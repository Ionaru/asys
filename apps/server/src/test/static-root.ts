// SPDX-License-Identifier: EUPL-1.2
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';

export const MARKER = 'ASYS-SHELL-MARKER-7f3a';

export const INDEX_HTML = `<!doctype html><html><body>${MARKER}</body></html>`;

export const HASHED = [
  '/main-ABCDEFGH.js',
  '/chunk-9NWjWR-i.js',
  '/chunk-Dc_ThKKr.js',
  '/media/AtkinsonHyperlegibleNext-Variable-4LEQQAMU.woff2',
];

/** A fresh static root with a small PWA build in it, removed when the scope closes. */
export const makeStaticRoot = Effect.acquireRelease(
  Effect.sync(() => {
    const root = mkdtempSync(join(tmpdir(), 'asys-static-'));
    mkdirSync(join(root, 'media'));
    mkdirSync(join(root, 'icons'));
    writeFileSync(join(root, 'index.html'), INDEX_HTML);
    writeFileSync(join(root, 'ngsw.json'), '{"configVersion":1}');
    writeFileSync(join(root, 'ngsw-worker.js'), 'self.addEventListener("fetch", () => {});');
    writeFileSync(join(root, 'main-ABCDEFGH.js'), 'console.log("main");');
    writeFileSync(join(root, 'chunk-9NWjWR-i.js'), 'console.log("chunk a");');
    writeFileSync(join(root, 'chunk-Dc_ThKKr.js'), 'console.log("chunk b");');
    writeFileSync(
      join(root, 'media', 'AtkinsonHyperlegibleNext-Variable-4LEQQAMU.woff2'),
      Buffer.from([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]),
    );
    writeFileSync(join(root, 'manifest.webmanifest'), '{"name":"ASYS"}');
    writeFileSync(join(root, 'icons', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

    return root;
  }),
  (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
);
