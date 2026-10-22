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
import { NgTemplateOutlet } from '@angular/common';
import type { FormValueControl } from '@angular/forms/signals';
import { formatMinutes } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { FieldControl } from '../../support/field-control';
import { FieldError } from '../../atoms/field-error/field-error';
import { InputBox } from '../../atoms/input/input-box';
import { Label } from '../../atoms/label/label';
import { SingleLine } from '../../atoms/input/single-line';

/** How the Estimate choices are drawn: wrapping chips, or a single ruler under a head with the Other button. */
export enum EstimateLayout {
  Chips = 'chips',
  Ruler = 'ruler',
}

let nextId = 0;

const CHIP_MINUTES: readonly number[] = [5, 15, 25, 45, 60, 120];

const MAX_MINUTES = 100000;

const OTHER_ERROR = 'Use whole minutes from 1 to 100000.';

/** Estimate chips plus an Other input, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-estimate-field',
  imports: [Button, FieldError, InputBox, Label, NgTemplateOutlet, SingleLine],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './estimate-field.component.html',
  styleUrl: './estimate-field.css',
})
export class EstimateField extends FieldControl implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);

  readonly legend = input<string>('Estimate');

  readonly layout = input<EstimateLayout>(EstimateLayout.Chips);

  protected readonly Layout = EstimateLayout;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly chips = CHIP_MINUTES.map((minutes) => {
    const label = formatMinutes(minutes);
    const [amount = label, unit = ''] = label.split(' ');
    return { minutes, label, amount, unit };
  });

  protected readonly legendId = `asys-estimate-${nextId}-legend`;

  protected readonly otherId = `asys-estimate-${nextId}-other`;

  protected override readonly messageParagraphId = `asys-estimate-${nextId++}-message`;

  readonly #injector = inject(Injector);

  private readonly chipButtons = viewChild<ElementRef<HTMLButtonElement>>('chipButton');

  private readonly otherInput = viewChild<ElementRef<HTMLTextAreaElement>>('otherInput');

  readonly #otherOpen = signal(false);

  readonly #typed = signal('');

  readonly #localError = signal(false);

  readonly #customValue = computed(() => {
    const value = this.value();
    return value !== null && !CHIP_MINUTES.includes(value) ? value : null;
  });

  protected readonly otherShown = computed(() => this.#otherOpen() || this.#customValue() !== null);

  protected readonly otherText = computed(() => {
    const custom = this.#customValue();
    return custom === null ? this.#typed() : String(custom);
  });

  protected override readonly showError = computed(
    () => this.#localError() || (this.touched() && this.errors().length > 0),
  );

  protected override readonly message = computed(() =>
    this.#localError() ? OTHER_ERROR : (this.errors()[0]?.message ?? 'Check this value'),
  );

  protected pick(minutes: number): void {
    this.value.set(minutes);
    this.#otherOpen.set(false);
    this.#typed.set('');
    this.#localError.set(false);
  }

  protected openOther(): void {
    this.#otherOpen.set(true);
    afterNextRender(() => this.otherInput()?.nativeElement.focus(), { injector: this.#injector });
  }

  /** The Ruler layout keeps what is typed and commits it on `change`. */
  protected keepTyped(raw: string): void {
    this.#otherOpen.set(true);
    this.#typed.set(raw);
  }

  protected typeOther(raw: string): void {
    const text = raw.trim();
    this.#otherOpen.set(true);
    this.#typed.set(raw);
    if (text === '') {
      this.#localError.set(false);
      this.value.set(null);
      return;
    }
    const minutes = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES) {
      this.#localError.set(false);
      this.value.set(minutes);
    } else {
      this.#localError.set(true);
      this.value.set(null);
    }
  }

  /** Focuses the first chip or ruler cell, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.chipButtons()?.nativeElement.focus(options);
  }
}
