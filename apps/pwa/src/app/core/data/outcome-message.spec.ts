// SPDX-License-Identifier: EUPL-1.2
import { NotApplicableReason, RejectedReason } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { outcomeMessage } from './outcome-message';

const GENERIC = 'Something went wrong. Try again.';

const rejected = (reason: RejectedReason): CommandOutcome => ({
  _tag: CommandOutcomeTag.Rejected,
  reason,
});

describe('outcomeMessage', () => {
  it('says nothing for Applied', () => {
    expect(outcomeMessage({ _tag: CommandOutcomeTag.Applied, seq: 4 })).toBeNull();
  });

  it('says nothing for SignedOut', () => {
    expect(outcomeMessage({ _tag: CommandOutcomeTag.SignedOut })).toBeNull();
  });

  it.each([NotApplicableReason.ExpectationFailed, NotApplicableReason.NotOpen])(
    'explains the Review item for NotApplicable %s',
    (reason) => {
      expect(
        outcomeMessage({ _tag: CommandOutcomeTag.NotApplicable, reason, reviewItemId: 'r1' }),
      ).toBe('That no longer applied, so it waits in the Inbox as a Review item.');
    },
  );

  it.each([
    [RejectedReason.NotFound, 'That Task or Area no longer exists.'],
    [RejectedReason.InvalidTitle, 'Enter a title.'],
    [RejectedReason.InvalidName, 'Enter a name.'],
    [RejectedReason.InvalidDate, 'Check the date.'],
    [RejectedReason.InvalidEstimate, 'Use whole minutes from 1 to 100000.'],
    [RejectedReason.InvalidRemaining, 'Use fewer minutes than the current Estimate.'],
    [RejectedReason.NoEstimate, 'Give this Task an Estimate first.'],
    [RejectedReason.UnknownArea, 'That Area no longer exists.'],
    [RejectedReason.SelfLink, 'A Task cannot wait for itself.'],
    [RejectedReason.DuplicateLink, 'This Task already waits for that one.'],
    [RejectedReason.Cycle, 'That would make these Tasks wait for each other.'],
    [RejectedReason.InvalidActiveHours, 'Check the Active hours.'],
    [RejectedReason.InvalidTimeZone, 'ASYS does not know that time zone.'],
    [RejectedReason.InvalidUrgencyWindow, 'Use 1 to 14 days.'],
    [RejectedReason.DuplicateId, GENERIC],
    [RejectedReason.InvalidNotes, GENERIC],
    [RejectedReason.InvalidPrivacy, GENERIC],
  ])('Rejected %s says its sentence', (reason, message) => {
    expect(outcomeMessage(rejected(reason))).toBe(message);
  });

  it('gives every RejectedReason a message', () => {
    for (const reason of Object.values(RejectedReason)) {
      expect(outcomeMessage(rejected(reason))).toEqual(expect.any(String));
    }
  });

  it('tells the person the server cannot be reached for Failed status 0', () => {
    expect(outcomeMessage({ _tag: CommandOutcomeTag.Failed, status: 0 })).toBe(
      'ASYS cannot reach the server. Try again.',
    );
  });

  it.each([500, 503, 404])('says something went wrong for Failed status %i', (status) => {
    expect(outcomeMessage({ _tag: CommandOutcomeTag.Failed, status })).toBe(GENERIC);
  });

  it('says something went wrong for KeyReused', () => {
    expect(outcomeMessage({ _tag: CommandOutcomeTag.KeyReused })).toBe(GENERIC);
  });
});
