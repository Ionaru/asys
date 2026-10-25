// SPDX-License-Identifier: EUPL-1.2
import { Component, input } from '@angular/core';

import { AreaEditor } from './area-editor';

/** The route wrapper that gives each Area id, or a new Area, a fresh editor. */
@Component({
  selector: 'app-area-editor-route',
  imports: [AreaEditor],
  template: `
    @for (id of [areaId() ?? null]; track id) {
      <asys-area-editor [areaId]="id" />
    }
  `,
})
export class AreaEditorRoute {
  readonly areaId = input<string | undefined>();
}
