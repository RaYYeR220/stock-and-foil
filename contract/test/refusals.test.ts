// SPDX-License-Identifier: Apache-2.0
//
// Adversarial suite: every refusal code the contract can emit, one scenario per code.
// A refusal happens while the transaction is being built, so a fraudulent transaction never
// reaches the chain — these tests are the product's fraud claims, written down.
import { describe, expect, it } from 'vitest';
import {
  acknowledged,
  DAY,
  Debtor,
  deployRegistry,
  expectRefusal,
  Financier,
  hex,
  offered,
  Operator,
  pure,
  Seller,
  setupRegistry,
  userAddress,
} from './harness.js';
import { randomBytes32, randomScalar } from '../../sdk/src/crypto/scalar.js';

const CASE_REF = new Uint8Array(32).fill(0xc7);

describe('membership refusals', () => {
  it('NOT_OPERATOR: a non-operator cannot admit a debtor', () => {
    const r = deployRegistry();
    const impostor = new Operator(r, { role: 'operator', secretKey: randomBytes32() });
    expectRefusal(() => impostor.admitDebtor(r.debtor.leaf), 'NOT_OPERATOR');
    expect(r.ledger().debtors.firstFree()).toBe(0n);
  });

  it('NOT_OPERATOR: a non-operator cannot admit a financier', () => {
    const r = deployRegistry();
    const impostor = new Operator(r, { role: 'operator', secretKey: r.financierA.sk });
    expectRefusal(() => impostor.admitFinancier(r.financierA.leaf), 'NOT_OPERATOR');
  });
});

describe('acknowledgment refusals', () => {
  it('NOT_REGISTERED_DEBTOR: an unadmitted debtor cannot acknowledge', () => {
    const r = setupRegistry();
    const stranger = new Debtor(r, { role: 'debtor', secretKey: randomBytes32() });
    const inv = r.seller.issueInvoice({ debtor: stranger, invoiceNo: 1n, amount: 100n, dueDate: r.now + 30n * DAY });
    expectRefusal(() => stranger.acknowledge(inv), 'NOT_REGISTERED_DEBTOR');
  });

  it('NOT_REGISTERED_DEBTOR: a financier leaf does not pass as a debtor', () => {
    const r = setupRegistry();
    const asDebtor = new Debtor(r, { role: 'debtor', secretKey: r.financierA.sk });
    const inv = r.seller.issueInvoice({ debtor: asDebtor, invoiceNo: 1n, amount: 100n, dueDate: r.now + 30n * DAY });
    const finPath = r.ledger().financiers.findPathForLeaf(r.financierA.leaf);
    expectRefusal(
      () => asDebtor.acknowledge(inv, { paths: { [hex(asDebtor.leaf)]: finPath } }),
      'NOT_REGISTERED_DEBTOR',
    );
  });

  it('NOT_YOUR_INVOICE: a debtor cannot acknowledge an invoice naming another debtor', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor2, invoiceNo: 1n, amount: 100n, dueDate: r.now + 30n * DAY });
    expectRefusal(() => r.debtor.acknowledge(inv), 'NOT_YOUR_INVOICE');
  });

  it('ALREADY_ACKNOWLEDGED: the same invoice number cannot be acknowledged twice, even re-salted or re-priced', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 1n, amount: 100n, dueDate: r.now + 30n * DAY });
    r.debtor.acknowledge(inv);
    expectRefusal(() => r.debtor.acknowledge(inv), 'ALREADY_ACKNOWLEDGED');
    expectRefusal(() => r.debtor.acknowledge({ ...inv, amount: 1_000n, salt: inv.salt + 1n }), 'ALREADY_ACKNOWLEDGED');
    expect(r.ledger().acks.firstFree()).toBe(1n);
  });
});

