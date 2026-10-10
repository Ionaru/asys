// SPDX-License-Identifier: EUPL-1.2
import { DestroyRef, inject, signal, type Signal } from '@angular/core';

import { AppUpdate } from '../../core/platform/app-update';

/** What the copy status reads after the codes were written to the clipboard. */
const COPIED_MESSAGE = 'Copied.';

/** What the copy status reads when the clipboard refused the codes. */
const COPY_FAILED_MESSAGE = 'Could not copy. Select the codes instead.';

/** Recovery codes a screen shows once, with the update prompt held back while they are on it. */
export interface RecoveryCodesRef {
  readonly codes: Signal<readonly string[]>;
  readonly copyStatus: Signal<string | null>;
  /** Shows a new set, clears the copy status and holds the update prompt unless it already does. */
  show(codes: readonly string[]): void;
  /** Clears the codes and the copy status and releases the hold, if there is one. */
  hide(): void;
  /** Writes the codes to the clipboard, one per line, and reports the outcome in `copyStatus`. */
  copy(): Promise<void>;
}

/**
 * Keeps recovery codes in memory while a screen shows them. Call it in an injection context: when
 * that context is destroyed, the codes are cleared and any hold is released.
 */
export const recoveryCodes = (): RecoveryCodesRef => {
  const appUpdate = inject(AppUpdate);

  const codes = signal<readonly string[]>([]);

  const copyStatus = signal<string | null>(null);

  let held = false;

  const release = (): void => {
    if (held) {
      held = false;
      appUpdate.release();
    }
  };

  const show = (next: readonly string[]): void => {
    codes.set(next);
    copyStatus.set(null);

    if (!held) {
      held = true;
      appUpdate.hold();
    }
  };

  const hide = (): void => {
    codes.set([]);
    copyStatus.set(null);
    release();
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(codes().join('\n'));
      copyStatus.set(COPIED_MESSAGE);
    } catch {
      copyStatus.set(COPY_FAILED_MESSAGE);
    }
  };

  inject(DestroyRef).onDestroy(() => {
    codes.set([]);
    release();
  });

  return { codes: codes.asReadonly(), copyStatus: copyStatus.asReadonly(), show, hide, copy };
};
