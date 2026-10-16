// SPDX-License-Identifier: Apache-2.0
//
// The HTTP surface. Three routes and no framework:
//
//   POST /v1/sponsor   pay the DUST for a bound transaction and submit it
//   GET  /healthz      liveness, plus what this sponsor will pay for and what it has paid
//   GET  /v1/policy    the allowlist, so a client can show the user what is sponsorable
//
// Written on `node:http` on purpose. The dependency surface of a process that holds a funded
// wallet is part of its threat model, and this needs nothing a framework would add.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { SPONSOR_PATH, SPONSOR_PROTOCOL_VERSION, SponsorError, type SponsorErrorBody, type SponsorRequest } from '@stockandfoil/sdk';
import type { SponsorService } from './service.js';

/** Largest request body accepted. A finalized transaction with proofs is tens of kilobytes. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface ServerOptions {
  service: SponsorService;
  /**
   * API keys, mapping a secret to the caller name it authenticates. When non-empty every
   * request must present one as `Authorization: Bearer <key>`, and the caller name becomes the
   * rate-limit bucket.
   */
  apiKeys?: ReadonlyMap<string, string>;
  /** Origins allowed to call this from a browser. `['*']` for a public demo sponsor. */
  allowedOrigins?: readonly string[];
  /**
   * Socket addresses whose `X-Forwarded-For` this service believes.
   *
   * Empty — the default — means the header is ignored entirely and the bucket is always the
   * socket address. Only the reverse proxy's own address belongs here.
   */
  trustedProxies?: readonly string[];
  /**
   * How many hops our own infrastructure appends to `X-Forwarded-For`, counted from the right.
   * `1` (the default) means the last entry is the one our proxy wrote.
   */
  trustProxyHops?: number;
}

export interface BucketOptions {
  /** Name behind a presented API key, when keys are configured. */
  apiKeyName?: string;
  trustedProxies?: readonly string[];
  trustProxyHops?: number;
}

/**
 * The rate-limit bucket for a request.
 *
 * Two things a caller can set are deliberately not used.
 *
 * The body's `caller` field, because a client can rotate it forever and the limit would stop
 * existing. And the *left* of `X-Forwarded-For`, which is the same trap wearing a header: a
 * client can send `X-Forwarded-For: <anything>` and a proxy appends to it, so the leftmost
 * entries are attacker-chosen. Only the rightmost entries were written by infrastructure we
 * control, so the hop our own proxy appended is taken by counting from the right — and only
 * when the request actually arrived from a proxy we named.
 *
 * With API keys configured none of that matters: the bucket is the name behind the key.
 */
export function rateLimitBucket(request: IncomingMessage, options: BucketOptions): string {
  if (options.apiKeyName !== undefined) return `key:${options.apiKeyName}`;

  const remote = request.socket.remoteAddress ?? 'unknown';
  const trusted = options.trustedProxies ?? [];
  if (trusted.length === 0 || !trusted.includes(remote)) return `ip:${remote}`;

  const raw = request.headers['x-forwarded-for'];
  const chain = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const hops = Math.max(1, Math.floor(options.trustProxyHops ?? 1));
  // Counting from the right: hops=1 is the last entry, the one the trusted proxy appended.
  const hop = chain[chain.length - hops];
  return `ip:${hop ?? remote}`;
}

const json = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
};

function corsHeaders(request: IncomingMessage, allowed: readonly string[]): Record<string, string> {
  const origin = request.headers.origin;
  if (origin === undefined || allowed.length === 0) return {};
  const permitted = allowed.includes('*') || allowed.includes(origin);
  return permitted
    ? {
        'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '600',
      }
    : {};
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new SponsorError('the request body is too large', 'BAD_REQUEST');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Client-supplied free text that will be written to a log: printable ASCII, bounded. */
export const sanitizeLabel = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[^\x20-\x7e]/g, ' ').trim().slice(0, 64);
  return cleaned === '' ? undefined : cleaned;
};

const statusFor = (code: SponsorErrorBody['code']): number => {
  switch (code) {
    case 'RATE_LIMITED':
      return 429;
    case 'UNAUTHORIZED':
      return 401;
    case 'SPONSOR_OUT_OF_DUST':
      return 503;
    case 'SUBMIT_FAILED':
      return 502;
    default:
      return 400;
  }
};

