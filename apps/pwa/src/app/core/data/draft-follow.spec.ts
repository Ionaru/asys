// SPDX-License-Identifier: EUPL-1.2
import { followStore, settleSaved, type DraftFields } from './draft-follow';

interface Draft {
  readonly name: string;
  readonly hours: number;
  readonly note: string;
}

const fields: DraftFields<Draft> = {
  keys: ['name', 'hours'],
  same: (key, a, b) => (key === 'name' ? a.name.trim() === b.name.trim() : a[key] === b[key]),
};

const draftOf = (name: string, hours: number, note: string): Draft => ({ name, hours, note });

describe('followStore', () => {
  it('lets an unedited field follow the store', () => {
    const result = followStore(
      fields,
      draftOf('Home', 2, 'b'),
      draftOf('Home', 2, 'd'),
      draftOf('House', 3, 's'),
    );

    expect(result.baseline).toEqual(draftOf('House', 3, 'b'));
    expect(result.draft).toEqual(draftOf('House', 3, 'd'));
  });

  it('keeps an edit when the store changed to something else', () => {
    const result = followStore(
      fields,
      draftOf('Home', 2, 'b'),
      draftOf('Work', 2, 'd'),
      draftOf('House', 2, 's'),
    );

    expect(result.baseline).toEqual(draftOf('Home', 2, 'b'));
    expect(result.draft).toEqual(draftOf('Work', 2, 'd'));
  });

  it('follows when the edit equals what the store now holds', () => {
    const result = followStore(
      fields,
      draftOf('Home', 2, 'b'),
      draftOf('Work', 2, 'd'),
      draftOf('Work', 2, 's'),
    );

    expect(result.baseline).toEqual(draftOf('Work', 2, 'b'));
    expect(result.draft).toEqual(draftOf('Work', 2, 'd'));
  });

  it('decides by same, not by ===', () => {
    const result = followStore(
      fields,
      draftOf('Home', 2, 'b'),
      draftOf(' Home ', 2, 'd'),
      draftOf('House', 2, 's'),
    );

    expect(result.baseline.name).toBe('House');
    expect(result.draft.name).toBe('House');
  });

  it('handles edited and unedited fields together', () => {
    const result = followStore(
      fields,
      draftOf('Home', 2, 'b'),
      draftOf('Work', 2, 'd'),
      draftOf('House', 5, 's'),
    );

    expect(result.baseline).toEqual(draftOf('Home', 5, 'b'));
    expect(result.draft).toEqual(draftOf('Work', 5, 'd'));
  });

  it('does not mutate its inputs and returns new objects', () => {
    const baseline = draftOf('Home', 2, 'b');
    const draft = draftOf('Home', 2, 'd');
    const stored = draftOf('House', 3, 's');

    const result = followStore(fields, baseline, draft, stored);

    expect(baseline).toEqual(draftOf('Home', 2, 'b'));
    expect(draft).toEqual(draftOf('Home', 2, 'd'));
    expect(stored).toEqual(draftOf('House', 3, 's'));
    for (const input of [baseline, draft, stored]) {
      expect(result.baseline).not.toBe(input);
      expect(result.draft).not.toBe(input);
    }
  });

  it('leaves everything alone when no keys apply', () => {
    const baseline = draftOf('Home', 2, 'b');
    const draft = draftOf('Work', 4, 'd');

    const result = followStore({ ...fields, keys: [] }, baseline, draft, draftOf('House', 3, 's'));

    expect(result.baseline).toEqual(baseline);
    expect(result.draft).toEqual(draft);
  });
});

describe('settleSaved', () => {
  it('takes the stored value for fields still as sent', () => {
    const result = settleSaved(
      fields,
      draftOf('Work', 2, 'x'),
      draftOf('Work', 2, 'd'),
      draftOf('Work ', 2, 's'),
    );

    expect(result).toEqual(draftOf('Work ', 2, 'd'));
  });

  it('keeps a field edited since the Save', () => {
    const result = settleSaved(
      fields,
      draftOf('Work', 2, 'x'),
      draftOf('Office', 2, 'd'),
      draftOf('Work', 3, 's'),
    );

    expect(result).toEqual(draftOf('Office', 3, 'd'));
  });

  it('does not mutate its inputs and returns a new object', () => {
    const sent = draftOf('Work', 2, 'x');
    const draft = draftOf('Work', 2, 'd');
    const stored = draftOf('Work ', 2, 's');

    const result = settleSaved(fields, sent, draft, stored);

    expect(sent).toEqual(draftOf('Work', 2, 'x'));
    expect(draft).toEqual(draftOf('Work', 2, 'd'));
    expect(stored).toEqual(draftOf('Work ', 2, 's'));
    for (const input of [sent, draft, stored]) {
      expect(result).not.toBe(input);
    }
  });
});
