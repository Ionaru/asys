// SPDX-License-Identifier: EUPL-1.2
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  type Command,
  type DomainState,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore } from '../../core/data/data-store';
import { Ids } from '../../core/platform/ids';
import { SaveState, TaskDraftSaver } from './task-draft-saver';
import type { TaskDraft } from './task-patch';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const KEY_REUSED: CommandOutcome = { _tag: CommandOutcomeTag.KeyReused };

const SIGNED_OUT: CommandOutcome = { _tag: CommandOutcomeTag.SignedOut };

const NOT_APPLICABLE: CommandOutcome = {
  _tag: CommandOutcomeTag.NotApplicable,
  reason: NotApplicableReason.ExpectationFailed,
  reviewItemId: 'rx',
};

const REJECTED_UNKNOWN_AREA: CommandOutcome = {
  _tag: CommandOutcomeTag.Rejected,
  reason: RejectedReason.UnknownArea,
};

const REVIEW_SENTENCE = 'That no longer applied, so it waits in the Inbox as a Review item.';

const UNKNOWN_AREA_SENTENCE = 'That Area no longer exists.';

const UNREACHABLE_SENTENCE = 'ASYS cannot reach the server. Try again.';

const GENERIC_SENTENCE = 'Something went wrong. Try again.';

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  notes: '',
  areaId: '',
  important: null,
  estimateMinutes: null,
  availableFrom: null,
  due: null,
};

const STORED_DRAFT: TaskDraft = {
  title: 'Buy milk',
  notes: '',
  areaId: 'a1',
  important: true,
  estimateMinutes: 30,
  availableFrom: null,
  due: null,
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Buy milk',
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  notes: '',
  captureText: '',
  areaId: 'a1',
  availableFrom: null,
  due: null,
  estimateMinutes: 30,
  important: true,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1,
  closedAt: null,
  ...overrides,
});

const domainState = (tasks: readonly Task[]): DomainState => ({
  tasks,
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
});

/** The store with Task 't1' as stored, changed by the overrides. */
const stored = (overrides: Partial<Task> = {}): DomainState => domainState([task(overrides)]);

/** The store with another Task only, as when 't1' is held by a Done or gone. */
const without = (): DomainState => domainState([task({ id: 't2', title: 'Other' })]);

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

/** The EditTask command the saver sends for a patch, with the status Task 't1' was stored with. */
const editCommand = (patch: Record<string, unknown>) => ({
  _tag: CommandTag.EditTask,
  taskId: 't1',
  patch,
  expect: { status: 'open' },
});

const setVisibility = (value: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
};

@Component({ template: '', providers: [CommandAttempts, TaskDraftSaver] })
class Host {
  constructor() {
    inject(TaskDraftSaver).connect(() => 't1');
  }
}

interface Sent {
  readonly command: Command;
  readonly key: string | undefined;
  readonly resolve: (outcome: CommandOutcome) => void;
}

const setup = async (initial: DomainState | null = stored()) => {
  const state = signal<DomainState | null>(initial);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const status = signal('ready');
  const sends: Sent[] = [];
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(
    (command, key) => {
      const d = deferred<CommandOutcome>();

      sends.push({ command, key, resolve: d.resolve });

      return d.promise;
    },
  );
  const refresh = vi.fn<() => void>();
  const runCommand = vi.fn<
    (
      command: Command,
      key: string,
      options?: { readonly keepalive?: boolean },
    ) => Promise<CommandOutcome>
  >(() => Promise.resolve(APPLIED));
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);

  TestBed.configureTestingModule({
    providers: [
      { provide: DataStore, useValue: { state, status, awaitingSync, send, refresh } },
      { provide: DataApi, useValue: { runCommand } },
      { provide: Ids, useValue: { next } },
    ],
  });

  const fixture = TestBed.createComponent(Host);
  const saver = fixture.debugElement.injector.get(TaskDraftSaver);
  const attempts = fixture.debugElement.injector.get(CommandAttempts);
  let destroyed = false;

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (!destroyed) {
        fixture.detectChanges();
        await fixture.whenStable();
      }
    }
  };
  const destroy = (): void => {
    destroyed = true;
    fixture.destroy();
  };
  /** Answers send `index`; the store is polled before the answer, as `DataStore.send` does. */
  const finish = async (
    index: number,
    outcome: CommandOutcome,
    poll?: DomainState | null,
  ): Promise<void> => {
    if (poll !== undefined) {
      state.set(poll);
    }

    must(sends[index], `send ${index}`).resolve(outcome);
    await settle();
  };
  const edit = (changes: Partial<TaskDraft>): void => {
    saver.model.update((draft) => ({ ...draft, ...changes }));
  };

  await settle();

  return {
    saver,
    attempts,
    state,
    awaitingSync,
    sends,
    send,
    refresh,
    runCommand,
    next,
    settle,
    destroy,
    finish,
    edit,
  };
};

