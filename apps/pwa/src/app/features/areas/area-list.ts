// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { activeHoursSummary } from '@asys/domain';

import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Button, ButtonVariant } from '../../ui/button/button';
import { LoadState } from '../../ui/load-state/load-state';
import { byAreaName } from './area-order';

/** Lists the Areas by name, each with its Active hours, and links to a new Area. */
@Component({
  selector: 'app-area-list',
  imports: [Button, LoadState, RouterLink],
  template: `
    <h1 class="asys-page__title area-list__title">Areas</h1>
    <p class="area-list__status" role="status"></p>
    @if (dataStore.state() !== null) {
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
      <div class="asys-button-group">
        <a asys-button [variant]="Variant.Primary" routerLink="/settings/areas/new">New Area</a>
      </div>
    } @else {
      <asys-load-state
        [failed]="dataStore.status() === Status.Failed"
        (retry)="dataStore.refresh()"
      />
    }
  `,
  styleUrl: './area-list.css',
})
export class AreaList {
  protected readonly dataStore = inject(DataStore);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  /** The Areas ordered by name, then id, with their Active hours summaries. */
  protected readonly rows = computed(() =>
    [...(this.dataStore.state()?.areas ?? [])].sort(byAreaName).map((area) => ({
      id: area.id,
      name: area.name,
      summary: activeHoursSummary(area.activeHours),
    })),
  );
}
