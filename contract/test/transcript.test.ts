// SPDX-License-Identifier: Apache-2.0
//
// What each circuit puts on the public ledger, value by value.
//
// A Midnight call reveals its *transcript*: the ledger operations it performed, with the keys it
// addressed and the values it pushed and read, in the clear. Circuit arguments and witnesses are
// not in it, so the question "what does this call leak" is answerable exactly:
// `transcriptValues(res)` is the set of bit patterns the call published.
//
// `docs/PRIVACY-BOUNDARY.md` is the prose version of this file. If an expectation here changes,
// that document is wrong until it is updated.
import { describe, expect, it } from 'vitest';
import {
  acknowledged,
  DAY,
  keyHex,
  leHex,
  offered,
  pure,
  setupRegistry,
  transcriptValues,
  userAddress,
  type CircuitResult,
} from './harness.js';
import { randomBytes32 } from '../../sdk/src/crypto/scalar.js';

const LENDER_REF = new Uint8Array(32).fill(0x1d);
const CASE_REF = new Uint8Array(32).fill(0xc7);

const published = (res: CircuitResult): Set<string> => new Set(transcriptValues(res));

/** Every private field of an invoice, in the encoding the transcript would use. */
const privateFields = (inv: { debtorId: bigint; sellerId: bigint; invoiceNo: bigint; amount: bigint; dueDate: bigint; salt: bigint }) =>
  [
    ['salt', inv.salt],
    ['sellerId', inv.sellerId],
    ['debtorId', inv.debtorId],
    ['invoiceNo', inv.invoiceNo],
    ['amount', inv.amount],
    ['dueDate', inv.dueDate],
  ] as const;

function expectNoInvoiceFields(res: CircuitResult, inv: Parameters<typeof privateFields>[0]): void {
  const values = published(res);
  for (const [name, value] of privateFields(inv)) {
    expect(values.has(leHex(value)), `${name} appeared in the public transcript`).toBe(false);
  }
}

describe('acknowledge', () => {
  it('publishes the members root, the ack nullifier and the ack leaf — and no invoice field', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({
      debtor: r.debtor,
      invoiceNo: 8_123_456_789n,
      amount: 777_777_777n,
      dueDate: r.now + 90n * DAY,
    });
    const res = r.debtor.acknowledge(inv);
    const values = published(res);
    // The ack nullifier is a Set key, so it is published verbatim: that is what makes one
    // acknowledgment per (debtor, seller, invoice number) enforceable, and non-repudiable.
    expect(values.has(keyHex(pure.ackNullifierOf(r.debtor.sk, inv.sellerId, inv.invoiceNo)))).toBe(true);
    // The ack leaf is not: a Merkle insert stores the hash of the value, so even `A = H("ack", F)`
    // stays one preimage away from the chain.
    expect(values.has(keyHex(pure.ackLeafOf(inv)))).toBe(false);
    expectNoInvoiceFields(res, inv);
    // The debtor stays inside the anonymity set: membership is proved against a root.
    expect(values.has(keyHex(r.debtor.leaf))).toBe(false);
    expect(values.has(keyHex(r.debtor.sk))).toBe(false);
  });
});

describe('offer', () => {
  it('publishes the marker, the expiry, the holder tag and the sealed record — nothing else', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { invoiceNo: 8_123_456_789n, amount: 777_777_777n });
    const n = pure.nullifierOf(inv);
    const tag = r.financierA.holderTag(n);
    const expiry = r.now + 7n * DAY;
    const res = r.seller.offer(inv, tag, expiry);
    const values = published(res);

    expect(values.has(keyHex(n))).toBe(true);
    expect(values.has(leHex(expiry))).toBe(true);
    expect(values.has(leHex(tag))).toBe(true);
    expect(values.has(keyHex(r.ledger().pledges.lookup(n).recordId))).toBe(true);
    // The ack leaf itself is NOT published: the proof is against a root, not a leaf.
    expect(values.has(keyHex(pure.ackLeafOf(inv)))).toBe(false);
    expectNoInvoiceFields(res, inv);
  });

  it('publishes the sealed ciphertext, which is the invoice under a one-time pad', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    const res = r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY);
    const record = r.ledger().records.lookup(r.ledger().pledges.lookup(n).recordId);
    const values = published(res);
    for (const c of record.ct) expect(values.has(leHex(c))).toBe(true);
    expect(values.has(leHex(record.E.x))).toBe(true);
    // Masked, so no ciphertext slot equals its plaintext.
    expect(record.ct).not.toContain(inv.sellerId);
    expect(record.ct).not.toContain(inv.salt);
  });
});

