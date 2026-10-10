// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { Haptics } from '../../core/platform/haptics';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { ThemeName } from '../../core/platform/theme';
import { Icon, IconName } from '../icon/icon';
import {
  CLICK_SUPPRESS_MS,
  RUBBER_BAND_FACTOR,
  RUBBER_BAND_MAX_PX,
  SwipeOutcome,
  swipeDecision,
  velocityOf,
} from './swipe-decision';
import type { SwipeDecisionInput, SwipeSample } from './swipe-decision';

/** The pointer types that may swipe; a mouse never does. */
enum SwipePointer {
  Touch = 'touch',
  Pen = 'pen',
}

/** A press on one of these keeps its own meaning, so it never starts a swipe. */
const OWN_GESTURE_TARGETS = 'input, textarea, select, asys-log-progress-form';

/**
 * Lets a person swipe a Task's content toward the end (Done) or the start (Log progress) on a touch
 * screen. Only the content surface moves, over reveals that sit behind it. A gesture that is a scroll,
 * a pinch or a tap stays with the browser. The gesture state lives in plain fields and the surface,
 * the reveals and the armed class are written straight to the DOM, so a move runs no change detection.
 */
@Component({
  selector: 'asys-swipe-actions',
  imports: [Icon],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-swipe' },
  templateUrl: './swipe-actions.component.html',
  styleUrl: './swipe-actions.css',
})
export class SwipeActions {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #document = inject(DOCUMENT);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  readonly #changeDetector = inject(ChangeDetectorRef);

  readonly #motion = inject(Motion);

  readonly #haptics = inject(Haptics);

  protected readonly Icons = IconName;

  /** The Task the content shows; a commit emits the id read at pointerdown, and only while it still matches. */
  readonly taskId = input.required<string>();

  /** Turns the whole gesture off, for a row that is busy or cannot be swiped. */
  readonly disabled = input<boolean>(false);

  /** Whether a swipe toward the end (right, Done) commits. */
  readonly endEnabled = input<boolean>(true);

  /** Whether a swipe toward the start (left, Log progress) commits. */
  readonly startEnabled = input<boolean>(false);

  /** Emits the Task id recorded at pointerdown when a swipe toward the end commits. */
  readonly commitEnd = output<string>();

  /** Emits the Task id recorded at pointerdown when a swipe toward the start commits. */
  readonly commitStart = output<string>();

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  private readonly endReveal = viewChild.required<ElementRef<HTMLElement>>('endReveal');

  private readonly startReveal = viewChild.required<ElementRef<HTMLElement>>('startReveal');

  /** The pointer of the gesture in progress, or null when there is none. */
  #pointerId: number | null = null;

  #startX = 0;

  #startY = 0;

  /** The Task id at pointerdown, so a commit still names the Task the person swiped. */
  #recordedId = '';

  /** The host's width at pointerdown, the base of the distance threshold. */
  #width = 0;

  #viewportWidth = 0;

  /** True once the gesture has been taken for a horizontal drag. */
  #locked = false;

  #samples: SwipeSample[] = [];

  /** The surface's offset after the last move, rubber-banded toward a direction that has no action. */
  #offset = 0;

  /** Whether releasing now would commit. */
  #armed = false;

  /** True from release until the reset, while the surface animates and no new gesture may start. */
  #settling = false;

  /** Whether the click that follows a swipe is swallowed. */
  #suppressClick = false;

  #suppressTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const host = this.#host.nativeElement;

