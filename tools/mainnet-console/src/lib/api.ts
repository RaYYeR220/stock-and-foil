// SPDX-License-Identifier: Apache-2.0
//
// The page's half of the local endpoints in `server/plugin.ts`. Nothing here reaches anything
// but `http://127.0.0.1:5174`.
import type { DeploymentFile, EvidenceFile, KeysFile } from '../../../../cli/src/records.js';
import type { Check, ServerPreflight } from '../../server/preflight.js';
import { decode, encode } from './codec.js';
import { consoleSessionToken, SESSION_HEADER } from './session-token.js';
import type { ConsoleState } from './state.js';

export type { Check, ServerPreflight };

/**
 * One call to the dev server.
 *
 * Two headers matter. The session secret is what distinguishes this page from any other page
 * in the same browser that can also reach `http://127.0.0.1:5174`; `Content-Type: application/json`
 * is required on writes and is deliberately not a CORS "simple" type, so a cross-origin form
 * post cannot imitate one even if it somehow learned the secret.
 */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { [SESSION_HEADER]: consoleSessionToken() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  });
  const text = await response.text();
  const parsed = text === '' ? null : (JSON.parse(text) as unknown);
  if (!response.ok) {
    const message = (parsed as { error?: string } | null)?.error ?? `${response.status} ${response.statusText}`;
    throw new Error(`${method} ${path}: ${message}`);
  }
  return parsed as T;
}

export const getPreflight = (deep = false): Promise<ServerPreflight> =>
  call<ServerPreflight>('GET', `/__console/preflight${deep ? '?deep=1' : ''}`);

export const getKeysFile = (): Promise<KeysFile | null> => call<KeysFile | null>('GET', '/__console/keys');

export const putKeysFile = (file: KeysFile, force = false): Promise<{ written: string }> =>
  call('POST', `/__console/keys${force ? '?force=1' : ''}`, file);

export const getState = (): Promise<ConsoleState | null> => call<ConsoleState | null>('GET', '/__console/state');

export const putState = (state: ConsoleState): Promise<{ written: string }> =>
  call('PUT', '/__console/state', state);

/** The private-state mirror, carrying the deployer's signing key. See `server/plugin.ts`. */
export interface PrivateStateFile {
  version: 1;
  states: Record<string, unknown>;
  signingKeys: Record<string, unknown>;
}

export const getPrivateState = async (): Promise<PrivateStateFile | null> => {
  const raw = await call<PrivateStateFile | null>('GET', '/__console/private-state');
  if (!raw) return null;
  return {
    version: 1,
    states: decode(raw.states) as Record<string, unknown>,
    signingKeys: decode(raw.signingKeys) as Record<string, unknown>,
  };
};

export const putPrivateState = (file: PrivateStateFile): Promise<{ written: string }> =>
  call('PUT', '/__console/private-state', {
    version: 1,
    states: encode(file.states),
    signingKeys: encode(file.signingKeys),
  });

/** What the dev server reports after putting a transaction on chain. */
export interface SubmitDiagnostics {
  extrinsicHash?: string;
  bytes: number;
  statuses: Array<{ atMs: number; status: string; detail?: string }>;
  rpcError?: { code?: number; message: string; data?: unknown };
  dispatchError?: string;
  elapsedMs: number;
}

export interface SubmitResult {
  extrinsicHash: string;
  blockHash: string;
  status: 'in-block';
  diagnostics: SubmitDiagnostics;
}

/**
 * A submission whose fate is unknown: accepted by the node, never seen in a block.
 *
 * Carried as its own error type because it is the one outcome where retrying is dangerous.
 */
export class SubmissionUnseenError extends Error {
  readonly unseen = true;
  constructor(
    message: string,
    readonly extrinsicHash?: string,
    readonly diagnostics?: SubmitDiagnostics,
  ) {
    super(message);
    this.name = 'SubmissionUnseenError';
  }
}

/** The node refused it. Nothing happened; a retry is safe. */
export class SubmissionRejectedError extends Error {
  readonly rejected = true;
  constructor(
    message: string,
    readonly diagnostics?: SubmitDiagnostics,
  ) {
    super(message);
    this.name = 'SubmissionRejectedError';
  }
}

export async function submitTransaction(txHex: string): Promise<SubmitResult> {
  const response = await fetch('/__console/submit', {
    method: 'POST',
    headers: { [SESSION_HEADER]: consoleSessionToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx: txHex }),
    credentials: 'omit',
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string; unseen?: boolean; rejected?: boolean; extrinsicHash?: string; diagnostics?: SubmitDiagnostics }
    | SubmitResult
    | null;
  if (response.ok) return body as SubmitResult;
  const failure = body as {
    error?: string;
    unseen?: boolean;
    rejected?: boolean;
    extrinsicHash?: string;
    diagnostics?: SubmitDiagnostics;
  } | null;
  const message = failure?.error ?? `${response.status} ${response.statusText}`;
  if (failure?.unseen) throw new SubmissionUnseenError(message, failure.extrinsicHash, failure.diagnostics);
  if (failure?.rejected) throw new SubmissionRejectedError(message, failure.diagnostics);
  throw new Error(`POST /__console/submit: ${message}`);
}

export const getDeployment = (): Promise<DeploymentFile | null> =>
  call<DeploymentFile | null>('GET', '/__console/deployment');

/** The server never overwrites one of these, so it may answer with a different name. */
export interface WriteResult {
  written: string;
  /** Set when a file of the preferred name already existed and was left alone. */
  supersedes?: string;
  note?: string;
}

export const writeDeployment = (file: DeploymentFile): Promise<WriteResult> =>
  call('POST', '/__console/deployment', file);

export const writeEvidence = (file: EvidenceFile): Promise<WriteResult> =>
  call('POST', '/__console/evidence', file);
