// SPDX-License-Identifier: EUPL-1.2

// Builds dist/libs/design-tokens/css/tokens.css from src/asys.resolver.json.
// Run from the workspace root: `pnpm exec tz build -c libs/design-tokens/terrazzo.config.mts`.
// Terrazzo resolves `tokens` and `outDir` against the working directory, not against this file.
import { defineConfig } from '@terrazzo/cli';
import css from '@terrazzo/plugin-css';

enum Scheme {
  Light = 'evergreen-light',
  Dark = 'evergreen-dark',
  Drive = 'evergreen-drive',
}

const EXTENSION_KEY = 'io.github.ionaru.asys';

// The tokens that differ between schemes. Every other token is the same in all of them, so only the light block carries it.
const SCHEME_TOKENS = ['color.*', 'shadow.*'];

// A token that DTCG cannot express as none (a shadow) says so in its extension.
const isNone = (extensions: Record<string, unknown> | undefined): boolean => {
  const own = extensions?.[EXTENSION_KEY];

  return typeof own === 'object' && own !== null && 'none' in own && own.none === true;
};

const leafName = (id: string): string => id.slice(id.lastIndexOf('.') + 1);

// Terrazzo prints the declarations at the indent that these wrappers imply, but trims the first line, so each wrapper indents it.
const wrap =
  (selector: string) =>
  (contents: string): string =>
    `${selector} {\n  ${contents}\n}`;

const wrapInMedia =
  (query: string, selector: string) =>
  (contents: string): string =>
    `${query} {\n  ${selector} {\n    ${contents}\n  }\n}`;

// Applying every context makes Terrazzo resolve its aliases, so a dangling reference in any of the 12 fails the build. Terrazzo itself only does it for the default context and the ones a permutation names.
// `Plugin` comes from `@terrazzo/parser`, which pnpm does not expose at the workspace root, so the type is taken from the CSS plugin's return type.
const allContextsResolve = (): ReturnType<typeof css> => ({
  name: 'asys:all-contexts-resolve',
  transform: ({ resolver }) => {
    // Terrazzo leaves the list out above its permutation limit; fail rather than skip the check.
    const inputs = resolver.listPermutations?.();

    if (inputs === undefined) {
      throw new Error(
        'Terrazzo did not list the resolver contexts, so they cannot all be checked.',
      );
    }

    for (const input of inputs) {
      resolver.apply(input);
    }
  },
});

export default defineConfig({
  tokens: ['./libs/design-tokens/src/asys.resolver.json'],
  outDir: './dist/libs/design-tokens/css/',
  alphabetize: false,
  plugins: [
    allContextsResolve(),
    css({
      filename: 'tokens.css',
      legacyHex: true,
      variableName: (token) => leafName(token.id),
      transform: (token) => (isNone(token.$extensions) ? 'none' : undefined),
      permutations: [
        {
          input: { scheme: Scheme.Light },
          prepare: wrap(':root, [data-theme="light"]'),
        },
        {
          input: { scheme: Scheme.Dark },
          include: SCHEME_TOKENS,
          prepare: wrapInMedia('@media (prefers-color-scheme: dark)', ':root:not([data-theme])'),
        },
        {
          input: { scheme: Scheme.Dark },
          include: SCHEME_TOKENS,
          prepare: wrap('[data-theme="dark"]'),
        },
        {
          input: { scheme: Scheme.Drive },
          include: SCHEME_TOKENS,
          prepare: wrap('[data-theme="drive"]'),
        },
      ],
    }),
  ],
});
