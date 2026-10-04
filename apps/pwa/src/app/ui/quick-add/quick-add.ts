// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonSize, ButtonVariant } from '../button/button';

/** The quick-add bar that captures a Task into the Inbox. */
@Component({
  selector: 'asys-quick-add',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  template: `
    <form class="asys-quickadd" (submit)="submit($event)" (keydown.escape)="close.emit()">
      <div class="asys-quickadd__row">
        <label class="asys-visually-hidden" [for]="inputId">Capture a Task</label>
        <input
          class="asys-quickadd__input"
          type="text"
          placeholder="Capture a Task"
          autocomplete="off"
          [id]="inputId"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <button
          asys-button
          type="submit"
          [variant]="Variants.Primary"
          [disabled]="value().trim() === '' || busy()"
        >
          Add
        </button>
        <button
          asys-button
          type="button"
          [variant]="Variants.Quiet"
          [size]="Sizes.Small"
          (click)="close.emit()"
        >
          Close
        </button>
      </div>
      <p class="asys-quickadd__hint">Goes to the Inbox until Triage</p>
      <p class="asys-quickadd__status" role="status">{{ message() }}</p>
    </form>
  `,
  styles: `
    .asys-quickadd {
      background: var(--surface);
      box-shadow: var(--shadow-sheet);
      padding: var(--space-3) var(--space-4);
      color: var(--ink);
    }

    .asys-quickadd__row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .asys-quickadd__input {
      flex: 1 1 auto;
      min-width: 0;
      min-height: var(--tap-target);
      padding: var(--space-2) var(--space-4);
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      font-family: var(--font-sans);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
      font-weight: 400;
    }

    .asys-quickadd__input::placeholder {
      color: var(--ink-muted);
      opacity: 1;
    }

    .asys-quickadd__hint {
      margin: var(--space-2) 0 0;
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-quickadd__status {
      margin: var(--space-1) 0 0;
      color: var(--ink);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
    }

    [data-theme='drive'] .asys-quickadd__input {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class QuickAdd {
  private static nextId = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly injector = inject(Injector);

  protected readonly Variants = ButtonVariant;

  protected readonly Sizes = ButtonSize;

  protected readonly inputId = `asys-quickadd-${QuickAdd.nextId++}-input`;

  readonly value = model<string>('');

  readonly busy = input<boolean>(false);

  readonly message = input<string | null>(null);

  readonly add = output<string>();

  readonly close = output<void>();

  constructor() {
    afterNextRender(() => this.focus(), { injector: this.injector });
  }

  /** Moves focus to the input. */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-quickadd__input')?.focus();
  }

  protected submit(event: Event): void {
    event.preventDefault();

    const text = this.value().trim();

    if (text !== '' && !this.busy()) {
      this.add.emit(text);
    }
  }
}
