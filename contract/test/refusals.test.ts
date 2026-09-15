// SPDX-License-Identifier: Apache-2.0
//
// Adversarial suite: every refusal code the contract can emit, one scenario per code.
import { describe, expect, it } from 'vitest';
import { DAY, Debtor, deployRegistry, expectRefusal, Operator, setupRegistry } from './harness.js';
import { randomBytes32 } from '../../sdk/src/crypto/scalar.js';

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
      () => asDebtor.acknowledge(inv, { paths: { [Buffer.from(asDebtor.leaf).toString('hex')]: finPath } }),
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
