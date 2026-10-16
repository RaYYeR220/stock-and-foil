// SPDX-License-Identifier: Apache-2.0
//
// The dev server half of the console: a handful of local endpoints and a static mount, all of
// them refusing anything that did not come from this machine.
//
// Three jobs it does that a browser cannot:
//
//   * holds the Blockfrost project token and attaches it to outbound indexer traffic, so the
//     credential never enters the page (see ./env.ts and the `/bf` proxy in vite.config.ts);
//   * serves the ~124 MB of staged proving material at /zk with CORS, which is what the 1AM
//     proving provider needs to fetch a proving key;
//   * reads `cli/.secrets/mainnet-keys.json` and writes `cli/deployments/mainnet.json`,
//     `cli/evidence/mainnet-*.json` and the console's own resumable state — in the exact shape
//     `cli/src/records.ts` defines, so `verify` and `proof` read them with no changes at all.
//
// It also persists the deployer's **signing key**. A staged deployment inserts ten verifier
// keys with maintenance transactions after the deploy, and only the holder of that key may do
// so. In the CLI it lives in a LevelDB store under `cli/.secrets/`; in a browser the default
// private-state provider is a `Map`, which a closed tab destroys — and with it the contract's
// maintenance authority, permanently. So the page mirrors its private state here.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { fileStamp, toJsonText } from '../../../cli/src/records.js';
import { blockfrostMainnetToken, findRepoRoot, redact } from './env.js';
import { paths, serverPreflight } from './preflight.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

/** Only this machine may talk to these endpoints, whatever the dev server is bound to. */
function isLocal(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress ?? '';
  if (!LOOPBACK.has(remote)) return false;
  // A loopback socket is not enough on its own: a page on another origin can still be pointed
  // at a hostname that resolves to 127.0.0.1. Pin the Host header too.
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return LOOPBACK.has(host);
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const text = toJsonText(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
};

/** At most 64 MB of request body; an evidence file is kilobytes, so this is only a stop. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 64 * 1024 * 1024) throw new Error('request body is too large');
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const writeFile = (path: string, value: unknown): void => {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, toJsonText(value), 'utf8');
};

const readFileIfPresent = (path: string): unknown =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : null;

const CONTENT_TYPES: Record<string, string> = {
  '.verifier': 'application/octet-stream',
  '.prover': 'application/octet-stream',
  '.bzkir': 'application/octet-stream',
  '.zkir': 'application/json',
  '.json': 'application/json',
};

/**
 * Serves the staged proving material.
 *
 * `Access-Control-Allow-Origin: *` is here because 1AM's guide asks for it: the proving
 * provider the wallet hands back fetches these URLs, and we do not get to assume it fetches
 * them from this page's origin.
 */
function serveZk(root: string, rest: string, req: IncomingMessage, res: ServerResponse): boolean {
  const relative = normalize(decodeURIComponent(rest)).replace(/^[/\\]+/, '');
  const file = join(root, relative);
  if (!file.startsWith(root + sep)) {
    res.statusCode = 403;
    res.end('outside the staged directory');
    return true;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('not staged');
    return true;
  }
  const stat = statSync(file);
  res.statusCode = 200;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}

export interface ConsoleBackendOptions {
  repoRoot?: string;
}

export function mainnetConsoleBackend(options: ConsoleBackendOptions = {}): Plugin {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const p = paths(repoRoot);
  const token = blockfrostMainnetToken(repoRoot).token;

  return {
    name: 'stock-and-foil:mainnet-console-backend',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/';
        const [pathname = '/', query = ''] = url.split('?');
        if (!pathname.startsWith('/__console') && !pathname.startsWith('/zk/')) return next();

        if (!isLocal(req)) {
          res.statusCode = 403;
          res.end('the mainnet console answers only on loopback');
          return undefined;
        }

        try {
          if (pathname.startsWith('/zk/')) {
            serveZk(p.staged, pathname.slice('/zk'.length), req, res);
            return undefined;
          }

          const params = new URLSearchParams(query);
          switch (`${req.method} ${pathname}`) {
            case 'GET /__console/preflight':
              return sendJson(res, 200, await serverPreflight(repoRoot, params.get('deep') === '1'));

            // The ceremony's secret shares. They have to reach the page: the operator, auditor
            // and keyholder circuits run there, and a witness cannot prove knowledge of a
            // secret it does not have. This is the reason the console is a separate local app
            // and never part of the published site.
            case 'GET /__console/keys':
              return sendJson(res, 200, readFileIfPresent(p.keysFile));
            case 'POST /__console/keys': {
              if (existsSync(p.keysFile) && params.get('force') !== '1') {
                return sendJson(res, 409, {
                  error:
                    'cli/.secrets/mainnet-keys.json already exists. Re-running the ceremony orphans a ' +
                    'contract deployed with the old keys.',
                });
              }
              writeFile(p.keysFile, await readBody(req));
              return sendJson(res, 200, { written: p.keysFile });
            }

            case 'GET /__console/state':
              return sendJson(res, 200, readFileIfPresent(p.runState));
            case 'PUT /__console/state':
              writeFile(p.runState, await readBody(req));
              return sendJson(res, 200, { written: p.runState });

            case 'GET /__console/private-state':
              return sendJson(res, 200, readFileIfPresent(p.privateState));
            case 'PUT /__console/private-state':
              writeFile(p.privateState, await readBody(req));
              return sendJson(res, 200, { written: p.privateState });

            // The file names are decided here, never by the request: `verify` and `proof` find
            // these by name, and a caller-chosen path is a write-anywhere endpoint.
            case 'GET /__console/deployment':
              return sendJson(res, 200, readFileIfPresent(p.deployment));
            case 'POST /__console/deployment': {
              writeFile(p.deployment, await readBody(req));
              return sendJson(res, 200, { written: p.deployment });
            }
            case 'POST /__console/evidence': {
              const path = join(p.evidence, `mainnet-${fileStamp()}.json`);
              writeFile(path, await readBody(req));
              return sendJson(res, 200, { written: path });
            }
            default:
              return sendJson(res, 404, { error: `no console endpoint ${req.method} ${pathname}` });
          }
        } catch (cause) {
          const message = redact(cause instanceof Error ? cause.message : String(cause), token);
          server.config.logger.error(`[mainnet-console] ${message}`);
          return sendJson(res, 500, { error: message });
        }
      });

      const port = server.config.server.port ?? 5174;
      server.config.logger.info(
        `\n  mainnet console — local only, never built, never published\n` +
          `  repository  ${repoRoot}\n` +
          `  token       ${token ? 'held by this dev server, not by the page' : 'ABSENT — see docs/MAINNET.md'}\n` +
          `  open        http://127.0.0.1:${port}/\n`,
      );
    },
  };
}
