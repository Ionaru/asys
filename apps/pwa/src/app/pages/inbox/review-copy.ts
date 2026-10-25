// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, type DomainState, NotApplicableReason, type ReviewItem } from '@asys/domain';

/** What a Review item says, and the Task it can open. */
export interface ReviewCopy {
  readonly question: string;
  readonly reason: string;
  readonly taskId: string | null;
}

const FALLBACK: ReviewCopy = { question: 'ASYS needs a decision.', reason: '', taskId: null };

const NOT_APPLICABLE_KIND = 'command_not_applicable';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const reasonText = (reason: unknown): string | null => {
  switch (reason) {
    case NotApplicableReason.ExpectationFailed:
      return 'It was closed or changed elsewhere first.';
    case NotApplicableReason.NotOpen:
      return 'It was already Done or Dropped.';
    default:
      return null;
  }
};

const taskQuestion = (tag: unknown, subject: string): string | null => {
  switch (tag) {
    case CommandTag.TriageTask:
      return `Triaging ${subject} no longer applies.`;
    case CommandTag.EditTask:
      return `Editing ${subject} no longer applies.`;
    case CommandTag.LogProgress:
      return `Logging progress on ${subject} no longer applies.`;
    case CommandTag.CompleteTask:
      return `Marking ${subject} Done no longer applies.`;
    case CommandTag.DropTask:
      return `Dropping ${subject} no longer applies.`;
    default:
      return null;
  }
};

/** The PWA's words for a Review item, from its kind and payload and the working set. */
export const reviewCopy = (item: ReviewItem, state: DomainState): ReviewCopy => {
  if (item.kind !== NOT_APPLICABLE_KIND || !isRecord(item.payload)) {
    return FALLBACK;
  }

  const { command, reason } = item.payload;
  const reasonLine = reasonText(reason);

  if (!isRecord(command) || reasonLine === null) {
    return FALLBACK;
  }

  if (command['_tag'] === CommandTag.UpdateArea) {
    const areaId = command['areaId'];

    if (typeof areaId !== 'string') {
      return FALLBACK;
    }

    const area = state.areas.find((candidate) => candidate.id === areaId);

    return {
      question:
        area === undefined
          ? 'Changing an Area no longer applies.'
          : `Changing the Area “${area.name}” no longer applies.`,
      reason: reasonLine,
      taskId: null,
    };
  }

  const taskId = command['taskId'];

  if (typeof taskId !== 'string') {
    return FALLBACK;
  }

  const task = state.tasks.find((candidate) => candidate.id === taskId);
  const question = taskQuestion(command['_tag'], task === undefined ? 'a Task' : `“${task.title}”`);

  if (question === null) {
    return FALLBACK;
  }

  return { question, reason: reasonLine, taskId: task === undefined ? null : taskId };
};
