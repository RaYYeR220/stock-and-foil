// SPDX-License-Identifier: Apache-2.0
//
// JSON for values that JSON does not have: a persona's 32-byte secret key and the field
// elements that travel as `bigint`.
//
// This exists because the console's private state has to survive a closed tab. The CLI keeps
// the same values in a LevelDB store, which serialises them with superjson; everything the
// private-state provider actually holds — strings, numbers, booleans, plain objects, arrays,
// `Uint8Array`, `bigint` — survives both, and anything else would be a value the CLI could not
// persist either.
export type Encoded = unknown;

const BYTES = '$bytes';
const BIG = '$bigint';

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const unhex = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export function encode(value: unknown): Encoded {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return { [BIG]: value.toString() };
  if (value instanceof Uint8Array) return { [BYTES]: hex(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

export function decode(value: Encoded): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const record = value as Record<string, unknown>;
  if (typeof record[BIG] === 'string') return BigInt(record[BIG]);
  if (typeof record[BYTES] === 'string') return unhex(record[BYTES]);
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, decode(v)]));
}
