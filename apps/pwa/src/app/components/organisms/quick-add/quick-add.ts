// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  inject,
  Injector,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { CaptureField } from '../../molecules/capture-field/capture-field';
import { Icon, IconName } from '../../atoms/icon/icon';

/** A capture that was not sent, shown above the input. */
export interface QuickAddFailure {
  readonly id: string;
  readonly text: string;
  readonly message: string | null;
  readonly canRetry: boolean;
}

/** The quick-add bar that captures a Task into the Inbox, around a capture field. */
@Component({
  selector: 'asys-quick-add',
  imports: [Button, CaptureField, Icon],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './quick-add.component.html',
  styleUrl: './quick-add.css',
})
export class QuickAdd {
  readonly #injector = inject(Injector);

  protected readonly Variants = ButtonVariant;

  protected readonly Sizes = ButtonSize;

  protected readonly Icons = IconName;

  private readonly capture = viewChild.required(CaptureField);

  readonly value = model<string>('');

  readonly failures = input<readonly QuickAddFailure[]>([]);

  readonly message = input<string | null>(null);

  readonly add = output<string>();

  readonly retry = output<string>();

  readonly discard = output<string>();

  readonly close = output<void>();

  constructor() {
    afterNextRender(() => this.focus(), { injector: this.#injector });
  }

  /** Moves focus to the input. */
  focus(): void {
    this.capture().focus();
  }

  /** Where the field is on screen, for a capture's flight to start from. */
  fieldRect(): DOMRect {
    return this.capture().fieldRect();
  }

  /** The row goes away, so focus moves to the input first and the keyboard stays up. */
  protected retryFailure(id: string): void {
    this.focus();
    this.retry.emit(id);
  }

  protected discardFailure(id: string): void {
    this.focus();
    this.discard.emit(id);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    const text = this.value().trim();

    if (text !== '') {
      this.add.emit(text);
    }
  }
}
