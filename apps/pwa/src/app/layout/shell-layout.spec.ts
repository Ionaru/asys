// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CommandTag, RejectedReason, type Command } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../core/api/data-api';
import { DataStore } from '../core/data/data-store';
import { Ids } from '../core/platform/ids';
import { ShellLayout } from './shell-layout';

@Component({ template: '' })
class Stub {}

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const deferred = <V>() => {
  let resolve: (value: V) => void = () => undefined;
  const promise = new Promise<V>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

const setup = async (url = '/now') => {
  let counter = 0;
  const send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();

  send.mockResolvedValue(APPLIED);

  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          {
            path: '',
            component: ShellLayout,
            children: [
              { path: 'now', component: Stub },
              { path: 'today', component: Stub },
              { path: 'inbox', component: Stub },
              { path: 'tasks/:taskId', component: Stub },
              { path: 'settings', component: Stub },
            ],
          },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataStore, useValue: { inboxCount: signal(0), send } },
      {
        provide: Ids,
        useValue: {
          next: () => {
            counter += 1;

            return `id-${counter}`;
          },
        },
      },
    ],
  });

  const harness = await RouterTestingHarness.create();
  const fixture = harness.fixture;

  document.body.appendChild(fixture.nativeElement);

  const root = (): HTMLElement => fixture.nativeElement;

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      TestBed.tick();
      await fixture.whenStable();
      await new Promise<void>((resolve) => setTimeout(resolve));
    }

    fixture.detectChanges();
  };

  const go = async (to: string): Promise<void> => {
    await harness.navigateByUrl(to);
    await settle();
  };

  const pill = (): HTMLButtonElement | null => root().querySelector('button.asys-capture');
  const bar = (): HTMLElement | null => root().querySelector('asys-quick-add');
  const input = (): HTMLInputElement | null => root().querySelector('.asys-quickadd__input');
  const status = (): string | null =>
    root().querySelector('.asys-quickadd__status')?.textContent?.trim() ?? null;
  const addButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-quickadd button')).find(
      (b) => b.textContent?.trim() === 'Add',
    );
  const closeButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-quickadd button')).find(
      (b) => b.textContent?.trim() === 'Close',
    );

  const open = async (): Promise<void> => {
    pill()?.click();
    await settle();
  };

  const type = async (text: string): Promise<void> => {
    const field = input();

    if (field !== null) {
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await settle();
  };

  const submit = async (): Promise<void> => {
    root()
      .querySelector('.asys-quickadd')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };

  const escape = async (): Promise<void> => {
    input()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
  };

  await go(url);

  return {
    send,
    root,
    settle,
    go,
    pill,
    bar,
    input,
    status,
    addButton,
    closeButton,
    open,
    type,
    submit,
    escape,
  };
};