export function createSponsorServer(options: ServerOptions): Server {
  const { service } = options;
  const apiKeys = options.apiKeys ?? new Map<string, string>();
  const allowedOrigins = options.allowedOrigins ?? [];
  const trustedProxies = options.trustedProxies ?? [];
  const trustProxyHops = options.trustProxyHops ?? 1;

  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      // Nothing below is expected to throw; if it does, say so without leaking internals.
      if (!response.headersSent) {
        json(response, 500, {
          protocol: SPONSOR_PROTOCOL_VERSION,
          error: 'the sponsor failed to handle the request',
          code: 'SUBMIT_FAILED',
        } satisfies SponsorErrorBody);
      }
      process.stderr.write(`sponsor: unhandled ${String(error)}\n`);
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const cors = corsHeaders(request, allowedOrigins);
    const path = (request.url ?? '/').split('?')[0];

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    if (request.method === 'GET' && path === '/healthz') {
      const stats = service.stats;
      json(
        response,
        200,
        {
          protocol: SPONSOR_PROTOCOL_VERSION,
          ok: true,
          sponsor: service.sponsorAddress,
          paid: stats.paid,
          refused: stats.refused,
          spentSpeck: stats.spentSpeck.toString(),
          reservedSpeck: stats.reservedSpeck.toString(),
          budgetSpeck: stats.budgetSpeck.toString(),
          budgetLeftSpeck: stats.budgetLeftSpeck.toString(),
        },
        cors,
      );
      return;
    }

    if (request.method === 'GET' && path === '/v1/policy') {
      json(
        response,
        200,
        {
          protocol: SPONSOR_PROTOCOL_VERSION,
          contracts: service.policy.contracts,
          circuits: service.policy.circuits,
          maxFeeSpeck: service.policy.maxFeeSpeck.toString(),
          rateLimit: service.policy.rateLimit,
        },
        cors,
      );
      return;
    }

    if (request.method !== 'POST' || path !== SPONSOR_PATH) {
      json(
        response,
        404,
        {
          protocol: SPONSOR_PROTOCOL_VERSION,
          error: `no route for ${request.method} ${path}; this sponsor serves POST ${SPONSOR_PATH}`,
          code: 'BAD_REQUEST',
        } satisfies SponsorErrorBody,
        cors,
      );
      return;
    }

    // Authentication, when keys are configured.
    let apiKeyName: string | undefined;
    if (apiKeys.size > 0) {
      const header = request.headers.authorization ?? '';
      const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      apiKeyName = apiKeys.get(presented);
      if (apiKeyName === undefined) {
        json(
          response,
          401,
          {
            protocol: SPONSOR_PROTOCOL_VERSION,
            error: 'this sponsor requires an API key as "Authorization: Bearer <key>".',
            code: 'UNAUTHORIZED',
          } satisfies SponsorErrorBody,
          cors,
        );
        return;
      }
    }
    const callerId = rateLimitBucket(request, { apiKeyName, trustedProxies, trustProxyHops });

    let body: SponsorRequest;
    try {
      const text = await readBody(request);
      body = JSON.parse(text) as SponsorRequest;
    } catch (error) {
      const sponsorError = error instanceof SponsorError ? error : undefined;
      json(
        response,
        400,
        {
          protocol: SPONSOR_PROTOCOL_VERSION,
          error: sponsorError?.message ?? 'the request body is not JSON',
          code: 'BAD_REQUEST',
        } satisfies SponsorErrorBody,
        cors,
      );
      return;
    }

    // `body.caller` is a label for the log and nothing else. It does not reach the bucket, and
    // it is stripped to printable ASCII first so a caller cannot forge log lines with newlines.
    const label = sanitizeLabel(body.caller);

    try {
      const result = await service.sponsor(body, { id: callerId, label });
      json(response, 200, result, cors);
    } catch (error) {
      if (error instanceof SponsorError) {
        const code = error.code === 'TRANSPORT' ? 'SUBMIT_FAILED' : error.code;
        json(
          response,
          statusFor(code),
          {
            protocol: SPONSOR_PROTOCOL_VERSION,
            error: error.message,
            code,
            retryAfterSeconds: error.retryAfterSeconds,
          } satisfies SponsorErrorBody,
          error.retryAfterSeconds === undefined
            ? cors
            : { ...cors, 'Retry-After': String(error.retryAfterSeconds) },
        );
        return;
      }
      throw error;
    }
  }
}
