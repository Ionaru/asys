// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { type Activation, activationOf } from '../../support/activation';
import { Button, ButtonVariant } from '../../atoms/button/button';
import { Countdown } from '../../atoms/countdown/countdown';
import { Icon, IconName } from '../../atoms/icon/icon';

/** Which layout the Undo bar shows. */
export enum UndoBarVariant {
  Pending = 'pending',
  Failed = 'failed',
  Notice = 'notice',
}

/** The bar above the bottom navigation: Undo for a held Done, Triage or Drop, or one that was not applied. */
@Component({
  selector: 'asys-undo-bar',
  imports: [Button, Countdown, Icon],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-undo',
    '[class.is-paused]': 'paused()',
    '[style.--asys-undo-duration]': 'duration()',
    '[style.--asys-undo-delay]': 'delay()',
    '(pointerenter)': 'enterPointer()',
    '(pointerleave)': 'leavePointer()',
    '(focusin)': 'focusInside.emit(true)',
    '(focusout)': 'leaveFocus($event)',
    '(keydown.escape)': 'escape.emit()',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './undo-bar.component.html',
  styleUrl: './undo-bar.css',
})
export class UndoBar {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variant = UndoBarVariant;

  protected readonly Variants = ButtonVariant;

  protected readonly Icons = IconName;

  protected readonly activationOf = activationOf;

  /** Whether the pointer is inside the bar, which holds the ring still like the Undo window's timer. */
  protected readonly paused = signal(false);

  readonly variant = input.required<UndoBarVariant>();

  readonly title = input<string>('');

  /** The word the Pending layout shows beside its icon, such as `Done`, `Triaged as Plan` or `Dropped`. */
  readonly status = input<string>('Done');

  /** The icon the Pending layout shows before the status. */
  readonly statusIcon = input<IconName>(IconName.Check);

  /** The Undo button's accessible name in the Pending layout, such as `Undo Done: <title>`. */
  readonly undoLabel = input.required<string>();

  /** The sentence the Failed layout opens with, such as `“<title>” is not Done.` */
  readonly failedText = input.required<string>();

  readonly detail = input<string | null>(null);

  readonly canRetry = input(false);

  /** The whole Undo window, in milliseconds: how long the ring takes to fill. */
  readonly windowMs = input<number>(5000);

  /** How much of the window is left when the Pending layout appears; `null` means all of it. */
  readonly remainingMs = input<number | null>(null);

  /** Names the Undo window the Pending layout counts down; a new name starts the ring again. */
  readonly windowKey = input<string | null>(null);

  readonly undo = output<void>();

  /** Emits how Try again was activated: `keyboard` is true for Enter or Space, false for a pointer. */
  readonly retry = output<Activation>();

  /** Emits how Dismiss was activated: `keyboard` is true for Enter or Space, false for a pointer. */
  readonly dismiss = output<Activation>();

  readonly escape = output<void>();

  readonly pointerInside = output<boolean>();

  readonly focusInside = output<boolean>();

  private readonly countdown = viewChild<Countdown, ElementRef<HTMLElement>>(Countdown, {
    read: ElementRef,
  });

  protected readonly duration = computed(() => `${this.windowMs()}ms`);

  /** A negative delay starts the ring part-way through its fill, where the timer is. */
  protected readonly delay = computed(() => {
    const whole = this.windowMs();
    const elapsed = Math.min(whole, Math.max(0, whole - (this.remainingMs() ?? whole)));

    return `-${elapsed}ms`;
  });

  constructor() {
    // A held command that follows another keeps the Pending layout, and with it the running fill, so the ring
    // starts again here. A layout that is new (the first one, or one back from a failure) starts it by itself.
    effect(() => {
      this.windowKey();
      this.remainingMs();
      const countdown = this.countdown()?.nativeElement;

      untracked(() => {
        const fill = countdown?.querySelector<SVGCircleElement>('.asys-countdown__fill');

        if (fill && typeof fill.getAnimations === 'function') {
          fill.getAnimations().forEach((animation) => (animation.currentTime = 0));
        }
      });
    });
  }

  /** Moves focus to the first button. */
  focusAction(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('button')?.focus();
  }

  protected enterPointer(): void {
    this.paused.set(true);
    this.pointerInside.emit(true);
  }

  protected leavePointer(): void {
    this.paused.set(false);
    this.pointerInside.emit(false);
  }

  protected leaveFocus(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (!(next instanceof Node) || !this.#host.nativeElement.contains(next)) {
      this.focusInside.emit(false);
    }
  }

  /** Ctrl+Z or Cmd+Z undoes the held command, except in an editable field, where it stays text undo. */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (
      this.variant() !== UndoBarVariant.Pending ||
      (event.key !== 'z' && event.key !== 'Z') ||
      !(event.ctrlKey || event.metaKey) ||
      event.shiftKey
    ) {
      return;
    }

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
    ) {
      return;
    }

    event.preventDefault();
    this.undo.emit();
  }
}
