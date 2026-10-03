// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { AppUpdate } from './app-update';
import { PageReload } from './page-reload';

interface FakeEvent {
  readonly type: string;
}

interface Setup {
  readonly appUpdate: AppUpdate;
  readonly events: Subject<FakeEvent>;
  readonly activateUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  readonly reload: ReturnType<typeof vi.fn<() => void>>;
}

const setup = (swUpdate: 'enabled' | 'disabled' | 'absent'): Setup => {
  const events = new Subject<FakeEvent>();
  const activateUpdate = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const reload = vi.fn<() => void>();
  TestBed.configureTestingModule({
    providers: [
      { provide: PageReload, useValue: { reload } },
      ...(swUpdate === 'absent'
        ? []
        : [
            {
              provide: SwUpdate,
              useValue: {
                isEnabled: swUpdate === 'enabled',
                versionUpdates: events,
                activateUpdate,
              },
            },
          ]),
    ],
  });

  return { appUpdate: TestBed.inject(AppUpdate), events, activateUpdate, reload };
};

describe('AppUpdate', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('ready', () => {
    it('starts false', () => {
      const { appUpdate } = setup('enabled');

      expect(appUpdate.ready()).toBe(false);
      expect(appUpdate.prompt()).toBe(false);
    });

    it('becomes true on VERSION_READY', () => {
      const { appUpdate, events } = setup('enabled');

      events.next({ type: 'VERSION_READY' });

      expect(appUpdate.ready()).toBe(true);
      expect(appUpdate.prompt()).toBe(true);
    });

    it.each(['VERSION_DETECTED', 'VERSION_INSTALLATION_FAILED', 'NO_NEW_VERSION_DETECTED'])(
      'ignores %s',
      (type) => {
        const { appUpdate, events } = setup('enabled');

        events.next({ type });

        expect(appUpdate.ready()).toBe(false);
      },
    );

    it('stays false when the service worker is not enabled', () => {
      const { appUpdate, events } = setup('disabled');

      events.next({ type: 'VERSION_READY' });

      expect(appUpdate.ready()).toBe(false);
    });

    it('stays false without SwUpdate and nothing throws', () => {
      expect(() => setup('absent')).not.toThrow();
      expect(TestBed.inject(AppUpdate).ready()).toBe(false);
    });
  });

  describe('hold and release', () => {
    it('hold makes prompt false while ready, release restores it', () => {
      const { appUpdate, events } = setup('enabled');
      events.next({ type: 'VERSION_READY' });

      appUpdate.hold();

      expect(appUpdate.ready()).toBe(true);
      expect(appUpdate.prompt()).toBe(false);

      appUpdate.release();

      expect(appUpdate.prompt()).toBe(true);
    });

    it('two holds need two releases', () => {
      const { appUpdate, events } = setup('enabled');
      events.next({ type: 'VERSION_READY' });

      appUpdate.hold();
      appUpdate.hold();
      appUpdate.release();

      expect(appUpdate.prompt()).toBe(false);

      appUpdate.release();

      expect(appUpdate.prompt()).toBe(true);
    });

    it('release never takes the count below 0', () => {
      const { appUpdate, events } = setup('enabled');
      events.next({ type: 'VERSION_READY' });

      appUpdate.release();
      appUpdate.release();
      appUpdate.hold();

      expect(appUpdate.prompt()).toBe(false);

      appUpdate.release();

      expect(appUpdate.prompt()).toBe(true);
    });

    it('a hold before the update is ready keeps the prompt hidden once it is', () => {
      const { appUpdate, events } = setup('enabled');
      appUpdate.hold();

      events.next({ type: 'VERSION_READY' });

      expect(appUpdate.ready()).toBe(true);
      expect(appUpdate.prompt()).toBe(false);
    });
  });

  describe('reload', () => {
    it('activates the update and then reloads the page', async () => {
      const { appUpdate, activateUpdate, reload } = setup('enabled');

      await appUpdate.reload();

      expect(activateUpdate).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(activateUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        reload.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('waits for activateUpdate before reloading', async () => {
      const { appUpdate, activateUpdate, reload } = setup('enabled');
      let finish: (value: boolean) => void = () => undefined;
      activateUpdate.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      );

      const done = appUpdate.reload();
      await Promise.resolve();

      expect(reload).not.toHaveBeenCalled();

      finish(true);
      await done;

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('still reloads when activateUpdate rejects', async () => {
      const { appUpdate, activateUpdate, reload } = setup('enabled');
      activateUpdate.mockRejectedValue(new Error('boom'));

      await expect(appUpdate.reload()).resolves.toBeUndefined();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads without SwUpdate', async () => {
      const { appUpdate, reload } = setup('absent');

      await appUpdate.reload();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not activate when the service worker is not enabled, but still reloads', async () => {
      const { appUpdate, activateUpdate, reload } = setup('disabled');

      await appUpdate.reload();

      expect(activateUpdate).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
