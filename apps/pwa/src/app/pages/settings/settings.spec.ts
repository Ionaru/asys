// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CommandTag, RejectedReason, type Command, type DomainState } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { TimeZoneSync } from '../../core/data/time-zone-sync';
import { DeviceZone } from '../../core/platform/device-zone';
import { Ids } from '../../core/platform/ids';
import { Settings } from './settings';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const rejected = (reason: RejectedReason): CommandOutcome => ({
  _tag: CommandOutcomeTag.Rejected,
  reason,
});

const domainState = (timeZone: string, urgencyWindowDays: number): DomainState => ({
  tasks: [],
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone, urgencyWindowDays },
});

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

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
  readonly deviceZone?: string | undefined;
}

const setup = async (options: SetupOptions = {}) => {
  const state = signal<DomainState | null>(
    options.state === undefined ? domainState('Europe/Amsterdam', 2) : options.state,
  );
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const sends: ReturnType<typeof deferred<CommandOutcome>>[] = [];
  const pending = (): Promise<CommandOutcome> => {
    const d = deferred<CommandOutcome>();

    sends.push(d);

    return d.promise;
  };
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(pending);
  const chooseZone = vi.fn<(zone: string) => Promise<CommandOutcome>>(pending);
  const refresh = vi.fn<() => void>();
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);
  const deviceZone = 'deviceZone' in options ? options.deviceZone : 'Europe/Amsterdam';

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DataStore,
        useValue: { state, status, awaitingSync, send, refresh },
      },
      { provide: TimeZoneSync, useValue: { choose: chooseZone } },
      { provide: DeviceZone, useValue: { current: vi.fn(() => deviceZone) } },
      { provide: Ids, useValue: { next } },
    ],
  });

  const fixture = TestBed.createComponent(Settings);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element | null = root()): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const field = (label: string): HTMLElement | undefined =>
    Array.from(root().querySelectorAll<HTMLElement>('asys-select-field')).find(
      (f) => text(f.querySelector('label')) === label,
    );
  const select = (label: string): HTMLSelectElement =>
    must(must(field(label)).querySelector('select'));
  const options_ = (label: string): HTMLOptionElement[] =>
    Array.from(select(label).querySelectorAll('option'));
  const choose = async (label: string, value: string): Promise<void> => {
    const el = select(label);

    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  };
  const statusLine = (): HTMLElement => must(root().querySelector('[role="status"]'));
  const deviceButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('button')).find((b) =>
      text(b).startsWith("Use this device's time zone"),
    );
  const link = (name: string): HTMLAnchorElement | undefined =>
    Array.from(root().querySelectorAll('a')).find((a) => text(a) === name);
  const finish = async (n: number, outcome: CommandOutcome): Promise<void> => {
    must(sends[n]).resolve(outcome);
    await settle();
  };

  await settle();

  return {
    state,
    status,
    awaitingSync,
    sends,
    send,
    chooseZone,
    refresh,
    next,
    fixture,
    root,
    text,
    settle,
    select,
    field,
    options: options_,
    choose,
    statusLine,
    deviceButton,
    link,
    finish,
  };
};

