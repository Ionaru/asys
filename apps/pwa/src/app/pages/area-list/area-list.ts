// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject } from '@angular/core';
import { activeHoursSummary } from '@asys/domain';

import {
  AreaListTemplate,
  type AreaListRow,
} from '../../components/templates/area-list-template/area-list-template';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { byAreaName } from '../../features/areas/area-order';

/** Lists the Areas by name, each with its Active hours, and links to a new Area. */
@Component({
  selector: 'app-area-list',
  imports: [AreaListTemplate],
  template: `
    <asys-area-list-template
      [rows]="rows()"
      [loaded]="dataStore.state() !== null"
      [failed]="dataStore.status() === Status.Failed"
      (retry)="dataStore.refresh()"
    />
  `,
})
export class AreaList {
  protected readonly dataStore = inject(DataStore);

  protected readonly Status = SyncStatus;

  /** The Areas ordered by name, then id, with their Active hours summaries. */
  protected readonly rows = computed((): readonly AreaListRow[] =>
    [...(this.dataStore.state()?.areas ?? [])].sort(byAreaName).map((area) => ({
      id: area.id,
      name: area.name,
      summary: activeHoursSummary(area.activeHours),
    })),
  );
}
