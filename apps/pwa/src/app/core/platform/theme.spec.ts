// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Palette, type Instant } from '@asys/domain';

import { Clock } from './clock';
import { PALETTE_KEY, STORED_PALETTE_MS, Theme, ThemeName } from './theme';

const T = 1_800_000_000_000;

const MINUTE = 60_000;

interface FakeMql extends EventTarget {
  matches: boolean;
  readonly media: string;
}

const createMql = (matches: boolean): FakeMql =>
  Object.assign(new EventTarget(), { matches, media: '(prefers-color-scheme: dark)' });

const attribute = (): string | null => document.documentElement.getAttribute('data-theme');

const paletteAttribute = (): string | null => document.documentElement.getAttribute('data-palette');

const record = (palette: unknown, savedAt: number): string => JSON.stringify({ palette, savedAt });

const metas = (): HTMLMetaElement[] => [
  ...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
];

const addMeta = (media: string, content: string): HTMLMetaElement => {
  const meta = document.createElement('meta');

  meta.name = 'theme-color';
  meta.media = media;
  meta.content = content;
  document.head.append(meta);

  return meta;
};

const change = (mql: FakeMql, matches: boolean): void => {
  mql.matches = matches;
  mql.dispatchEvent(Object.assign(new Event('change'), { matches }));
};

