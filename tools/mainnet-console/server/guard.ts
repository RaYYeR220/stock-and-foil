// SPDX-License-Identifier: Apache-2.0
//
// Who is allowed to talk to this dev server.
//
// "It only listens on loopback" is not an access control. Every page the operator has open in
// the same browser can issue requests to `http://127.0.0.1:5174`, and a cross-site POST is
// something browsers send without asking. Two endpoints here make that dangerous rather than
// merely untidy:
//
//   /bf          attaches our Blockfrost credential to whatever arrives, so an unrelated tab
//                could read mainnet on our project and burn the quota — the classic confused
//                deputy. The attacker never sees the credential; it does not need to.
//   /__console   writes files, including the deployment record we later publish as proof.
//
// So every request to either has to clear four things: the socket is loopback, the `Host` is
// this server's own, the `Origin` — when the browser sends one — is this server's own, and the
// request carries the secret minted when the server started. A page that does not know the
// secret cannot forge any of this, and a cross-origin page cannot read it, because nothing
// here answers with CORS headers (`server.cors` is off, and only `/zk` opts in).
//
// What this does not defend against, stated plainly: another *process* on the machine can
// fetch `/` and read the secret out of the HTML. Nothing a localhost dev server does can stop
// that, which is why the console is meant to be running only while a deployment is in
// progress. See README.md.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SESSION_HEADER, SESSION_QUERY } from './env.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const LOOPBACK_SOCKETS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** JSON is the only body this server accepts; it is also not a CORS "simple" content type. */
const JSON_TYPE = /^application\/json\b/i;

export type Refusal = { status: number; reason: string };

const constantTimeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Compare lengths first, but still run the comparison so the branch is not the only signal.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

/** The origins this server answers to, both spellings of loopback at its own port. */
export const allowedOrigins = (port: number): string[] => [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  `http://[::1]:${port}`,
];

const hostName = (host: string): string => {
  const trimmed = host.trim();
  if (trimmed.startsWith('[')) return trimmed.slice(1, trimmed.indexOf(']'));
  return trimmed.replace(/:\d+$/, '');
};

const hostPort = (host: string): string => {
  const match = /:(\d+)$/.exec(host.trim());
  return match?.[1] ?? '';
};

export interface GuardOptions {
  sessionToken: string;
  port: number;
  /** True for requests that carry a body, which must then be JSON. */
  expectsBody?: boolean;
}

/**
 * Checks one request. Returns `undefined` when it may proceed, or the refusal to send.
 *
 * The refusal text never says *which* check failed in a way that helps a guesser: a missing
 * secret and a wrong secret are the same answer.
 */
export function refuse(req: IncomingMessage, options: GuardOptions): Refusal | undefined {
  const remote = req.socket.remoteAddress ?? '';
  if (!LOOPBACK_SOCKETS.has(remote)) {
    return { status: 403, reason: 'the mainnet console answers only on loopback' };
  }

  // A loopback socket is not enough: a page on any origin can be pointed at a hostname that
  // resolves to 127.0.0.1 and reach this server with someone else's `Host`.
  const host = req.headers.host ?? '';
  if (!LOOPBACK_HOSTS.has(hostName(host)) || hostPort(host) !== String(options.port)) {
    return { status: 403, reason: `the mainnet console answers only to its own host, not "${host}"` };
  }

  // Browsers send `Origin` on every cross-origin request and on same-origin writes. Absent is
  // allowed (a same-origin GET, or curl); present and foreign is not.
  const origin = req.headers.origin;
  if (origin !== undefined && !allowedOrigins(options.port).includes(origin)) {
    return { status: 403, reason: `requests from ${origin} are not answered` };
  }

  // `Sec-Fetch-Site` is sent by every current browser and costs nothing to check.
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') {
    return { status: 403, reason: `cross-site requests (${site}) are not answered` };
  }

  const presented = sessionTokenOf(req);
  if (presented === undefined || !constantTimeEqual(presented, options.sessionToken)) {
    return {
      status: 403,
      reason:
        'this request did not carry the console session secret. The secret is minted when the ' +
        'dev server starts and handed to the console page; reload http://127.0.0.1:' +
        `${options.port}/ in the tab you are driving, and if that does not help, restart the server.`,
    };
  }

  if (options.expectsBody) {
    const type = req.headers['content-type'] ?? '';
    if (!JSON_TYPE.test(type)) {
      return { status: 415, reason: `this endpoint takes application/json, not "${type || 'nothing'}"` };
    }
  }
  return undefined;
}

/** The secret as presented, from the header first and the query second. */
export function sessionTokenOf(req: IncomingMessage): string | undefined {
  const header = req.headers[SESSION_HEADER];
  if (typeof header === 'string' && header !== '') return header;
  const query = (req.url ?? '').split('?')[1];
  if (query === undefined) return undefined;
  const value = new URLSearchParams(query).get(SESSION_QUERY);
  return value === null || value === '' ? undefined : value;
}

export const sendRefusal = (res: ServerResponse, refusal: Refusal): void => {
  res.statusCode = refusal.status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(refusal.reason);
};