describe('offer refusals: the three First Brands frauds', () => {
  it('NOT_ACKNOWLEDGED (forged): an invoice the debtor never owed cannot be pledged', () => {
    const r = setupRegistry();
    const forged = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 9999n, amount: 500_000n, dueDate: r.now + 90n * DAY });
    const tag = r.financierA.holderTag(pure.nullifierOf(forged));
    expectRefusal(() => r.seller.offer(forged, tag, r.now + 7n * DAY), 'NOT_ACKNOWLEDGED');
    expect(r.ledger().pledges.size()).toBe(0n);
  });

  it('NOT_ACKNOWLEDGED (inflated): the acknowledged invoice cannot be re-priced upwards', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { amount: 230_000n });
    const inflated = { ...inv, amount: 2_300_000n };
    const tag = r.financierA.holderTag(pure.nullifierOf(inflated));
    expectRefusal(() => r.seller.offer(inflated, tag, r.now + 7n * DAY), 'NOT_ACKNOWLEDGED');
  });

  it('ALREADY_ENCUMBERED (double pledge): a pledged invoice cannot be offered to a second financier', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    r.financierA.accept(n);
    expectRefusal(() => r.seller.offer(inv, r.financierB.holderTag(n), r.now + 7n * DAY), 'ALREADY_ENCUMBERED');
    expect(r.ledger().pledges.lookup(n).holderTag).toBe(r.financierA.holderTag(n));
  });

  it('ALREADY_ENCUMBERED: a live offer blocks a second offer until it expires', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    expectRefusal(() => r.seller.offer(inv, r.financierB.holderTag(n), r.now + 7n * DAY), 'ALREADY_ENCUMBERED');
  });

  it('NOT_INVOICE_OWNER: a financier who learned the invoice during diligence cannot pledge it', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const thief = new Seller(r, { role: 'seller', secretKey: r.financierB.sk });
    const tag = r.financierB.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => thief.offer(inv, tag, r.now + 7n * DAY), 'NOT_INVOICE_OWNER');
  });

  it('ALREADY_SETTLED: a settled invoice can never be pledged again', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    r.debtor.pay(inv);
    const tag = r.financierA.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => r.seller.offer(inv, tag, r.now + 7n * DAY), 'ALREADY_SETTLED');
  });

  it('BAD_EXPIRY: an offer cannot expire in the past', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const tag = r.financierA.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => r.seller.offer(inv, tag, r.now - DAY), 'BAD_EXPIRY');
  });

  it('INVOICE_OVERDUE: an offer cannot outlive the invoice it is secured on', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { due: 3n * DAY });
    const tag = r.financierA.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => r.seller.offer(inv, tag, r.now + 7n * DAY), 'INVOICE_OVERDUE');
  });

  it('INVOICE_OVERDUE: an invoice that is already due cannot be pledged at all', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { due: DAY });
    r.advance(2n * DAY);
    const tag = r.financierA.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => r.seller.offer(inv, tag, r.now + DAY), 'INVOICE_OVERDUE');
  });

  it('BAD_EPHEMERAL: a record cannot be sealed with a degenerate ephemeral key', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const tag = r.financierA.holderTag(pure.nullifierOf(inv));
    expectRefusal(() => r.seller.offer(inv, tag, r.now + 7n * DAY, { ephemeral: 0n }), 'BAD_EPHEMERAL');
  });
});