describe('Theme', () => {
  const cleanUp = (): void => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.style.removeProperty('--paper');

    for (const meta of metas()) {
      meta.remove();
    }
  };

  beforeEach(() => {
    cleanUp();
    TestBed.configureTestingModule({
      providers: [{ provide: Clock, useValue: { now: signal(T as Instant) } }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    cleanUp();
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

  describe('palette', () => {
    it('starts with no palette and no attribute', () => {
      const theme = TestBed.inject(Theme);

      expect(theme.palette()).toBeNull();
      expect(paletteAttribute()).toBeNull();
    });

    it.each([Palette.Harbour, Palette.Moss, Palette.Graphite])(
      'setPalette(%s) sets the attribute and palette()',
      (palette) => {
        const theme = TestBed.inject(Theme);

        theme.setPalette(palette);

        expect(paletteAttribute()).toBe(palette);
        expect(theme.palette()).toBe(palette);
      },
    );

    it('setPalette(Evergreen) removes the attribute but palette() stays evergreen', () => {
      const theme = TestBed.inject(Theme);
      theme.setPalette(Palette.Harbour);

      theme.setPalette(Palette.Evergreen);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBe(Palette.Evergreen);
    });

    it('setPalette(null) removes the attribute and palette() is null', () => {
      const theme = TestBed.inject(Theme);
      theme.setPalette(Palette.Moss);

      theme.setPalette(null);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
    });

    it('keeps the data-theme attribute when the palette changes', () => {
      const theme = TestBed.inject(Theme);

      theme.setPalette(Palette.Harbour);

      expect(attribute()).toBe('light');
    });

    it.each([Palette.Harbour, Palette.Evergreen, null])(
      'setPalette(%s) stores the palette with the time',
      (palette) => {
        const theme = TestBed.inject(Theme);

        theme.setPalette(palette);

        expect(localStorage.getItem(PALETTE_KEY)).toBe(
          `{"palette":${JSON.stringify(palette)},"savedAt":${T}}`,
        );
      },
    );

    it('exposes the documented key and age limit', () => {
      expect(PALETTE_KEY).toBe('asys.palette');
      expect(STORED_PALETTE_MS).toBe(3_600_000);
    });
  });

  describe('stored palette at construction', () => {
    it('applies a record 59 minutes old, without writing', () => {
      const text = record('moss', T - 59 * MINUTE);
      localStorage.setItem(PALETTE_KEY, text);

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBe('moss');
      expect(theme.palette()).toBe(Palette.Moss);
      expect(localStorage.getItem(PALETTE_KEY)).toBe(text);
    });

    it('applies a record just now', () => {
      localStorage.setItem(PALETTE_KEY, record('graphite', T));

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBe('graphite');
      expect(theme.palette()).toBe(Palette.Graphite);
    });

    it('applies a stored null palette as the default look', () => {
      localStorage.setItem(PALETTE_KEY, record(null, T - MINUTE));

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
    });

    it('applies a stored evergreen without an attribute', () => {
      localStorage.setItem(PALETTE_KEY, record('evergreen', T - MINUTE));

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBe(Palette.Evergreen);
    });

    it('ignores a record 60 minutes old and leaves it in storage', () => {
      const text = record('moss', T - 60 * MINUTE);
      localStorage.setItem(PALETTE_KEY, text);

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
      expect(localStorage.getItem(PALETTE_KEY)).toBe(text);
    });

    it('ignores a record saved in the future', () => {
      localStorage.setItem(PALETTE_KEY, record('moss', T + 1));

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
    });

    it.each([
      ['an unknown palette', record('pink', T)],
      ['a string', '"x"'],
      ['a missing savedAt', '{"palette":"moss"}'],
      ['a non-numeric savedAt', '{"palette":"moss","savedAt":"now"}'],
      ['a missing palette', `{"savedAt":${T}}`],
      ['text that is not JSON', 'moss'],
    ])('ignores %s', (_name, text) => {
      localStorage.setItem(PALETTE_KEY, text);

      const theme = TestBed.inject(Theme);

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
    });
  });

  describe('clearPalette', () => {
    it('forgets the palette, the attribute and the stored record', () => {
      const theme = TestBed.inject(Theme);
      theme.setPalette(Palette.Harbour);

      theme.clearPalette();

      expect(paletteAttribute()).toBeNull();
      expect(theme.palette()).toBeNull();
      expect(localStorage.getItem(PALETTE_KEY)).toBeNull();
    });
  });

  describe('theme-color metas', () => {
    const PAPER = '#123456';

    it('are set to the computed --paper after setPalette', () => {
      const light = addMeta('(prefers-color-scheme: light)', '#ffffff');
      const dark = addMeta('(prefers-color-scheme: dark)', '#000000');
      document.documentElement.style.setProperty('--paper', PAPER);
      const theme = TestBed.inject(Theme);

      theme.setPalette(Palette.Harbour);

      expect(light.content).toBe(PAPER);
      expect(dark.content).toBe(PAPER);
    });

    it('are set to the computed --paper at construction', () => {
      const light = addMeta('(prefers-color-scheme: light)', '#ffffff');
      const dark = addMeta('(prefers-color-scheme: dark)', '#000000');
      document.documentElement.style.setProperty('--paper', PAPER);

      TestBed.inject(Theme);

      expect(light.content).toBe(PAPER);
      expect(dark.content).toBe(PAPER);
    });

    it('keep their content without --paper', () => {
      const light = addMeta('(prefers-color-scheme: light)', '#ffffff');
      const dark = addMeta('(prefers-color-scheme: dark)', '#000000');
      const theme = TestBed.inject(Theme);

      theme.setPalette(Palette.Harbour);
      theme.clearPalette();

      expect(light.content).toBe('#ffffff');
      expect(dark.content).toBe('#000000');
    });

    it('follow a prefers-color-scheme change', () => {
      const mql = createMql(true);
      vi.stubGlobal('matchMedia', () => mql);
      const light = addMeta('(prefers-color-scheme: light)', '#ffffff');
      const dark = addMeta('(prefers-color-scheme: dark)', '#000000');
      TestBed.inject(Theme);
      document.documentElement.style.setProperty('--paper', PAPER);

      change(mql, false);

      expect(light.content).toBe(PAPER);
      expect(dark.content).toBe(PAPER);
    });

    it('follow clearPalette', () => {
      const light = addMeta('(prefers-color-scheme: light)', '#ffffff');
      const theme = TestBed.inject(Theme);
      theme.setPalette(Palette.Harbour);
      document.documentElement.style.setProperty('--paper', '#abcdef');

      theme.clearPalette();

      expect(light.content).toBe('#abcdef');
    });
  });
});