const captureCommand = (taskId: string, title: string): Command => ({
  _tag: CommandTag.CaptureTask,
  taskId,
  title,
  captureText: title,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ShellLayout', () => {
  describe('header', () => {
    it('links to Settings and no longer to Account', async () => {
      const { root } = await setup();
      const links = Array.from(root().querySelectorAll<HTMLAnchorElement>('header a'));

      const settings = links.find((a) => a.textContent?.trim() === 'Settings');

      expect(settings?.getAttribute('href')).toBe('/settings');
      expect(links.some((a) => a.textContent?.trim() === 'Account')).toBe(false);
    });
  });

  describe('where Capture shows', () => {
    it.each(['/now', '/today', '/inbox'])('shows the pill and no bar on %s', async (url) => {
      const { pill, bar } = await setup(url);

      expect(pill()).not.toBeNull();
      expect(bar()).toBeNull();
    });

    it.each(['/tasks/x', '/settings'])('shows neither the pill nor the bar on %s', async (url) => {
      const { pill, bar } = await setup(url);

      expect(pill()).toBeNull();
      expect(bar()).toBeNull();
    });

    it('ignores the query when deciding the path', async () => {
      const { pill } = await setup('/now?x=1');

      expect(pill()).not.toBeNull();
    });
  });

  describe('opening and closing', () => {
    it('replaces the pill with the bar and focuses its input when the pill is clicked', async () => {
      const { pill, bar, input, open } = await setup();

      await open();

      expect(pill()).toBeNull();
      expect(bar()).not.toBeNull();
      expect(document.activeElement).toBe(input());
    });

    it('closes with the Close button, shows the pill again and focuses it', async () => {
      const { pill, bar, open, closeButton, settle } = await setup();

      await open();
      closeButton()?.click();
      await settle();

      expect(bar()).toBeNull();
      expect(pill()).not.toBeNull();
      expect(document.activeElement).toBe(pill());
    });

    it('closes on Escape, shows the pill again and focuses it', async () => {
      const { pill, bar, open, escape } = await setup();

      await open();
      await escape();

      expect(bar()).toBeNull();
      expect(document.activeElement).toBe(pill());
    });

    it('keeps the typed text for the next opening', async () => {
      const { input, open, type, escape } = await setup();

      await open();
      await type('Buy milk');
      await escape();
      await open();

      expect(input()?.value).toBe('Buy milk');
    });

    it('stays open when moving between /now, /today and /inbox', async () => {
      const { bar, open, go } = await setup('/now');

      await open();
      await go('/today');

      expect(bar()).not.toBeNull();

      await go('/inbox');

      expect(bar()).not.toBeNull();
    });

    it('closes on any other path and starts closed when coming back', async () => {
      const { pill, bar, open, go } = await setup('/now');

      await open();
      await go('/settings');

      expect(bar()).toBeNull();

      await go('/now');

      expect(bar()).toBeNull();
      expect(pill()).not.toBeNull();
    });
  });

  describe('adding', () => {
    it('sends a CaptureTask without an areaId, with the first id as taskId and the next as key', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('Buy milk');
      await submit();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[0]?.[1]).toBe('id-2');
    });

    it('sends the trimmed text', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('  Buy milk  ');
      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
    });

    it('on Applied clears the text, says it is captured and returns focus to the input', async () => {
      const { input, status, open, type, submit } = await setup();

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('Captured. It waits in the Inbox.');
      expect(document.activeElement).toBe(input());
    });

    it('uses a new taskId and key for the next add after Applied', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('Buy milk');
      await submit();
      await type('Buy milk');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on Failed keeps the text, shows the message and retries with the same command and key', async () => {
      const { send, input, status, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('Buy milk');
      expect(status()).toBe('ASYS cannot reach the server. Try again.');

      await submit();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-2');
    });

    it('uses a new taskId and key when the text changed after Failed', async () => {
      const { send, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      await type('Buy bread');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on Rejected keeps the text, shows the message and drops the pending command', async () => {
      const { send, input, status, open, type, submit } = await setup();

      send.mockResolvedValueOnce({
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.InvalidTitle,
      });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('Buy milk');
      expect(status()).toBe('Enter a title.');

      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on NotApplicable keeps the text and shows the Review item message', async () => {
      const { send, input, status, open, type, submit } = await setup();

      send.mockResolvedValueOnce({
        _tag: CommandOutcomeTag.NotApplicable,
        reason: 'x',
        reviewItemId: 'r',
      } as unknown as CommandOutcome);

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('Buy milk');
      expect(status()).toBe('That no longer applied, so it waits in the Inbox as a Review item.');
    });

    it('on KeyReused keeps the text and shows the generic message', async () => {
      const { send, input, status, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.KeyReused });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('Buy milk');
      expect(status()).toBe('Something went wrong. Try again.');
    });

    it('on SignedOut keeps the text and shows no message', async () => {
      const { send, input, status, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.SignedOut });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('Buy milk');
      expect(status()).toBe('');
    });

    it('clears the status message when the bar is opened again', async () => {
      const { send, status, open, type, submit, escape } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      await escape();
      await open();

      expect(status()).toBe('');
    });

    it('clears the text and leaves focus on the pill when an add resolves Applied after the bar closed', async () => {
      const { send, pill, input, open, type, submit, escape, settle } = await setup();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await open();
      await type('Buy milk');
      await submit();
      await escape();

      expect(document.activeElement).toBe(pill());

      pending.resolve(APPLIED);
      await settle();

      expect(document.activeElement).toBe(pill());

      await open();

      expect(input()?.value).toBe('');
    });

    it('drops a second add and disables Add while a send is pending', async () => {
      const { send, addButton, open, type, submit, settle } = await setup();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await open();
      await type('Buy milk');
      await submit();

      expect(addButton()?.disabled).toBe(true);

      await submit();

      expect(send).toHaveBeenCalledTimes(1);

      pending.resolve(APPLIED);
      await settle();
      await type('Buy bread');

      expect(addButton()?.disabled).toBe(false);
    });
  });
});
