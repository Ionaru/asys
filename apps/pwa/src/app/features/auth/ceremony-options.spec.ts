// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  AuthError,
  AuthResultTag,
  type AuthResult,
  type CeremonyOptions,
} from '../../core/api/auth-api';
import { ceremonyOptions, OPTIONS_MAX_AGE_MS, type CeremonyOptionsRef } from './ceremony-options';

type Options = { readonly n: number };

type Loaded = AuthResult<CeremonyOptions<Options>>;

const loaded = (n: number): Loaded => ({
  _tag: AuthResultTag.Ok,
  value: { challengeId: `challenge-${n}`, options: { n } },
});

const failed = (error: AuthError): Loaded => ({ _tag: AuthResultTag.Failed, error });

let load = vi.fn<() => Promise<Loaded>>();

@Component({ template: '' })
class Host {
  readonly enabled = signal(true);

  readonly ref: CeremonyOptionsRef<Options> = ceremonyOptions(
    () => load(),
    () => this.enabled(),
  );
}

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(0);
};

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(0);
};

const create = async (): Promise<ComponentFixture<Host>> => {
  const fixture = TestBed.createComponent(Host);
  await settle();

  return fixture;
};

const callsOf = (): number => load.mock.calls.length;

describe('ceremonyOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T09:00:00Z'));
    let n = 0;
    load = vi.fn<() => Promise<Loaded>>().mockImplementation(() => {
      n += 1;

      return Promise.resolve(loaded(n));
    });
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes a max age of 4 minutes', () => {
    expect(OPTIONS_MAX_AGE_MS).toBe(240_000);
  });

  describe('loading', () => {
    it('is idle while disabled: no request, no options, no error', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.enabled.set(false);
      await settle();

      expect(callsOf()).toBe(0);
      expect(fixture.componentInstance.ref.options()).toBeNull();
      expect(fixture.componentInstance.ref.error()).toBeNull();
    });

    it('loads once it becomes enabled', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.enabled.set(false);
      await settle();

      fixture.componentInstance.enabled.set(true);
      await settle();

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()).toEqual({
        challengeId: 'challenge-1',
        options: { n: 1 },
      });
    });

    it('loads when enabled from the start and exposes the options with no error', async () => {
      const fixture = await create();

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()).toEqual({
        challengeId: 'challenge-1',
        options: { n: 1 },
      });
      expect(fixture.componentInstance.ref.error()).toBeNull();
    });

    it('has null options and null error while the load is pending', async () => {
      load.mockReturnValue(new Promise<Loaded>(() => undefined));

      const fixture = await create();

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()).toBeNull();
      expect(fixture.componentInstance.ref.error()).toBeNull();
    });

    it('exposes the AuthError of a failed load and no options', async () => {
      load.mockResolvedValue(failed(AuthError.Network));

      const fixture = await create();

      expect(fixture.componentInstance.ref.options()).toBeNull();
      expect(fixture.componentInstance.ref.error()).toBe(AuthError.Network);
    });

    it('loads when no enabled function is given', async () => {
      @Component({ template: '' })
      class Plain {
        readonly ref = ceremonyOptions(() => load());
      }

      const fixture = TestBed.createComponent(Plain);
      await settle();

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()?.challengeId).toBe('challenge-1');
    });
  });

  describe('discard', () => {
    it('drops the options and loads new ones at once', async () => {
      const fixture = await create();

      fixture.componentInstance.ref.discard();
      await settle();

      expect(callsOf()).toBe(2);
      expect(fixture.componentInstance.ref.options()?.challengeId).toBe('challenge-2');
    });

    it('has no options while the reload is pending', async () => {
      const fixture = await create();
      load.mockReturnValue(new Promise<Loaded>(() => undefined));

      fixture.componentInstance.ref.discard();

      expect(fixture.componentInstance.ref.options()).toBeNull();

      await settle();

      expect(callsOf()).toBe(2);
      expect(fixture.componentInstance.ref.options()).toBeNull();
    });

    it('clears a previous error when the reload succeeds', async () => {
      load.mockResolvedValueOnce(failed(AuthError.Unexpected));
      const fixture = await create();
      expect(fixture.componentInstance.ref.error()).toBe(AuthError.Unexpected);

      fixture.componentInstance.ref.discard();
      await settle();

      expect(fixture.componentInstance.ref.error()).toBeNull();
      expect(fixture.componentInstance.ref.options()).not.toBeNull();
    });

    it('does not load while disabled', async () => {
      const fixture = await create();
      fixture.componentInstance.enabled.set(false);
      await settle();

      fixture.componentInstance.ref.discard();
      await settle();

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()).toBeNull();
    });
  });

  describe('age timer', () => {
    it('refetches when the options are 4 minutes old, not before', async () => {
      await create();

      await advance(OPTIONS_MAX_AGE_MS - 1);

      expect(callsOf()).toBe(1);

      await advance(1);

      expect(callsOf()).toBe(2);
    });

    it('arms the timer from the time the load resolved, again for every new load', async () => {
      await create();

      await advance(OPTIONS_MAX_AGE_MS);
      expect(callsOf()).toBe(2);

      await advance(OPTIONS_MAX_AGE_MS - 1);
      expect(callsOf()).toBe(2);

      await advance(1);
      expect(callsOf()).toBe(3);
    });

    it('does not arm a timer when the load failed', async () => {
      load.mockResolvedValue(failed(AuthError.Network));
      await create();

      await advance(OPTIONS_MAX_AGE_MS * 3);

      expect(callsOf()).toBe(1);
    });

    it('discard restarts the age from the new load, not the first one', async () => {
      const fixture = await create();
      await advance(OPTIONS_MAX_AGE_MS - 1_000);

      fixture.componentInstance.ref.discard();
      await settle();
      expect(callsOf()).toBe(2);

      await advance(2_000);
      expect(callsOf()).toBe(2);

      await advance(OPTIONS_MAX_AGE_MS - 2_000);
      expect(callsOf()).toBe(3);
    });

    it('stops the timer when enabled turns false', async () => {
      const fixture = await create();

      fixture.componentInstance.enabled.set(false);
      await settle();
      await advance(OPTIONS_MAX_AGE_MS * 2);

      expect(callsOf()).toBe(1);
      expect(fixture.componentInstance.ref.options()).toBeNull();
    });

    it('with a load pending, the old timer does not fire a second refetch', async () => {
      const fixture = await create();
      await advance(OPTIONS_MAX_AGE_MS - 1_000);
      load.mockReturnValue(new Promise<Loaded>(() => undefined));

      fixture.componentInstance.ref.discard();
      await settle();
      await advance(OPTIONS_MAX_AGE_MS * 2);

      expect(callsOf()).toBe(2);
    });

    it('timer of the first load does not fire after an event-driven refetch (t0, t1 example)', async () => {
      await create();
      const t0 = Date.now();

      vi.setSystemTime(t0 + OPTIONS_MAX_AGE_MS);
      window.dispatchEvent(new Event('online'));
      await settle();

      expect(callsOf()).toBe(2);
      const t1 = Date.now();

      await advance(OPTIONS_MAX_AGE_MS - 1);
      expect(Date.now()).toBe(t1 + OPTIONS_MAX_AGE_MS - 1);
      expect(callsOf()).toBe(2);

      await advance(1);
      expect(callsOf()).toBe(3);
    });
  });

  describe('visibility and online', () => {
    it('refetches on visibilitychange to visible once the options are 4 minutes old', async () => {
      await create();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS);
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(2);
    });

    it('does not refetch on visibilitychange before 4 minutes', async () => {
      await create();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS - 1);
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(1);
    });

    it('does not refetch when the page became hidden', async () => {
      await create();
      setVisibility('hidden');

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS * 2);
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(1);
    });

    it('refetches on online once the options are 4 minutes old', async () => {
      await create();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS);
      window.dispatchEvent(new Event('online'));
      await settle();

      expect(callsOf()).toBe(2);
    });

    it('does not refetch on online before 4 minutes', async () => {
      await create();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS - 1);
      window.dispatchEvent(new Event('online'));
      await settle();

      expect(callsOf()).toBe(1);
    });

    it('does nothing when there are no options (failed load)', async () => {
      load.mockResolvedValue(failed(AuthError.Network));
      await create();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS * 2);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(1);
    });

    it('does nothing while disabled', async () => {
      const fixture = await create();
      fixture.componentInstance.enabled.set(false);
      await settle();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS * 2);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(1);
    });
  });

  describe('destroy', () => {
    it('removes the timer', async () => {
      const fixture = await create();

      fixture.destroy();
      await advance(OPTIONS_MAX_AGE_MS * 2);

      expect(callsOf()).toBe(1);
    });

    it('removes the online and visibility listeners', async () => {
      const fixture = await create();

      fixture.destroy();
      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS * 2);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(callsOf()).toBe(1);
    });
  });
});
