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
import { toBytes32, toHex, ZERO_BYTES32 } from '../bytes.js';
import {
  decryptRecord,
  decryptShare,
  recoverSharedSecret,
  verifyRecordDisclosure,
  type DecryptionShare,
  type DisclosureVerification,
} from '../crypto/records.js';
import {
  findCase,
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
  /**
   * Pledge nullifier the record belongs to: the live pledge's when one still references the
   * record, otherwise the one recomputed from the opened invoice.
   */
  nullifier?: string;
  verification: DisclosureVerification;
  /** `recordIdOf(N, E)` recomputed from the opened invoice equals the ledger key. */
  recordIdMatches: boolean;
  verified: boolean;
}

const UNREADABLE: Invoice = { debtorId: 0n, sellerId: 0n, invoiceNo: 0n, amount: 0n, dueDate: 0n, salt: 0n };

/** Fixed four-slot vectors are the contract's batching idiom; this is the padding for them. */
const pad4 = <T>(values: readonly T[], fill: T): [T, T, T, T] =>
  [0, 1, 2, 3].map((i) => values[i] ?? fill) as [T, T, T, T];

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
    // The record's own ledger key is the binding — `recordId = H("record", N, E)` recomputed from
    // the plaintext. A pledge nullifier is not: a later offer of the same receivable moves the
    // pledge to a fresh record and leaves this one unreferenced, and those superseded records are
    // exactly what an investigation opens.
    const verification: DisclosureVerification = verifyRecordDisclosure(opened, record);
    const nullifier = view.pledges.find((p) => p.recordId === record.recordId)?.nullifier ?? verification.nullifier;

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
      recordIdMatches: verification.verified,
      verified: verification.verified,
    };
  }

  /**
   * Opens a **case**: up to four records a keyholder approves once, instead of once per record.
   *
   * This is the fix for the per-record approval treadmill (audit finding F-08): an insolvency
   * over N receivables used to need N approvals from each keyholder, which is neither how an
   * investigation works nor a shape in which consent stays meaningful. The threshold does not
   * move — two of three keyholders are still required for every record — and the per-record
   * `request` path still exists for a single receivable.
   *
   * The trade-off to put in front of the keyholders, not bury: **a case approval is broader
   * than a record approval.** Approving a case consents to all of its records at once, up
   * front, and a keyholder cannot withhold one of them afterwards. Keep cases small and name
   * them after a real matter.
   *
   * Four is the bound because `approveCase` does one curve multiplication and one hash per slot
   * inside the proof, and because a borrowing base is four slots wide — a bigger investigation
   * is a second case.
   */
  openCase(caseRef: Uint8Array | string, recordIds: ReadonlyArray<Uint8Array | string>): Promise<TxReceipt> {
    if (recordIds.length > 4) throw new Error(`a disclosure case covers at most 4 records, got ${recordIds.length}`);
    const ids = recordIds.map((id) => toBytes32(id));
    return this.call('openCase', [
      toBytes32(caseRef),
      pad4(ids, ZERO_BYTES32),
      pad4(ids.map(() => true), false),
    ]);
  }

  /** `H("caseshare", caseRef, index, slot)` — where one keyholder's share for one slot lives. */
  caseShareKeyOf(caseRef: Uint8Array | string, index: 0 | 1 | 2, slot: number): Uint8Array {
    return pureCircuits.caseShareKeyOf(toBytes32(caseRef), BigInt(index), BigInt(slot));
  }

  /**
   * Opens one record of a case, from the approvals that are on the ledger.
   *
   * `slot` is the record's position in the case as `openCase` listed it, which is also what
   * `CaseView.recordIds` reports. Fewer than two approvals yields plaintext that does not
   * verify: `verified` is the honest answer, not an exception.
   */
  async openFromCase(caseRef: Uint8Array | string, slot: number): Promise<Disclosure> {
    const view: PublicLedgerView = await this.backend.publicState();
    const ref = toHex(caseRef);
    const open = findCase(view, ref);
    if (!open) throw new Error(`no disclosure case ${ref} on the ledger`);
    const recordId = open.recordIds[slot];
    if (recordId === undefined) throw new Error(`case ${ref} has no slot ${slot}`);
    const record = findRecord(view, recordId);
    if (!record) throw new Error(`case ${ref} names record ${recordId}, which is not on the ledger`);

    const parts: DecryptionShare[] = [];
    open.approvals.forEach((approved, i) => {
      if (!approved) return;
      const sealed = findShare(view, this.caseShareKeyOf(ref, i as 0 | 1 | 2, slot));
      if (sealed) parts.push({ index: (i + 1) as 1 | 2 | 3, D: decryptShare(sealed, this.scalar, slot) });
    });

    const opened = this.tryOpen(record, parts);
    const verification: DisclosureVerification = verifyRecordDisclosure(opened, record);
    const nullifier = view.pledges.find((p) => p.recordId === record.recordId)?.nullifier ?? verification.nullifier;
    return {
      requestId: ref,
      recordId: record.recordId,
      caseRef: ref,
      approvals: open.approvals,
      indices: parts.map((p) => p.index),
      invoice: opened.invoice,
      holderTag: opened.holderTag,
      nullifier,
      verification,
      recordIdMatches: verification.verified,
      verified: verification.verified,
    };
  }

  /** Every record of a case, opened in slot order. */
  async openWholeCase(caseRef: Uint8Array | string): Promise<Disclosure[]> {
    const view = await this.backend.publicState();
    const open = findCase(view, toHex(caseRef));
    if (!open) throw new Error(`no disclosure case ${toHex(caseRef)} on the ledger`);
    const out: Disclosure[] = [];
    for (let slot = 0; slot < open.recordIds.length; slot += 1) out.push(await this.openFromCase(caseRef, slot));
    return out;
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
