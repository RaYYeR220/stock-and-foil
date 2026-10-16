// SPDX-License-Identifier: Apache-2.0
//
// The dev server half of the console: a handful of local endpoints and a static mount.
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
//
// Every endpoint except `/zk` is behind `./guard.ts`: loopback socket, own `Host`, own
// `Origin`, and the per-run secret. `/zk` is exempt on purpose — it serves compiled public
// artefacts, carries no credential, has no side effect, is read-only, and the wallet's proving
// provider has to be able to fetch it.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { fileStamp, toJsonText } from '../../../cli/src/records.js';
import { blockfrostMainnetToken, findRepoRoot, redact, SESSION_HEADER } from './env.js';
import { refuse, sendRefusal, sessionTokenOf } from './guard.js';
import { paths, serverPreflight } from './preflight.js';
import { assertDeployment, assertEvidence, InvalidRecord } from './validate.js';

/**
 * At most 8 MB of request body.
 *
 * The largest thing the page sends is an evidence file, which is tens of kilobytes; the
 * private-state mirror is smaller still. This is a stop, not a budget.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(toJsonText(body));
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error(`request body is larger than ${MAX_BODY_BYTES} bytes`);
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('this endpoint needs a JSON body and got an empty one');
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** Refuses a path that is not inside `dir`, whatever it took to get there. */
function assertInside(dir: string, path: string): string {
  const full = resolve(path);
  const rel = relative(resolve(dir), full);
  if (rel === '' || rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(dir, rel) !== full) {
    throw new Error(`refusing to write outside ${dir}`);
  }
  return full;
}

/** Overwrites. For the checkpoints under `.secrets/`, which are meant to be rewritten. */
function writeCheckpoint(dir: string, path: string, value: unknown): string {
  const full = assertInside(dir, path);
  mkdirSync(resolve(full, '..'), { recursive: true });
  writeFileSync(full, toJsonText(value), 'utf8');
  return full;
}

/**
 * Never overwrites. For the two files that are evidence.
 *
 * A record of a mainnet deployment is not a cache: clobbering one loses the only local account
 * of transactions that cannot be replayed. If the preferred name is taken the write goes to a
 * suffixed one and the caller is told, so the operator reconciles two files rather than
 * discovering that one of them used to say something else.
 */
function writeNew(dir: string, name: string, value: unknown): { path: string; renamedFrom?: string } {
  mkdirSync(dir, { recursive: true });
  const preferred = assertInside(dir, join(dir, name));
  if (!existsSync(preferred)) {
    writeFileSync(preferred, toJsonText(value), 'utf8');
    return { path: preferred };
  }
  const stem = name.replace(/\.json$/, '');
  for (let n = 2; n < 1000; n += 1) {
    const candidate = assertInside(dir, join(dir, `${stem}-${n}.json`));
    if (!existsSync(candidate)) {
      writeFileSync(candidate, toJsonText(value), 'utf8');
      return { path: candidate, renamedFrom: preferred };
    }
  }
  throw new Error(`${preferred} exists and so do a thousand alternatives; move some aside`);
}

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
 * them from this page's origin. Reads only, and nothing under this path is secret — these are
 * the compiled artefacts of an Apache-2.0 contract.
 */
function serveZk(root: string, rest: string, req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.statusCode = 405;
    res.end('the staged proving material is read-only');
    return;
  }
  let file: string;
  try {
    file = join(root, normalize(decodeURIComponent(rest)).replace(/^[/\\]+/, ''));
  } catch {
    res.statusCode = 400;
    res.end('not a usable path');
    return;
  }
  if (!file.startsWith(root + sep)) {
    res.statusCode = 403;
    res.end('outside the staged directory');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('not staged');
    return;
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
    return;
  }
  createReadStream(file).pipe(res);
}

export interface ConsoleBackendOptions {
  repoRoot?: string;
  /** The per-run secret, minted in `vite.config.ts` so the proxy and this plugin share one. */
  sessionToken: string;
  port: number;
}

const WRITES = new Set([
  'POST /__console/keys',
  'PUT /__console/state',
  'PUT /__console/private-state',
  'POST /__console/deployment',
  'POST /__console/evidence',
]);

