// SPDX-License-Identifier: EUPL-1.2

// Builds the curated palettes for the Palette setting and checks every promised contrast pair.
// It reads the Evergreen colours from libs/design-tokens/src/themes/*.tokens.json and derives the other palettes from the inputs below.
// `node scripts/palettes.mts` rewrites palettes/<palette>-<theme>.tokens.json and asys.resolver.json under libs/design-tokens/src;
// `node scripts/palettes.mts --check` fails when a palette breaks a rule or a generated file is stale.
// The rules are the design system's Personalisation section: Evergreen is the themes exactly, the others are derived.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const designDir = resolve(import.meta.dirname, '../libs/design-tokens/src');

const themesDir = resolve(designDir, 'themes');

const palettesDir = resolve(designDir, 'palettes');

const resolverPath = resolve(designDir, 'asys.resolver.json');

const TOKENS_SUFFIX = '.tokens.json';

// One reverse-domain key for everything the standard has no place for.
const EXTENSION = 'io.github.ionaru.asys';

// Closed sets as const objects: enums are not erasable syntax, and these scripts run through Node's type stripping.
const Mode = { Light: 'light', Dark: 'dark', Drive: 'drive' } as const;

type ModeValue = (typeof Mode)[keyof typeof Mode];

const MODES: readonly ModeValue[] = [Mode.Light, Mode.Dark, Mode.Drive];

const Ground = { Warm: 'warm', Neutral: 'neutral', Cool: 'cool' } as const;

type GroundValue = (typeof Ground)[keyof typeof Ground];

type Rgb = readonly [number, number, number];

type Oklch = readonly [number, number, number];

type TokenMap = Record<string, string>;

type ModeMaps = Record<ModeValue, TokenMap>;

const THEME_NAMES: Record<ModeValue, string> = {
  light: 'Light',
  dark: 'Dark',
  drive: 'Voice only',
};

interface PaletteInput {
  readonly name: string;
  readonly accent: string;
  readonly highlight: string;
  readonly ground: GroundValue;
}

interface ColorValue {
  colorSpace: 'srgb';
  components: [number, number, number];
  hex: string;
}

interface ThemeFile {
  $description: string;
  color: Record<string, unknown>;
  shadow: unknown;
}

// The curated palettes. Adding one: add its inputs here, run the script, review it in all three themes.
const PALETTES: Record<string, PaletteInput> = {
  evergreen: { name: 'Evergreen', accent: '#0e5c4f', highlight: '#f2b632', ground: Ground.Warm },
  harbour: { name: 'Harbour', accent: '#1d5a85', highlight: '#f0b45a', ground: Ground.Cool },
  moss: { name: 'Moss', accent: '#4f6228', highlight: '#e9c46a', ground: Ground.Warm },
  graphite: { name: 'Graphite', accent: '#4a5664', highlight: '#7fd1c7', ground: Ground.Neutral },
};

// Hand-checked grounds; Warm is the shipped default.
const GROUNDS: Record<GroundValue, ModeMaps> = {
  warm: {
    light: {
      paper: '#f5f3ee',
      surface: '#ffffff',
      sunken: '#ebe8e1',
      line: '#dcd8cf',
      'line-strong': '#858077',
      ink: '#1a1d20',
      'ink-muted': '#565a5f',
    },
    dark: {
      paper: '#121416',
      surface: '#1c1f22',
      sunken: '#0b0d0e',
      line: '#2d3136',
      'line-strong': '#6e747b',
      ink: '#ecebe6',
      'ink-muted': '#a9aeb3',
    },
    drive: {
      paper: '#000000',
      surface: '#0e0e0e',
      sunken: '#000000',
      line: '#333333',
      'line-strong': '#a3a3a3',
      ink: '#ffffff',
      'ink-muted': '#d6d6d6',
    },
  },
  neutral: {
    light: {
      paper: '#f4f4f4',
      surface: '#ffffff',
      sunken: '#e8e8e8',
      line: '#d8d8d8',
      'line-strong': '#808080',
      ink: '#1b1b1b',
      'ink-muted': '#575757',
    },
    dark: {
      paper: '#141414',
      surface: '#1e1e1e',
      sunken: '#0c0c0c',
      line: '#303030',
      'line-strong': '#737373',
      ink: '#ebebeb',
      'ink-muted': '#ababab',
    },
    drive: {
      paper: '#000000',
      surface: '#0e0e0e',
      sunken: '#000000',
      line: '#333333',
      'line-strong': '#a3a3a3',
      ink: '#ffffff',
      'ink-muted': '#d6d6d6',
    },
  },
  cool: {
    light: {
      paper: '#f1f4f6',
      surface: '#ffffff',
      sunken: '#e4e9ed',
      line: '#d3dae0',
      'line-strong': '#7a838c',
      ink: '#191d22',
      'ink-muted': '#535a62',
    },
    dark: {
      paper: '#11151a',
      surface: '#1a2027',
      sunken: '#0a0d10',
      line: '#2b333c',
      'line-strong': '#6b7580',
      ink: '#e8ecef',
      'ink-muted': '#a5aeb6',
    },
    drive: {
      paper: '#000000',
      surface: '#0e0e0e',
      sunken: '#000000',
      line: '#333333',
      'line-strong': '#a3a3a3',
      ink: '#ffffff',
      'ink-muted': '#d6d6d6',
    },
  },
};

