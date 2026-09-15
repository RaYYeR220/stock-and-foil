// SPDX-License-Identifier: Apache-2.0
//
// The guided First Brands replay, run through the role clients on the in-process backend.
// Everything here is the product's claim written down: the three frauds are refused while the
// transaction is being built, proceeds reach the financier who funded the invoice, and a sealed
// record only opens once two of three keyholders have approved on the ledger.
import { pureCircuits } from '@stockandfoil/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { hex, userAddress } from '../src/bytes.js';
import { SimulatorBackend } from '../src/backend/simulator.js';
import { generatePersona, generateRegistryKeys, type RegistryKeys } from '../src/crypto/keys.js';
import { Refusal, refusalCodeOf, type RefusalCode } from '../src/errors.js';
import {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  SellerClient,
} from '../src/roles/index.js';
import { encumbranceOf, findPledge, type Invoice } from '../src/types.js';

const DAY = 86_400n;
/** 2026-09-21T00:00:00Z. */
const T0 = 1_790_035_200n;
const CASE_REF = new Uint8Array(32).fill(0xc7);
const LENDER_REF = new Uint8Array(32).fill(0x1d);
const LENDER_NONCE = new Uint8Array(32).fill(0x2e);

/** Asserts a call is refused with exactly `code`, and that nothing else went wrong. */
async function expectRefusal(promise: Promise<unknown>, code: RefusalCode, circuit?: string): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof Refusal)) {
    throw new Error(`expected ${code}, got ${error === undefined ? 'success' : String(error)}`);
  }
  expect(error.code).toBe(code);
  if (circuit) expect(error.circuit).toBe(circuit);
  return error;
}

interface World {
  keys: RegistryKeys;
  backend: SimulatorBackend;
  operator: OperatorClient;
  debtor: DebtorClient;
  seller: SellerClient;
  financierA: FinancierClient;
  financierB: FinancierClient;
  auditor: AuditorClient;
  keyholders: [KeyholderClient, KeyholderClient, KeyholderClient];
}

async function setup(): Promise<World> {
  const keys = generateRegistryKeys();
  const backend = SimulatorBackend.deploy({
    constructorArgs: keys.constructorArgs,
    operator: keys.operator,
    now: T0,
  });
  const world: World = {
    keys,
    backend,
    operator: new OperatorClient(backend, keys.operator),
    debtor: new DebtorClient(backend, generatePersona('debtor')),
    seller: new SellerClient(backend, generatePersona('seller')),
    financierA: new FinancierClient(backend, generatePersona('financier')),
    financierB: new FinancierClient(backend, generatePersona('financier')),
    auditor: new AuditorClient(backend, keys.auditor.persona),
    keyholders: keys.keyholders.map((p, i) => new KeyholderClient(backend, p, i as 0 | 1 | 2)) as World['keyholders'],
  };
  await world.operator.admitDebtor(world.debtor.leaf);
  await world.operator.admitFinancier(world.financierA.leaf);
  await world.operator.admitFinancier(world.financierB.leaf);
  return world;
}

const invoiceOf = (w: World, o: { invoiceNo: bigint; amount: bigint; dueDays?: bigint }): Invoice =>
  w.seller.issueInvoice({
    debtorId: w.debtor.id,
    invoiceNo: o.invoiceNo,
    amount: o.amount,
    dueDate: T0 + (o.dueDays ?? 90n) * DAY,
  });

let w: World;
beforeEach(async () => {
  w = await setup();
});

describe('guided replay: admission, acknowledgment and the first pledge', () => {
  it('admits participants and reports them in the public view', async () => {
    const view = await w.backend.publicState();
    expect(view.counts).toMatchObject({ debtors: 1, financiers: 2, acks: 0, pledges: 0 });
    expect(view.config.operatorId).toBe(hex(pureCircuits.operatorIdOf(w.keys.operator.secretKey)));
    expect(view.config.threshold).toBe(2);
  });

  it('a stranger cannot admit anyone', async () => {
    const impostor = new OperatorClient(w.backend, generatePersona('operator'));
    await expectRefusal(impostor.admitDebtor(w.debtor.leaf), 'NOT_OPERATOR', 'admitDebtor');
    expect((await w.backend.publicState()).counts.debtors).toBe(1);
  });

  it('debtor acknowledges, seller offers, financier A accepts', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 230_000n });
    const ack = await w.debtor.acknowledge(inv);
    expect(ack).toMatchObject({ circuit: 'acknowledge', network: 'simulator' });
    expect(ack.durationMs).toBeGreaterThanOrEqual(0);

    const n = pureCircuits.nullifierOf(inv);
    expect(await w.financierA.checkEncumbrance(inv)).toBe('FREE');

    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    expect(findPledge(await w.backend.publicState(), n)).toMatchObject({
      status: 'OFFERED',
      holderTag: String(w.financierA.holderTag(n)),
      expiry: T0 + 7n * DAY,
      claimed: false,
    });

    await w.financierA.accept(n);
    expect(findPledge(await w.backend.publicState(), n)?.status).toBe('PLEDGED');
    expect(await w.financierA.checkEncumbrance(inv)).toBe('ENCUMBERED');
    expect(await w.financierB.checkEncumbrance(inv)).toBe('ENCUMBERED');
  });
});

