// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type { DomainState, Instant } from '@asys/domain';

import { App } from './app';
import { Session, SessionState } from './core/auth/session';
import { DataStore, SyncStatus } from './core/data/data-store';
import { AppUpdate } from './core/platform/app-update';
import { DeviceZone } from './core/platform/device-zone';

@Component({ template: '' })
class Stub {}

const SYNCED_AT: Instant = Date.parse('2026-10-03T08:05:00Z');

const stateIn = (timeZone: string): DomainState =>
  ({ settings: { timeZone } }) as unknown as DomainState;

const setup = async (initial: SessionState, url = '/now') => {
  const sessionState = signal(initial);
  const check = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const status = signal(SyncStatus.Ready);
  const state = signal<DomainState | null>(null);
  const syncedAt = signal<Instant | null>(null);
  const start = vi.fn<() => void>();
  const stop = vi.fn<() => void>();
  const prompt = signal(false);
  const reload = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'now', component: Stub },
          { path: 'account', component: Stub },
          { path: 'signin', component: Stub },
          { path: 'signup', component: Stub },
          { path: 'recover', component: Stub },
        ],
        withComponentInputBinding(),
      ),
      { provide: Session, useValue: { state: sessionState, me: signal(null), check } },
      {
        provide: DataStore,
        useValue: {
          status,
          state,
          syncedAt,
          now: signal(null),
          inboxCount: signal(0),
          start,
          stop,
        },
      },
      { provide: AppUpdate, useValue: { prompt, reload } },
      { provide: DeviceZone, useValue: { current: () => 'Europe/Amsterdam' } },
    ],
  });

  const router = TestBed.inject(Router);

  await router.navigateByUrl(url);

  const fixture = TestBed.createComponent(App);
  const root = (): HTMLElement => fixture.nativeElement;

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      TestBed.tick();
      await fixture.whenStable();
      await new Promise<void>((resolve) => setTimeout(resolve));
    }

    fixture.detectChanges();
  };

  await settle();

  const banners = (): string[] =>
    Array.from(root().querySelectorAll('[role="status"]')).map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  return {
    router,
    root,
    settle,
    banners,
    sessionState,
    check,
    status,
    state,
    syncedAt,
    start,
    stop,
    prompt,
    reload,
  };
};

