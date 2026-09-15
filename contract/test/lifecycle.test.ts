// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { acknowledged, DAY, deployRegistry, hex, MASK64, NATIVE_COLOR, openRecord, pure, setupRegistry, unpack } from './harness.js';
import { PledgeStatus } from '../src/index.js';
import { FIELD_MODULUS, randomBytes32 } from '../../sdk/src/crypto/scalar.js';

const IDENTITY = { x: 0n, y: 1n };

describe('deployment and membership', () => {
  it('stores the sealed configuration at deploy', () => {
    const r = deployRegistry();
    const L = r.ledger();
    expect(hex(L.operatorId)).toBe(hex(pure.operatorIdOf(r.operator.sk)));
    expect(L.disclosurePk).toEqual(pure.pubKeyOf(r.disclosureSk));
    expect(L.keyholderPks).toEqual(r.keyholders.map((k) => pure.pubKeyOf(k.share.value)));
    expect(L.auditorPk).toEqual(pure.pubKeyOf(r.auditorSk));
    expect(hex(L.settlementColor)).toBe(hex(NATIVE_COLOR));
    expect(L.threshold).toBe(2n);
  });

  it('operator admits a debtor and a financier into their member trees', () => {
    const r = deployRegistry();
    r.operator.admitDebtor(r.debtor.leaf);
    r.operator.admitFinancier(r.financierA.leaf);
    const L = r.ledger();
    expect(L.debtors.findPathForLeaf(r.debtor.leaf)).toBeDefined();
    expect(L.financiers.findPathForLeaf(r.financierA.leaf)).toBeDefined();
    expect(L.debtors.firstFree()).toBe(1n);
    expect(L.financiers.firstFree()).toBe(1n);
    expect(L.financiers.findPathForLeaf(r.debtor.leaf)).toBeUndefined();
  });

  it('derives identities under distinct domains', () => {
    const sk = randomBytes32();
    const bytesIds = [pure.debtorLeaf(sk), pure.financierLeaf(sk), pure.operatorIdOf(sk)].map(hex);
    expect(new Set(bytesIds).size).toBe(3);
    const fieldIds = [pure.debtorIdOf(sk), pure.sellerIdOf(sk)];
    expect(fieldIds[0]).not.toBe(fieldIds[1]);
    for (const id of fieldIds) expect(id < FIELD_MODULUS).toBe(true);
  });
});

describe('acknowledgment', () => {
  it('registered debtor acknowledges an invoice: ack leaf and ack nullifier are published', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 1001n, amount: 230_000n, dueDate: r.now + 90n * DAY });
    r.debtor.acknowledge(inv);
    const L = r.ledger();
    expect(L.acks.findPathForLeaf(pure.ackLeafOf(inv))).toBeDefined();
    expect(L.ackNullifiers.size()).toBe(1n);
    expect(L.ackNullifiers.member(pure.ackNullifierOf(r.debtor.sk, inv.sellerId, inv.invoiceNo))).toBe(true);
  });

  it('two debtors acknowledge different invoices of the same seller', () => {
    const r = setupRegistry();
    const a = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 1n, amount: 10n, dueDate: r.now + 30n * DAY });
    const b = r.seller.issueInvoice({ debtor: r.debtor2, invoiceNo: 1n, amount: 10n, dueDate: r.now + 30n * DAY });
    r.debtor.acknowledge(a);
    r.debtor2.acknowledge(b);
    expect(r.ledger().acks.firstFree()).toBe(2n);
  });

  it('ack leaf and nullifier derive from the fingerprint under their own domains', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 9n, amount: 5n, dueDate: r.now + DAY });
    const f = pure.fingerprint(inv);
    expect(hex(pure.ackLeafFromFingerprint(f))).toBe(hex(pure.ackLeafOf(inv)));
    expect(hex(pure.nullifierFromFingerprint(f))).toBe(hex(pure.nullifierOf(inv)));
  });

  it('fingerprint, ack leaf and pledge nullifier are pairwise distinct', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 7n, amount: 1n, dueDate: r.now + DAY });
    const values = [pure.fingerprint(inv), pure.ackLeafOf(inv), pure.nullifierOf(inv)].map(hex);
    expect(new Set(values).size).toBe(3);
    const salted = { ...inv, salt: inv.salt + 1n };
    expect(hex(pure.nullifierOf(salted))).not.toBe(hex(pure.nullifierOf(inv)));
  });
});