describe('guided replay: the three First Brands frauds', () => {
  let inv: Invoice;
  let n: Uint8Array;

  beforeEach(async () => {
    inv = invoiceOf(w, { invoiceNo: 1001n, amount: 230_000n });
    await w.debtor.acknowledge(inv);
    n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    await w.financierA.accept(n);
  });

  it('fraud 1 — forged: an invoice the debtor never owed is refused', async () => {
    const forged = invoiceOf(w, { invoiceNo: 9999n, amount: 500_000n });
    const tag = w.financierB.holderTag(pureCircuits.nullifierOf(forged));
    await expectRefusal(w.seller.offer(forged, tag, T0 + 7n * DAY), 'NOT_ACKNOWLEDGED', 'offer');
    expect((await w.backend.publicState()).counts.pledges).toBe(1);
  });

  it('fraud 2 — inflated: the acknowledged invoice cannot be re-priced upwards', async () => {
    const inflated = { ...inv, amount: 2_300_000n };
    const tag = w.financierB.holderTag(pureCircuits.nullifierOf(inflated));
    await expectRefusal(w.seller.offer(inflated, tag, T0 + 7n * DAY), 'NOT_ACKNOWLEDGED', 'offer');
  });

  it('fraud 3 — double pledge: financier B is refused, and learns nothing else', async () => {
    const refusal = await expectRefusal(
      w.seller.offer(inv, w.financierB.holderTag(n), T0 + 7n * DAY),
      'ALREADY_ENCUMBERED',
      'offer',
    );
    expect(refusal.message).toMatch(/already pledged/i);
    const view = await w.backend.publicState();
    expect(view.counts.records).toBe(1);
    expect(findPledge(view, n)?.holderTag).toBe(String(w.financierA.holderTag(n)));
  });

  it('a financier who learned the invoice during diligence cannot pledge it either', async () => {
    const thief = new SellerClient(w.backend, { ...w.financierB.persona, role: 'seller' });
    await expectRefusal(
      thief.offer(inv, w.financierB.holderTag(n), T0 + 7n * DAY),
      'NOT_INVOICE_OWNER',
      'offer',
    );
  });

  it('refusals carry their code through the cause chain of a wrapped error', () => {
    const wrapped = new Error('Unexpected error executing scoped transaction', {
      cause: new Error('failed assert: ALREADY_ENCUMBERED'),
    });
    expect(refusalCodeOf(wrapped)).toBe('ALREADY_ENCUMBERED');
    expect(refusalCodeOf(new Error('network unreachable'))).toBeUndefined();
  });
});

describe('guided replay: release, re-offer, settlement and claim', () => {
  it('A releases, B takes the pledge, the debtor pays and B claims the proceeds', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 230_000n });
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    await w.financierA.accept(n);

    await w.financierA.release(n);
    expect(findPledge(await w.backend.publicState(), n)?.status).toBe('RELEASED');
    expect(await w.financierB.checkEncumbrance(inv)).toBe('FREE');

    await w.seller.offer(inv, w.financierB.holderTag(n), T0 + 7n * DAY);
    await w.financierB.accept(n);
    expect(findPledge(await w.backend.publicState(), n)?.status).toBe('PLEDGED');

    const paid = await w.debtor.pay(inv);
    expect(paid.unshielded?.received).toBe(inv.amount);
    const settled = findPledge(await w.backend.publicState(), n);
    expect(settled).toMatchObject({ status: 'SETTLED', amount: inv.amount, claimed: false });
    expect(settled?.payeeTag).toBe(String(w.financierB.holderTag(n)));

    await expectRefusal(w.seller.claim(n, userAddress(new Uint8Array(32).fill(0x5e))), 'NOT_PAYEE', 'claimAsSeller');
    await expectRefusal(w.financierA.claim(n, userAddress(new Uint8Array(32).fill(0xa1))), 'NOT_PAYEE', 'claimAsHolder');

    const claim = await w.financierB.claim(n, userAddress(new Uint8Array(32).fill(0xb2)));
    expect(claim.unshielded?.sent).toBe(inv.amount);
    expect(findPledge(await w.backend.publicState(), n)?.claimed).toBe(true);
    await expectRefusal(
      w.financierB.claim(n, userAddress(new Uint8Array(32).fill(0xb2))),
      'ALREADY_CLAIMED',
      'claimAsHolder',
    );
    expect(await w.financierB.checkEncumbrance(inv)).toBe('SETTLED');
  });

  it('an unaccepted offer expires and the invoice becomes free again', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1002n, amount: 45_000n });
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    expect(await w.financierA.checkEncumbrance(inv)).toBe('ENCUMBERED');

    w.backend.advanceTo(T0 + 8n * DAY);
    expect(await w.backend.now()).toBe(T0 + 8n * DAY);
    await expectRefusal(w.financierA.accept(n), 'OFFER_EXPIRED', 'accept');
    expect(await w.financierA.checkEncumbrance(inv)).toBe('FREE');

    await w.seller.offer(inv, w.financierB.holderTag(n), T0 + 15n * DAY);
    await w.financierB.accept(n);
    expect(findPledge(await w.backend.publicState(), n)?.status).toBe('PLEDGED');
  });
});

