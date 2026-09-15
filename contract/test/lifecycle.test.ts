// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { DAY, deployRegistry, hex, NATIVE_COLOR, pure, setupRegistry } from './harness.js';
import { FIELD_MODULUS, randomBytes32 } from '../../sdk/src/crypto/scalar.js';

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

  it('fingerprint, ack leaf and pledge nullifier are pairwise distinct', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 7n, amount: 1n, dueDate: r.now + DAY });
    const values = [pure.fingerprint(inv), pure.ackLeafOf(inv), pure.nullifierOf(inv)].map(hex);
    expect(new Set(values).size).toBe(3);
    const salted = { ...inv, salt: inv.salt + 1n };
    expect(hex(pure.nullifierOf(salted))).not.toBe(hex(pure.nullifierOf(inv)));
  });
});
