// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { Ids } from './ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Ids', () => {
  it('next returns a lowercase v4 UUID', () => {
    const ids = TestBed.inject(Ids);

    expect(ids.next()).toMatch(UUID_V4);
  });

  it('next returns a different id on every call', () => {
    const ids = TestBed.inject(Ids);
    const seen = new Set(Array.from({ length: 50 }, () => ids.next()));

    expect(seen.size).toBe(50);
  });
});