describe('lying witnesses', () => {
  it('NOT_ACKNOWLEDGED: a valid Merkle path for a different ack leaf does not authorise an offer', () => {
    const r = setupRegistry();
    const acked = acknowledged(r, { invoiceNo: 1n });
    const forged = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 2n, amount: 1n, dueDate: r.now + 30n * DAY });
    const stolen = r.ledger().acks.findPathForLeaf(pure.ackLeafOf(acked));
    const tag = r.financierA.holderTag(pure.nullifierOf(forged));
    expectRefusal(
      () => r.seller.offer(forged, tag, r.now + 7n * DAY, { paths: { [hex(pure.ackLeafOf(forged))]: stolen } }),
      'NOT_ACKNOWLEDGED',
    );
  });

  it('NOT_ACKNOWLEDGED: relabelling a real path with the wanted leaf does not change its root', () => {
    const r = setupRegistry();
    const acked = acknowledged(r, { invoiceNo: 1n });
    const forged = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 2n, amount: 1n, dueDate: r.now + 30n * DAY });
    const leaf = pure.ackLeafOf(forged);
    const relabelled = { ...r.ledger().acks.findPathForLeaf(pure.ackLeafOf(acked))!, leaf };
    const tag = r.financierA.holderTag(pure.nullifierOf(forged));
    expectRefusal(
      () => r.seller.offer(forged, tag, r.now + 7n * DAY, { paths: { [hex(leaf)]: relabelled } }),
      'NOT_ACKNOWLEDGED',
    );
  });

  it('NOT_REGISTERED_DEBTOR: a relabelled membership path does not admit a stranger', () => {
    const r = setupRegistry();
    const stranger = new Debtor(r, { role: 'debtor', secretKey: randomBytes32() });
    const inv = r.seller.issueInvoice({ debtor: stranger, invoiceNo: 1n, amount: 1n, dueDate: r.now + 30n * DAY });
    const relabelled = { ...r.ledger().debtors.findPathForLeaf(r.debtor.leaf)!, leaf: stranger.leaf };
    expectRefusal(
      () => stranger.acknowledge(inv, { paths: { [hex(stranger.leaf)]: relabelled } }),
      'NOT_REGISTERED_DEBTOR',
    );
  });
});

describe('accept and release refusals', () => {
  it('NOT_LICENSED: an unadmitted financier cannot accept, even an offer addressed to it', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    const outsider = new Financier(r, { role: 'financier', secretKey: randomBytes32() });
    r.seller.offer(inv, outsider.holderTag(n), r.now + 7n * DAY);
    expectRefusal(() => outsider.accept(n), 'NOT_LICENSED');
  });

  it('NO_SUCH_OFFER: nothing to accept under an unknown nullifier', () => {
    const r = setupRegistry();
    expectRefusal(() => r.financierA.accept(randomBytes32()), 'NO_SUCH_OFFER');
  });

  it('NO_SUCH_OFFER: an already accepted offer cannot be accepted again', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    r.financierA.accept(n);
    expectRefusal(() => r.financierA.accept(n), 'NO_SUCH_OFFER');
  });

  it('NOT_ADDRESSEE: a financier cannot accept an offer addressed to a competitor', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    expectRefusal(() => r.financierB.accept(n), 'NOT_ADDRESSEE');
  });

  it('OFFER_EXPIRED: an offer cannot be accepted after its expiry', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    r.advance(8n * DAY);
    expectRefusal(() => r.financierA.accept(n), 'OFFER_EXPIRED');
  });

  it('NOT_HOLDER: only the financier holding the pledge can release it', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    r.financierA.accept(n);
    expectRefusal(() => r.financierB.release(n), 'NOT_HOLDER');
  });

  it('NOT_PLEDGED: an offer that was never accepted cannot be released', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    expectRefusal(() => r.financierA.release(n), 'NOT_PLEDGED');
    expectRefusal(() => r.financierA.release(randomBytes32()), 'NOT_PLEDGED');
  });
});

