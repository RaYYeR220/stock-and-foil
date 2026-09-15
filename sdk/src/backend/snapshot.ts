// SPDX-License-Identifier: Apache-2.0
//
// Writing a simulator world down, so it can be read back.
//
// `SimulatorBackend.snapshot()` hands back a contract state held by the WebAssembly runtime and a
// block time, and a host that wants to keep a sandbox across a page reload has to keep its own key
// material and invoice book beside it. None of that survives `JSON.stringify`: a bigint throws, a
// `Uint8Array` comes back as an object of numbered keys, and the contract state is an opaque
// handle. So this is one codec for the three of them, tagged wherever they appear in whatever
// structure the host hands over.
//
// Nothing here touches storage, a clock or a window: where the string goes is the host's business.
import * as RT from '@midnight-ntwrk/compact-runtime';
import { fromHex, hex } from '../bytes.js';
import type { SimulatorSnapshot } from './simulator.js';

/** Tag keys. A leading `#` cannot appear in a field name the contract or the SDK produces. */
const BIGINT = '#bigint';
const BYTES = '#bytes';
const STATE = '#state';

const tagged = (value: unknown, tag: string): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const carried = (value as Record<string, unknown>)[tag];
  return typeof carried === 'string' ? carried : undefined;
};

/**
 * Contract state as the runtime serializes it. After the first call the simulator holds a
 * `ChargedState`, which has no serializer of its own, so it travels inside an otherwise blank
 * `ContractState` — the simulator runs circuits from the compiled contract in this process and
 * never reads the entry points back off the state.
 */
function stateBytes(state: SimulatorSnapshot['state']): Uint8Array {
  if (state instanceof RT.ContractState) return state.serialize();
  const carrier = new RT.ContractState();
  carrier.data = state;
  return carrier.serialize();
}

/**
 * JSON for a `SimulatorSnapshot`, or for any structure that carries one — keys, personas and an
 * invoice book are all bigints and byte strings, and they are round-tripped the same way.
 */
export function encodeSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, raw: unknown) => {
    if (typeof raw === 'bigint') return { [BIGINT]: raw.toString() };
    if (raw instanceof Uint8Array) return { [BYTES]: hex(raw) };
    if (raw instanceof RT.ContractState || raw instanceof RT.ChargedState) {
      return { [STATE]: hex(stateBytes(raw)) };
    }
    return raw;
  });
}

/**
 * The inverse. Throws on anything that is not what `encodeSnapshot` wrote — a truncated string, a
 * state from an older build of the contract — so a caller restoring one can fall back to a fresh
 * world instead of running on half a registry.
 */
export function decodeSnapshot<T = SimulatorSnapshot>(text: string): T {
  return JSON.parse(text, (_key, raw: unknown) => {
    const int = tagged(raw, BIGINT);
    if (int !== undefined) return BigInt(int);
    const bytes = tagged(raw, BYTES);
    if (bytes !== undefined) return fromHex(bytes);
    const state = tagged(raw, STATE);
    if (state !== undefined) return RT.ContractState.deserialize(fromHex(state));
    return raw;
  }) as T;
}
