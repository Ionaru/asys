// SPDX-License-Identifier: EUPL-1.2
import { areaSelectOptions, NO_AREA_LABEL } from './area-options';

describe('areaSelectOptions', () => {
  it('gives only No Area for an empty list', () => {
    expect(areaSelectOptions([])).toEqual([{ value: '', label: 'No Area' }]);
  });

  it('puts No Area first, then the Areas in the order given', () => {
    const options = areaSelectOptions([
      { id: 'b', name: 'Zed' },
      { id: 'a', name: 'Alpha' },
    ]);

    expect(options).toEqual([
      { value: '', label: 'No Area' },
      { value: 'b', label: 'Zed' },
      { value: 'a', label: 'Alpha' },
    ]);
  });

  it('exposes the No Area label', () => {
    expect(NO_AREA_LABEL).toBe('No Area');
  });
});
