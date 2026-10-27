// SPDX-License-Identifier: EUPL-1.2
import {
  applyChanges,
  type Change,
  CommandTag,
  completeTask,
  type CompleteTask,
  type DomainState,
  dropTask,
  type DropTask,
  type Instant,
  isInInbox,
  triageTask,
  type TriageTask,
  type TransitionResult,
  TransitionResultTag,
} from '@asys/domain';

/** A command the Undo window can hold: a Done, a Triage or a Drop. */
export type HeldCommand = CompleteTask | TriageTask | DropTask;

/** A Done, a Triage or a Drop kept back locally until the person's Undo window ends and the server has it. */
export interface Hold {
  readonly key: string;
  readonly command: HeldCommand;
  readonly at: Instant;
}

/** The held command's own transition over the state. */
const transition = (state: DomainState, hold: Hold): TransitionResult => {
  const command = hold.command;

  switch (command._tag) {
    case CommandTag.CompleteTask:
      return completeTask(state, command, hold.at);
    case CommandTag.TriageTask:
      return triageTask(state, command, hold.at);
    case CommandTag.DropTask:
      return dropTask(state, command, hold.at);
  }
};

/**
 * The changes the hold makes in this state, or null when it has no work to do. A Triage also needs its Task
 * in the Inbox: another device may have triaged it already, and applying the hold again would overwrite that.
 */
const changesOf = (state: DomainState, hold: Hold): readonly Change[] | null => {
  const command = hold.command;

  if (command._tag === CommandTag.TriageTask) {
    const task = state.tasks.find((candidate) => candidate.id === command.taskId);

    if (task === undefined || !isInInbox(task)) {
      return null;
    }
  }

  const result = transition(state, hold);

  return result._tag === TransitionResultTag.Applied ? result.changes : null;
};

/** The synced state with every hold applied in the order held; a hold that no longer applies is skipped. Returns `synced` itself when none applies. */
export const applyHolds = (synced: DomainState, holds: readonly Hold[]): DomainState => {
  let acc = synced;

  for (const hold of holds) {
    const changes = changesOf(acc, hold);

    if (changes !== null) {
      acc = applyChanges(acc, changes);
    }
  }

  return acc;
};

/** Whether the synced state still shows the held Task as the hold expects it (open, and for a Triage in the Inbox), so the hold has work to do. */
export const isStillHeld = (synced: DomainState, hold: Hold): boolean =>
  changesOf(synced, hold) !== null;