// Danger is not personal: Overdue looks the same in every palette.
const DANGER: ModeMaps = {
  light: {
    danger: '#b33a12',
    'on-danger': '#ffffff',
    'danger-soft': '#f8e3da',
    'on-danger-soft': '#8f2c0b',
  },
  dark: {
    danger: '#ff9470',
    'on-danger': '#1a1d20',
    'danger-soft': '#3d2018',
    'on-danger-soft': '#ffbfa8',
  },
  drive: {
    danger: '#ffa07f',
    'on-danger': '#000000',
    'danger-soft': '#33170f',
    'on-danger-soft': '#ffc7b3',
  },
};

// Every pair a palette promises. Text pairs (4.5) rise to 7 in Voice only.
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['ink', 'paper', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'sunken', 4.5],
  ['ink-muted', 'paper', 4.5],
  ['ink-muted', 'surface', 4.5],
  ['ink-muted', 'sunken', 4.5],
  ['on-signal', 'signal', 4.5],
  ['on-signal-soft', 'signal-soft', 4.5],
  ['ink', 'signal-soft', 4.5],
  ['ink-muted', 'signal-soft', 4.5],
  ['signal', 'surface', 4.5],
  ['signal', 'paper', 4.5],
  ['on-now', 'now', 4.5],
  ['on-danger', 'danger', 4.5],
  ['on-danger-soft', 'danger-soft', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'paper', 4.5],
  ['line-strong', 'surface', 3],
  ['line-strong', 'paper', 3],
  ['line-strong', 'sunken', 3],
  ['focus', 'surface', 3],
  ['focus', 'paper', 3],
  ['voice-2', 'surface', 3],
  ['voice-3', 'surface', 3],
  ['voice-3', 'sunken', 3],
];

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const toGamma = (v: number): number =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

const hexToRgb = (hex: string): Rgb => {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as unknown as Rgb;
};

const rgbToHex = (rgb: Rgb): string =>
  '#' +
  rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

const rgbToOklch = (rgb: Rgb): Oklch => {
  const [r, g, b] = rgb.map(toLinear) as unknown as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
};

const oklchToRgb = ([lightness, chroma, hue]: Oklch): Rgb => {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

const inGamut = (rgb: Rgb): boolean => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// Keeps lightness and hue, lowering chroma until the colour fits sRGB.
const oklch = (lightness: number, chroma: number, hue: number): string => {
  let c = chroma;
  let rgb = oklchToRgb([lightness, c, hue]);
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.002);
    rgb = oklchToRgb([lightness, c, hue]);
  }
  return rgbToHex(rgb);
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (high + 0.05) / (low + 0.05);
};

// Moves lightness in small steps (darker for -1, lighter for 1) from a start until ok holds.
const seek = (
  lightness: number,
  chroma: number,
  hue: number,
  direction: -1 | 1,
  ok: (hex: string) => boolean,
): string => {
  for (let l = lightness; l >= 0 && l <= 1; l += direction * 0.005) {
    const hex = oklch(l, chroma, hue);
    if (ok(hex)) return hex;
  }
  return oklch(direction < 0 ? 0 : 1, 0, hue);
};

