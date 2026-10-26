// SPDX-License-Identifier: EUPL-1.2

// Checks the PWA's Atomic Design levels (apps/pwa/src/app/components/README.md): every relative import under
// components/, pages/, layout/ and in app.ts must point at a level the importing file may hold.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const app = resolve(root, 'apps/pwa/src/app');

const Level = {
  Atom: 'atoms',
  Molecule: 'molecules',
  Organism: 'organisms',
  Template: 'templates',
  Support: 'support',
} as const;

type LevelName = (typeof Level)[keyof typeof Level];

const LEVELS: readonly string[] = Object.values(Level);

// The levels each level may import from, besides its own folder.
const MAY_IMPORT: Readonly<Record<LevelName, readonly LevelName[]>> = {
  [Level.Atom]: [Level.Support],
  [Level.Molecule]: [Level.Atom, Level.Molecule, Level.Support],
  [Level.Organism]: [Level.Atom, Level.Molecule, Level.Organism, Level.Support],
  [Level.Template]: [Level.Atom, Level.Molecule, Level.Organism, Level.Support],
  [Level.Support]: [],
};

// The Icon atom, the one place Font Awesome is imported.
const ICON = 'atoms/icon';

// An atom may hold the Icon and Count atoms as parts of its label.
const ATOM_PARTS = [ICON, 'atoms/count'];

// The one component that may use core at runtime, and the seams it may use.
const CORE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  'organisms/swipe-actions': [
    'core/platform/haptics',
    'core/platform/motion',
    'core/platform/theme',
  ],
};

// The app's folders outside components/ that no component may import from.
const OUTSIDE = ['pages', 'layout'];

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      })
    : [];

// The shell's files: the .ts files of layout/ and app.ts, specs included.
const shellFiles = (): string[] => [
  ...walk(resolve(app, 'layout')).filter((path) => path.endsWith('.ts')),
  resolve(app, 'app.ts'),
  ...[resolve(app, 'app.spec.ts')].filter((path) => existsSync(path)),
];

const appPath = (file: string): string => relative(app, file).split('\\').join('/');

interface Reference {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly line: number;
}

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

// Blanks out comments, keeping their line breaks, so a quote inside one cannot hide an import.
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '));

const references = (source: string): Reference[] => {
  const text = withoutComments(source);
  const found: Reference[] = [];
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const specifier = match[3] ?? match[4] ?? match[5] ?? '';
    // `import { type A, type B } from` imports types only, as `import type { A, B } from` does.
    const names = /^\{([^}]*)\}$/.exec((match[2] ?? '').trim())?.[1];
    const allInlineTypes =
      names !== undefined &&
      names
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
        .every((name) => name.startsWith('type '));
    const typeOnly = match[1] !== undefined || allInlineTypes;
    const line = text.slice(0, match.index + match[0].indexOf(specifier)).split('\n').length;
    found.push({ specifier, typeOnly, line });
  }
  return found;
};

// The level and the component folder of a path under components/, such as ['atoms', 'atoms/icon'].
const componentOf = (path: string): readonly [string, string] | undefined => {
  const [top, level, name] = path.split('/');
  if (top !== 'components' || level === undefined || !LEVELS.includes(level)) return undefined;
  return [level, level === Level.Support || name === undefined ? level : `${level}/${name}`];
};

const failures: string[] = [];

const fail = (file: string, line: number, message: string): void => {
  failures.push(`${appPath(file)}:${line}: ${message}`);
};

