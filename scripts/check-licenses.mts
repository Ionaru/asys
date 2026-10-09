// SPDX-License-Identifier: EUPL-1.2

// Fails when a production dependency has a licence outside the allowlist.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD']);

// The Font Awesome Pro icon sets ship under the commercial Font Awesome Pro licence (ADR 0011). Each is
// allowed by name, and only while its licence field still reads exactly as reviewed.
const ALLOWED_BY_NAME: ReadonlyMap<string, string> = new Map([
  ['@fortawesome/pro-regular-svg-icons', 'UNLICENSED'],
  ['@fortawesome/pro-solid-svg-icons', 'UNLICENSED'],
]);

const tokenize = (input: string): string[] => {
  const tokens = input.match(/\(|\)|[^\s()]+/g);
  return tokens ?? [];
};

// Grammar: or := and ('OR' and)*, and := atom ('AND' atom)*, atom := '(' or ')' | id.
// Returns true/false, or throws when the expression does not parse (fail closed).
const evaluate = (expression: string): boolean => {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos];
  const parseOr = (): boolean => {
    let result = parseAnd();
    while (peek() === 'OR') {
      pos++;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const parseAnd = (): boolean => {
    let result = parseAtom();
    while (peek() === 'AND') {
      pos++;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  };
  const parseAtom = (): boolean => {
    const token = peek();
    if (token === undefined) throw new Error('unexpected end');
    pos++;
    if (token === '(') {
      const inner = parseOr();
      if (peek() !== ')') throw new Error('missing )');
      pos++;
      return inner;
    }
    if (token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      throw new Error(`unexpected ${token}`);
    }
    if (token === 'UNKNOWN') return false;
    return ALLOWED.has(token);
  };
  const result = parseOr();
  if (pos !== tokens.length) throw new Error(`unexpected ${tokens[pos]}`);
  return result;
};

const passes = (license: unknown): boolean => {
  if (typeof license !== 'string' || license.trim() === '') return false;
  try {
    return evaluate(license);
  } catch {
    return false;
  }
};

const file = process.argv[2];

const raw = file
  ? readFileSync(file, 'utf8')
  : execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

interface Entry {
  name: string;
  versions?: string[];
  license?: unknown;
}

const report: Record<string, unknown> | null = JSON.parse(raw);

let total = 0;

const offenders: string[] = [];

for (const [license, entries] of Object.entries(report ?? {})) {
  if (!Array.isArray(entries)) {
    console.error(`Unexpected report shape under "${license}": not a list`);
    process.exit(1);
  }
  for (const entry of entries as Entry[]) {
    total++;
    if (ALLOWED_BY_NAME.get(entry.name) !== entry.license && !passes(entry.license)) {
      offenders.push(`${entry.name}@${(entry.versions ?? []).join(',')}: ${entry.license}`);
    }
  }
}

// An empty report means nothing was checked, which must not pass as OK.
if (total === 0) {
  console.error('No production packages found in the licence report');
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(offenders.join('\n'));
  process.exit(1);
}

console.log(`OK: ${total} production packages have allowed licences`);