describe('settlement refusals', () => {
  it('NOT_YOUR_INVOICE: a debtor cannot pay another debtor’s invoice', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    expectRefusal(() => r.debtor2.pay(inv), 'NOT_YOUR_INVOICE');
  });

  it('NOT_ACKNOWLEDGED: a payment must name an invoice that was acknowledged', () => {
    const r = setupRegistry();
    const inv = r.seller.issueInvoice({ debtor: r.debtor, invoiceNo: 7n, amount: 10n, dueDate: r.now + 30n * DAY });
    expectRefusal(() => r.debtor.pay(inv), 'NOT_ACKNOWLEDGED');
  });

  it('ALREADY_SETTLED: an invoice cannot be paid through the registry twice', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    r.debtor.pay(inv);
    expectRefusal(() => r.debtor.pay(inv), 'ALREADY_SETTLED');
  });

  it('NOT_SETTLED: proceeds cannot be claimed before the debtor pays', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    r.financierA.accept(n);
    expectRefusal(() => r.financierA.claim(n, userAddress(0xa1)), 'NOT_SETTLED');
    expectRefusal(() => r.seller.claim(randomBytes32(), userAddress(0x5e)), 'NOT_SETTLED');
  });

  it('NOT_PAYEE: the seller cannot take proceeds that belong to the pledge holder', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    r.financierA.accept(n);
    r.debtor.pay(inv);
    expectRefusal(() => r.seller.claim(n, userAddress(0x5e)), 'NOT_PAYEE');
    expectRefusal(() => r.financierB.claim(n, userAddress(0xb2)), 'NOT_PAYEE');
    expect(r.ledger().pledges.lookup(n).claimed).toBe(false);
  });

  it('NOT_PAYEE: a financier cannot take proceeds of an invoice nobody financed', () => {
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    r.debtor.pay(inv);
    expectRefusal(() => r.financierA.claim(n, userAddress(0xa1)), 'NOT_PAYEE');
  });

  it('ALREADY_CLAIMED: proceeds are paid out exactly once', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    r.financierA.accept(n);
    r.debtor.pay(inv);
    r.financierA.claim(n, userAddress(0xa1));
    expectRefusal(() => r.financierA.claim(n, userAddress(0xa1)), 'ALREADY_CLAIMED');
  });
});

describe('disclosure refusals', () => {
  it('NOT_AUDITOR: only the holder of the auditor key can open a request', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    const impostor = { ...r.auditor.ps, scalar: randomScalar() };
    expectRefusal(() => r.h.call(impostor, 'requestDisclosure', [recordId, CASE_REF]), 'NOT_AUDITOR');
  });

  it('NO_SUCH_RECORD: a request needs a record that exists', () => {
    const r = setupRegistry();
    expectRefusal(() => r.auditor.request(randomBytes32(), CASE_REF), 'NO_SUCH_RECORD');
  });

  it('DUPLICATE_REQUEST: the same record and case reference cannot be requested twice', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    r.auditor.request(recordId, CASE_REF);
    expectRefusal(() => r.auditor.request(recordId, CASE_REF), 'DUPLICATE_REQUEST');
    r.auditor.request(recordId, new Uint8Array(32).fill(0xc8));
    expect(r.ledger().requests.size()).toBe(2n);
  });

  it('NO_SUCH_REQUEST: a keyholder cannot approve a request that was never opened', () => {
    const r = setupRegistry();
    expectRefusal(() => r.keyholders[0].approve(randomBytes32()), 'NO_SUCH_REQUEST');
  });

  it('NOT_KEYHOLDER: a stranger cannot approve, and a keyholder cannot approve in another slot', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    r.auditor.request(recordId, CASE_REF);
    const requestId = pure.requestIdOf(recordId, CASE_REF);
    const stranger = { ...r.keyholders[0].ps, scalar: randomScalar() };
    expectRefusal(() => r.h.call(stranger, 'approveDisclosure', [requestId, 0n]), 'NOT_KEYHOLDER');
    expectRefusal(() => r.h.call(r.keyholders[0].ps, 'approveDisclosure', [requestId, 1n]), 'NOT_KEYHOLDER');
    expectRefusal(() => r.h.call(r.keyholders[0].ps, 'approveDisclosure', [requestId, 3n]), 'NOT_KEYHOLDER');
    expect(r.ledger().shares.size()).toBe(0n);
  });

  it('ALREADY_APPROVED: a keyholder cannot approve the same request twice', () => {
    const r = setupRegistry();
    const { n } = offered(r);
    const recordId = r.ledger().pledges.lookup(n).recordId;
    r.auditor.request(recordId, CASE_REF);
    const requestId = pure.requestIdOf(recordId, CASE_REF);
    r.keyholders[1].approve(requestId);
    expectRefusal(() => r.keyholders[1].approve(requestId), 'ALREADY_APPROVED');
    expect(r.ledger().shares.size()).toBe(1n);
  });
});