    host.addEventListener('pointerdown', this.#onPointerDown);
    host.addEventListener('pointermove', this.#onPointerMove);
    host.addEventListener('pointerup', this.#onPointerUp);
    host.addEventListener('pointercancel', this.#onPointerCancel);
    host.addEventListener('click', this.#onClick, { capture: true });

    this.#destroyRef.onDestroy(() => {
      host.removeEventListener('pointerdown', this.#onPointerDown);
      host.removeEventListener('pointermove', this.#onPointerMove);
      host.removeEventListener('pointerup', this.#onPointerUp);
      host.removeEventListener('pointercancel', this.#onPointerCancel);
      host.removeEventListener('click', this.#onClick, { capture: true });
      this.#disarmClickSuppression();
    });
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    const now = performance.now();

    this.#disarmClickSuppression();

    if (!event.isPrimary) {
      // A second finger means a pinch, so a gesture that has not locked yet is given up.
      if (this.#pointerId !== null && !this.#locked) {
        this.#clearGesture();
      }

      return;
    }

    if (this.#settling || this.disabled() || this.#inVoice() || !this.#mayStartOn(event)) {
      return;
    }

    if (this.#locked) {
      // A drag whose pointerup and pointercancel never arrived: put its surface back before the new one.
      this.#reset();
    }

    this.#pointerId = event.pointerId;
    this.#startX = event.clientX;
    this.#startY = event.clientY;
    this.#recordedId = this.taskId();
    this.#width = this.#host.nativeElement.getBoundingClientRect().width;
    this.#viewportWidth = window.innerWidth;
    this.#locked = false;
    this.#samples = [{ x: event.clientX, t: now }];
    this.#offset = 0;
    this.#armed = false;
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) {
      return;
    }

    this.#samples.push({ x: event.clientX, t: performance.now() });

    const dx = event.clientX - this.#startX;
    const dy = event.clientY - this.#startY;

    if (!this.#locked) {
      const outcome = swipeDecision(this.#decisionInput(dx, dy, 0, false));

      if (outcome === SwipeOutcome.Pending) {
        return;
      }

      if (outcome !== SwipeOutcome.Track) {
        this.#clearGesture();

        return;
      }

      this.#locked = true;
      this.#capturePointer(event.pointerId);
    }

    this.#track(dx, dy);
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) {
      return;
    }

    if (!this.#locked) {
      this.#clearGesture();

      return;
    }

    this.#samples.push({ x: event.clientX, t: performance.now() });
    this.#armClickSuppression();

    const dx = event.clientX - this.#startX;
    const dy = event.clientY - this.#startY;
    const outcome = swipeDecision(this.#decisionInput(dx, dy, velocityOf(this.#samples), true));

    void this.#settle(outcome, this.#offsetFor(dx));
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) {
      return;
    }

    if (!this.#locked) {
      this.#clearGesture();

      return;
    }

    void this.#settle(SwipeOutcome.SpringBack, this.#offset);
  };

  /** Swallows the click that follows a swipe, so a drag that began on a link does not follow it. */
  readonly #onClick = (event: Event): void => {
    if (!this.#suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.#disarmClickSuppression();
  };

  /** Whether the Voice only theme is on; the gesture is off there, as large buttons do the work. */
  #inVoice(): boolean {
    return this.#document.documentElement.getAttribute('data-theme') === ThemeName.Drive;
  }

  /** Whether a press with this pointer, on this target, may begin a swipe. */
  #mayStartOn(event: PointerEvent): boolean {
    if (event.pointerType !== SwipePointer.Touch && event.pointerType !== SwipePointer.Pen) {
      return false;
    }

    return !(event.target instanceof Element && event.target.closest(OWN_GESTURE_TARGETS) !== null);
  }

  #decisionInput(dx: number, dy: number, velocity: number, locked: boolean): SwipeDecisionInput {
    return {
      startX: this.#startX,
      dx,
      dy,
      width: this.#width,
      viewportWidth: this.#viewportWidth,
      velocity,
      enabled: { start: this.startEnabled(), end: this.endEnabled() },
      locked,
    };
  }

  /** The surface's offset for a drag of `dx`: the drag itself, or a short rubber band where nothing commits. */
  #offsetFor(dx: number): number {
    if (dx > 0 ? this.endEnabled() : this.startEnabled()) {
      return dx;
    }

    return Math.sign(dx) * Math.min(RUBBER_BAND_FACTOR * Math.abs(dx), RUBBER_BAND_MAX_PX);
  }

  /** Keeps the pointer on the host for the rest of the drag; a pointer that is already gone is not an error. */
  #capturePointer(pointerId: number): void {
    const host = this.#host.nativeElement;

    if (typeof host.setPointerCapture !== 'function') {
      return;
    }

    try {
      host.setPointerCapture(pointerId);
    } catch {
      // The pointer may have ended since the move was queued (NotFoundError), and the drag still tracks.
    }
  }

  /** Moves the surface, shows the reveal it uncovers, and ticks when the release would start or stop committing. */
  #track(dx: number, dy: number): void {
    const offset = this.#offsetFor(dx);

    this.#offset = offset;
    this.surface().nativeElement.style.translate = `${offset}px`;
    this.endReveal().nativeElement.hidden = dx <= 0;
    this.startReveal().nativeElement.hidden = dx >= 0;

    const outcome = swipeDecision(this.#decisionInput(dx, dy, 0, true));
    const armed = outcome === SwipeOutcome.CommitEnd || outcome === SwipeOutcome.CommitStart;

    if (armed !== this.#armed) {
      this.#armed = armed;
      this.#host.nativeElement.classList.toggle('asys-swipe--armed', armed);
      this.#haptics.tick();
    }
  }

  /**
   * Ends a locked gesture. A commit toward the end slides the surface off and emits once it has gone; every
   * other outcome springs back, and a commit toward the start emits after that. A Task that changed
   * meanwhile is never reported as swiped.
   */
  async #settle(outcome: SwipeOutcome, offset: number): Promise<void> {
    const recordedId = this.#recordedId;
    const width = this.#width;
    const unchanged = this.taskId() === recordedId;
    const slideOff = outcome === SwipeOutcome.CommitEnd && unchanged;
    const surface = this.surface().nativeElement;

    this.#settling = true;
    this.#pointerId = null;
    this.#locked = false;

    // The final state is written first, so with motion off (where play resolves at once) it is in place.
    surface.style.translate = slideOff ? `${width}px` : '';

    try {
      await this.#motion.play(
        surface,
        [{ translate: `${offset}px` }, { translate: slideOff ? `${width}px` : '0px' }],
        slideOff
          ? { duration: MotionDuration.Quick, easing: MotionEasing.In }
          : { duration: MotionDuration.Moderate, easing: MotionEasing.Out },
      );
    } catch {
      // The animation is decoration, so one that fails changes nothing about the outcome.
    }

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (!slideOff) {
      this.#reset();

      if (outcome === SwipeOutcome.CommitStart && unchanged && this.taskId() === recordedId) {
        this.commitStart.emit(recordedId);
      }

      return;
    }