describe('App', () => {
  it('renders the router outlet', async () => {
    const { root } = await setup(SessionState.Unknown);

    expect(root().querySelector('router-outlet')).not.toBeNull();
  });

  describe('data store', () => {
    it('starts once when the session is signed in', async () => {
      const { start, stop } = await setup(SessionState.SignedIn);

      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
    });

    it('starts when the session becomes signed in', async () => {
      const { sessionState, settle, start } = await setup(SessionState.Unknown);

      expect(start).not.toHaveBeenCalled();

      sessionState.set(SessionState.SignedIn);
      await settle();

      expect(start).toHaveBeenCalledTimes(1);
    });

    it('stops once when the session becomes signed out after a start', async () => {
      const { sessionState, settle, start, stop } = await setup(SessionState.SignedIn);

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(stop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
    });

    it('does nothing when signed in becomes unreachable', async () => {
      const { sessionState, settle, start, stop } = await setup(SessionState.SignedIn);

      sessionState.set(SessionState.Unreachable);
      await settle();

      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
    });

    it('does nothing when the session is set to the same value again', async () => {
      const { sessionState, settle, start, stop } = await setup(SessionState.SignedIn);

      sessionState.set(SessionState.SignedIn);
      await settle();

      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
    });
  });

  describe('signed out while inside', () => {
    it('navigates from /now to sign-in with the return URL when signed in becomes signed out', async () => {
      const { router, sessionState, settle } = await setup(SessionState.SignedIn, '/now');

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(router.url).toBe('/signin?returnUrl=%2Fnow');
    });

    it('navigates from /now to sign-in with the return URL when unreachable becomes signed out', async () => {
      const { router, sessionState, settle } = await setup(SessionState.Unreachable, '/now');

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(router.url).toBe('/signin?returnUrl=%2Fnow');
    });

    it('navigates from /account to /signin without a return URL', async () => {
      const { router, sessionState, settle } = await setup(SessionState.SignedIn, '/account');

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(router.url).toBe('/signin');
    });

    it('does not navigate when already at /signin', async () => {
      const { router, sessionState, settle } = await setup(SessionState.SignedIn, '/signin');

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(router.url).toBe('/signin');
    });

    it('does not navigate when unknown becomes signed out', async () => {
      const { router, sessionState, settle } = await setup(SessionState.Unknown, '/now');

      sessionState.set(SessionState.SignedOut);
      await settle();

      expect(router.url).toBe('/now');
    });
  });

  describe('update prompt', () => {
    it('is absent while there is no update', async () => {
      const { banners } = await setup(SessionState.SignedIn);

      expect(banners()).toEqual([]);
    });

    it('shows its text and a Reload button while the prompt is true', async () => {
      const { root, banners, prompt, settle } = await setup(SessionState.SignedIn);

      prompt.set(true);
      await settle();

      expect(banners()).toEqual(['A new version of ASYS is ready. Reload']);
      expect(
        Array.from(root().querySelectorAll('button')).some(
          (b) => b.textContent?.trim() === 'Reload',
        ),
      ).toBe(true);
    });

    it('calls reload when Reload is clicked', async () => {
      const { root, prompt, settle, reload } = await setup(SessionState.SignedIn);

      prompt.set(true);
      await settle();
      const button = Array.from(root().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Reload',
      );
      button?.click();
      await settle();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('goes away when the prompt becomes false', async () => {
      const { banners, prompt, settle } = await setup(SessionState.SignedIn);

      prompt.set(true);
      await settle();
      prompt.set(false);
      await settle();

      expect(banners()).toEqual([]);
    });
  });

  describe('unreachable banner', () => {
    it('shows while the session is unreachable', async () => {
      const { banners } = await setup(SessionState.Unreachable);

      expect(banners()).toEqual(['ASYS cannot reach the server.']);
    });

    it('is absent in the other session states', async () => {
      for (const state of [SessionState.Unknown, SessionState.SignedIn, SessionState.SignedOut]) {
        TestBed.resetTestingModule();
        const { banners } = await setup(state);

        expect(banners()).toEqual([]);
      }
    });
  });

  describe('stale banner', () => {
    it('shows the last sync time in the Current time zone inside span.asys-num', async () => {
      const { root, banners, status, state, syncedAt, settle } = await setup(SessionState.SignedIn);

      state.set(stateIn('Europe/Amsterdam'));
      syncedAt.set(SYNCED_AT);
      status.set(SyncStatus.Stale);
      await settle();

      expect(banners()).toEqual(['Showing what was loaded at 10:05. Trying again.']);
      expect(root().querySelector('[role="status"] span.asys-num')?.textContent?.trim()).toBe(
        '10:05',
      );
    });

    it('uses the time zone of the state', async () => {
      const { banners, status, state, syncedAt, settle } = await setup(SessionState.SignedIn);

      state.set(stateIn('UTC'));
      syncedAt.set(SYNCED_AT);
      status.set(SyncStatus.Stale);
      await settle();

      expect(banners()).toEqual(['Showing what was loaded at 08:05. Trying again.']);
    });

    it('falls back to the device zone when the state zone is unknown to this browser', async () => {
      const { banners, status, state, syncedAt, settle } = await setup(SessionState.SignedIn);

      state.set(stateIn('Mars/Olympus'));
      syncedAt.set(SYNCED_AT);
      status.set(SyncStatus.Stale);
      await settle();

      expect(banners()).toEqual(['Showing what was loaded at 10:05. Trying again.']);
    });

    it.each([SyncStatus.Idle, SyncStatus.Loading, SyncStatus.Ready, SyncStatus.Failed])(
      'is absent while the status is %s',
      async (status) => {
        const setupResult = await setup(SessionState.SignedIn);

        setupResult.state.set(stateIn('Europe/Amsterdam'));
        setupResult.syncedAt.set(SYNCED_AT);
        setupResult.status.set(status);
        await setupResult.settle();

        expect(setupResult.banners()).toEqual([]);
      },
    );
  });

  describe('retry while unreachable', () => {
    it('checks the session on focus', async () => {
      const { check, settle } = await setup(SessionState.Unreachable);

      window.dispatchEvent(new Event('focus'));
      await settle();

      expect(check).toHaveBeenCalledTimes(1);
    });

    it('checks the session on online', async () => {
      const { check, settle } = await setup(SessionState.Unreachable);

      window.dispatchEvent(new Event('online'));
      await settle();

      expect(check).toHaveBeenCalledTimes(1);
    });

    it.each([SessionState.Unknown, SessionState.SignedIn, SessionState.SignedOut])(
      'does not check the session on focus or online while %s',
      async (initial) => {
        const { check, settle } = await setup(initial);

        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));
        await settle();

        expect(check).not.toHaveBeenCalled();
      },
    );

    it('stops checking once the session is reachable again', async () => {
      const { sessionState, check, settle } = await setup(SessionState.Unreachable);

      sessionState.set(SessionState.SignedIn);
      await settle();
      window.dispatchEvent(new Event('focus'));
      await settle();

      expect(check).not.toHaveBeenCalled();
    });
  });
});
