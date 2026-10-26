// SPDX-License-Identifier: EUPL-1.2
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { ButtonGroup } from '../../molecules/button-group/button-group';
import { LoadState } from '../../molecules/load-state/load-state';

/** One Area in the list: its name and its Active hours summary. */
export interface AreaListRow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
}

/** Lays out the Areas, each with its Active hours, and a link to a new Area. */
@Component({
  selector: 'asys-area-list-template',
  imports: [Button, ButtonGroup, LoadState, RouterLink],
  template: `
    <h1 class="asys-page__title area-list__title">Areas</h1>
    <p class="area-list__status" role="status"></p>
    @if (loaded()) {
      @if (rows().length > 0) {
        <ul class="area-list__list">
          @for (row of rows(); track row.id) {
            <li>
              <a class="area-list__link" [routerLink]="['/settings/areas', row.id]">
                <span class="area-list__name">{{ row.name }}</span>
                <span class="area-list__summary">{{ row.summary }}</span>
              </a>
            </li>
          }
        </ul>
      } @else {
        <p class="area-list__text">No Areas yet.</p>
      }
      <div asys-button-group>
        <a asys-button [variant]="Variant.Primary" routerLink="/settings/areas/new">New Area</a>
      </div>
    } @else {
      <asys-load-state [failed]="failed()" (retry)="retry.emit()" />
    }
  `,
  styleUrl: './area-list-template.css',
})
export class AreaListTemplate {
  /** The Areas in the order to show them. */
  readonly rows = input.required<readonly AreaListRow[]>();

  /** Whether the Areas have loaded; until then the load state shows. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the Areas failed. */
  readonly failed = input.required<boolean>();

  /** Asks to load the Areas again after a failure. */
  readonly retry = output();

  protected readonly Variant = ButtonVariant;
}