describe('Settings', () => {
  describe('page frame', () => {
    it('shows the heading and the Areas and Account links', async () => {
      const { root, link } = await setup();

      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Settings');
      expect(must(link('Areas')).getAttribute('href')).toBe('/settings/areas');
      expect(must(link('Account')).getAttribute('href')).toBe('/account');
      expect(root().querySelector('[role="status"]')).not.toBeNull();
    });

    it('shows Loading while there is no state, but keeps the heading and links', async () => {
      const { text, root, link } = await setup({ state: null });

      expect(text()).toContain('Loading…');
      expect(root().querySelector('asys-select-field')).toBeNull();
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Settings');
      expect(link('Account')).toBeDefined();
    });

    it('offers Try again after a failed load and still shows the Account link', async () => {
      const { root, link, refresh, settle } = await setup({
        state: null,
        status: SyncStatus.Failed,
      });

      expect(root().querySelector('[role="alert"]')?.textContent).toContain(
        'ASYS could not load your Tasks.',
      );
      expect(must(link('Account')).getAttribute('href')).toBe('/account');

      must(
        Array.from(root().querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Try again',
        ),
      ).click();
      await settle();

      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Urgency window', () => {
    it('offers 1 day to 14 days and shows the stored window with its hint', async () => {
      const { options, select, text, field } = await setup();

      expect(options('Urgency window').map((o) => o.value)).toEqual(
        Array.from({ length: 14 }, (_, i) => String(i + 1)),
      );
      expect(must(options('Urgency window')[0]).textContent?.trim()).toBe('1 day');
      expect(must(options('Urgency window')[1]).textContent?.trim()).toBe('2 days');
      expect(must(options('Urgency window')[13]).textContent?.trim()).toBe('14 days');
      expect(select('Urgency window').value).toBe('2');
      expect(text(field('Urgency window'))).toContain(
        'A Task counts as urgent this many days before its Latest start.',
      );
    });

    it('sends SetUrgencyWindow at once with the attempt key', async () => {
      const { choose, send } = await setup();

      await choose('Urgency window', '5');

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(send.mock.calls[0])[0]).toEqual({ _tag: CommandTag.SetUrgencyWindow, days: 5 });
      expect(must(send.mock.calls[0])[1]).toBe('key-1');
    });

    it('says Urgency window saved after Applied and shows the new stored value', async () => {
      const { choose, finish, state, statusLine, select } = await setup();

      await choose('Urgency window', '5');
      state.set(domainState('Europe/Amsterdam', 5));
      await finish(0, APPLIED);

      expect(statusLine().textContent?.trim()).toBe('Urgency window saved.');
      expect(select('Urgency window').value).toBe('5');
    });

    it('puts the stored window back and shows the message when the change is rejected', async () => {
      const { choose, finish, statusLine, select } = await setup();

      await choose('Urgency window', '9');
      await finish(0, rejected(RejectedReason.InvalidUrgencyWindow));

      expect(select('Urgency window').value).toBe('2');
      expect(statusLine().textContent?.trim()).toBe('Use 1 to 14 days.');
    });

    it('puts the stored window back when the send failed', async () => {
      const { choose, finish, statusLine, select } = await setup();

      await choose('Urgency window', '7');
      await finish(0, FAILED);

      expect(select('Urgency window').value).toBe('2');
      expect(statusLine().textContent?.trim()).toBe('ASYS cannot reach the server. Try again.');
    });
  });

  describe('Time zone', () => {
    it('shows the stored zone and its hint', async () => {
      const { text, select, field } = await setup();

      expect(text()).toContain('Current time zone: Europe/Amsterdam');
      expect(select('Time zone').value).toBe('Europe/Amsterdam');
      expect(text(field('Time zone'))).toContain(
        'Dates without a time follow this time zone. Your phone keeps it up to date.',
      );
    });

    it('lists UTC first, then the supported zones in their order', async () => {
      const { options } = await setup();
      const values = options('Time zone').map((o) => o.value);

      expect(values).toEqual([
        'UTC',
        ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC'),
      ]);
      expect(options('Time zone').every((o) => o.textContent?.trim() === o.value)).toBe(true);
    });

    it('appends the stored zone when the list lacks it', async () => {
      const { options, select, text } = await setup({ state: domainState('Mars/Base', 2) });
      const values = options('Time zone').map((o) => o.value);

      expect(values[0]).toBe('UTC');
      expect(values.at(-1)).toBe('Mars/Base');
      expect(values.filter((v) => v === 'Mars/Base')).toHaveLength(1);
      expect(select('Time zone').value).toBe('Mars/Base');
      expect(text()).toContain('Current time zone: Mars/Base');
    });

    it('lists UTC exactly once, first, when UTC is the stored zone', async () => {
      const { options, select } = await setup({ state: domainState('UTC', 2) });
      const values = options('Time zone').map((o) => o.value);

      expect(values.filter((v) => v === 'UTC')).toEqual(['UTC']);
      expect(values[0]).toBe('UTC');
      expect(select('Time zone').value).toBe('UTC');
    });

    it('calls TimeZoneSync.choose with the chosen zone', async () => {
      const { choose, chooseZone, send } = await setup();

      await choose('Time zone', 'Europe/London');

      expect(chooseZone).toHaveBeenCalledExactlyOnceWith('Europe/London');
      expect(send).not.toHaveBeenCalled();
    });

    it('says Time zone saved after Applied', async () => {
      const { choose, finish, state, statusLine, select, text } = await setup();

      await choose('Time zone', 'Europe/London');
      state.set(domainState('Europe/London', 2));
      await finish(0, APPLIED);

      expect(statusLine().textContent?.trim()).toBe('Time zone saved.');
      expect(select('Time zone').value).toBe('Europe/London');
      expect(text()).toContain('Current time zone: Europe/London');
    });

    it('resets the select to the stored zone when the zone is rejected', async () => {
      const { choose, finish, statusLine, select, text } = await setup();

      await choose('Time zone', 'Europe/London');

      expect(select('Time zone').value).toBe('Europe/London');

      await finish(0, rejected(RejectedReason.InvalidTimeZone));

      expect(select('Time zone').value).toBe('Europe/Amsterdam');
      expect(statusLine().textContent?.trim()).toBe('ASYS does not know that time zone.');
      expect(text()).toContain('Current time zone: Europe/Amsterdam');
    });
  });

  describe('device time zone', () => {
    it('hides the button when the device zone equals the stored zone', async () => {
      const { deviceButton } = await setup({ deviceZone: 'Europe/Amsterdam' });

      expect(deviceButton()).toBeUndefined();
    });

    it('hides the button when the device zone is unknown', async () => {
      const { deviceButton } = await setup({ deviceZone: undefined });

      expect(deviceButton()).toBeUndefined();
    });

    it('offers the device zone when it differs and chooses it on click', async () => {
      const { deviceButton, chooseZone, settle } = await setup({
        state: domainState('Europe/London', 2),
        deviceZone: 'Europe/Amsterdam',
      });

      expect(must(deviceButton()).textContent?.trim()).toBe(
        "Use this device's time zone (Europe/Amsterdam)",
      );

      must(deviceButton()).click();
      await settle();

      expect(chooseZone).toHaveBeenCalledExactlyOnceWith('Europe/Amsterdam');
    });
  });

  describe('while a send is pending', () => {
    it('disables both selects and the device button during an urgency change', async () => {
      const { choose, select, deviceButton, finish } = await setup({
        state: domainState('Europe/London', 2),
      });

      await choose('Urgency window', '4');

      expect(select('Urgency window').disabled).toBe(true);
      expect(select('Time zone').disabled).toBe(true);
      expect(must(deviceButton()).disabled).toBe(true);

      await finish(0, FAILED);

      expect(select('Urgency window').disabled).toBe(false);
      expect(select('Time zone').disabled).toBe(false);
      expect(must(deviceButton()).disabled).toBe(false);
    });

    it('disables both selects during a time zone change', async () => {
      const { choose, select, finish } = await setup();

      await choose('Time zone', 'Europe/London');

      expect(select('Urgency window').disabled).toBe(true);
      expect(select('Time zone').disabled).toBe(true);

      await finish(0, FAILED);

      expect(select('Urgency window').disabled).toBe(false);
      expect(select('Time zone').disabled).toBe(false);
    });

    it('disables the controls while settings await the server, and says so', async () => {
      const { awaitingSync, select, deviceButton, settle, text } = await setup({
        state: domainState('Europe/London', 2),
      });

      awaitingSync.set(new Set(['settings']));
      await settle();

      expect(select('Urgency window').disabled).toBe(true);
      expect(select('Time zone').disabled).toBe(true);
      expect(must(deviceButton()).disabled).toBe(true);
      expect(text()).toContain('Saved. Waiting for the server.');

      awaitingSync.set(new Set());
      await settle();

      expect(select('Urgency window').disabled).toBe(false);
      expect(text()).not.toContain('Saved. Waiting for the server.');
    });
  });
});
