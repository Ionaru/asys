// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Service, signal, type Signal } from '@angular/core';
import type { AreaPick, Instant } from '@asys/domain';

import { Clock } from '../platform/clock';
import { DeviceStorage } from '../platform/device-storage';

/** Where the pick is kept in DeviceStorage. */
export const AREA_PICK_KEY = 'asys.areaPick';

/** Reads a stored pick; anything malformed reads as no pick. */
const parsePick = (raw: string | null): AreaPick | null => {
  if (raw === null) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { areaId, endsAt } = value as { areaId?: unknown; endsAt?: unknown };

  if (typeof areaId !== 'string' || areaId === '' || typeof endsAt !== 'number') {
    return null;
  }

  return Number.isFinite(endsAt) ? { areaId, endsAt: endsAt as Instant } : null;
};

/** The Area picked in Now on this device, kept in DeviceStorage until it ends. */
@Service()
export class AreaPickStore {
  readonly #storage = inject(DeviceStorage);
  readonly #clock = inject(Clock);
  readonly #document = inject(DOCUMENT);

  readonly #stored = signal<AreaPick | null>(parsePick(this.#storage.get(AREA_PICK_KEY)));

  /** The stored pick while the Clock is before its endsAt; null when there is none, it is malformed or it has ended. */
  readonly current: Signal<AreaPick | null> = computed<AreaPick | null>(() => {
    const stored = this.#stored();

    return stored !== null && this.#clock.now() < stored.endsAt ? stored : null;
  });

  constructor() {
    const view = this.#document.defaultView;

    if (view === null) {
      return;
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key === AREA_PICK_KEY || event.key === null) {
        this.#stored.set(parsePick(this.#storage.get(AREA_PICK_KEY)));
      }
    };

    view.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      view.removeEventListener('storage', onStorage);
    });
  }

  /** Keeps the pick on this device. */
  pick(value: AreaPick): void {
    this.#storage.set(
      AREA_PICK_KEY,
      JSON.stringify({ areaId: value.areaId, endsAt: value.endsAt }),
    );
    this.#stored.set({ areaId: value.areaId, endsAt: value.endsAt });
  }

  /** Forgets the pick on this device. */
  clear(): void {
    this.#storage.remove(AREA_PICK_KEY);
    this.#stored.set(null);
  }
}
