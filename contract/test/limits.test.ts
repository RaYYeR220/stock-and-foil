// SPDX-License-Identifier: Apache-2.0
//
// The limits, demonstrated. Each test here reproduces a leak or a griefing vector that the
// registry does **not** prevent, so that `docs/PRIVACY-BOUNDARY.md` and `docs/THREAT-MODEL.md`
// describe behaviour that is checked rather than believed. A test failing here means a
// documented limit changed — reread the docs before changing the test.
import { describe, expect, it } from 'vitest';
import {
  acknowledged,
  DAY,
  hex,
  offered,
  pure,
  sentTo,
  setupRegistry,
  userAddress,
} from './harness.js';
import { randomBytes32, randomScalar } from '../../sdk/src/crypto/scalar.js';
import { PledgeStatus } from '../src/index.js';

const LENDER_REF = new Uint8Array(32).fill(0x1d);

describe('linkability of seller payee tags', () => {
  it('anyone holding a sellerId links every settled-unfinanced pledge of that seller', () => {
    // `payeeTag = H("sellerpayee", sellerId, N)` and N is the public map key, so the tag is
    // testable by anybody who knows `sellerId`. Unlike a holder tag — `H("holder", finSk, N)`,
    // which needs a secret — `sellerId` is a mandatory invoice field: every debtor of the seller
    // holds it, and so does the auditor after any single approved disclosure.
    const r = setupRegistry();
    const mine = [1n, 2n].map((no) => acknowledged(r, { invoiceNo: no, amount: 100n * no }));
    const theirs = acknowledged(r, { seller: r.seller2, debtor: r.debtor2, invoiceNo: 9n, amount: 5n });
    for (const inv of mine) r.debtor.pay(inv);
    r.debtor2.pay(theirs);

    const sellerId = r.seller.id;
    const linked: string[] = [];
    for (const [n, p] of r.ledger().pledges) {
      if (p.payeeTag === pure.sellerPayeeTagOf(sellerId, n)) linked.push(hex(n));
    }
    expect(linked.sort()).toEqual(mine.map((inv) => hex(pure.nullifierOf(inv))).sort());
    expect(linked).toHaveLength(2);
  });

  it('holder tags stay unlinkable: knowing a sellerId says nothing about a financed pledge', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    r.financierA.accept(n);
    r.debtor.pay(inv);
    expect(r.ledger().pledges.lookup(n).payeeTag).not.toBe(pure.sellerPayeeTagOf(r.seller.id, n));
    expect(r.ledger().pledges.lookup(n).payeeTag).toBe(r.financierA.holderTag(n));
  });
});

describe('a guessable lender nonce', () => {
  /** A counter nonce, the shape an integration reaches for without being told not to. */
  const counterNonce = (i: number): Uint8Array => {
    const nonce = new Uint8Array(32);
    nonce[31] = i;
    return nonce;
  };

  it('is recoverable from the public certificate id and then names the borrower', () => {
    const r = setupRegistry();
    const inv = acknowledged(r, { invoiceNo: 1n, amount: 100_000n });
    const n = pure.nullifierOf(inv);
    r.seller.certify([{ invoice: inv, holderTag: r.financierA.holderTag(n) }], {
      lenderRef: LENDER_REF,
      lenderNonce: counterNonce(7),
      floor: 100_000n,
      validUntil: r.now + 30n * DAY,
    });
    const certId = pure.certIdOf(LENDER_REF, counterNonce(7));
    const cert = r.ledger().certificates.lookup(certId);

    // The observer has only the ledger: certId (the map key) and cert.lenderRef.
    let recovered: Uint8Array | undefined;
    for (let i = 0; i < 256 && !recovered; i += 1) {
      if (hex(pure.certIdOf(cert.lenderRef, counterNonce(i))) === hex(certId)) recovered = counterNonce(i);
    }
    expect(recovered).toBeDefined();
    // With the nonce, `borrowerCommit` is a test, not a commitment: any candidate sellerId
    // confirms or excludes the borrower.
    expect(hex(pure.borrowerCommitOf(r.seller.id, recovered!))).toBe(hex(cert.borrowerCommit));
    expect(hex(pure.borrowerCommitOf(r.seller2.id, recovered!))).not.toBe(hex(cert.borrowerCommit));
  });

  it('lets a stranger burn the certificate id before the borrower uses it', () => {
    const r = setupRegistry();
    const mine = acknowledged(r, { invoiceNo: 1n, amount: 100_000n });
    const squatted = acknowledged(r, { seller: r.seller2, debtor: r.debtor2, invoiceNo: 1n, amount: 1n });
    const options = { lenderRef: LENDER_REF, lenderNonce: counterNonce(7), floor: 0n, validUntil: r.now + 30n * DAY };

    // A different seller registers the guessed id first, with an invoice of their own.
    r.seller2.certify(
      [{ invoice: squatted, holderTag: r.financierB.holderTag(pure.nullifierOf(squatted)) }],
      options,
    );
    expect(() =>
      r.seller.certify([{ invoice: mine, holderTag: r.financierA.holderTag(pure.nullifierOf(mine)) }], options),
    ).toThrow(/DUPLICATE_CERTIFICATE/);
    // A 32-byte random nonce has no such neighbourhood to search.
    r.seller.certify([{ invoice: mine, holderTag: r.financierA.holderTag(pure.nullifierOf(mine)) }], {
      ...options,
      lenderNonce: randomBytes32(),
    });
    expect(r.ledger().certificates.size()).toBe(2n);
  });
});

