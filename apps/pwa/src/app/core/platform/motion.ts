// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';

import { ThemeName } from './theme';

/** Motion duration tokens; `Motion.play` resolves them to milliseconds. */
export enum MotionDuration {
  Quick = 'var(--duration-quick)',
  Moderate = 'var(--duration-moderate)',
}

/** Motion easing tokens; `Motion.play` resolves them to a timing function. */
export enum MotionEasing {
  Out = 'var(--ease-out)',
  In = 'var(--ease-in)',
  Emphasized = 'var(--ease-emphasized)',
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const TOKEN_REFERENCE = /^var\((--[\w-]+)\)$/;

/** The custom property named by a `var(--name)` string, or undefined for any other string. */
const tokenName = (value: string): string | undefined => TOKEN_REFERENCE.exec(value)?.[1];

/** A CSS time in milliseconds or seconds, as milliseconds; a bare number counts as milliseconds. */
const toMilliseconds = (time: string): number => {
  const value = Number.parseFloat(time);

  return time.endsWith('s') && !time.endsWith('ms') ? value * 1000 : value;
};

/** The one way script code animates: honours reduced motion and the Voice only theme, resolves motion tokens. */
@Service()
export class Motion {
  readonly #document = inject(DOCUMENT);

  readonly #reducedSignal = signal(false);

  readonly reduced: Signal<boolean> = this.#reducedSignal.asReadonly();

  constructor() {
    const mql =
      typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;

    if (mql === undefined) {
      return;
    }

    this.#reducedSignal.set(mql.matches);

    const handler = (event: Event): void => {
      this.#reducedSignal.set((event as MediaQueryListEvent).matches);
    };

    mql.addEventListener('change', handler);
    inject(DestroyRef).onDestroy(() => {
      mql.removeEventListener('change', handler);
    });
  }

  /** Whether script may animate right now. Read live, because the theme can change at any time. */
  allowed(): boolean {
    return (
      typeof Element.prototype.animate === 'function' &&
      !this.reduced() &&
      this.#document.documentElement.getAttribute('data-theme') !== ThemeName.Drive
    );
  }

  /** Animates `el` and resolves when it ends or is cancelled; resolves at once when not allowed. */
  async play(
    el: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ): Promise<void> {
    if (!this.allowed()) {
      return;
    }

    const resolved = this.#resolveOptions(options);

    if (resolved === undefined) {
      return;
    }

    try {
      await el.animate(keyframes, resolved).finished;
    } catch (error) {
      // A cancelled animation is not a failure for the caller.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      throw error;
    }
  }

  /** The options with `duration` and `easing` tokens resolved; undefined when a token has no value. */
  #resolveOptions(options: KeyframeAnimationOptions): KeyframeAnimationOptions | undefined {
    const resolved = { ...options };

    if (typeof options.duration === 'string') {
      const name = tokenName(options.duration);

      if (name !== undefined) {
        const duration = toMilliseconds(this.#readToken(name));

        if (!Number.isFinite(duration)) {
          return undefined;
        }

        resolved.duration = duration;
      }
    }

    if (typeof options.easing === 'string') {
      const name = tokenName(options.easing);

      if (name !== undefined) {
        const easing = this.#readToken(name);

        if (easing === '') {
          return undefined;
        }

        resolved.easing = easing;
      }
    }

    return resolved;
  }

  /** The computed value of a custom property on the root element, trimmed; empty when unset. */
  #readToken(name: string): string {
    const root = this.#document.documentElement;
    const view = this.#document.defaultView ?? window;

    return view.getComputedStyle(root).getPropertyValue(name).trim();
  }
}
