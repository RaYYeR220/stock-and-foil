// SPDX-License-Identifier: Apache-2.0
//
// Threshold disclosure: two of three keyholders must approve before an auditor can open one
// sealed record, and the opened record proves itself against the nullifier the ledger is keyed by.
import { describe, expect, it } from 'vitest';
import {
  combineShares,
  hex,
  offered,
  openRecord,
  openShare,
  pure,
  recomputesNullifier,
  setupRegistry,
  type Registry,
} from './harness.js';
import { randomScalar } from '../../sdk/src/crypto/scalar.js';

const CASE_REF = new Uint8Array(32).fill(0xc7);

/** Offers an invoice, opens a disclosure request against its record and returns everything needed. */
function requested(r: Registry, caseRef: Uint8Array = CASE_REF, invoiceNo = 1001n) {
  const { inv, n } = offered(r, r.financierA, { invoiceNo });
  const recordId = r.ledger().pledges.lookup(n).recordId;
  r.auditor.request(recordId, caseRef);
  return { inv, n, recordId, requestId: pure.requestIdOf(recordId, caseRef) };
}

/** Auditor's view of one approval: the keyholder's share index and the recovered point D_i. */
function shareOf(r: Registry, requestId: Uint8Array, index: 0 | 1 | 2, auditorSk = r.auditorSk) {
  const sealed = r.ledger().shares.lookup(pure.shareKeyOf(requestId, BigInt(index)));
  return { index: index + 1, D: openShare(sealed, auditorSk) };
}

describe('disclosure requests', () => {
  it('auditor opens a request against a stored record', () => {
    const r = setupRegistry();
    const { recordId, requestId } = requested(r);
    const req = r.ledger().requests.lookup(requestId);
    expect(hex(req.recordId)).toBe(hex(recordId));
    expect(hex(req.caseRef)).toBe(hex(CASE_REF));
    expect(req.approvals).toEqual([false, false, false]);
    expect(r.ledger().shares.size()).toBe(0n);
  });

  it('records each approval on the ledger and stores one sealed share per keyholder', () => {
    const r = setupRegistry();
    const { requestId } = requested(r);
    r.keyholders[0].approve(requestId);
    expect(r.ledger().requests.lookup(requestId).approvals).toEqual([true, false, false]);
    r.keyholders[2].approve(requestId);
    expect(r.ledger().requests.lookup(requestId).approvals).toEqual([true, false, true]);
    expect(r.ledger().shares.size()).toBe(2n);
    const share = r.ledger().shares.lookup(pure.shareKeyOf(requestId, 2n));
    expect(share.version).toBe(1n);
    expect(share.ct).toHaveLength(2);
    expect(share.E2).not.toEqual(pure.identityPoint());
  });

  it('shares are addressed by request and index, never by map order', () => {
    const r = setupRegistry();
    const first = requested(r, new Uint8Array(32).fill(0x01), 1n);
    const second = requested(r, new Uint8Array(32).fill(0x02), 2n);
    expect(hex(first.requestId)).not.toBe(hex(second.requestId));
    r.keyholders[1].approve(second.requestId);
    expect(r.ledger().shares.member(pure.shareKeyOf(second.requestId, 1n))).toBe(true);
    expect(r.ledger().shares.member(pure.shareKeyOf(first.requestId, 1n))).toBe(false);
  });
});