describe('guided replay: borrowing-base certificate', () => {
  async function pool(amounts: bigint[]) {
    const slots = [];
    for (const [k, amount] of amounts.entries()) {
      const invoice = invoiceOf(w, { invoiceNo: BigInt(2000 + k), amount });
      await w.debtor.acknowledge(invoice);
      slots.push({ invoice, holderTag: w.financierA.holderTag(pureCircuits.nullifierOf(invoice)) });
    }
    return slots;
  }

  it('locks three invoices to one lender over a proved floor, and the lender accepts them', async () => {
    const slots = await pool([100_000n, 200_000n, 300_000n]);
    const receipt = await w.seller.certify(slots, {
      lenderRef: LENDER_REF,
      lenderNonce: LENDER_NONCE,
      floor: 500_000n,
      validUntil: T0 + 30n * DAY,
    });
    expect(receipt.circuit).toBe('certifyBorrowingBase');

    const view = await w.backend.publicState();
    const cert = view.certificates[0]!;
    expect(view.counts.certificates).toBe(1);
    expect(cert).toMatchObject({ count: 3, floor: 500_000n, validUntil: T0 + 30n * DAY });
    expect(cert.certId).toBe(hex(pureCircuits.certIdOf(LENDER_REF, LENDER_NONCE)));
    expect(cert.lenderRef).toBe(hex(LENDER_REF));
    expect(cert.borrowerCommit).toBe(hex(pureCircuits.borrowerCommitOf(w.seller.id, LENDER_NONCE)));
    expect(cert.nullifiers).toHaveLength(3);

    for (const slot of slots) {
      const n = pureCircuits.nullifierOf(slot.invoice);
      expect(findPledge(view, n)).toMatchObject({ status: 'OFFERED', expiry: T0 + 30n * DAY });
      await w.financierA.accept(n);
    }
    const after = await w.backend.publicState();
    for (const slot of slots) {
      expect(findPledge(after, pureCircuits.nullifierOf(slot.invoice))?.status).toBe('PLEDGED');
    }
  });

  it('BELOW_FLOOR: a pool worth less than the floor it claims is refused, and locks nothing', async () => {
    const slots = await pool([100_000n, 200_000n]);
    await expectRefusal(
      w.seller.certify(slots, {
        lenderRef: LENDER_REF,
        lenderNonce: LENDER_NONCE,
        floor: 500_000n,
        validUntil: T0 + 30n * DAY,
      }),
      'BELOW_FLOOR',
      'certifyBorrowingBase',
    );
    const view = await w.backend.publicState();
    expect(view.counts.pledges).toBe(0);
    expect(view.counts.certificates).toBe(0);
  });

  it('EMPTY_POOL and DUPLICATE_INVOICE are refused before anything is locked', async () => {
    const slots = await pool([100_000n]);
    await expectRefusal(
      w.seller.certify([], { lenderRef: LENDER_REF, lenderNonce: LENDER_NONCE, floor: 0n, validUntil: T0 + 30n * DAY }),
      'EMPTY_POOL',
    );
    await expectRefusal(
      w.seller.certify([slots[0]!, slots[0]!], {
        lenderRef: LENDER_REF,
        lenderNonce: LENDER_NONCE,
        floor: 0n,
        validUntil: T0 + 30n * DAY,
      }),
      'DUPLICATE_INVOICE',
    );
  });
});

