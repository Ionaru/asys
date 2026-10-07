// SPDX-License-Identifier: EUPL-1.2
import { computed, Directive, input, output, type Signal } from '@angular/core';
import type { ValidationError } from '@angular/forms/signals';

/** The hint, error and touch members every Signal Forms custom control shares. */
@Directive()
export abstract class FieldControl {
  /** Helper text shown under the control while there is no error to show. */
  readonly hint = input<string | undefined>();

  /** The validation errors Signal Forms binds to the control. */
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  /** Whether the person has interacted with the control, set by Signal Forms. */
  readonly touched = input<boolean>(false);

  /** Whether the control is disabled, set by Signal Forms. */
  readonly disabled = input<boolean>(false);

  /** Emits when the control loses focus, so Signal Forms marks it touched. */
  readonly touch = output<void>();

  /** The id of the error or hint paragraph, unique per control instance. */
  protected abstract readonly messageParagraphId: string;

  /** Whether the error paragraph shows: touched with at least one error. */
  protected readonly showError: Signal<boolean> = computed(
    () => this.touched() && this.errors().length > 0,
  );

  /** The first error's message, or a generic one when it has none. */
  protected readonly message: Signal<string> = computed(
    () => this.errors()[0]?.message ?? 'Check this value',
  );

  /** The paragraph id the native control references with `aria-describedby`, if any shows. */
  protected readonly messageId: Signal<string | null> = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );
}
