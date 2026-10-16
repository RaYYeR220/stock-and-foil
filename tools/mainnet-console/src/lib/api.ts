// SPDX-License-Identifier: Apache-2.0
//
// The page's half of the local endpoints in `server/plugin.ts`. Nothing here reaches anything
// but `http://127.0.0.1:5174`.
import type { DeploymentFile, EvidenceFile, KeysFile } from '../../../../cli/src/records.js';
import type { Check, ServerPreflight } from '../../server/preflight.js';
import { decode, encode } from './codec.js';
import type { ConsoleState } from './state.js';

export type { Check, ServerPreflight };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
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

export const getDeployment = (): Promise<DeploymentFile | null> =>
  call<DeploymentFile | null>('GET', '/__console/deployment');

export const writeDeployment = (file: DeploymentFile): Promise<{ written: string }> =>
  call('POST', '/__console/deployment', file);

export const writeEvidence = (file: EvidenceFile): Promise<{ written: string }> =>
  call('POST', '/__console/evidence', file);
