// SPDX-License-Identifier: EUPL-1.2
/** The Blocked by header's one line: what the Task waits for, then how many Tasks wait for it. */
export const blockerSummary = (waitsFor: readonly string[], blocksCount: number): string => {
  const [first, second] = waitsFor;
  let waits: string;

  if (first === undefined) {
    waits = 'Waits for no other Task.';
  } else if (second === undefined) {
    waits = `Waits for ${first}.`;
  } else if (waitsFor.length === 2) {
    waits = `Waits for ${first} and ${second}.`;
  } else {
    waits = `Waits for ${first} and ${waitsFor.length - 1} more.`;
  }

  const blocking =
    blocksCount === 0
      ? 'No Task waits for this one.'
      : blocksCount === 1
        ? '1 Task waits for this one.'
        : `${blocksCount} Tasks wait for this one.`;

  return `${waits} ${blocking}`;
};
