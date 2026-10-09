// SPDX-License-Identifier: EUPL-1.2
import { Service, signal } from '@angular/core';

/** The Task whose title morphs in the running view transition; only the view-transition handler sets it. */
@Service()
export class TaskMorph {
  readonly #taskIdSignal = signal<string | null>(null);

  readonly taskId = this.#taskIdSignal.asReadonly();

  /** Names the Task whose title morphs, or none with null. */
  set(taskId: string | null): void {
    this.#taskIdSignal.set(taskId);
  }
}
