// SPDX-License-Identifier: EUPL-1.2

// Puts the screenshots from `nx run pwa-e2e:shots` on a pull request, as a `## Screenshots` section in its body.
//
// The upload takes two passes. gh rewrites only Markdown image references (`![alt](./file)`) to uploaded
// `https://github.com/user-attachments/...` URLs; this is an assumption, last checked 2026-10-17 with gh 2.102.0.
// Markdown images inside a GitHub table render at their natural width and scroll sideways, so the final section is
// HTML with `<img width>`. Pass one therefore uploads the files through plain Markdown references and collects the
// URLs; pass two writes the laid-out section with those URLs. A rerun replaces the section instead of adding one, and
// any failure after the first edit puts the original body back.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const HEADING = '## Screenshots';

const ATTACH_LIMIT = 50;

const USAGE = 'Usage: node scripts/pr-screenshots.mts <pr> <dir> [--dry-run]';

const SCHEMES = ['light', 'dark'] as const;

type Scheme = (typeof SCHEMES)[number];

// Shots at least 768 px wide are laid out two to a table; narrower ones, three.
const LAYOUT = {
  narrow: { perTable: 3, width: 220 },
  wide: { perTable: 2, width: 420 },
} as const;

interface Sidecar {
  readonly caption: string;
  readonly group: string | null;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

type Shot = Sidecar & { readonly name: string };

interface Shots {
  readonly shots: ReadonlyArray<Shot>;
  readonly newestMtime: Date;
}

const fail = (message: string): never => {
  console.error(message);
  return process.exit(1);
};

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const readShots = (dir: string): Shots => {
  if (!existsSync(dir)) return fail(`No such directory: ${dir}`);
  const files = readdirSync(dir).sort();
  const jsons = files.filter((file) => /-(light|dark)\.json$/.test(file));
  const pngs = files.filter((file) => /-(light|dark)\.png$/.test(file));
  if (jsons.length === 0) return fail(`No sidecar (<name>-<scheme>.json) in ${dir}`);
  const problems: string[] = [];
  for (const json of jsons) {
    if (!pngs.includes(json.replace(/\.json$/, '.png'))) problems.push(`${json} has no PNG`);
  }
  for (const png of pngs) {
    if (!jsons.includes(png.replace(/\.png$/, '.json'))) problems.push(`${png} has no sidecar`);
  }
  const sidecars = new Map<string, Sidecar>();
  for (const json of jsons) {
    try {
      sidecars.set(
        json.replace(/\.json$/, ''),
        JSON.parse(readFileSync(join(dir, json), 'utf8')) as Sidecar,
      );
    } catch {
      problems.push(`${json} is not valid JSON`);
    }
  }
  const names = [...new Set(jsons.map((json) => json.replace(/-(light|dark)\.json$/, '')))];
  const shots: Shot[] = [];
  for (const name of names) {
    const light = sidecars.get(`${name}-light`);
    const dark = sidecars.get(`${name}-dark`);
    if (!light || !dark) {
      problems.push(`${name} lacks its ${light ? 'dark' : 'light'} pair`);
      continue;
    }
    const differing = (['caption', 'group', 'width', 'height'] as const).filter(
      (key) => light[key] !== dark[key],
    );
    if (differing.length > 0) {
      problems.push(`${name}'s light and dark sidecars differ in ${differing.join(', ')}`);
      continue;
    }
    shots.push({ ...light, name });
  }
  if (problems.length > 0)
    return fail(`Cannot use ${dir}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  const newestMtime = new Date(Math.max(...pngs.map((png) => statSync(join(dir, png)).mtimeMs)));
  return { shots, newestMtime };
};

const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const layoutOf = (shot: Shot) => (shot.width >= 768 ? LAYOUT.wide : LAYOUT.narrow);

const chunk = <T,>(items: ReadonlyArray<T>, size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
};

const table = (
  shots: ReadonlyArray<Shot>,
  width: number,
  urlOf: (stem: string) => string,
): string => {
  const header = shots.map((shot) => `<th>${escapeHtml(shot.caption)}</th>`).join('');
  const row = (scheme: Scheme): string => {
    const cells = shots
      .map((shot) => {
        const alt = escapeHtml(`${shot.caption}, ${scheme}`);
        return `<td><img src="${urlOf(`${shot.name}-${scheme}`)}" width="${width}" alt="${alt}"></td>`;
      })
      .join('');
    return `<tr><th>${scheme === 'light' ? 'Light' : 'Dark'}</th>${cells}</tr>`;
  };
  return ['<table>', `<tr><th></th>${header}</tr>`, row('light'), row('dark'), '</table>'].join(
    '\n',
  );
};

const layOut = (
  { shots, newestMtime }: Shots,
  topic: string,
  urlOf: (stem: string) => string,
): string => {
  const groups: Array<{ readonly group: string | null; readonly shots: Shot[] }> = [];
  for (const shot of shots) {
    const existing = groups.find((entry) => entry.group === shot.group);
    if (existing) existing.shots.push(shot);
    else groups.push({ group: shot.group, shots: [shot] });
  }
  const sizes = [
    ...new Set(
      shots.map((shot) => `${shot.width} × ${shot.height} px at ${shot.deviceScaleFactor}x`),
    ),
  ];
  const blocks: string[] = [
    HEADING,
    `Taken on ${localDate(newestMtime)} with \`pnpm exec nx run pwa-e2e:shots -- src/${topic}.shots.ts\`, at ${sizes.join(' and ')}. Click an image for full size.`,
  ];
  for (const { group, shots: members } of groups) {
    if (group !== null) blocks.push(`**${escapeHtml(group)}**`);
    const runs: Shot[][] = [];
    for (const shot of members) {
      const last = runs[runs.length - 1];
      if (last?.[0] && layoutOf(last[0]) === layoutOf(shot)) last.push(shot);
      else runs.push([shot]);
    }
    for (const run of runs) {
      const { perTable, width } = layoutOf(run[0] as Shot);
      for (const part of chunk(run, perTable)) blocks.push(table(part, width, urlOf));
    }
  }
  return blocks.join('\n\n');
};

const outsideFences = (lines: ReadonlyArray<string>): boolean[] => {
  let inFence = false;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      return false;
    }
    return !inFence;
  });
};