describe('2-of-3 threshold decryption', () => {
  for (const pair of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as Array<[0 | 1 | 2, 0 | 1 | 2]>) {
    it(`keyholders ${pair[0]} and ${pair[1]} open the record, which recomputes the ledger nullifier`, () => {
      const r = setupRegistry();
      const { inv, n, recordId, requestId } = requested(r);
      for (const i of pair) r.keyholders[i].approve(requestId);

      const S = combineShares(pair.map((i) => shareOf(r, requestId, i)));
      expect(S).toEqual(pure.mulPoint(r.ledger().records.lookup(recordId).E, r.disclosureSk));

      const opened = openRecord(r.ledger().records.lookup(recordId), S);
      expect(opened.invoice).toEqual(inv);
      expect(opened.holderTag).toBe(r.financierA.holderTag(n));
      expect(recomputesNullifier(opened.invoice, n)).toBe(true);
    });
  }

  it('a single share does not open the record', () => {
    const r = setupRegistry();
    const { inv, n, recordId, requestId } = requested(r);
    r.keyholders[0].approve(requestId);
    const S = combineShares([shareOf(r, requestId, 0)]);
    const opened = openRecord(r.ledger().records.lookup(recordId), S);
    expect(opened.invoice).not.toEqual(inv);
    expect(recomputesNullifier(opened.invoice, n)).toBe(false);
  });

  it('a wrong auditor scalar cannot recover the shares', () => {
    const r = setupRegistry();
    const { inv, n, recordId, requestId } = requested(r);
    for (const i of [0, 1] as const) r.keyholders[i].approve(requestId);
    const wrong = randomScalar();
    let recomputed = false;
    try {
      const S = combineShares([0, 1].map((i) => shareOf(r, requestId, i as 0 | 1, wrong)));
      const opened = openRecord(r.ledger().records.lookup(recordId), S);
      expect(opened.invoice).not.toEqual(inv);
      recomputed = recomputesNullifier(opened.invoice, n);
    } catch {
      // Garbage share points are not on the curve; the pure circuit refuses them outright.
      recomputed = false;
    }
    expect(recomputed).toBe(false);
  });

  it('approvals are per record, not per case: one approval on each of two requests opens it', () => {
    // A keyholder publishes D_i = s_i·E, and E belongs to the *record*. Two requests naming the
    // same record therefore yield two independent shares from two different keyholders, and the
    // auditor combines them across requests. The threshold holds — two distinct keyholders are
    // still required — but neither request's approval vector reaches two, so the per-request
    // trail understates how far the record has been opened, and a keyholder that consents to one
    // case reference cannot withhold the same share from another. See docs/THREAT-MODEL.md.
    const r = setupRegistry();
    const caseA = new Uint8Array(32).fill(0xa1);
    const caseB = new Uint8Array(32).fill(0xb2);
    const { inv, recordId } = requested(r, caseA);
    r.auditor.request(recordId, caseB);
    const reqA = pure.requestIdOf(recordId, caseA);
    const reqB = pure.requestIdOf(recordId, caseB);

    r.keyholders[0].approve(reqA);
    r.keyholders[1].approve(reqB);
    expect(r.ledger().requests.lookup(reqA).approvals).toEqual([true, false, false]);
    expect(r.ledger().requests.lookup(reqB).approvals).toEqual([false, true, false]);

    const S = combineShares([shareOf(r, reqA, 0), shareOf(r, reqB, 1)]);
    expect(openRecord(r.ledger().records.lookup(recordId), S).invoice).toEqual(inv);
  });

  it('the disclosure key opens only the record it was asked for', () => {
    const r = setupRegistry();
    const first = offered(r, r.financierA, { invoiceNo: 1n });
    const second = offered(r, r.financierB, { invoiceNo: 2n });
    const L = r.ledger();
    const recA = L.records.lookup(L.pledges.lookup(first.n).recordId);
    const opened = openRecord(recA, pure.mulPoint(recA.E, r.disclosureSk));
    expect(recomputesNullifier(opened.invoice, first.n)).toBe(true);
    expect(recomputesNullifier(opened.invoice, second.n)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Case-scoped disclosure (audit finding F-08)
//
// A record approval is per record: an insolvency over N receivables made every keyholder sign N
// times, which is not how an investigation works and is where consent fatigue starts. A *case*
// names up to four records up front; a keyholder approves the case once and the circuit publishes
// one sealed share per record in it. The threshold is unchanged — two keyholders are still
// required for every record — and so is the per-record path, which still exists for the single
// receivable an auditor wants to look at without opening a case at all.
//
// The honest trade-off, stated here and in docs/THREAT-MODEL.md: a case approval is *broader*
// than a record approval. A keyholder that approves a case has consented to all four records at
// once and cannot take one back. That breadth is exactly what an insolvency practitioner needs
// and exactly what a privacy reviewer must see written down.

describe('case-scoped disclosure', () => {
  const CASE_A = new Uint8Array(32).fill(0xa5);

  /** Offers `count` invoices and returns their record ids, in order. */
  function records(r: Registry, count: number): { recordIds: Uint8Array[]; invoices: ReturnType<typeof offered>[] } {
    const invoices = [...Array(count).keys()].map((k) => offered(r, r.financierA, { invoiceNo: BigInt(k + 1) }));
    return { recordIds: invoices.map((o) => r.ledger().pledges.lookup(o.n).recordId), invoices };
  }

  /** The auditor's view of one keyholder's share for one slot of a case. */
  function caseShareOf(r: Registry, caseRef: Uint8Array, index: 0 | 1 | 2, slot: number) {
    const sealed = r.ledger().shares.lookup(pure.caseShareKeyOf(caseRef, BigInt(index), BigInt(slot)));
    return { index: index + 1, D: openShare(sealed, r.auditorSk, slot) };
  }

  it('one approval per keyholder opens every record in the case', () => {
    const r = setupRegistry();
    const { recordIds, invoices } = records(r, 3);
    r.auditor.openCase(CASE_A, recordIds);

    const opened = r.ledger().cases.lookup(CASE_A);
    expect(opened.count).toBe(3n);
    expect(opened.approvals).toEqual([false, false, false]);
    expect(opened.recordIds.map(hex)).toEqual([...recordIds.map(hex), hex(new Uint8Array(32))]);

    // Two signatures in total, for three records — the old path needed six.
    r.keyholders[0].approveCase(CASE_A);
    r.keyholders[2].approveCase(CASE_A);
    expect(r.ledger().cases.lookup(CASE_A).approvals).toEqual([true, false, true]);
    expect(r.ledger().shares.size()).toBe(6n);

    recordIds.forEach((recordId, slot) => {
      const S = combineShares([caseShareOf(r, CASE_A, 0, slot), caseShareOf(r, CASE_A, 2, slot)]);
      const record = r.ledger().records.lookup(recordId);
      expect(S).toEqual(pure.mulPoint(record.E, r.disclosureSk));
      const plaintext = openRecord(record, S);
      expect(plaintext.invoice).toEqual(invoices[slot]!.inv);
      expect(recomputesNullifier(plaintext.invoice, invoices[slot]!.n)).toBe(true);
    });
  });

  it('one keyholder is not enough, for any record in the case', () => {
    const r = setupRegistry();
    const { recordIds, invoices } = records(r, 2);
    r.auditor.openCase(CASE_A, recordIds);
    r.keyholders[1].approveCase(CASE_A);
    expect(r.ledger().shares.size()).toBe(2n);
    recordIds.forEach((recordId, slot) => {
      const S = combineShares([caseShareOf(r, CASE_A, 1, slot)]);
      const plaintext = openRecord(r.ledger().records.lookup(recordId), S);
      expect(plaintext.invoice).not.toEqual(invoices[slot]!.inv);
      expect(recomputesNullifier(plaintext.invoice, invoices[slot]!.n)).toBe(false);
    });
  });

  it('every slot gets its own mask, so two slots naming one record do not cancel', () => {
    // One approval seals four shares under a single shared point, so the slots must use
    // different mask indices. If they did not, subtracting two ciphertexts would cancel the
    // masks and show an observer with no key at all which slots name the same record.
    const r = setupRegistry();
    const { recordIds } = records(r, 1);
    r.auditor.openCase(CASE_A, [recordIds[0]!, recordIds[0]!]);
    r.keyholders[0].approveCase(CASE_A);
    const first = r.ledger().shares.lookup(pure.caseShareKeyOf(CASE_A, 0n, 0n));
    const second = r.ledger().shares.lookup(pure.caseShareKeyOf(CASE_A, 0n, 1n));
    expect(first.E2).toEqual(second.E2);
    expect(first.ct[0]).not.toBe(second.ct[0]);
    expect(first.ct[1]).not.toBe(second.ct[1]);
    // Both still decrypt to the same point, because the slots do name the same record.
    expect(openShare(first, r.auditorSk, 0)).toEqual(openShare(second, r.auditorSk, 1));
  });

  it('the per-record path is untouched: a case and a request coexist on one record', () => {
    const r = setupRegistry();
    const { recordIds, invoices } = records(r, 1);
    const recordId = recordIds[0]!;
    r.auditor.request(recordId, CASE_A);
    const requestId = pure.requestIdOf(recordId, CASE_A);
    r.auditor.openCase(CASE_A, [recordId]);

    r.keyholders[0].approve(requestId);
    r.keyholders[1].approveCase(CASE_A);
    expect(r.ledger().requests.lookup(requestId).approvals).toEqual([true, false, false]);
    expect(r.ledger().cases.lookup(CASE_A).approvals).toEqual([false, true, false]);
    expect(r.ledger().shares.size()).toBe(2n);

    // Shares are bound to the record, so one from each path combines — which is F-08 again,
    // now visible across the two paths and counted per record by the SDK.
    const S = combineShares([
      { index: 1, D: openShare(r.ledger().shares.lookup(pure.shareKeyOf(requestId, 0n)), r.auditorSk) },
      caseShareOf(r, CASE_A, 1, 0),
    ]);
    expect(openRecord(r.ledger().records.lookup(recordId), S).invoice).toEqual(invoices[0]!.inv);
  });

  it('a case share key is distinct from a request share key under the same reference', () => {
    const r = setupRegistry();
    const { recordIds } = records(r, 1);
    const requestId = pure.requestIdOf(recordIds[0]!, CASE_A);
    expect(hex(pure.caseShareKeyOf(CASE_A, 0n, 0n))).not.toBe(hex(pure.shareKeyOf(requestId, 0n)));
    expect(hex(pure.caseShareKeyOf(CASE_A, 0n, 0n))).not.toBe(hex(pure.caseShareKeyOf(CASE_A, 0n, 1n)));
    expect(hex(pure.caseShareKeyOf(CASE_A, 0n, 0n))).not.toBe(hex(pure.caseShareKeyOf(CASE_A, 1n, 0n)));
  });
});