describe('accept, release and settle', () => {
  it('accept publishes only the marker it took up', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    const res = r.financierA.accept(n);
    expect(published(res).has(keyHex(n))).toBe(true);
    expectNoInvoiceFields(res, inv);
    // Membership is proved against a root: the financier's own leaf never appears.
    expect(published(res).has(keyHex(r.financierA.leaf))).toBe(false);
  });

  it('payInvoice publishes the amount, because settlement is unshielded', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { amount: 777_777_777n });
    const res = r.debtor.pay(inv);
    const values = published(res);
    expect(values.has(leHex(inv.amount))).toBe(true);
    expect(values.has(keyHex(pure.nullifierOf(inv)))).toBe(true);
    // Every other invoice field stays private, including the due date and the number.
    for (const [name, value] of privateFields(inv)) {
      if (name === 'amount') continue;
      expect(values.has(leHex(value)), `${name} appeared in the public transcript`).toBe(false);
    }
  });

  it('a claim publishes the payout address and the amount against a public marker', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { amount: 4_242_424n });
    const n = pure.nullifierOf(inv);
    r.debtor.pay(inv);
    const to = userAddress(0x5e);
    const res = r.seller.claim(n, to);
    const values = published(res);
    expect(values.has(keyHex(n))).toBe(true);
    expect(values.has(leHex(inv.amount))).toBe(true);
    expect(values.has(keyHex(to.bytes))).toBe(true);
  });
});

describe('certifyBorrowingBase', () => {
  it('publishes the floor, the locked markers and the borrower commitment — not the line items', () => {
    const r = setupRegistry();
    // Distinctive values, so that finding one in the transcript means something.
    const invoices = [7_001_002_003n, 7_004_005_006n].map((no, k) =>
      acknowledged(r, { invoiceNo: no, amount: 123_456_789n * BigInt(k + 1) }),
    );
    const nonce = randomBytes32();
    const floor = 370_370_367n;
    const validUntil = r.now + 30n * DAY;
    const res = r.seller.certify(
      invoices.map((invoice) => ({ invoice, holderTag: r.financierA.holderTag(pure.nullifierOf(invoice)) })),
      { lenderRef: LENDER_REF, lenderNonce: nonce, floor, validUntil },
    );
    const values = published(res);

    expect(values.has(leHex(floor))).toBe(true);
    expect(values.has(leHex(validUntil))).toBe(true);
    expect(values.has(keyHex(LENDER_REF))).toBe(true);
    expect(values.has(keyHex(pure.certIdOf(LENDER_REF, nonce)))).toBe(true);
    expect(values.has(keyHex(pure.borrowerCommitOf(r.seller.id, nonce)))).toBe(true);
    for (const inv of invoices) expect(values.has(keyHex(pure.nullifierOf(inv)))).toBe(true);

    // The nonce itself is a circuit argument, so only its hashes reach the chain — which is why
    // it has to be unguessable (see docs/PRIVACY-BOUNDARY.md).
    expect(values.has(keyHex(nonce))).toBe(false);
    for (const inv of invoices) expectNoInvoiceFields(res, inv);
  });

  it('an unused slot leaves no trace at all, even when a real invoice is parked in it', () => {
    const r = setupRegistry();
    const used = acknowledged(r, { invoiceNo: 7_111_222_333n, amount: 100_000n });
    const parked = acknowledged(r, { invoiceNo: 7_444_555_666n, amount: 987_654_321n });
    const nonce = randomBytes32();
    const res = r.seller.certify([{ invoice: used, holderTag: r.financierA.holderTag(pure.nullifierOf(used)) }], {
      lenderRef: LENDER_REF,
      lenderNonce: nonce,
      floor: 0n,
      validUntil: r.now + 30n * DAY,
    });
    const values = published(res);
    expect(values.has(keyHex(pure.nullifierOf(used)))).toBe(true);
    expect(values.has(keyHex(pure.nullifierOf(parked)))).toBe(false);
    expectNoInvoiceFields(res, parked);
    // What is public is the pool *size*: the certificate carries `count`, and one marker per slot.
    expect(r.ledger().certificates.lookup(pure.certIdOf(LENDER_REF, nonce)).count).toBe(1n);
  });
});

describe('disclosure', () => {
  it('a request publishes the record id and the case reference, and nothing about the invoice', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    const res = r.auditor.request(recordId, CASE_REF);
    const values = published(res);
    expect(values.has(keyHex(recordId))).toBe(true);
    expect(values.has(keyHex(CASE_REF))).toBe(true);
    expect(values.has(keyHex(pure.requestIdOf(recordId, CASE_REF)))).toBe(true);
    expectNoInvoiceFields(res, inv);
  });

  it('an approval publishes the keyholder slot and a sealed share, never the share itself', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    r.auditor.request(recordId, CASE_REF);
    const requestId = pure.requestIdOf(recordId, CASE_REF);
    const res = r.keyholders[1].approve(requestId);
    const values = published(res);
    expect(values.has(keyHex(pure.shareKeyOf(requestId, 1n)))).toBe(true);
    // The Shamir share and the point D = s·E it proves are never in the clear.
    expect(values.has(leHex(r.keyholders[1].share.value))).toBe(false);
    const D = pure.mulPoint(r.ledger().records.lookup(recordId).E, r.keyholders[1].share.value);
    expect(values.has(leHex(D.x))).toBe(false);
    expect(values.has(leHex(D.y))).toBe(false);
  });
});
