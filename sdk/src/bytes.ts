// SPDX-License-Identifier: Apache-2.0
//
// Byte helpers. Every 32-byte ledger key (ack leaf, nullifier, record id, request id) travels
// through the SDK as a `Uint8Array` and is rendered as lower-case hex for display and lookup.

/** Lower-case hex of a byte string, without a `0x` prefix. */
export const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Parses hex (with or without `0x`) back into bytes. */
export function fromHex(text: string): Uint8Array {
  const body = text.startsWith('0x') ? text.slice(2) : text;
  if (body.length % 2 !== 0) throw new Error(`hex string of odd length: ${text}`);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`not a hex string: ${text}`);
    out[i] = byte;
  }
  return out;
}

/** Accepts either form of a 32-byte ledger key and returns bytes. */
export const toBytes32 = (key: Uint8Array | string): Uint8Array =>
  typeof key === 'string' ? fromHex(key) : key;

/** Accepts either form of a 32-byte ledger key and returns hex. */
export const toHex = (key: Uint8Array | string): string => (typeof key === 'string' ? key : hex(key));

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** 32 zero bytes: the unused-slot marker in a certificate and the empty record id. */
export const ZERO_BYTES32 = new Uint8Array(32);

/** The native unshielded token color (`nativeToken()` = `pad(32, "")`). */
export const NATIVE_TOKEN_COLOR = new Uint8Array(32);

/** A 32-byte address as the claim circuits expect it on the TypeScript side. */
export interface UserAddress {
  bytes: Uint8Array;
}

/** Builds a `UserAddress` from bytes or from the hex a keystore returns. */
export function userAddress(address: Uint8Array | string): UserAddress {
  const bytes = toBytes32(address);
  if (bytes.length !== 32) throw new Error(`user address must be 32 bytes, got ${bytes.length}`);
  return { bytes };
}