const derive = ({ accent, highlight, ground }: PaletteInput): ModeMaps => {
  const [aL, aC, aH] = rgbToOklch(hexToRgb(accent));
  const [hL, hC, hH] = rgbToOklch(hexToRgb(highlight));
  const maps = {} as ModeMaps;
  for (const mode of MODES) {
    const g = GROUNDS[ground][mode];
    const t: TokenMap = { ...g, ...DANGER[mode] };
    const paper = g['paper'] ?? '';
    const surface = g['surface'] ?? '';
    const target = mode === Mode.Drive ? 7 : 4.5;
    if (mode === Mode.Light) {
      // A dark accent fill with white text on it.
      t['on-signal'] = '#ffffff';
      t['signal'] = seek(
        Math.min(aL, 0.62),
        aC,
        aH,
        -1,
        (h) =>
          contrast(h, '#ffffff') >= 4.5 && contrast(h, paper) >= 4.5 && contrast(h, surface) >= 4.5,
      );
      t['signal-soft'] = oklch(0.94, Math.min(aC, 0.035), aH);
      t['on-signal-soft'] = seek(
        0.42,
        Math.min(aC, 0.1),
        aH,
        -1,
        (h) => contrast(h, t['signal-soft'] ?? '') >= 4.5,
      );
      t['voice-1'] = oklch(0.88, Math.min(aC, 0.05), aH);
      t['voice-2'] = seek(0.66, Math.min(aC, 0.09), aH, -1, (h) => contrast(h, surface) >= 3);
      t['focus'] = g['ink'] ?? '';
    } else {
      // A light accent fill with dark text on it. A near-grey accent stays grey: its hue means nothing.
      const signalChroma = aC < 0.02 ? aC : Math.min(Math.max(aC, 0.06), 0.13);
      const onSignal = mode === Mode.Drive ? '#000000' : oklch(0.2, Math.min(aC, 0.03), aH);
      t['on-signal'] = onSignal;
      t['signal'] = seek(
        Math.max(aL, mode === Mode.Drive ? 0.82 : 0.74),
        signalChroma,
        aH,
        1,
        (h) =>
          contrast(h, onSignal) >= target &&
          contrast(h, paper) >= target &&
          contrast(h, surface) >= target,
      );
      t['signal-soft'] = oklch(mode === Mode.Drive ? 0.27 : 0.3, Math.min(aC, 0.05), aH);
      t['on-signal-soft'] = seek(
        0.86,
        Math.min(aC, 0.08),
        aH,
        1,
        (h) => contrast(h, t['signal-soft'] ?? '') >= target,
      );
      t['voice-1'] = oklch(0.33, Math.min(aC, 0.05), aH);
      t['voice-2'] = seek(0.58, Math.min(aC, 0.09), aH, 1, (h) => contrast(h, surface) >= 3);
    }
    t['voice-3'] = t['signal'] ?? '';
    // The highlight is always a light fill with dark text on it.
    const onNow = mode === Mode.Drive ? '#000000' : '#1a1d20';
    t['on-now'] = onNow;
    t['now'] = seek(
      Math.max(hL, mode === Mode.Drive ? 0.84 : 0.78),
      hC,
      hH,
      1,
      (h) => contrast(h, onNow) >= (mode === Mode.Drive ? 9 : 7),
    );
    if (mode !== Mode.Light) t['focus'] = t['now'];
    maps[mode] = t;
  }
  return maps;
};

const failures = (id: string, maps: ModeMaps): string[] => {
  const found: string[] = [];
  for (const mode of MODES) {
    const map = maps[mode];
    const pairs = [
      ...PAIRS.map(([a, b, min]): [string, string, number] => [
        a,
        b,
        mode === Mode.Drive && min === 4.5 ? 7 : min,
      ]),
    ];
    for (const [a, b, min] of pairs) {
      const ratio = contrast(map[a] ?? '', map[b] ?? '');
      if (ratio < min)
        found.push(`${id} ${mode}: ${a} on ${b} is ${ratio.toFixed(2)}, needs ${min}`);
    }
  }
  return found;
};

// Components are the channel over 255, rounded to four places; Math.round(component * 255) gives the hex channel back.
const toColorValue = (hex: string): ColorValue => ({
  colorSpace: 'srgb',
  components: hexToRgb(hex).map((v) => Math.round(v * 10_000) / 10_000) as ColorValue['components'],
  hex,
});

// JSON.stringify, with short arrays of primitives on one line the way oxfmt keeps them: its 100 columns include a trailing comma.
const serialize = (value: unknown): string =>
  JSON.stringify(value, null, 2).replace(
    /^( *)(".*": )?\[\n((?: *(?:-?[\d.]+|true|false|".*"),?\n)+) *\](,?)$/gm,
    (whole, indent: string, key: string | undefined, items: string, comma: string) => {
      const line = `${indent}${key ?? ''}[${items
        .trim()
        .split(/,?\n\s*/)
        .join(', ')}]${comma}`;
      return line.length <= 100 ? line : whole;
    },
  ) + '\n';

const readTheme = (mode: ModeValue): ThemeFile =>
  JSON.parse(readFileSync(resolve(themesDir, `${mode}${TOKENS_SUFFIX}`), 'utf8')) as ThemeFile;

const colorNames = (theme: ThemeFile): string[] =>
  Object.keys(theme.color).filter((key) => !key.startsWith('$'));

const themes = Object.fromEntries(MODES.map((mode) => [mode, readTheme(mode)])) as Record<
  ModeValue,
  ThemeFile
>;

const tokenNames = colorNames(themes[Mode.Light]);

const problems: string[] = [];

