// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { activeHoursSummary } from '@asys/domain';

import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Button, ButtonVariant } from '../../ui/button/button';

const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Lists the Areas by name, each with its Active hours, and links to a new Area. */
@Component({
  selector: 'app-area-list',
  imports: [Button, RouterLink],
  template: `
    <h1 class="area-list__title">Areas</h1>
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
    } @else if (dataStore.status() === Status.Failed) {
      <p role="alert">ASYS could not load your Tasks.</p>
      <button asys-button type="button" [variant]="Variant.Quiet" (click)="dataStore.refresh()">
        Try again
      </button>
    } @else {
      <p>Loading…</p>
    }
  `,
  styles: `
    .area-list__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .area-list__status:empty {
      margin: 0;
    }

    .area-list__list {
      margin: 0 0 var(--space-4);
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--line);
    }

    .area-list__link {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-1);
      min-height: var(--row-min);
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      text-decoration: none;
    }

    .area-list__name {
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
    }

    .area-list__summary {
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      color: var(--ink-muted);
    }

    .area-list__text {
      margin: 0 0 var(--space-4);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class AreaList {
  protected readonly dataStore = inject(DataStore);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  /** The Areas ordered by name, then id, with their Active hours summaries. */
  protected readonly rows = computed(() =>
    [...(this.dataStore.state()?.areas ?? [])]
      .sort((a, b) => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.id, b.id))
      .map((area) => ({
        id: area.id,
        name: area.name,
        summary: activeHoursSummary(area.activeHours),
      })),
  );
}