describe('TaskDraftSaver', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  describe('following the store', () => {
    it('holds the empty draft, no baseline and no Task before the Task appears', async () => {
      const { saver, send } = await setup(null);

      expect(saver.model()).toStrictEqual(EMPTY_DRAFT);
      expect(saver.baseline()).toBeNull();
      expect(saver.task()).toBeUndefined();
      expect(saver.state()).toBe(SaveState.Idle);
      expect(saver.message()).toBe('');
      expect(saver.needsEstimate()).toBe(false);
      expect(saver.needsImportance()).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it('takes the stored values as baseline, model and committed when the Task first appears, and sends nothing', async () => {
      const { saver, state, send, settle } = await setup(null);

      state.set(stored({ notes: 'Semi-skimmed' }));
      await settle();

      const expected = { ...STORED_DRAFT, notes: 'Semi-skimmed' };

      expect(saver.task()?.id).toBe('t1');
      expect(saver.baseline()).toStrictEqual(expected);
      expect(saver.model()).toStrictEqual(expected);
      expect(saver.committed()).toStrictEqual({ title: 'Buy milk', notes: 'Semi-skimmed' });
      expect(saver.state()).toBe(SaveState.Idle);
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing when the Task is already in the store at the start', async () => {
      const { saver, send } = await setup();

      expect(saver.baseline()).toStrictEqual(STORED_DRAFT);
      expect(saver.model()).toStrictEqual(STORED_DRAFT);
      expect(saver.committed()).toStrictEqual({ title: 'Buy milk', notes: '' });
      expect(send).not.toHaveBeenCalled();
    });

    it('keeps the same baseline and model objects on an unchanged poll and sends nothing', async () => {
      const { saver, state, send, settle } = await setup();
      const baseline = saver.baseline();
      const model = saver.model();
      const committed = saver.committed();

      state.set(stored());
      await settle();
      state.set(stored());
      await settle();

      expect(saver.baseline()).toBe(baseline);
      expect(saver.model()).toBe(model);
      expect(saver.committed()).toBe(committed);
      expect(send).not.toHaveBeenCalled();
    });

    it('takes a changed stored value into baseline and model for a field the person has not touched, sending nothing', async () => {
      const { saver, state, send, settle } = await setup();

      state.set(stored({ estimateMinutes: 45 }));
      await settle();

      expect(saver.baseline()?.estimateMinutes).toBe(45);
      expect(saver.model().estimateMinutes).toBe(45);
      expect(send).not.toHaveBeenCalled();
    });

    it('follows a title changed on another device when the person has not touched it, and sends nothing', async () => {
      const { saver, state, send, settle } = await setup();

      state.set(stored({ title: 'Buy bread' }));
      await settle();

      expect(saver.model().title).toBe('Buy bread');
      expect(saver.committed().title).toBe('Buy bread');
      expect(saver.baseline()?.title).toBe('Buy bread');
      expect(send).not.toHaveBeenCalled();
    });

    it('keeps a field the person edited when the store changes another, and takes the stored committed text for a title never committed', async () => {
      const { saver, state, settle, edit } = await setup();

      saver.halt();
      edit({ estimateMinutes: 15, title: 'Buy ' });
      state.set(stored({ title: 'Buy bread', notes: 'Fresh' }));
      await settle();

      expect(saver.model().estimateMinutes).toBe(15);
      expect(saver.baseline()?.estimateMinutes).toBe(30);
      expect(saver.model().title).toBe('Buy ');
      expect(saver.model().notes).toBe('Fresh');
      expect(saver.baseline()?.notes).toBe('Fresh');
      expect(saver.committed()).toStrictEqual({ title: 'Buy bread', notes: 'Fresh' });
    });

    it('changes nothing when the Task disappears from the store', async () => {
      const { saver, state, send, settle } = await setup();
      const baseline = saver.baseline();
      const model = saver.model();

      state.set(without());
      await settle();

      expect(saver.task()).toBeUndefined();
      expect(saver.baseline()).toBe(baseline);
      expect(saver.model()).toBe(model);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('when nothing is sent (blocked)', () => {
    it('sends nothing before the Task has appeared, even for an edited draft, nor when it appears', async () => {
      const { saver, state, send, settle, edit } = await setup(null);

      edit({ title: 'Typed', important: false });
      saver.commit();
      await settle();
      state.set(stored());
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing while the Task is missing from the store', async () => {
      const { state, send, settle, edit } = await setup();

      state.set(without());
      await settle();
      edit({ important: false });
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing after halt() until resume(), which then sends the change', async () => {
      const { saver, send, sends, settle, edit } = await setup();

      saver.halt();
      edit({ important: false });
      await settle();
      edit({ areaId: 'a2' });
      await settle();

      expect(send).not.toHaveBeenCalled();

      saver.resume();
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ important: false, areaId: 'a2' }));
    });

    it('sends nothing while DataStore.awaitingSync holds the Task, and one save follows when it stops holding it', async () => {
      const { awaitingSync, send, sends, settle, edit } = await setup();

      awaitingSync.set(new Set(['t1']));
      edit({ important: false });
      await settle();

      expect(send).not.toHaveBeenCalled();

      awaitingSync.set(new Set());
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ important: false }));
    });

    it('is not blocked by awaitingSync holding another Task', async () => {
      const { awaitingSync, sends, settle, edit } = await setup();

      awaitingSync.set(new Set(['t2']));
      edit({ important: false });
      await settle();

      expect(sends).toHaveLength(1);
    });
  });

  describe('the trigger', () => {
    it('sends one EditTask for one tap, with the status the Task was stored with', async () => {
      const { saver, send, sends, settle, edit } = await setup();

      edit({ important: false });
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ important: false }));
      expect(saver.state()).toBe(SaveState.Saving);
    });

    it('sends the status from the first baseline even after the stored status changed', async () => {
      const { state, sends, settle, edit } = await setup();

      state.set(stored({ status: TaskStatus.Delegated }));
      await settle();
      edit({ important: false });
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ important: false }));
    });

    it('never sends for typing alone, whether title or notes', async () => {
      const { saver, send, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      await settle();
      edit({ notes: 'Barista edition' });
      await settle();

      expect(send).not.toHaveBeenCalled();
      expect(saver.state()).toBe(SaveState.Idle);
    });

    it('sends the trimmed title when commit() is called', async () => {
      const { saver, sends, settle, edit } = await setup();

      edit({ title: '  Buy oat milk  ' });
      await settle();
      saver.commit();
      await settle();

      expect(saver.committed().title).toBe('  Buy oat milk  ');
      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ title: 'Buy oat milk' }));
    });

    it('sends the notes when commit() is called', async () => {
      const { saver, sends, settle, edit } = await setup();

      edit({ notes: 'Barista edition' });
      saver.commit();
      await settle();

      expect(saver.committed()).toStrictEqual({ title: 'Buy milk', notes: 'Barista edition' });
      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ notes: 'Barista edition' }));
    });

    it('sends only the tap when a title is typed but not committed, and the Applied keeps the typed title', async () => {
      const { saver, sends, finish, settle, edit } = await setup();

      edit({ title: 'Buy ', important: false });
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ important: false }));

      await finish(0, APPLIED, stored({ important: false }));

      expect(saver.model().title).toBe('Buy ');
      expect(saver.model().important).toBe(false);
      expect(saver.baseline()?.important).toBe(false);
      expect(sends).toHaveLength(1);
    });

    it('sends both values for an Inbox Task that gets an Importance and an Estimate', async () => {
      const { saver, sends, settle, edit } = await setup(
        stored({ important: null, estimateMinutes: null }),
      );

      expect(saver.needsImportance()).toBe(false);
      expect(saver.needsEstimate()).toBe(false);

      edit({ important: true, estimateMinutes: 15 });
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(
        editCommand({ important: true, estimateMinutes: 15 }),
      );
    });

    it('sends nothing for a committed title that is empty, and flags it', async () => {
      const { saver, send, settle, edit } = await setup();

      edit({ title: '   ' });
      saver.commit();
      await settle();

      expect(saver.needsTitle()).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });

    it('does not flag a title that has text', async () => {
      const { saver } = await setup();

      expect(saver.needsTitle()).toBe(false);
    });

    it('sends nothing for an emptied Estimate or Importance of a Task that had them, and flags each', async () => {
      const { saver, send, settle, edit } = await setup();

      edit({ estimateMinutes: null });
      await settle();

      expect(saver.needsEstimate()).toBe(true);
      expect(saver.needsImportance()).toBe(false);
      expect(send).not.toHaveBeenCalled();

      edit({ important: null });
      await settle();

      expect(saver.needsImportance()).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });

    it('leaves an emptied Estimate out of the patch while another field is sent', async () => {
      const { sends, settle, edit } = await setup();

      edit({ estimateMinutes: null, areaId: 'a2' });
      await settle();

      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ areaId: 'a2' }));
    });
  });

  describe('the loop', () => {
    it('sets Saved with no message on Applied, adopting the stored values as the baseline', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();

      expect(saver.state()).toBe(SaveState.Saving);

      await finish(0, APPLIED, stored({ important: false }));

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.message()).toBe('');
      expect(saver.baseline()).toStrictEqual({ ...STORED_DRAFT, important: false });
      expect(saver.model()).toStrictEqual({ ...STORED_DRAFT, important: false });
      expect(sends).toHaveLength(1);
    });

    it('sends exactly two EditTasks for two taps during a send, the second carrying what changed meanwhile', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      edit({ estimateMinutes: 15 });
      edit({ areaId: 'a2' });
      await settle();

      expect(sends).toHaveLength(1);

      await finish(0, APPLIED, stored({ important: false }));

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(
        editCommand({ estimateMinutes: 15, areaId: 'a2' }),
      );

      await finish(1, APPLIED, stored({ important: false, estimateMinutes: 15, areaId: 'a2' }));

      expect(sends).toHaveLength(2);
      expect(saver.state()).toBe(SaveState.Saved);
    });

    it('keeps a field edited during the send, and the next send carries it', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      edit({ important: true });
      await settle();

      await finish(0, APPLIED, stored({ important: false }));

      expect(saver.baseline()?.important).toBe(false);
      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(editCommand({ important: true }));
    });

    it('never overwrites text typed during a send when it settles', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.commit();
      await settle();
      edit({ title: 'Buy oat milk and ' });
      await settle();

      await finish(0, APPLIED, stored({ title: 'Buy oat milk' }));

      expect(saver.model().title).toBe('Buy oat milk and ');
      expect(saver.committed().title).toBe('Buy oat milk');
      expect(saver.baseline()?.title).toBe('Buy oat milk');
      expect(sends).toHaveLength(1);
    });

    it('keeps the baseline and sends nothing more when the Task left the store during the send', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();

      const baseline = saver.baseline();

      await finish(0, APPLIED, without());

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.baseline()).toBe(baseline);
      expect(sends).toHaveLength(1);
    });

    it('sends nothing more after an Applied whose poll failed, even once awaitingSync clears and the store catches up', async () => {
      const { awaitingSync, saver, state, sends, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();

      // The poll failed: the store still shows the old values and holds the Task.
      awaitingSync.set(new Set(['t1']));
      await finish(0, APPLIED);

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.model().important).toBe(false);
      expect(sends).toHaveLength(1);

      state.set(stored({ important: false }));
      awaitingSync.set(new Set());
      await settle();

      expect(sends).toHaveLength(1);
      expect(saver.baseline()?.important).toBe(false);
    });

    it('sets Failed with the message, asks the store to refresh and does not resend on a later poll', async () => {
      const { saver, state, refresh, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);

      expect(saver.state()).toBe(SaveState.Failed);
      expect(saver.message()).toBe(UNREACHABLE_SENTENCE);
      expect(refresh).toHaveBeenCalledTimes(1);

      state.set(stored());
      await settle();
      state.set(stored({ version: 2 }));
      await settle();

      expect(sends).toHaveLength(1);
    });

    it('resends the identical command with the same idempotency key on retry(), and clears the message on Applied', async () => {
      const { saver, next, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);
      saver.retry();
      await settle();

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(must(sends[0]).command);
      expect(must(sends[1]).key).toBe(must(sends[0]).key);
      expect(next).toHaveBeenCalledTimes(1);
      expect(saver.state()).toBe(SaveState.Saving);

      await finish(1, APPLIED, stored({ important: false }));

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.message()).toBe('');
    });

    it('sends again with a new key once the patch of a Failed send has changed', async () => {
      const { sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);
      edit({ areaId: 'a2' });
      await settle();

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(editCommand({ important: false, areaId: 'a2' }));
      expect(must(sends[1]).key).not.toBe(must(sends[0]).key);
    });

    it('sets Refused with the message on Rejected, resends nothing on later polls, and sends again once the patch changes', async () => {
      const { saver, state, sends, finish, edit, settle } = await setup();

      edit({ areaId: 'gone' });
      await settle();

      expect(must(sends[0]).command).toStrictEqual(editCommand({ areaId: 'gone' }));

      await finish(0, REJECTED_UNKNOWN_AREA);

      expect(saver.state()).toBe(SaveState.Refused);
      expect(saver.message()).toBe(UNKNOWN_AREA_SENTENCE);

      state.set(stored());
      await settle();
      state.set(stored({ version: 2 }));
      await settle();

      expect(sends).toHaveLength(1);

      edit({ areaId: 'a2' });
      await settle();

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(editCommand({ areaId: 'a2' }));
    });

    it('does not resend a refused patch when saving is blocked and unblocked again with the same draft', async () => {
      const { saver, awaitingSync, sends, finish, edit, settle } = await setup();

      edit({ areaId: 'gone' });
      await settle();
      await finish(0, REJECTED_UNKNOWN_AREA);

      expect(saver.state()).toBe(SaveState.Refused);

      saver.halt();
      await settle();
      saver.resume();
      await settle();

      expect(sends).toHaveLength(1);

      awaitingSync.set(new Set(['t1']));
      await settle();
      awaitingSync.set(new Set());
      await settle();

      expect(sends).toHaveLength(1);
      expect(saver.state()).toBe(SaveState.Refused);
    });

    it("follows another device's change to a field the patch did not carry when the answer applies, and sends nothing more", async () => {
      const { saver, sends, finish, edit, settle } = await setup(stored({ estimateMinutes: 45 }));

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false, estimateMinutes: 60 }));

      expect(saver.model().important).toBe(false);
      expect(saver.model().estimateMinutes).toBe(60);
      expect(saver.baseline()?.estimateMinutes).toBe(60);
      expect(sends).toHaveLength(1);
      expect(saver.state()).toBe(SaveState.Saved);
    });

    it('follows a title changed on another device when the answer applies, in model and committed text, and sends nothing more', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false, title: 'Buy bread' }));

      expect(saver.model().title).toBe('Buy bread');
      expect(saver.committed().title).toBe('Buy bread');
      expect(sends).toHaveLength(1);
    });

    it("keeps text typed during the send when the answer applies together with another device's title, and sends nothing more", async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      edit({ title: 'Buy ' });
      await settle();
      await finish(0, APPLIED, stored({ important: false, title: 'Buy bread' }));

      expect(saver.model().title).toBe('Buy ');
      expect(saver.committed().title).toBe('Buy bread');
      expect(saver.baseline()?.title).toBe('Buy bread');
      expect(sends).toHaveLength(1);
    });

    it('does not touch the model for the keys it did not carry while awaitingSync holds the Task', async () => {
      const { awaitingSync, saver, sends, finish, edit, settle } = await setup(
        stored({ estimateMinutes: 45 }),
      );

      edit({ important: false });
      await settle();
      awaitingSync.set(new Set(['t1']));
      await finish(0, APPLIED, stored({ important: false, estimateMinutes: 60 }));

      expect(saver.model().important).toBe(false);
      expect(saver.model().estimateMinutes).toBe(45);
      expect(sends).toHaveLength(1);
    });

    it("sets Saved and clears the message of a Failed send when a poll shows the draft's values stored, sending nothing", async () => {
      const { saver, state, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);

      expect(saver.state()).toBe(SaveState.Failed);

      state.set(stored({ important: false }));
      await settle();

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.message()).toBe('');
      expect(saver.saved()).toBe(true);
      expect(sends).toHaveLength(1);
    });

    it('sets Saved and clears the message of a Failed send when the person sets the field back', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);
      edit({ important: true });
      await settle();

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.message()).toBe('');
      expect(sends).toHaveLength(1);
    });

    it('sets Saved and clears the message of a Refused send when the Area is set back, and sends a refused value again later', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ areaId: 'gone' });
      await settle();
      await finish(0, REJECTED_UNKNOWN_AREA);

      expect(saver.state()).toBe(SaveState.Refused);

      edit({ areaId: 'a1' });
      await settle();

      expect(saver.state()).toBe(SaveState.Saved);
      expect(saver.message()).toBe('');
      expect(sends).toHaveLength(1);

      edit({ areaId: 'gone' });
      await settle();

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(editCommand({ areaId: 'gone' }));
    });

    it('sets Refused with the message on KeyReused and resends nothing', async () => {
      const { saver, state, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, KEY_REUSED);

      expect(saver.state()).toBe(SaveState.Refused);
      expect(saver.message()).toBe(GENERIC_SENTENCE);

      state.set(stored());
      await settle();

      expect(sends).toHaveLength(1);
    });

    it('sets Stopped with the message on NotApplicable, and sends nothing more in this visit', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, NOT_APPLICABLE);

      expect(saver.state()).toBe(SaveState.Stopped);
      expect(saver.message()).toBe(REVIEW_SENTENCE);

      edit({ areaId: 'a2' });
      await settle();
      edit({ estimateMinutes: 15 });
      await settle();
      saver.retry();
      await settle();
      saver.commit();
      saver.flush();
      await settle();

      expect(sends).toHaveLength(1);
      expect(saver.state()).toBe(SaveState.Stopped);
    });

    it('stops the loop on SignedOut and leaves the message empty', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      edit({ estimateMinutes: 15 });
      await settle();
      await finish(0, SIGNED_OUT);

      expect(saver.message()).toBe('');
      expect(sends).toHaveLength(1);
    });

    it('replaces the message of a Failed send by an empty one once a later send is Applied', async () => {
      const { saver, sends, finish, edit, settle } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);

      expect(saver.message()).not.toBe('');

      edit({ areaId: 'a2' });
      await settle();
      await finish(1, APPLIED, stored({ important: false, areaId: 'a2' }));

      expect(saver.message()).toBe('');
      expect(sends).toHaveLength(2);
    });
  });

  describe('flush', () => {
    it('commits the typed text, and sends the change before returning', async () => {
      const { saver, send, sends, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.flush();

      expect(saver.committed().title).toBe('Buy oat milk');
      expect(send).toHaveBeenCalledTimes(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ title: 'Buy oat milk' }));
    });

    it('has started the send before a held Done can remove the Task from the store', async () => {
      const { saver, state, send, sends, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.commit();
      saver.flush();
      state.set(without());
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ title: 'Buy oat milk' }));
    });

    it('sends the change once when the Task stays in the store', async () => {
      const { saver, send, sends, finish, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.commit();
      saver.flush();
      await settle();
      await finish(0, APPLIED, stored({ title: 'Buy oat milk' }));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sends).toHaveLength(1);
      expect(saver.saved()).toBe(true);
    });

    it('adds nothing for a second identical flush while the first is in flight', async () => {
      const { saver, send, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.flush();
      saver.flush();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when nothing differs from the baseline', async () => {
      const { saver, send, settle } = await setup();

      saver.flush();
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('queues the command during a send and sends it after, once, however often it is flushed', async () => {
      const { saver, sends, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      edit({ title: 'Buy oat milk' });
      saver.flush();
      saver.flush();
      await settle();

      expect(sends).toHaveLength(1);

      await finish(0, APPLIED, stored({ important: false }));

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(
        editCommand({ important: false, title: 'Buy oat milk' }),
      );

      await finish(1, APPLIED, stored({ important: false, title: 'Buy oat milk' }));

      expect(sends).toHaveLength(2);
    });

    it('sends the queued command after the send settles even when the Task is no longer in the store', async () => {
      const { saver, sends, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      edit({ title: 'Buy oat milk' });
      saver.flush();
      await finish(0, APPLIED, without());

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(
        editCommand({ important: false, title: 'Buy oat milk' }),
      );
    });

    it('drops the queued command when halt() was called before the send settled', async () => {
      const { saver, sends, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      edit({ title: 'Buy oat milk' });
      saver.flush();
      saver.halt();
      await finish(0, APPLIED, stored({ important: false }));

      expect(sends).toHaveLength(1);
    });

    it('commits but sends nothing when halted', async () => {
      const { saver, send, settle, edit } = await setup();

      saver.halt();
      edit({ title: 'Buy oat milk' });
      saver.flush();
      await settle();

      expect(saver.committed().title).toBe('Buy oat milk');
      expect(send).not.toHaveBeenCalled();
    });

    it('commits but sends nothing when Stopped', async () => {
      const { saver, sends, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, NOT_APPLICABLE);
      edit({ title: 'Buy oat milk' });
      saver.flush();
      await settle();

      expect(saver.committed().title).toBe('Buy oat milk');
      expect(sends).toHaveLength(1);
    });

    it('commits but sends nothing when the Task never appeared', async () => {
      const { saver, send, settle, edit } = await setup(null);

      edit({ title: 'Buy oat milk' });
      saver.flush();
      await settle();

      expect(saver.committed().title).toBe('Buy oat milk');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('halt, resume and idle', () => {
    it('lets the send in flight finish, drops the again pass, and resolves idle() after it settles; resume() sends the rest', async () => {
      const { saver, sends, finish, settle, edit } = await setup();
      let idle = false;

      edit({ important: false });
      await settle();
      edit({ estimateMinutes: 15 });
      await settle();
      saver.halt();
      void saver.idle().then(() => {
        idle = true;
      });
      await settle();

      expect(idle).toBe(false);

      await finish(0, APPLIED, stored({ important: false }));

      expect(idle).toBe(true);
      expect(sends).toHaveLength(1);
      expect(saver.model().estimateMinutes).toBe(15);

      saver.resume();
      await settle();

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(editCommand({ estimateMinutes: 15 }));
    });

    it('resolves idle() at once when nothing is in flight', async () => {
      const { saver } = await setup();

      await expect(saver.idle()).resolves.toBeUndefined();
    });

    it('resolves idle() only after a queued flush has been sent and settled', async () => {
      const { saver, sends, finish, settle, edit } = await setup();
      let idle = false;

      edit({ important: false });
      await settle();
      edit({ title: 'Buy oat milk' });
      saver.flush();
      void saver.idle().then(() => {
        idle = true;
      });
      await finish(0, APPLIED, stored({ important: false }));

      expect(sends).toHaveLength(2);
      expect(idle).toBe(false);

      await finish(1, APPLIED, stored({ important: false, title: 'Buy oat milk' }));

      expect(idle).toBe(true);
    });

    it('saves a dirty draft again as soon as resume() is called', async () => {
      const { saver, sends, settle, edit } = await setup();

      saver.halt();
      edit({ important: false });
      await settle();
      saver.resume();
      await settle();

      expect(sends).toHaveLength(1);
    });
  });

  describe('leaving the page', () => {
    it('sends the committed change with keepalive when the page becomes hidden', async () => {
      const { saver, attempts, runCommand, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      const command = editCommand({ title: 'Buy oat milk' });

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(command);
      expect(runCommand.mock.calls[0]?.[1]).toBe(attempts.keyFor(command as Command));
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(saver.committed().title).toBe('Buy oat milk');
      expect(saver.state()).toBe(SaveState.Idle);
    });

    it('sends on pagehide', async () => {
      const { runCommand, edit } = await setup();

      edit({ important: false });
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(editCommand({ important: false }));
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
    });

    it('sends nothing on visibilitychange while the page is visible', async () => {
      const { runCommand, edit } = await setup();

      edit({ important: false });
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('sends nothing when the patch is empty', async () => {
      const { runCommand } = await setup();

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('sends nothing when halted, when Stopped, or when the Task is not in the store', async () => {
      const halted = await setup();

      halted.saver.halt();
      halted.edit({ important: false });
      window.dispatchEvent(new Event('pagehide'));

      expect(halted.runCommand).not.toHaveBeenCalled();
      TestBed.resetTestingModule();

      const missing = await setup();

      missing.state.set(without());
      await missing.settle();
      missing.edit({ important: false });
      window.dispatchEvent(new Event('pagehide'));

      expect(missing.runCommand).not.toHaveBeenCalled();
      TestBed.resetTestingModule();

      const stopped = await setup();

      stopped.edit({ important: false });
      await stopped.settle();
      await stopped.finish(0, NOT_APPLICABLE);
      stopped.edit({ areaId: 'a2' });
      window.dispatchEvent(new Event('pagehide'));

      expect(stopped.runCommand).not.toHaveBeenCalled();
    });

    it('sends nothing while awaitingSync holds the Task, even for a dirty draft', async () => {
      const { awaitingSync, runCommand, edit } = await setup();

      awaitingSync.set(new Set(['t1']));
      edit({ important: false });
      window.dispatchEvent(new Event('pagehide'));
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('gives the loop the same key for the identical command when the page comes back', async () => {
      const { runCommand, sends, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      window.dispatchEvent(new Event('pagehide'));
      await settle();

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(sends).toHaveLength(1);
      expect(must(sends[0]).command).toStrictEqual(runCommand.mock.calls[0]?.[0]);
      expect(must(sends[0]).key).toBe(runCommand.mock.calls[0]?.[1]);
    });
  });

  describe('destroy', () => {
    it('sends a committed but unsent change once', async () => {
      const { saver, send, sends, destroy, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.commit();
      destroy();
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ title: 'Buy oat milk' }));
    });

    it('commits typed text and sends it', async () => {
      const { send, sends, destroy, settle, edit } = await setup();

      edit({ notes: 'Barista edition' });
      destroy();
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(sends[0]).command).toStrictEqual(editCommand({ notes: 'Barista edition' }));
    });

    it('sends nothing when the Task is missing from the store', async () => {
      const { state, send, destroy, settle } = await setup();

      state.set(without());
      await settle();
      destroy();
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing for a committed change when the Task was removed from the store before the destroy', async () => {
      const { saver, state, send, destroy, settle, edit } = await setup();

      edit({ title: 'Buy oat milk' });
      saver.commit();
      state.set(without());
      destroy();
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing when nothing changed', async () => {
      const { send, destroy, settle } = await setup();

      destroy();
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('takes no again pass: the in-flight send finishes and at most the flushed command follows', async () => {
      const { sends, destroy, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      edit({ estimateMinutes: 15 });
      await settle();
      destroy();
      await finish(0, APPLIED, stored({ important: false }));

      expect(sends).toHaveLength(2);
      expect(must(sends[1]).command).toStrictEqual(
        editCommand({ important: false, estimateMinutes: 15 }),
      );

      await finish(1, APPLIED, stored({ important: false, estimateMinutes: 15 }));

      expect(sends).toHaveLength(2);
    });

    it('sends nothing on visibilitychange or pagehide afterwards', async () => {
      const { runCommand, destroy, edit } = await setup();

      edit({ important: false });
      destroy();
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  describe('saved', () => {
    it('is false before anything was sent', async () => {
      const { saver } = await setup();

      expect(saver.saved()).toBe(false);
    });

    it('is false while a send is in flight and true once it is Applied with nothing pending', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();

      expect(saver.saved()).toBe(false);

      await finish(0, APPLIED, stored({ important: false }));

      expect(saver.saved()).toBe(true);
    });

    it('is false after Failed', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, FAILED);

      expect(saver.saved()).toBe(false);
    });

    it('is false while a title is typed but not committed, and true again after the commit is saved', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false }));
      edit({ title: 'Buy ' });
      await settle();

      expect(saver.saved()).toBe(false);

      saver.commit();
      await settle();
      await finish(1, APPLIED, stored({ important: false, title: 'Buy' }));

      expect(saver.saved()).toBe(true);
    });

    it('is false while an Estimate is needed', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false }));
      edit({ estimateMinutes: null });
      await settle();

      expect(saver.needsEstimate()).toBe(true);
      expect(saver.saved()).toBe(false);
    });

    it('is false while an Importance is needed', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ areaId: 'a2' });
      await settle();
      await finish(0, APPLIED, stored({ areaId: 'a2' }));
      edit({ important: null });
      await settle();

      expect(saver.needsImportance()).toBe(true);
      expect(saver.saved()).toBe(false);
    });

    it('is false while a title is needed', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false }));
      edit({ title: '' });
      saver.commit();
      await settle();

      expect(saver.needsTitle()).toBe(true);
      expect(saver.saved()).toBe(false);
    });

    it('is false while a change is pending, such as after halt()', async () => {
      const { saver, finish, settle, edit } = await setup();

      edit({ important: false });
      await settle();
      await finish(0, APPLIED, stored({ important: false }));
      saver.halt();
      edit({ areaId: 'a2' });
      await settle();

      expect(saver.saved()).toBe(false);
    });
  });
});
