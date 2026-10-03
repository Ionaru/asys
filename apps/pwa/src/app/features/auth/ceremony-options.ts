// SPDX-License-Identifier: EUPL-1.2
import { computed, DestroyRef, effect, inject, resource, signal, type Signal } from '@angular/core';

import {
  AuthResultTag,
  type AuthError,
  type AuthResult,
  type CeremonyOptions,
} from '../../core/api/auth-api';

/** How long begin options are kept before they are refetched (the server keeps them 5 minutes). */
export const OPTIONS_MAX_AGE_MS = 240_000;

/** Passkey begin options held briefly by a screen. */
export interface CeremonyOptionsRef<O> {
  readonly options: Signal<CeremonyOptions<O> | null>;
  readonly error: Signal<AuthError | null>;
  /** Drops the current options and starts a new load (when enabled). */
  discard(): void;
}

interface Loaded<O> {
  readonly version: number;
  readonly result: AuthResult<CeremonyOptions<O>>;
}

/** Loads passkey begin options and refetches them once they are about to expire. */
export const ceremonyOptions = <O>(
  load: () => Promise<AuthResult<CeremonyOptions<O>>>,
  enabled: () => boolean = () => true,
): CeremonyOptionsRef<O> => {
  const version = signal(0);

  const discardedVersion = signal(-1);

  let timer: ReturnType<typeof setTimeout> | null = null;

  let fetchedAt: number | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = null;
    fetchedAt = null;
  };

  const discard = (): void => {
    clearTimer();
    discardedVersion.set(version());
    version.update((current) => current + 1);
  };

  const loaded = resource<Loaded<O>, number | undefined>({
    params: () => (enabled() ? version() : undefined),
    loader: async ({ params, abortSignal }) => {
      clearTimer();

      const result = await load();

      if (!abortSignal.aborted && result._tag === AuthResultTag.Ok) {
        clearTimer();
        fetchedAt = Date.now();
        timer = setTimeout(discard, OPTIONS_MAX_AGE_MS);
      }

      return { version: params, result };
    },
  });

  effect(() => {
    if (!enabled()) {
      clearTimer();
    }
  });

  const discardIfOld = (): void => {
    if (fetchedAt !== null && Date.now() - fetchedAt >= OPTIONS_MAX_AGE_MS) {
      discard();
    }
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      discardIfOld();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', discardIfOld);

  inject(DestroyRef).onDestroy(() => {
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', discardIfOld);
  });

  const current = computed((): Loaded<O> | null => {
    if (!loaded.hasValue()) {
      return null;
    }

    const value = loaded.value();

    return value.version === discardedVersion() ? null : value;
  });

  const options = computed((): CeremonyOptions<O> | null => {
    const value = current();

    return value !== null && value.result._tag === AuthResultTag.Ok ? value.result.value : null;
  });

  const error = computed((): AuthError | null => {
    const value = current();

    return value !== null && value.result._tag === AuthResultTag.Failed ? value.result.error : null;
  });

  return { options, error, discard };
};
