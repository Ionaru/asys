// SPDX-License-Identifier: EUPL-1.2

// Serves the built PWA (dist/apps/pwa/browser) on http://localhost:4200 so the service worker really runs,
// which `ng serve` never does. Paths without a file extension fall back to index.html; /v1/** and /health go to the API on :3000.
// Usage: `node scripts/serve-pwa.mts` after `nx build pwa`.
import { createReadStream, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../dist/apps/pwa/browser');

const HOST = 'localhost';

const PORT = 4200;

const API_HOST = 'localhost';

const API_PORT = 3000;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The service worker, its manifest and the shell must always be revalidated, or an update is not seen.
const NO_CACHE_FILES: ReadonlySet<string> = new Set([
  'ngsw-worker.js',
  'ngsw.json',
  'safety-worker.js',
  'worker-basic.min.js',
  'index.html',
]);

// Hop-by-hop headers belong to one connection, so they are not forwarded in either direction.
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
]);

const isProxied = (pathname: string): boolean =>
  pathname === '/health' || pathname === '/v1' || pathname.startsWith('/v1/');

// Copies the raw header list (names and order as sent, repeated headers kept) minus the hop-by-hop ones.
const forwardedHeaders = (raw: readonly string[]): string[] => {
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index];
    if (!HOP_BY_HOP.has(name.toLowerCase())) out.push(name, raw[index + 1]);
  }
  return out;
};

// Host is kept as the browser sent it (localhost:4200), like Vite's proxy does without changeOrigin,
// so the API sees the same request it would see from `nx serve pwa`.
const proxy = (req: IncomingMessage, res: ServerResponse): void => {
  const upstream = request(
    {
      host: API_HOST,
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers: forwardedHeaders(req.rawHeaders),
    },
    (upstreamRes) => {
      res.writeHead(
        upstreamRes.statusCode ?? 502,
        upstreamRes.statusMessage,
        forwardedHeaders(upstreamRes.rawHeaders),
      );
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      `Bad gateway: the API on ${API_HOST}:${API_PORT} is unreachable (${(error as NodeJS.ErrnoException).code ?? error.message}).\n`,
    );
  });
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
};

const fileAt = (path: string): string | undefined => {
  try {
    return statSync(path).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
};

// Maps a URL path to a file under ROOT; undefined means refused (traversal or a malformed path).
const resolveFile = (pathname: string): { file: string | undefined } | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined;
  const target = resolve(ROOT, `.${decoded}`);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return undefined;
  const file = fileAt(target);
  if (file !== undefined) return { file };
  if (extname(target) === '') return { file: fileAt(resolve(ROOT, 'index.html')) };
  return { file: undefined };
};

const sendText = (res: ServerResponse, status: number, text: string, headers = {}): void => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(`${text}\n`);
};

const serveStatic = (req: IncomingMessage, res: ServerResponse, pathname: string): void => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
    return;
  }
  const resolved = resolveFile(pathname);
  if (resolved === undefined) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (resolved.file === undefined) {
    sendText(res, 404, 'Not found');
    return;
  }
  const { file } = resolved;
  const headers: Record<string, string | number> = {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': statSync(file).size,
  };
  if (NO_CACHE_FILES.has(file.slice(ROOT.length + 1))) headers['cache-control'] = 'no-cache';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
};

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', `http://${HOST}`).pathname;
  if (isProxied(pathname)) proxy(req, res);
  else serveStatic(req, res, pathname);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop whatever listens on it; this server never picks another port.`,
    );
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(
    `Serving ${ROOT} on http://${HOST}:${PORT} (API proxied to http://${API_HOST}:${API_PORT})`,
  );
});