describe('guided replay: threshold disclosure', () => {
  async function requested() {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 230_000n });
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);
    const holderTag = w.financierA.holderTag(n);
    await w.seller.offer(inv, holderTag, T0 + 7n * DAY);
    await w.financierA.accept(n);
    const recordId = findPledge(await w.backend.publicState(), n)!.recordId;
    await w.auditor.request(recordId, CASE_REF);
    return { inv, n, holderTag, recordId, requestId: w.auditor.requestIdOf(recordId, CASE_REF) };
  }

  it('two of three keyholders approve and the record opens and verifies itself', async () => {
    const { inv, n, holderTag, recordId, requestId } = await requested();
    expect((await w.backend.publicState()).requests[0]).toMatchObject({
      recordId,
      caseRef: hex(CASE_REF),
      approvals: [false, false, false],
    });

    await w.keyholders[0].approve(requestId);
    await w.keyholders[2].approve(requestId);
    const view = await w.backend.publicState();
    expect(view.requests[0]!.approvals).toEqual([true, false, true]);
    expect(view.counts.shares).toBe(2);

    const opened = await w.auditor.open(requestId);
    expect(opened.verified).toBe(true);
    expect(opened.invoice).toEqual(inv);
    expect(opened.holderTag).toBe(holderTag);
    expect(opened.nullifier).toBe(hex(n));
    expect(opened.indices).toEqual([1, 3]);
    expect(opened.recordIdMatches).toBe(true);
  });

  it('a single approval is not enough: the record does not open and does not verify', async () => {
    const { inv, requestId } = await requested();
    await w.keyholders[1].approve(requestId);
    const opened = await w.auditor.open(requestId);
    expect(opened.verified).toBe(false);
    expect(opened.invoice).not.toEqual(inv);
    expect(opened.indices).toEqual([2]);
  });

  it('only the auditor may request, and only a keyholder may approve in its own slot', async () => {
    const { recordId, requestId } = await requested();
    const impostor = new AuditorClient(w.backend, generatePersona('auditor'));
    await expectRefusal(impostor.request(recordId, CASE_REF), 'NOT_AUDITOR', 'requestDisclosure');
    await expectRefusal(w.auditor.request(recordId, CASE_REF), 'DUPLICATE_REQUEST', 'requestDisclosure');

    const stranger = new KeyholderClient(w.backend, generatePersona('keyholder'), 0);
    await expectRefusal(stranger.approve(requestId), 'NOT_KEYHOLDER', 'approveDisclosure');
    const wrongSlot = new KeyholderClient(w.backend, w.keys.keyholders[0], 1);
    await expectRefusal(wrongSlot.approve(requestId), 'NOT_KEYHOLDER', 'approveDisclosure');

    await w.keyholders[0].approve(requestId);
    await expectRefusal(w.keyholders[0].approve(requestId), 'ALREADY_APPROVED', 'approveDisclosure');
  });
});

describe('simulator world control', () => {
  it('restores the whole world from a snapshot, ledger and clock alike', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 230_000n });
    await w.debtor.acknowledge(inv);
    const snapshot = w.backend.snapshot();

    const n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    await w.financierA.accept(n);
    w.backend.advanceTo(T0 + 3n * DAY);
    expect((await w.backend.publicState()).counts.pledges).toBe(1);

    w.backend.restore(snapshot);
    const view = await w.backend.publicState();
    expect(view.counts).toMatchObject({ acks: 1, pledges: 0, records: 0 });
    expect(await w.backend.now()).toBe(T0);
    expect(encumbranceOf(findPledge(view, n), T0)).toBe('FREE');

    await w.seller.offer(inv, w.financierB.holderTag(n), T0 + 7n * DAY);
    expect(findPledge(await w.backend.publicState(), n)?.holderTag).toBe(String(w.financierB.holderTag(n)));
  });

  it('resets to the state right after deployment', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 1n });
    await w.debtor.acknowledge(inv);
    w.backend.advanceTo(T0 + 100n * DAY);
    w.backend.reset();
    const view = await w.backend.publicState();
    expect(view.counts).toMatchObject({ debtors: 0, financiers: 0, acks: 0 });
    expect(await w.backend.now()).toBe(T0);
  });

  it('exposes Merkle paths for both member trees and the ack tree', async () => {
    const inv = invoiceOf(w, { invoiceNo: 1001n, amount: 1n });
    await w.debtor.acknowledge(inv);
    expect(await w.backend.pathForAck(pureCircuits.ackLeafOf(inv))).toBeDefined();
    expect(await w.backend.pathForMember('debtors', w.debtor.leaf)).toBeDefined();
    expect(await w.backend.pathForMember('financiers', w.debtor.leaf)).toBeUndefined();
  });
});
