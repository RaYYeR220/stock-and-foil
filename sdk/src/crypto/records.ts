// SPDX-License-Identifier: Apache-2.0
//
// The sealed-record codec. A record on the ledger is
// `{ version, E, ct = [debtorId, sellerId, pack(invoiceNo, amount, dueDate), salt, holderTag] + mask }`
// with `mask_j = maskOf(S, j)` and `S = e·disclosurePk`. Opening one is subtraction mod p once
// the shared point S is back, and a correctly opened record recomputes the nullifier the ledger
// is keyed by — which is what makes a disclosure self-verifying rather than trusted.
//
// Curve arithmetic goes through the contract's exported pure circuits, so the maths off chain is
// literally the maths the circuits run.
import { pureCircuits } from '@stockandfoil/contract';
import { hex, toHex } from '../bytes.js';
import type { Invoice, Point, RecordView, ShareView } from '../types.js';
import { FIELD_MODULUS, lagrangeAtZero } from './scalar.js';

/** Mask construction the contract seals with today (`cipherVersion()`). */
export const CIPHER_VERSION = 1;

const MASK64 = (1n << 64n) - 1n;

/** A sealed value carries a version because Poseidon is not promised stable across upgrades. */
export class CipherVersionError extends Error {
  constructor(
    readonly found: number,
    readonly expected: number = CIPHER_VERSION,
  ) {
    super(`sealed value uses cipher version ${found}, this SDK understands ${expected}`);
    this.name = 'CipherVersionError';
  }
}

export const modP = (x: bigint): bigint => ((x % FIELD_MODULUS) + FIELD_MODULUS) % FIELD_MODULUS;

const requireUint64 = (name: string, value: bigint): bigint => {
  if (value < 0n || value > MASK64) throw new Error(`${name} does not fit Uint<64>: ${value}`);
  return value;
};

/** `invoiceNo·2^128 + amount·2^64 + dueDate`, identical to the `packFields` pure circuit. */
export function packFields(invoiceNo: bigint, amount: bigint, dueDate: bigint): bigint {
  return (
    (requireUint64('invoiceNo', invoiceNo) << 128n) |
    (requireUint64('amount', amount) << 64n) |
    requireUint64('dueDate', dueDate)
  );
}

export function unpackFields(packed: bigint): { invoiceNo: bigint; amount: bigint; dueDate: bigint } {
  return { invoiceNo: packed >> 128n, amount: (packed >> 64n) & MASK64, dueDate: packed & MASK64 };
}

/** The five plaintext fields of a record, in slot order. */
export type RecordFields = [bigint, bigint, bigint, bigint, bigint];

export function packRecordFields(invoice: Invoice, holderTag: bigint): RecordFields {
  return [
    invoice.debtorId,
    invoice.sellerId,
    packFields(invoice.invoiceNo, invoice.amount, invoice.dueDate),
    invoice.salt,
    holderTag,
  ];
}

/** What a disclosure yields: the whole invoice plus the tag naming the financier it was offered to. */
export interface OpenedRecord {
  invoice: Invoice;
  holderTag: bigint;
}

export function unpackRecordFields(fields: readonly bigint[]): OpenedRecord {
  if (fields.length !== 5) throw new Error(`a sealed record has 5 fields, got ${fields.length}`);
  const [debtorId, sellerId, packed, salt, holderTag] = fields as RecordFields;
  const { invoiceNo, amount, dueDate } = unpackFields(packed);
  return { invoice: { debtorId, sellerId, invoiceNo, amount, dueDate, salt }, holderTag };
}

/** Adds the one-time masks derived from the shared point: the off-chain twin of `sealRecord`. */
export const sealFields = (fields: readonly bigint[], S: Point): bigint[] =>
  fields.map((f, j) => modP(f + pureCircuits.maskOf(S, BigInt(j))));

/** Removes them again. */
export const openFields = (ct: readonly bigint[], S: Point): bigint[] =>
  ct.map((c, j) => modP(c - pureCircuits.maskOf(S, BigInt(j))));

const checkVersion = (version: number | bigint): void => {
  if (Number(version) !== CIPHER_VERSION) throw new CipherVersionError(Number(version));
};

/** Opens a sealed record given the recovered shared secret `S = sk·E`. */
export function decryptRecord(record: Pick<RecordView, 'version' | 'ct'>, S: Point): OpenedRecord {
  checkVersion(record.version);
  return unpackRecordFields(openFields(record.ct, S));
}

/** Opens one keyholder's sealed decryption share with the auditor scalar, returning `D_i = s_i·E`. */
export function decryptShare(share: Pick<ShareView, 'version' | 'E2' | 'ct'>, auditorScalar: bigint): Point {
  checkVersion(share.version);
  const S2 = pureCircuits.mulPoint(share.E2, auditorScalar);
  const [x, y] = openFields(share.ct, S2);
  return { x: x ?? 0n, y: y ?? 0n };
}

/** One keyholder's contribution to a disclosure: its Shamir index (1-based) and `D_i = s_i·E`. */
export interface DecryptionShare {
  index: 1 | 2 | 3;
  D: Point;
}

/**
 * Lagrange-combines decryption shares into the shared secret `S = sk·E = Σ λ_i·D_i`.
 * Coefficients are reduced into the scalar field before `ecMul`, which rejects anything at or
 * above the subgroup order.
 */
export function recoverSharedSecret(shares: readonly DecryptionShare[]): Point {
  if (shares.length === 0) throw new Error('no decryption shares to combine');
  const lambdas = lagrangeAtZero(shares.map((s) => s.index));
  return shares
    .map((s, k) => pureCircuits.mulPoint(s.D, lambdas[k]!))
    .reduce((acc, P) => pureCircuits.addPoints(acc, P));
}

/** Why an opened record failed to prove itself, when it did. */
export type DisclosureFailure = 'MALFORMED' | 'MISMATCH';

export interface DisclosureVerification {
  verified: boolean;
  /** Present when the plaintext was well formed enough to hash. */
  fingerprint?: string;
  nullifier?: string;
  ackLeaf?: string;
  reason?: DisclosureFailure;
}

/**
 * Self-verifying disclosure: recompute `F`, `A` and `N` from the opened invoice and compare `N`
 * to the ledger key the record was found under. Opening with the wrong key yields field elements
 * that overflow `Uint<64>`, which the pure circuits reject outright, so that case is caught and
 * reported rather than thrown.
 */
export function verifyDisclosure(
  opened: Pick<OpenedRecord, 'invoice'>,
  expectedNullifier: Uint8Array | string,
): DisclosureVerification {
  let fingerprint: Uint8Array;
  try {
    fingerprint = pureCircuits.fingerprint(opened.invoice);
  } catch {
    return { verified: false, reason: 'MALFORMED' };
  }
  const nullifier = hex(pureCircuits.nullifierFromFingerprint(fingerprint));
  const result: DisclosureVerification = {
    verified: nullifier === toHex(expectedNullifier),
    fingerprint: hex(fingerprint),
    nullifier,
    ackLeaf: hex(pureCircuits.ackLeafFromFingerprint(fingerprint)),
  };
  return result.verified ? result : { ...result, reason: 'MISMATCH' };
}
