// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';

import { Button, ButtonVariant } from '../button/button';

/** Which layout the Undo bar shows. */
export enum UndoBarVariant {
  Done = 'done',
  Failed = 'failed',
  Notice = 'notice',
}

/** The bar above the bottom navigation: Undo for a held Done, or a Done that was not applied. */
@Component({
  selector: 'asys-undo-bar',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-undobar',
    '(pointerenter)': 'pointerInside.emit(true)',
    '(pointerleave)': 'pointerInside.emit(false)',
    '(focusin)': 'focusInside.emit(true)',
    '(focusout)': 'leaveFocus($event)',
    '(keydown.escape)': 'escape.emit()',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './undo-bar.component.html',
  styleUrl: './undo-bar.css',
})
export class UndoBar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variant = UndoBarVariant;

  protected readonly Variants = ButtonVariant;

  readonly variant = input.required<UndoBarVariant>();

  readonly title = input<string>('');

  readonly detail = input<string | null>(null);

  readonly canRetry = input(false);

  readonly undo = output<void>();

  /** Emits how Try again was activated: `keyboard` is true for Enter or Space, false for a pointer. */
  readonly retry = output<{ readonly keyboard: boolean }>();

  /** Emits how Dismiss was activated: `keyboard` is true for Enter or Space, false for a pointer. */
  readonly dismiss = output<{ readonly keyboard: boolean }>();

  readonly escape = output<void>();

  readonly pointerInside = output<boolean>();

  readonly focusInside = output<boolean>();

  /** Moves focus to the first button. */
  focusAction(): void {
    this.host.nativeElement.querySelector<HTMLElement>('button')?.focus();
  }

  protected leaveFocus(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (!(next instanceof Node) || !this.host.nativeElement.contains(next)) {
      this.focusInside.emit(false);
    }
  }

  /** Ctrl+Z or Cmd+Z undoes the Done, except in an editable field, where it stays text undo. */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (
      this.variant() !== UndoBarVariant.Done ||
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
