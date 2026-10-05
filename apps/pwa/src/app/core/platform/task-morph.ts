// SPDX-License-Identifier: EUPL-1.2
import { Service, signal } from '@angular/core';

/** The Task whose title morphs in the running view transition; only the view-transition handler writes it. */
@Service()
export class TaskMorph {
  readonly taskId = signal<string | null>(null);
}
