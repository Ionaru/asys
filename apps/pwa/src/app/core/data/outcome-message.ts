// SPDX-License-Identifier: EUPL-1.2
import { RejectedReason } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';

const GENERIC = 'Something went wrong. Try again.';

const rejectedMessage = (reason: RejectedReason): string => {
  switch (reason) {
    case RejectedReason.NotFound:
      return 'That Task or Area no longer exists.';
    case RejectedReason.InvalidTitle:
      return 'Enter a title.';
    case RejectedReason.InvalidName:
      return 'Enter a name.';
    case RejectedReason.InvalidDate:
      return 'Check the date.';
    case RejectedReason.InvalidEstimate:
      return 'Use whole minutes from 1 to 100000.';
    case RejectedReason.InvalidRemaining:
      return 'Use fewer minutes than the current Estimate.';
    case RejectedReason.NoEstimate:
      return 'Give this Task an Estimate first.';
    case RejectedReason.UnknownArea:
      return 'That Area no longer exists.';
    case RejectedReason.SelfLink:
      return 'A Task cannot wait for itself.';
    case RejectedReason.DuplicateLink:
      return 'This Task already waits for that one.';
    case RejectedReason.Cycle:
      return 'That would make these Tasks wait for each other.';
    case RejectedReason.InvalidActiveHours:
      return 'Check the Active hours.';
    case RejectedReason.InvalidTimeZone:
      return 'ASYS does not know that time zone.';
    case RejectedReason.InvalidUrgencyWindow:
      return 'Use 1 to 14 days.';
    case RejectedReason.DuplicateId:
    case RejectedReason.InvalidNotes:
    case RejectedReason.InvalidPrivacy:
      return GENERIC;
  }
};

/** The sentence a screen shows for a command outcome; null when there is nothing to say. */
export const outcomeMessage = (outcome: CommandOutcome): string | null => {
  switch (outcome._tag) {
    case CommandOutcomeTag.Applied:
    case CommandOutcomeTag.SignedOut:
      return null;
    case CommandOutcomeTag.NotApplicable:
      return 'That no longer applied, so it waits in the Inbox as a Review item.';
    case CommandOutcomeTag.Rejected:
      return rejectedMessage(outcome.reason);
    case CommandOutcomeTag.KeyReused:
      return GENERIC;
    case CommandOutcomeTag.Failed:
      return outcome.status === 0 ? 'ASYS cannot reach the server. Try again.' : GENERIC;
  }
};
