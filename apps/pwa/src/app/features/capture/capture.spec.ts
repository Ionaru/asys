// SPDX-License-Identifier: EUPL-1.2
import { Component, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CommandTag, RejectedReason, type Command } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore } from '../../core/data/data-store';
import { Ids } from '../../core/platform/ids';
import { Capture } from './capture';

@Component({ template: '' })
class Stub {}

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const SHARE_URL = '/capture?title=A%20page&text=https%3A%2F%2Fx.y';

const deferred = <V>() => {
  let resolve: (value: V) => void = () => undefined;
  const promise = new Promise<V>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

const captureCommand = (taskId: string, title: string, captureText: string = title): Command => ({
  _tag: CommandTag.CaptureTask,
  taskId,
  title,
  captureText,
});

const setup = async (url: string) => {
  let counter = 0;
  const send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();

  send.mockResolvedValue(APPLIED);

  const handleError = vi.fn<(error: unknown) => void>();

  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'capture', component: Capture },
          { path: 'inbox', component: Stub },
          { path: 'now', component: Stub },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataStore, useValue: { send } },
      { provide: ErrorHandler, useValue: { handleError } },
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
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }

    fixture.detectChanges();
  };

  const go = async (to: string): Promise<void> => {
    await harness.navigateByUrl(to, Capture);
    await settle();
  };

  const input = (): HTMLInputElement => root().querySelector('input') as HTMLInputElement;
  const addButton = (): HTMLButtonElement =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;
  const status = (): HTMLElement => root().querySelector('.capture__status') as HTMLElement;
  const statusText = (): string => status().textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const statusLinks = (): HTMLAnchorElement[] =>
    Array.from(status().querySelectorAll<HTMLAnchorElement>('a'));
  const routerUrl = (): string => TestBed.inject(Router).url;

  const type = async (text: string): Promise<void> => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };

  const submit = async (): Promise<void> => {
    root()
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };

  await go(url);

  return {
    send,
    handleError,
    root,
    settle,
    go,
    input,
    addButton,
    status,
    statusText,
    statusLinks,
    routerUrl,
    type,
    submit,
  };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Capture', () => {
  it('shows the heading', async () => {
    const { root } = await setup('/capture');

    expect(root().querySelector('h1.capture__title')?.textContent?.trim()).toBe('Capture');
  });

  describe('prefill', () => {
    it('shows the shared title in the Title field', async () => {
      const { input, root } = await setup(SHARE_URL);

      expect(input().value).toBe('A page');
      expect(root().querySelector('label')?.textContent?.trim()).toBe('Title');
    });

    it('shows an empty field when nothing is shared', async () => {
      const { input } = await setup('/capture');

      expect(input().value).toBe('');
    });

    it('follows a new share when the route is reused', async () => {
      const { input, go } = await setup(SHARE_URL);

      await go('/capture?title=Other%20page');

      expect(input().value).toBe('Other page');
    });
  });

  describe('adding a share', () => {
    it('sends the shared title and the whole shared text, with the first id as taskId and the next as key', async () => {
      const { send, submit } = await setup(SHARE_URL);

      await submit();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(
        captureCommand('id-1', 'A page', 'A page\nhttps://x.y'),
      );
      expect(send.mock.calls[0]?.[1]).toBe('id-2');
    });

    it('sends an edited title with the shared captureText unchanged', async () => {
      const { send, type, submit } = await setup(SHARE_URL);

      await type('Read later');
      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(
        captureCommand('id-1', 'Read later', 'A page\nhttps://x.y'),
      );
    });

    it('appends a shared url to the captureText', async () => {
      const { send, submit } = await setup('/capture?title=A%20page&url=https%3A%2F%2Fx.y');

      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(
        captureCommand('id-1', 'A page', 'A page\nhttps://x.y'),
      );
    });
  });

  describe('adding without a share', () => {
    it('sends the typed text as title and captureText, without an areaId', async () => {
      const { send, type, submit } = await setup('/capture');

      await type('Buy stamps');
      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy stamps'));
      expect(send.mock.calls[0]?.[1]).toBe('id-2');
    });

    it('sends the trimmed text', async () => {
      const { send, type, submit } = await setup('/capture');

      await type('  Buy stamps  ');
      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy stamps'));
    });

    it.each(['', '   '])('disables Add and sends nothing for the blank text %j', async (text) => {
      const { send, addButton, type, submit } = await setup('/capture');

      await type(text);

      expect(addButton().disabled).toBe(true);

      await submit();

      expect(send).not.toHaveBeenCalled();
    });

    it('enables Add once there is text', async () => {
      const { addButton, type } = await setup('/capture');

      await type('Buy stamps');

      expect(addButton().disabled).toBe(false);
    });
  });

  describe('Applied', () => {
    it('moves the URL to /capture, clears the field and keeps the confirmation with both links', async () => {
      const { input, statusText, statusLinks, routerUrl, submit } = await setup(SHARE_URL);

      await submit();

      expect(routerUrl()).toBe('/capture');
      expect(input().value).toBe('');
      expect(statusText()).toContain('Captured “A page”. It waits in the Inbox until Triage.');

      const links = statusLinks();

      expect(links.map((a) => a.textContent?.trim())).toStrictEqual([
        'Open the Inbox',
        'Go to Now',
      ]);
      expect(links.map((a) => a.getAttribute('href'))).toStrictEqual(['/inbox', '/now']);
    });

    it('confirms the trimmed title typed without a share', async () => {
      const { statusText, routerUrl, type, submit } = await setup('/capture');

      await type('  Buy stamps ');
      await submit();

      expect(routerUrl()).toBe('/capture');
      expect(statusText()).toContain('Captured “Buy stamps”.');
    });

    it('focuses the Title field', async () => {
      const { input, submit } = await setup(SHARE_URL);

      await submit();

      expect(document.activeElement).toBe(input());
    });

    it('keeps the status region in the DOM with the status role and no text before any add', async () => {
      const { status, statusText } = await setup('/capture');

      expect(status().getAttribute('role')).toBe('status');
      expect(statusText()).toBe('');
    });

    it('does not hide the empty status region, so the confirmation is announced', async () => {
      const { status } = await setup('/capture');

      expect(getComputedStyle(status()).display).not.toBe('none');
    });

    it('uses a new taskId and key for the next add', async () => {
      const { send, type, submit } = await setup(SHARE_URL);

      await submit();
      await type('Buy stamps');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy stamps'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('clears the confirmation when a new add starts', async () => {
      const { send, statusText, type, submit } = await setup(SHARE_URL);
      const pending = deferred<CommandOutcome>();

      await submit();

      expect(statusText()).toContain('Captured');

      send.mockReturnValueOnce(pending.promise);
      await type('Buy stamps');
      await submit();

      expect(statusText()).toBe('');

      pending.resolve(APPLIED);
    });
  });

  describe('Failed', () => {
    it('keeps the text, shows the message and resends the same taskId with the same key', async () => {
      const { send, input, statusText, routerUrl, submit } = await setup(SHARE_URL);

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await submit();

      expect(input().value).toBe('A page');
      expect(statusText()).toBe('ASYS cannot reach the server. Try again.');
      expect(routerUrl()).toContain('/capture?title=A%20page');

      await submit();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(
        captureCommand('id-1', 'A page', 'A page\nhttps://x.y'),
      );
      expect(send.mock.calls[1]?.[1]).toBe('id-2');
    });

    it('uses a new taskId and key when the title changed after Failed', async () => {
      const { send, type, submit } = await setup('/capture');

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await type('Buy stamps');
      await submit();
      await type('Buy bread');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });
  });

  describe('other outcomes', () => {
    it('on Rejected keeps the text, shows the message and drops the pending command', async () => {
      const { send, input, statusText, type, submit } = await setup('/capture');

      send.mockResolvedValueOnce({
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.InvalidTitle,
      });

      await type('Buy stamps');
      await submit();

      expect(input().value).toBe('Buy stamps');
      expect(statusText()).toBe('Enter a title.');

      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy stamps'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on KeyReused keeps the text and shows the generic message', async () => {
      const { send, input, statusText, type, submit } = await setup('/capture');

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.KeyReused });

      await type('Buy stamps');
      await submit();

      expect(input().value).toBe('Buy stamps');
      expect(statusText()).toBe('Something went wrong. Try again.');
    });

    it('on SignedOut keeps the text and shows no message', async () => {
      const { send, input, statusText, type, submit } = await setup('/capture');

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.SignedOut });

      await type('Buy stamps');
      await submit();

      expect(input().value).toBe('Buy stamps');
      expect(statusText()).toBe('');
    });

    it('clears an earlier message when a new add starts', async () => {
      const { send, statusText, type, submit } = await setup('/capture');
      const pending = deferred<CommandOutcome>();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await type('Buy stamps');
      await submit();

      expect(statusText()).not.toBe('');

      send.mockReturnValueOnce(pending.promise);
      await submit();

      expect(statusText()).toBe('');

      pending.resolve(APPLIED);
    });
  });

  describe('while a send is pending', () => {
    it('sends nothing on a second tap and disables Add', async () => {
      const { send, addButton, submit, settle } = await setup(SHARE_URL);
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await submit();

      expect(addButton().disabled).toBe(true);

      await submit();

      expect(send).toHaveBeenCalledTimes(1);

      pending.resolve(APPLIED);
      await settle();
    });
  });

  describe('when the screen is left while the send is pending', () => {
    it('does not navigate back to /capture or throw when the send resolves Applied', async () => {
      const { send, handleError, routerUrl, settle, submit } = await setup(SHARE_URL);
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);
      await submit();
      await TestBed.inject(Router).navigateByUrl('/now');
      await settle();
      pending.resolve(APPLIED);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(routerUrl()).toBe('/now');
      expect(handleError).not.toHaveBeenCalled();
    });
  });

  describe('not waiting for the working set', () => {
    it('can add at once because the store exposes no state', async () => {
      const { send, submit } = await setup(SHARE_URL);

      await submit();

      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