for (const mode of MODES) {
  const file = `themes/${mode}${TOKENS_SUFFIX}`;
  const names = colorNames(themes[mode]);
  if (names.join() !== tokenNames.join()) {
    problems.push(`${file}: colour names differ from themes/light${TOKENS_SUFFIX}`);
    continue;
  }
  for (const name of names) {
    const value = (themes[mode].color[name] as { $value?: Partial<ColorValue> } | undefined)
      ?.$value;
    const hex = value?.hex;
    const components = value?.components;
    const matches =
      value?.colorSpace === 'srgb' &&
      typeof hex === 'string' &&
      /^#[0-9a-f]{6}$/.test(hex) &&
      Array.isArray(components) &&
      components.length === 3 &&
      components.every(
        (c, i) => Math.round(c * 255) === parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16),
      );
    if (!matches) problems.push(`${file}: ${name} components do not match its hex ${String(hex)}`);
  }
}

// Stop here: the colours below are read from themes that passed these checks.
if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exit(1);
}

// Evergreen is the shipped colours: the hex of every theme colour.
const shipped = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    Object.fromEntries(
      tokenNames.map((name) => [
        name,
        (themes[mode].color[name] as { $value: ColorValue }).$value.hex,
      ]),
    ),
  ]),
) as ModeMaps;

// Generated files by path, in write order. Palette files carry a theme's file with the palette's colours.
const generated = new Map<string, string>();

const schemeContexts: Record<string, { $ref: string }[]> = {};

for (const [id, input] of Object.entries(PALETTES)) {
  const maps = id === 'evergreen' ? shipped : derive(input);
  problems.push(...failures(id, maps));
  for (const mode of MODES) {
    if (id === 'evergreen') {
      schemeContexts[`${id}-${mode}`] = [{ $ref: `themes/${mode}${TOKENS_SUFFIX}` }];
      continue;
    }
    const file = `${id}-${mode}${TOKENS_SUFFIX}`;
    const palette = structuredClone(themes[mode]);
    palette.$description = `Generated by scripts/palettes.mts from themes/${mode}${TOKENS_SUFFIX}; do not edit. The ${input.name} palette in the ${THEME_NAMES[mode]} theme.`;
    for (const name of tokenNames) {
      // A colour the themes gained but derive() does not know would otherwise be written empty.
      const hex = maps[mode][name];
      if (hex === undefined) {
        problems.push(`${id} ${mode}: no derived colour for ${name}`);
        continue;
      }
      (palette.color[name] as { $value: ColorValue }).$value = toColorValue(hex);
    }
    generated.set(resolve(palettesDir, file), serialize(palette));
    schemeContexts[`${id}-${mode}`] = [{ $ref: `palettes/${file}` }];
  }
}

const resolver = {
  version: '2025.10',
  name: 'ASYS',
  description:
    'Generated by scripts/palettes.mts; do not edit. The ASYS design tokens: the base set, then one scheme context. Evergreen contexts use the hand-authored themes, the other palettes the generated palette files.',
  sets: {
    base: {
      description: 'The tokens that are the same in every scheme.',
      sources: [{ $ref: `base${TOKENS_SUFFIX}` }],
    },
  },
  modifiers: {
    scheme: {
      description:
        'A palette in a theme, named <palette>-<theme>. One modifier, because a palette carries a full colour map per theme: palette and theme are not independent choices.',
      contexts: schemeContexts,
      default: 'evergreen-light',
      $extensions: {
        [EXTENSION]: {
          themes: Object.fromEntries(MODES.map((mode) => [mode, { name: THEME_NAMES[mode] }])),
          palettes: Object.fromEntries(
            Object.entries(PALETTES).map(([id, { name, ground }]) => [id, { name, ground }]),
          ),
        },
      },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
};

generated.set(resolverPath, serialize(resolver));

if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exit(1);
}

// Anything else in palettes/ is a leftover, for example from a palette that was removed from PALETTES.
const leftovers = (): string[] =>
  readdirSync(palettesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(TOKENS_SUFFIX))
    .map((entry) => resolve(palettesDir, entry.name))
    .filter((path) => !generated.has(path));

const paletteFileCount = generated.size - 1;

if (process.argv.includes('--check')) {
  const found: string[] = [];
  for (const [path, text] of generated) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text)
      found.push(`${path} is stale: run node scripts/palettes.mts`);
  }
  if (existsSync(palettesDir)) {
    for (const path of leftovers())
      found.push(`${path} is not a generated palette file: run node scripts/palettes.mts`);
  }
  if (found.length > 0) {
    console.log(found.join('\n'));
    process.exit(1);
  }
  console.log(
    `OK: ${Object.keys(PALETTES).length} palettes pass every pair and the palette files and asys.resolver.json are current`,
  );
} else {
  mkdirSync(palettesDir, { recursive: true });
  for (const path of leftovers()) {
    rmSync(path);
    console.log(`Deleted ${path}`);
  }
  for (const [path, text] of generated) writeFileSync(path, text);
  console.log(
    `Wrote ${paletteFileCount} palette files and asys.resolver.json for ${Object.keys(PALETTES).length} palettes`,
  );
}