const checkComponent = (file: string, level: LevelName, folder: string): void => {
  const text = readFileSync(file, 'utf8');
  for (const { specifier, typeOnly, line } of references(text)) {
    if (specifier.startsWith('@fortawesome/') && folder !== ICON) {
      fail(file, line, `only ${ICON} may import Font Awesome (${specifier})`);
    }
    if (!specifier.startsWith('.')) continue;
    const target = appPath(resolve(dirname(file), specifier));
    if (target.startsWith('..')) continue;
    const outside = OUTSIDE.find((top) => target === top || target.startsWith(`${top}/`));
    if (outside !== undefined) {
      fail(file, line, `a component may not import from ${outside}/ (${specifier})`);
      continue;
    }
    if (target.startsWith('core/')) {
      if (typeOnly || (CORE_EXCEPTIONS[folder] ?? []).includes(target)) continue;
      fail(file, line, `a component may not use core/ at runtime (${specifier})`);
      continue;
    }
    const component = componentOf(target);
    if (component === undefined) {
      fail(file, line, `a component may import only components/ and core/ types (${specifier})`);
      continue;
    }
    const [targetLevel, targetFolder] = component;
    if (targetFolder === folder) continue;
    if (level === Level.Atom && ATOM_PARTS.includes(targetFolder)) continue;
    if (!MAY_IMPORT[level].some((allowed) => allowed === targetLevel)) {
      fail(file, line, `${level} may not import ${targetLevel} (${specifier})`);
    }
  }
  if (level === Level.Atom && file.endsWith('.html')) {
    fail(file, 1, 'an atom keeps its template inline');
  }
};

const checkPage = (folder: string): void => {
  const files = walk(folder);
  for (const file of files) {
    if (file.endsWith('.html') || file.endsWith('.css')) {
      fail(file, 1, 'a page has no HTML or CSS file');
    }
  }
  const name = folder.split('/').at(-1) ?? '';
  const page = join(folder, `${name}.ts`);
  if (!existsSync(page)) {
    fail(folder, 1, `a page folder holds ${name}.ts`);
    return;
  }
  const templates = new Set<string>();
  for (const file of files.filter((path) => path.endsWith('.ts'))) {
    const spec = file.endsWith('.spec.ts');
    for (const { specifier, typeOnly, line } of references(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const target = appPath(resolve(dirname(file), specifier));
      if (target === 'layout' || target.startsWith('layout/')) {
        fail(file, line, `a page may not import layout/ (${specifier})`);
        continue;
      }
      // Specs may render any level to test the page; only the layout/ ban applies to them.
      if (spec) continue;
      const component = componentOf(target);
      if (component === undefined || typeOnly) continue;
      const [level, componentFolder] = component;
      if (level === Level.Template) {
        templates.add(componentFolder);
      } else if (level !== Level.Support) {
        fail(file, line, `a page imports only its template, not ${level} (${specifier})`);
      }
    }
  }
  if (templates.size !== 1) {
    fail(page, 1, `a page imports exactly one template, found ${templates.size}`);
  }
};

const checkShell = (file: string): void => {
  for (const { specifier, line } of references(readFileSync(file, 'utf8'))) {
    if (!specifier.startsWith('.')) continue;
    const target = appPath(resolve(dirname(file), specifier));
    if (target.startsWith('..')) continue;
    if (target === 'pages' || target.startsWith('pages/')) {
      fail(file, line, `the shell may not import pages/ (${specifier})`);
    } else if (componentOf(target)?.[0] === Level.Template) {
      fail(file, line, `the shell may not import a template (${specifier})`);
    }
  }
};

const componentFiles = walk(resolve(app, 'components'));

for (const file of componentFiles) {
  const component = componentOf(appPath(file));
  if (component === undefined) {
    if (!file.endsWith('README.md')) fail(file, 1, `not in a level folder (${LEVELS.join(', ')})`);
    continue;
  }
  const [level, folder] = component;
  if (file.endsWith('.ts') || file.endsWith('.html'))
    checkComponent(file, level as LevelName, folder);
}

const pages = resolve(app, 'pages');

const pageEntries = existsSync(pages) ? readdirSync(pages).map((name) => join(pages, name)) : [];

const pageFolders = pageEntries.filter((path) => statSync(path).isDirectory());

for (const file of pageEntries.filter((path) => !statSync(path).isDirectory())) {
  fail(file, 1, 'a page lives in a folder of its own, pages/<name>/<name>.ts');
}

for (const folder of pageFolders) checkPage(folder);

const shell = shellFiles();

for (const file of shell) checkShell(file);

if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

console.log(
  `OK: ${componentFiles.length} component files, ${pageFolders.length} pages and ${shell.length} shell files follow the levels`,
);
