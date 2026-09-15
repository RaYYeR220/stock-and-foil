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