    if (this.taskId() !== recordedId) {
      this.#reset();

      return;
    }

    this.commitEnd.emit(recordedId);

    if (this.#destroyRef.destroyed) {
      return;
    }

    // The surface stays off to the side until the page has rendered what the commit changed.
    this.#changeDetector.markForCheck();
    afterNextRender(
      () => {
        if (!this.#destroyRef.destroyed) {
          this.#reset();
        }
      },
      { injector: this.#injector },
    );
  }

  /** Puts the surface, the reveals and the gesture state back to rest, without a tick. */
  #reset(): void {
    this.surface().nativeElement.style.translate = '';
    this.#host.nativeElement.classList.remove('asys-swipe--armed');
    this.endReveal().nativeElement.hidden = true;
    this.startReveal().nativeElement.hidden = true;
    this.#clearGesture();
    this.#settling = false;
  }

  #clearGesture(): void {
    this.#pointerId = null;
    this.#locked = false;
    this.#samples = [];
    this.#offset = 0;
    this.#armed = false;
  }

  /** Swallows the next click for a moment, because the browser sends one after the finger lifts. */
  #armClickSuppression(): void {
    this.#disarmClickSuppression();
    this.#suppressClick = true;
    this.#suppressTimer = setTimeout(() => {
      this.#suppressClick = false;
      this.#suppressTimer = undefined;
    }, CLICK_SUPPRESS_MS);
  }

  #disarmClickSuppression(): void {
    this.#suppressClick = false;

    if (this.#suppressTimer !== undefined) {
      clearTimeout(this.#suppressTimer);
      this.#suppressTimer = undefined;
    }
  }
}
