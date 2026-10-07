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
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { formatMinutes } from '@asys/domain';

import { FieldControl } from '../field-control/field-control';

let nextId = 0;

const CHIP_MINUTES: readonly number[] = [5, 15, 25, 45, 60, 120];

const MAX_MINUTES = 100000;

const OTHER_ERROR = 'Use whole minutes from 1 to 100000.';

/** Estimate chips plus an Other input, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-estimate-field',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './estimate-field.component.html',
  styleUrl: './estimate-field.css',
})
export class EstimateField extends FieldControl implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);

  readonly legend = input<string>('Estimate');

  protected readonly chips = CHIP_MINUTES.map((minutes) => ({
    minutes,
    label: formatMinutes(minutes),
  }));

  protected readonly otherId = `asys-estimate-${nextId}-other`;

  protected override readonly messageParagraphId = `asys-estimate-${nextId++}-message`;

  private readonly injector = inject(Injector);

  private readonly chipButtons = viewChild<ElementRef<HTMLButtonElement>>('chipButton');

  private readonly otherInput = viewChild<ElementRef<HTMLInputElement>>('otherInput');

  private readonly otherOpen = signal(false);

  private readonly typed = signal('');

  private readonly localError = signal(false);

  private readonly customValue = computed(() => {
    const value = this.value();
    return value !== null && !CHIP_MINUTES.includes(value) ? value : null;
  });

  protected readonly otherShown = computed(() => this.otherOpen() || this.customValue() !== null);

  protected readonly otherText = computed(() => {
    const custom = this.customValue();
    return custom === null ? this.typed() : String(custom);
  });

  protected override readonly showError = computed(
    () => this.localError() || (this.touched() && this.errors().length > 0),
  );

  protected override readonly message = computed(() =>
    this.localError() ? OTHER_ERROR : (this.errors()[0]?.message ?? 'Check this value'),
  );

  protected pick(minutes: number): void {
    this.value.set(minutes);
    this.otherOpen.set(false);
    this.typed.set('');
    this.localError.set(false);
  }

  protected openOther(): void {
    this.otherOpen.set(true);
    afterNextRender(() => this.otherInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected typeOther(raw: string): void {
    const text = raw.trim();
    this.otherOpen.set(true);
    this.typed.set(raw);
    if (text === '') {
      this.localError.set(false);
      this.value.set(null);
      return;
    }
    const minutes = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES) {
      this.localError.set(false);
      this.value.set(minutes);
    } else {
      this.localError.set(true);
      this.value.set(null);
    }
  }

  /** Focuses the first chip, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.chipButtons()?.nativeElement.focus(options);
  }
}
