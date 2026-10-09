// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonSize, ButtonVariant } from '../button/button';
import { Icon, IconName } from '../icon/icon';

/** A capture that was not sent, shown above the input. */
export interface QuickAddFailure {
  readonly id: string;
  readonly text: string;
  readonly message: string | null;
  readonly canRetry: boolean;
}

/** The quick-add bar that captures a Task into the Inbox. */
@Component({
  selector: 'asys-quick-add',
  imports: [Button, Icon],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './quick-add.component.html',
  styleUrl: './quick-add.css',
})
export class QuickAdd {
  private static nextId = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly injector = inject(Injector);

  protected readonly Variants = ButtonVariant;

  protected readonly Sizes = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly inputId = `asys-quickadd-${QuickAdd.nextId++}-input`;

  readonly value = model<string>('');

  readonly failures = input<readonly QuickAddFailure[]>([]);

  readonly message = input<string | null>(null);

  readonly add = output<string>();

  readonly retry = output<string>();

  readonly discard = output<string>();

  readonly close = output<void>();

  protected readonly blank = computed(() => this.value().trim() === '');

  constructor() {
    afterNextRender(() => this.focus(), { injector: this.injector });
  }

  /** Moves focus to the input. */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-quickadd__input')?.focus();
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
