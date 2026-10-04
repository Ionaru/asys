// SPDX-License-Identifier: EUPL-1.2
import { Component, input } from '@angular/core';

import { TaskEditor } from './task-editor';

/** The route wrapper that gives each Task id a fresh editor. */
@Component({
  selector: 'app-task-editor-route',
  imports: [TaskEditor],
  template: `
    @for (id of [taskId()]; track id) {
      <asys-task-editor [taskId]="id" />
    }
  `,
})
export class TaskEditorRoute {
  readonly taskId = input.required<string>();
}
