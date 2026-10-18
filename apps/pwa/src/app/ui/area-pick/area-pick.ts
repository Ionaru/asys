// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, output, viewChild, ViewEncapsulation } from '@angular/core';

import { IconName, Icon } from '../../components/atoms/icon/icon';

/** One Area the control offers. */
export interface AreaChoice {
  readonly id: string;
  readonly name: string;
}

/** A chip that names the Current Area over a transparent native select, so each platform shows its own list. */
@Component({
  selector: 'asys-area-pick',
  imports: [Icon],
  encapsulation: ViewEncapsulation.None,
  template: `
    <span class="asys-area-pick__chip" aria-hidden="true">
      <span class="asys-area-pick__text">
        <span class="asys-area-pick__label">{{ label() }}</span>
        <span class="asys-area-pick__state">{{
          pickedId() === null ? 'Automatic' : 'Picked'
        }}</span>
      </span>
      <asys-icon [name]="IconName.ChevronDown" />
    </span>
    <select
      #select
      class="asys-area-pick__select"
      aria-label="Current Area"
      (change)="choose(select.value)"
    >
      <option value="" [selected]="pickedId() === null">{{ automaticLabel() }}</option>
      @for (area of areas(); track area.id) {
        <option [value]="area.id" [selected]="area.id === pickedId()">{{ area.name }}</option>
      }
    </select>
  `,
  host: {
    class: 'asys-area-pick',
    '[class.asys-area-pick--picked]': 'pickedId() !== null',
  },
  styleUrl: './area-pick.css',
})
export class AreaPickControl {
  protected readonly IconName = IconName;

  /** The Current Area's names, such as `Work`, `Work + Personal` or `No Area in use`. */
  readonly label = input.required<string>();

  /** The picked Area's id, or null while the Current Area is automatic. */
  readonly pickedId = input.required<string | null>();

  /** The first option, such as `Automatic: Work`. */
  readonly automaticLabel = input.required<string>();

  /** The Areas to offer, already in the order to show. */
  readonly areas = input.required<readonly AreaChoice[]>();

  /** A choice of an Area by id, or null for Automatic. */
  readonly areaPicked = output<string | null>();

  private readonly select = viewChild<ElementRef<HTMLSelectElement>>('select');

  /** Moves focus to the native select. */
  focus(): void {
    this.select()?.nativeElement.focus();
  }

  protected choose(value: string): void {
    this.areaPicked.emit(value === '' ? null : value);
  }
}
