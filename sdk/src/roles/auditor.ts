// SPDX-License-Identifier: Apache-2.0
//
// The trustee investigator. It can open exactly one sealed record, and only after two of three
// keyholders have approved that record on the ledger — the approval is public, so a disclosure
// leaves a trail even though its contents do not.
//
// The opened record proves itself: it recomputes the invoice fingerprint, hence the pledge
// nullifier and the record id, and those must equal the ledger keys the record was found under.
// Nobody has to trust the auditor's transcription.
import { pureCircuits } from '@stockandfoil/contract';
import { hex, toBytes32, toHex } from '../bytes.js';
import {
  decryptRecord,
  decryptShare,
  recoverSharedSecret,
  verifyDisclosure,
  type DecryptionShare,
  type DisclosureVerification,
} from '../crypto/records.js';
import {
  findRecord,
  findRequest,
  findShare,
  type Invoice,
  type Point,
  type PublicLedgerView,
  type TxReceipt,
} from '../types.js';
import { RoleClient } from './base.js';

/** What opening a disclosure request produced, and whether it proved itself. */
export interface Disclosure {
  requestId: string;
  recordId: string;
  caseRef: string;
  approvals: [boolean, boolean, boolean];
  /** Shamir indices (1-based) of the shares that were combined. */
  indices: Array<1 | 2 | 3>;
  invoice: Invoice;
  holderTag: bigint;
  /** Pledge nullifier the record is stored against, when a pledge still references it. */
  nullifier?: string;
  verification: DisclosureVerification;
  /** `recordIdOf(N, E)` recomputed from the opened invoice equals the ledger key. */
  recordIdMatches: boolean;
  verified: boolean;
}

const UNREADABLE: Invoice = { debtorId: 0n, sellerId: 0n, invoiceNo: 0n, amount: 0n, dueDate: 0n, salt: 0n };

export class AuditorClient extends RoleClient {
  private get scalar(): bigint {
    const s = this.persona.scalar;
    if (s === undefined) throw new Error('auditor persona has no disclosure scalar');
    return s;
  }

  get publicKey(): Point {
    return pureCircuits.pubKeyOf(this.scalar);
  }

  /** `H("request", recordId, caseRef)` — the ledger key of the request this would open. */
  requestIdOf(recordId: Uint8Array | string, caseRef: Uint8Array | string): Uint8Array {
    return pureCircuits.requestIdOf(toBytes32(recordId), toBytes32(caseRef));
  }

  request(recordId: Uint8Array | string, caseRef: Uint8Array | string): Promise<TxReceipt> {
    return this.call('requestDisclosure', [toBytes32(recordId), toBytes32(caseRef)]);
  }

  /**
   * Combines whatever approvals are on the ledger and opens the record. Fewer than two shares
   * yields plaintext that does not verify: `verified` is the honest answer, not an exception.
   */
  async open(requestId: Uint8Array | string): Promise<Disclosure> {
    const view: PublicLedgerView = await this.backend.publicState();
    const id = toHex(requestId);
    const request = findRequest(view, id);
    if (!request) throw new Error(`no disclosure request ${id} on the ledger`);
    const record = findRecord(view, request.recordId);
    if (!record) throw new Error(`request ${id} names record ${request.recordId}, which is not on the ledger`);

    const parts: DecryptionShare[] = [];
    request.approvals.forEach((approved, i) => {
      if (!approved) return;
      const sealed = findShare(view, pureCircuits.shareKeyOf(toBytes32(requestId), BigInt(i)));
      if (sealed) parts.push({ index: (i + 1) as 1 | 2 | 3, D: decryptShare(sealed, this.scalar) });
    });

    const opened = this.tryOpen(record, parts);
    const nullifier = view.pledges.find((p) => p.recordId === record.recordId)?.nullifier;
    const verification = nullifier
      ? verifyDisclosure(opened, nullifier)
      : ({ verified: false, reason: 'MISMATCH' } as DisclosureVerification);
    const recordIdMatches =
      verification.nullifier !== undefined &&
      hex(pureCircuits.recordIdOf(toBytes32(verification.nullifier), record.E)) === record.recordId;

    return {
      requestId: id,
      recordId: record.recordId,
      caseRef: request.caseRef,
      approvals: request.approvals,
      indices: parts.map((p) => p.index),
      invoice: opened.invoice,
      holderTag: opened.holderTag,
      nullifier,
      verification,
      recordIdMatches,
      verified: verification.verified && recordIdMatches,
    };
  }

  /** Garbage shares need not be on the curve; that is a failed disclosure, not a crash. */
  private tryOpen(
    record: { version: number; ct: bigint[] },
    parts: readonly DecryptionShare[],
  ): { invoice: Invoice; holderTag: bigint } {
    if (parts.length === 0) return { invoice: UNREADABLE, holderTag: 0n };
    try {
      return decryptRecord(record, recoverSharedSecret(parts));
    } catch {
      return { invoice: UNREADABLE, holderTag: 0n };
    }
  }
}
