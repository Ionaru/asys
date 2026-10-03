// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { Theme, ThemeName } from './theme';

interface FakeMql extends EventTarget {
  matches: boolean;
  readonly media: string;
}

const createMql = (matches: boolean): FakeMql =>
  Object.assign(new EventTarget(), { matches, media: '(prefers-color-scheme: dark)' });

const attribute = (): string | null => document.documentElement.getAttribute('data-theme');

const change = (mql: FakeMql, matches: boolean): void => {
  mql.matches = matches;
  mql.dispatchEvent(Object.assign(new Event('change'), { matches }));
};

describe('Theme', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
  });

  it('has the documented names', () => {
    expect(ThemeName.Light).toBe('light');
    expect(ThemeName.Dark).toBe('dark');
    expect(ThemeName.Drive).toBe('drive');
  });

  it('is dark and sets the attribute while the media query matches', () => {
    vi.stubGlobal('matchMedia', () => createMql(true));

    const theme = TestBed.inject(Theme);

    expect(theme.current()).toBe(ThemeName.Dark);
    expect(attribute()).toBe('dark');
  });

  it('is light and sets the attribute while the media query does not match', () => {
    vi.stubGlobal('matchMedia', () => createMql(false));

    const theme = TestBed.inject(Theme);

    expect(theme.current()).toBe(ThemeName.Light);
    expect(attribute()).toBe('light');
  });

  it('is light and sets the attribute when matchMedia does not exist', () => {
    const theme = TestBed.inject(Theme);

    expect(theme.current()).toBe(ThemeName.Light);
    expect(attribute()).toBe('light');
  });

  it('follows a change event in both directions', () => {
    const mql = createMql(true);
    vi.stubGlobal('matchMedia', () => mql);
    const theme = TestBed.inject(Theme);

    change(mql, false);

    expect(theme.current()).toBe(ThemeName.Light);
    expect(attribute()).toBe('light');

    change(mql, true);

    expect(theme.current()).toBe(ThemeName.Dark);
    expect(attribute()).toBe('dark');
  });

  it('removes its change listener on destroy', () => {
    const mql = createMql(true);
    vi.stubGlobal('matchMedia', () => mql);
    const add = vi.spyOn(mql, 'addEventListener');
    const remove = vi.spyOn(mql, 'removeEventListener');
    const theme = TestBed.inject(Theme);
    const added = add.mock.calls.find(([type]) => type === 'change');

    expect(added).toBeDefined();

    TestBed.resetTestingModule();

    expect(remove).toHaveBeenCalledWith('change', added?.[1]);

    change(mql, false);

    expect(theme.current()).toBe(ThemeName.Dark);
    expect(attribute()).toBe('dark');
  });
});