export function mainnetConsoleBackend(options: ConsoleBackendOptions): Plugin {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const p = paths(repoRoot);
  const token = blockfrostMainnetToken(repoRoot).token;
  const { sessionToken, port } = options;
  const scrub = (text: string): string => redact(text, token, sessionToken);

  return {
    name: 'stock-and-foil:mainnet-console-backend',
    apply: 'serve',

    /**
     * Hands the page its secret.
     *
     * Through the plugin at serve time, not through the bundle: nothing in `src/` contains it,
     * no source map carries it, and it changes on every restart. A cross-origin page cannot
     * read this meta tag, because reading it means reading the document, which the same-origin
     * policy forbids.
     */
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: SESSION_HEADER, content: sessionToken },
          injectTo: 'head-prepend' as const,
        },
      ];
    },

    configureServer(server) {
      // The WebSocket upgrade never reaches connect middleware, so `/bf/ws` is policed here.
      // This listener is attached while plugins are configured, which is before Vite's proxy
      // attaches its own, so an unauthorised socket is destroyed before the proxy sees it.
      // Vite's own HMR socket is left alone.
      server.httpServer?.on('upgrade', (req, socket) => {
        if (!(req.url ?? '').startsWith('/bf')) return;
        const refusal = refuse(req, { sessionToken, port });
        if (refusal) {
          server.config.logger.warn(`[mainnet-console] refused a /bf websocket: ${refusal.reason}`);
          socket.destroy();
        }
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/';
        const [pathname = '/', query = ''] = url.split('?');
        const isConsole = pathname.startsWith('/__console');
        const isProxy = pathname === '/bf' || pathname.startsWith('/bf/');
        const isZk = pathname.startsWith('/zk/');
        if (!isConsole && !isProxy && !isZk) return next();

        if (isZk) {
          serveZk(p.staged, pathname.slice('/zk'.length), req, res);
          return undefined;
        }

        const route = `${req.method} ${pathname}`;
        const refusal = refuse(req, { sessionToken, port, expectsBody: isConsole && WRITES.has(route) });
        if (refusal) {
          server.config.logger.warn(`[mainnet-console] refused ${scrub(route)}: ${refusal.reason}`);
          sendRefusal(res, refusal);
          return undefined;
        }

        // An authorised /bf request falls through to Vite's proxy, which attaches the
        // Blockfrost credential. The guard above is the only thing standing between another
        // page in this browser and our quota.
        if (isProxy) return next();

        try {
          const params = new URLSearchParams(query);
          switch (route) {
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
              return sendJson(res, 200, { written: writeCheckpoint(p.secrets, p.keysFile, await readBody(req)) });
            }

            // The run state and the private-state mirror are checkpoints: they are supposed to
            // be rewritten after every step, and the newest one is the true one.
            case 'GET /__console/state':
              return sendJson(res, 200, readFileIfPresent(p.runState));
            case 'PUT /__console/state':
              return sendJson(res, 200, { written: writeCheckpoint(p.secrets, p.runState, await readBody(req)) });

            case 'GET /__console/private-state':
              return sendJson(res, 200, readFileIfPresent(p.privateState));
            case 'PUT /__console/private-state':
              return sendJson(res, 200, {
                written: writeCheckpoint(p.secrets, p.privateState, await readBody(req)),
              });

            // The two files that are evidence. The name is decided here, never by the request;
            // the shape is checked before anything is written; and an existing file is never
            // overwritten, because it records transactions that cannot be replayed.
            case 'GET /__console/deployment':
              return sendJson(res, 200, readFileIfPresent(p.deployment));
            case 'POST /__console/deployment': {
              const body = await readBody(req);
              assertDeployment(body);
              const written = writeNew(p.deployments, 'mainnet.json', body);
              return sendJson(res, 200, {
                written: written.path,
                supersedes: written.renamedFrom,
                note: written.renamedFrom
                  ? `${written.renamedFrom} already existed and was left untouched. verify and proof ` +
                    'read mainnet.json, so reconcile the two by hand before trusting either.'
                  : undefined,
              });
            }
            case 'POST /__console/evidence': {
              const body = await readBody(req);
              assertEvidence(body);
              const written = writeNew(p.evidence, `mainnet-${fileStamp()}.json`, body);
              return sendJson(res, 200, { written: written.path, supersedes: written.renamedFrom });
            }
            default:
              return sendJson(res, 404, { error: `no console endpoint ${scrub(route)}` });
          }
        } catch (cause) {
          const invalid = cause instanceof InvalidRecord;
          const message = scrub(cause instanceof Error ? cause.message : String(cause));
          server.config.logger.error(`[mainnet-console] ${message}`);
          return sendJson(res, invalid ? 422 : 500, { error: message });
        }
      });

      server.config.logger.info(
        `\n  mainnet console — local only, never built, never published\n` +
          `  repository  ${repoRoot}\n` +
          `  blockfrost  ${token ? 'held by this dev server, not by the page' : 'ABSENT — see docs/MAINNET.md'}\n` +
          `  session     a fresh secret per run, handed to the page in its HTML\n` +
          `  open        http://127.0.0.1:${port}/   (stop this server when the deploy is done)\n`,
      );
    },
  };
}

export { sessionTokenOf };