describe('a reused sealing scalar', () => {
  it('lets a passive observer read off which fields two records share', () => {
    // ct_j = field_j + maskOf(e·disclosurePk, j). One e means one set of masks, so subtracting
    // two ciphertexts cancels them. No key is needed and the contract cannot see it: the scalar
    // is a witness and freshness is not a provable property. Only `E` being repeated gives it away.
    const r = setupRegistry();
    const a = acknowledged(r, { invoiceNo: 1n, amount: 10n });
    const b = acknowledged(r, { invoiceNo: 2n, amount: 20n });
    const e = randomScalar();
    const na = pure.nullifierOf(a);
    const nb = pure.nullifierOf(b);
    r.seller.offer(a, r.financierA.holderTag(na), r.now + 7n * DAY, { ephemeral: e });
    r.seller.offer(b, r.financierA.holderTag(nb), r.now + 7n * DAY, { ephemeral: e });

    const L = r.ledger();
    const ra = L.records.lookup(L.pledges.lookup(na).recordId);
    const rb = L.records.lookup(L.pledges.lookup(nb).recordId);
    expect(ra.E).toEqual(rb.E);
    expect(ra.ct[0]).toBe(rb.ct[0]); // same debtor
    expect(ra.ct[1]).toBe(rb.ct[1]); // same seller
    expect(ra.ct[2]).not.toBe(rb.ct[2]); // different number, amount and due date

    // A fresh scalar per record leaks none of it.
    const c = acknowledged(r, { invoiceNo: 3n, amount: 10n });
    const nc = pure.nullifierOf(c);
    r.seller.offer(c, r.financierA.holderTag(nc), r.now + 7n * DAY, { ephemeral: randomScalar() });
    const rc = r.ledger().records.lookup(r.ledger().pledges.lookup(nc).recordId);
    expect(rc.E).not.toEqual(ra.E);
    expect(rc.ct[0]).not.toBe(ra.ct[0]);
  });

  it('overwrites the earlier record of the same receivable: records are not append-only', () => {
    // recordId = H("record", N, E). Re-offering the same receivable with the same scalar lands on
    // the same ledger key, and `records.insert` replaces what was there — erasing the evidence of
    // the earlier offer, including a record an auditor has an open request against.
    const r = setupRegistry();
    const inv = acknowledged(r);
    const n = pure.nullifierOf(inv);
    const e = randomScalar();
    r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY, { ephemeral: e });
    const recordId = r.ledger().pledges.lookup(n).recordId;
    const before = [...r.ledger().records.lookup(recordId).ct];

    r.financierA.accept(n);
    r.financierA.release(n);
    r.seller.offer(inv, r.financierB.holderTag(n), r.now + 7n * DAY, { ephemeral: e });

    expect(hex(r.ledger().pledges.lookup(n).recordId)).toBe(hex(recordId));
    expect(r.ledger().records.size()).toBe(1n);
    expect([...r.ledger().records.lookup(recordId).ct]).not.toEqual(before);

    // A fresh scalar keeps both, which is what the design assumes.
    r.financierB.accept(n);
    r.financierB.release(n);
    r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY, { ephemeral: randomScalar() });
    expect(r.ledger().records.size()).toBe(2n);
  });
});

describe('shared capacity', () => {
  it('one admitted debtor can spend ack-tree leaves on invoices no seller ever issued', () => {
    // `acknowledge` needs only the debtor's own key and an invoice naming them; the sellerId can
    // be invented. The tree is depth 16 = 65,536 leaves for the whole registry and it is never
    // pruned, so the capacity is a shared resource any single admitted debtor can consume.
    const r = setupRegistry();
    for (let i = 0; i < 25; i += 1) {
      r.debtor.acknowledge({
        debtorId: r.debtor.id,
        sellerId: BigInt(i) + 1_000_000n,
        invoiceNo: BigInt(i),
        amount: 1n,
        dueDate: r.now + 30n * DAY,
        salt: BigInt(i),
      });
    }
    expect(r.ledger().acks.firstFree()).toBe(25n);
    expect(r.ledger().ackNullifiers.size()).toBe(25n);
  });
});

describe('settlement is transparent', () => {
  it('claiming twice to one address clusters a financier’s book under it', () => {
    // Holder tags are per pledge and unlinkable, but a claim pays a plain unshielded address
    // against a public nullifier. Reusing the address links the pledges to each other and to the
    // financier's real-world wallet — the one place the tag scheme can be undone for free.
    const r = setupRegistry();
    const wallet = userAddress(0xa1);
    const claimed: string[] = [];
    for (const invoiceNo of [1n, 2n]) {
      const inv = acknowledged(r, { invoiceNo, amount: 1_000n * invoiceNo });
      const n = pure.nullifierOf(inv);
      r.seller.offer(inv, r.financierA.holderTag(n), r.now + 7n * DAY);
      r.financierA.accept(n);
      r.debtor.pay(inv);
      const receipt = r.financierA.claim(n, wallet);
      expect(sentTo(receipt, wallet)).toBe(inv.amount);
      claimed.push(hex(n));
      expect(r.ledger().pledges.lookup(n).status).toBe(PledgeStatus.SETTLED);
    }
    // The two nullifiers are unrelated on the ledger; only the shared payout address joins them.
    expect(claimed).toHaveLength(2);
    expect(claimed[0]).not.toBe(claimed[1]);
  });
});
