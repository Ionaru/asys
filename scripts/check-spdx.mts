// SPDX-License-Identifier: EUPL-1.2

// Checks that every file with comment syntax carries the expected licence tag.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const EXEMPT_EXTENSIONS = [
  '.json',
  '.webmanifest',
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.woff',
  '.woff2',
];

const EXEMPT_PATHS = new Set(['pnpm-lock.yaml', 'REUSE.toml']);

const EXEMPT_NAMES = new Set(['LICENSE', '.gitkeep']);

const isExempt = (file: string): boolean => {
  if (EXEMPT_EXTENSIONS.some((extension) => file.endsWith(extension))) return true;
  if (EXEMPT_PATHS.has(file) || file.startsWith('LICENSES/')) return true;
  const name = basename(file);
  return EXEMPT_NAMES.has(name) || name.startsWith('LICENSE.');
};

// Licence by location; the first matching prefix wins, anything else is EUPL-1.2.
const LICENCE_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ['libs/domain/', 'MPL-2.0'],
  ['libs/contract/', 'MPL-2.0'],
  ['libs/effect-passkeys/', 'MIT'],
];

const expectedLicence = (file: string): string =>
  LICENCE_BY_PREFIX.find(([prefix]) => file.startsWith(prefix))?.[1] ?? 'EUPL-1.2';

// REUSE-IgnoreStart
const TAG_PATTERN = /SPDX-License-Identifier:(.*)/;
// REUSE-IgnoreEnd

const foundLicence = (file: string): string => {
  const head = readFileSync(resolve(root, file), 'utf8').split('\n').slice(0, 5);
  for (const line of head) {
    const match = TAG_PATTERN.exec(line);
    if (match) {
      return (match[1] ?? '').trim().replace(/-->$/, '').replace(/\*\/$/, '').trim();
    }
  }
  return '';
};

// A symbolic link, such as a .claude/skills entry that points into .agents/skills, is checked at its target.
const isSymbolicLink = (file: string): boolean => lstatSync(resolve(root, file)).isSymbolicLink();

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  },
)
  .split('\0')
  .filter((file) => file !== '');

const failures: string[] = [];

let count = 0;

for (const file of files) {
  if (!existsSync(resolve(root, file)) || isExempt(file) || isSymbolicLink(file)) continue;
  count++;
  const expected = expectedLicence(file);
  const found = foundLicence(file);
  if (found === '') {
    failures.push(`missing: ${file}`);
  } else if (found !== expected) {
    failures.push(`wrong licence (found ${found}, expected ${expected}): ${file}`);
  }
}

if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}

console.log(`OK: ${count} files carry the expected licence identifier`);