describe('offer, accept, release', () => {
  it('debtor acknowledges, seller offers, financier accepts', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    const tag = r.financierA.holderTag(n);
    const expiry = r.now + 7n * DAY;
    r.seller.offer(inv, tag, expiry);
    const offered = r.ledger().pledges.lookup(n);
    expect(offered.status).toBe(PledgeStatus.OFFERED);
    expect(offered.holderTag).toBe(tag);
    expect(offered.expiry).toBe(expiry);
    expect(offered.claimed).toBe(false);
    r.financierA.accept(n);
    const pledged = r.ledger().pledges.lookup(n);
    expect(pledged.status).toBe(PledgeStatus.PLEDGED);
    expect(pledged.holderTag).toBe(tag);
    expect(hex(pledged.recordId)).toBe(hex(offered.recordId));
  });

  it('offer stores a versioned record that the disclosure key opens to the invoice and holder tag', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    const tag = r.financierA.holderTag(n);
    r.seller.offer(inv, tag, r.now + 7n * DAY);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    const rec = r.ledger().records.lookup(recordId);
    expect(rec.version).toBe(1n);
    expect(rec.ct).toHaveLength(5);
    expect(rec.E).not.toEqual(IDENTITY);
    expect(hex(pure.recordIdOf(n, rec.E))).toBe(hex(recordId));
    const opened = openRecord(rec, pure.mulPoint(rec.E, r.disclosureSk));
    expect(opened.invoice).toEqual(inv);
    expect(opened.holderTag).toBe(tag);
    expect(hex(pure.nullifierOf(opened.invoice))).toBe(hex(n));
    expect(rec.ct).not.toContain(inv.debtorId);
    expect(rec.ct).not.toContain(inv.sellerId);
  });

  it('packs invoiceNo, amount and dueDate into one field without loss at the Uint<64> maximum', () => {
    const packed = pure.packFields(MASK64, MASK64 - 1n, MASK64 - 2n);
    expect(unpack(packed)).toEqual({ invoiceNo: MASK64, amount: MASK64 - 1n, dueDate: MASK64 - 2n });
  });

  it('released invoice is re-offered to financier B, who accepts; both records stay on the ledger', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY);
    r.financierA.accept(n);
    r.financierA.release(n);
    expect(r.ledger().pledges.lookup(n).status).toBe(PledgeStatus.RELEASED);
    const tagB = r.financierB.holderTag(n);
    r.seller.offer(inv, tagB, r.now + 7n * DAY);
    r.financierB.accept(n);
    const p = r.ledger().pledges.lookup(n);
    expect(p.status).toBe(PledgeStatus.PLEDGED);
    expect(p.holderTag).toBe(tagB);
    expect(r.ledger().records.size()).toBe(2n);
  });

  it('an unaccepted offer becomes re-offerable once its expiry passes', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY);
    r.advance(7n * DAY);
    r.seller.offer(inv, r.financierB.holderTag(n), r.now + 7n * DAY);
    r.financierB.accept(n);
    expect(r.ledger().pledges.lookup(n).status).toBe(PledgeStatus.PLEDGED);
  });

  it('holder tags are per financier and per nullifier', () => {
    const r = setupRegistry();
    const n1 = randomBytes32();
    const n2 = randomBytes32();
    expect(r.financierA.holderTag(n1)).not.toBe(r.financierB.holderTag(n1));
    expect(r.financierA.holderTag(n1)).not.toBe(r.financierA.holderTag(n2));
  });
});