// The section runs from its heading to the next heading of level 1 or 2, skipping fenced code.
const sectionRange = (lines: ReadonlyArray<string>): { start: number; end: number } | null => {
  const live = outsideFences(lines);
  const starts = lines.flatMap((line, index) =>
    live[index] && line.trimEnd() === HEADING ? [index] : [],
  );
  if (starts.length > 1)
    return fail(`The PR body has ${starts.length} "${HEADING}" sections; keep one`);
  const start = starts[0];
  if (start === undefined) return null;
  const next = lines.findIndex(
    (line, index) => index > start && live[index] && /^#{1,2} /.test(line),
  );
  return { start, end: next === -1 ? lines.length : next };
};

const withSection = (body: string, section: string): string => {
  const lines = body.split('\n');
  const range = sectionRange(lines);
  if (range === null) return `${body.trimEnd()}\n\n${section}`;
  const before = lines.slice(0, range.start).join('\n');
  const prefix = range.start === 0 ? '' : `${before}\n`;
  if (range.end === lines.length) return `${prefix}${section}`;
  return `${prefix}${section}\n\n${lines.slice(range.end).join('\n')}`;
};

const sectionOf = (body: string): string => {
  const lines = body.split('\n');
  const range = sectionRange(lines);
  return range === null ? '' : lines.slice(range.start, range.end).join('\n');
};

const gh = (args: ReadonlyArray<string>, cwd?: string): string =>
  execFileSync('gh', [...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const view = (pr: string): { body: string; url: string } => {
  const data = JSON.parse(gh(['pr', 'view', pr, '--json', 'body,url'])) as {
    body: string;
    url: string;
  };
  return { body: data.body ?? '', url: data.url };
};

const collectUrls = (body: string, into: Map<string, string>): void => {
  for (const match of body.matchAll(
    /!\[([^\]]+)\]\((https:\/\/github\.com\/user-attachments\/[^)\s]+)\)/g,
  )) {
    into.set(match[1] as string, match[2] as string);
  }
};

const main = (): void => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [pr, dirArgument, ...extra] = args.filter((arg) => arg !== '--dry-run');
  if (!pr || !dirArgument || extra.length > 0 || [pr, dirArgument].some((a) => a.startsWith('-')))
    return fail(USAGE);
  const dir = resolve(dirArgument);
  const topic = basename(dir);
  const loaded = readShots(dir);
  const stems = loaded.shots.flatMap((shot) => SCHEMES.map((scheme) => `${shot.name}-${scheme}`));

  if (dryRun) {
    const { body, url } = view(pr);
    const action = sectionOf(body) === '' ? 'Would append a' : 'Would replace the existing';
    console.log(`${action} ${HEADING} section in ${url} (${stems.length} images)\n`);
    console.log(
      layOut(loaded, topic, (stem) => `https://github.com/user-attachments/assets/DRY-RUN-${stem}`),
    );
    return;
  }

  if (!gh(['pr', 'edit', '--help']).includes('--attach'))
    return fail('gh pr edit has no --attach; upgrade gh');
  // gh names the PR from the git checkout of its cwd, and the uploads run in `dir`, so every later call uses the URL.
  const { body: original, url } = view(pr);
  const stamp = new Date()
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  const originalFile = join(dir, `.pr-body-original-${stamp}.md`);
  writeFileSync(originalFile, original);

  try {
    const urls = new Map<string, string>();
    const stepFile = join(dir, '.pr-body-step.md');
    for (const part of chunk(stems, ATTACH_LIMIT)) {
      const references = part.map((stem) => `![${stem}](./${stem}.png)`).join('\n\n');
      writeFileSync(stepFile, withSection(original, `${HEADING}\n\n${references}`));
      gh(
        [
          'pr',
          'edit',
          url,
          '--body-file',
          stepFile,
          ...part.flatMap((stem) => ['--attach', `./${stem}.png`]),
        ],
        dir,
      );
      collectUrls(view(url).body, urls);
      const missing = part.filter((stem) => !urls.has(stem));
      if (missing.length > 0) throw new Error(`No uploaded asset for: ${missing.join(', ')}`);
    }

    const finalFile = join(dir, '.pr-body-final.md');
    writeFileSync(
      finalFile,
      withSection(
        original,
        layOut(loaded, topic, (stem) => urls.get(stem) as string),
      ),
    );
    gh(['pr', 'edit', url, '--body-file', finalFile]);

    const images = sectionOf(view(url).body).match(/<img\b/g)?.length ?? 0;
    if (images !== stems.length) {
      throw new Error(`The ${HEADING} section has ${images} images for ${stems.length} PNG files`);
    }
    console.log(`${url}: ${stems.length} images in ${HEADING}`);
  } catch (error) {
    const reason = (error as Error).message.split('\n')[0];
    try {
      gh(['pr', 'edit', url, '--body-file', originalFile]);
    } catch {
      return fail(
        `${reason}. Restoring the original body failed; run: gh pr edit ${url} --body-file ${originalFile}`,
      );
    }
    return fail(`${reason}. The original body is restored from ${originalFile}`);
  }
};

main();
