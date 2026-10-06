// SPDX-License-Identifier: EUPL-1.2
import {
  applyChanges,
  completeTask,
  type CompleteTask,
  type DomainState,
  type Instant,
  TransitionResultTag,
} from '@asys/domain';

/** A Done kept back locally until the person's Undo window ends and the server has it. */
export interface Hold {
  readonly key: string;
  readonly command: CompleteTask;
  readonly at: Instant;
}

/** The synced state with every hold applied in the order held; a hold that no longer applies is skipped. Returns `synced` itself when none applies. */
export const applyHolds = (synced: DomainState, holds: readonly Hold[]): DomainState => {
  let acc = synced;

  for (const hold of holds) {
    const result = completeTask(acc, hold.command, hold.at);

    if (result._tag === TransitionResultTag.Applied) {
      acc = applyChanges(acc, result.changes);
    }
  }

  return acc;
};

/** Whether the synced state still shows the held Task as open, so the hold has work to do. */
export const isStillHeld = (synced: DomainState, hold: Hold): boolean =>
  completeTask(synced, hold.command, hold.at)._tag === TransitionResultTag.Applied;
