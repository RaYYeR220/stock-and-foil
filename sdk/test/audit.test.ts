// SPDX-License-Identifier: Apache-2.0
//
// Checks a third party can run against a live registry. Two registry guarantees are not enforced
// by a circuit and so have to be observable instead — a record is only secret if its sealing
// scalar was fresh, and a decryption share is bound to a record rather than to the request that
// asked for it — and a disclosure has to prove itself even when no pledge still points at the
// record it opened.
import { pureCircuits } from '@stockandfoil/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { openableRecords, recordDisclosureState, reusedSealingKeys } from '../src/audit.js';
import { hex } from '../src/bytes.js';
import { SimulatorBackend } from '../src/backend/simulator.js';
import { generatePersona, generateRegistryKeys, verifyRegistryConfig, type RegistryKeys } from '../src/crypto/keys.js';
import { randomScalar } from '../src/crypto/scalar.js';
import {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  SellerClient,
} from '../src/roles/index.js';
import { findPledge, findRecord, type Invoice } from '../src/types.js';

const DAY = 86_400n;
const T0 = 1_790_035_200n;
const CASE_REF = new Uint8Array(32).fill(0xc7);

interface World {
  keys: RegistryKeys;
  backend: SimulatorBackend;
  debtor: DebtorClient;
  seller: SellerClient;
  financierA: FinancierClient;
  financierB: FinancierClient;
  auditor: AuditorClient;
  keyholders: KeyholderClient[];
}

async function setup(): Promise<World> {
  const keys = generateRegistryKeys();
  const backend = SimulatorBackend.deploy({ constructorArgs: keys.constructorArgs, operator: keys.operator, now: T0 });
  const operator = new OperatorClient(backend, keys.operator);
  const w: World = {
    keys,
    backend,
    debtor: new DebtorClient(backend, generatePersona('debtor')),
    seller: new SellerClient(backend, generatePersona('seller')),
    financierA: new FinancierClient(backend, generatePersona('financier')),
    financierB: new FinancierClient(backend, generatePersona('financier')),
    auditor: new AuditorClient(backend, keys.auditor.persona),
    keyholders: keys.keyholders.map((p, i) => new KeyholderClient(backend, p, i as 0 | 1 | 2)),
  };
  await operator.admitDebtor(w.debtor.leaf);
  await operator.admitFinancier(w.financierA.leaf);
  await operator.admitFinancier(w.financierB.leaf);
  return w;
}

let w: World;
beforeEach(async () => {
  w = await setup();
});

const invoiceOf = (invoiceNo: bigint, amount: bigint): Invoice =>
  w.seller.issueInvoice({ debtorId: w.debtor.id, invoiceNo, amount, dueDate: T0 + 90n * DAY });

describe('verifying a registry from its public state', () => {
  it('a deployed registry reports a sound ceremony', async () => {
    const view = await w.backend.publicState();
    expect(verifyRegistryConfig(view.config)).toEqual({ ok: true, problems: [] });
    expect(view.config.threshold).toBe(2);
  });
});

describe('a disclosure of a superseded record', () => {
  it('verifies against the record’s own ledger key, with no pledge pointing at it', async () => {
    // A re-offer moves the pledge to a fresh record and leaves the earlier one unreferenced.
    // Those are the records an insolvency case opens, so verification cannot depend on a live
    // pledge: the binding is recordId = H("record", N, E) recomputed from the plaintext.
    const inv = invoiceOf(1n, 230_000n);
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);

    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    const firstRecordId = findPledge(await w.backend.publicState(), n)!.recordId;
    await w.financierA.accept(n);
    await w.financierA.release(n);
    await w.seller.offer(inv, w.financierB.holderTag(n), T0 + 14n * DAY);
    const liveRecordId = findPledge(await w.backend.publicState(), n)!.recordId;
    expect(liveRecordId).not.toBe(firstRecordId);

    await w.auditor.request(firstRecordId, CASE_REF);
    const requestId = w.auditor.requestIdOf(firstRecordId, CASE_REF);
    await w.keyholders[0]!.approve(requestId);
    await w.keyholders[1]!.approve(requestId);

    const opened = await w.auditor.open(requestId);
    expect(opened.invoice).toEqual(inv);
    expect(opened.holderTag).toBe(w.financierA.holderTag(n));
    expect(opened.verified).toBe(true);
    expect(opened.recordIdMatches).toBe(true);
    expect(opened.nullifier).toBe(hex(n));

    const record = findRecord(await w.backend.publicState(), firstRecordId)!;
    expect(hex(pureCircuits.recordIdOf(pureCircuits.nullifierOf(opened.invoice), record.E))).toBe(firstRecordId);
  });

  it('still refuses a record that only one keyholder approved', async () => {
    const inv = invoiceOf(2n, 1_000n);
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    const recordId = findPledge(await w.backend.publicState(), n)!.recordId;
    await w.auditor.request(recordId, CASE_REF);
    const requestId = w.auditor.requestIdOf(recordId, CASE_REF);
    await w.keyholders[2]!.approve(requestId);

    const opened = await w.auditor.open(requestId);
    expect(opened.verified).toBe(false);
    expect(opened.invoice).not.toEqual(inv);
  });
});

describe('record-level disclosure accounting', () => {
  it('counts approvals across every request that names a record, not per request', async () => {
    const inv = invoiceOf(3n, 50_000n);
    await w.debtor.acknowledge(inv);
    const n = pureCircuits.nullifierOf(inv);
    await w.seller.offer(inv, w.financierA.holderTag(n), T0 + 7n * DAY);
    const recordId = findPledge(await w.backend.publicState(), n)!.recordId;

    const caseA = new Uint8Array(32).fill(0xa1);
    const caseB = new Uint8Array(32).fill(0xb2);
    await w.auditor.request(recordId, caseA);
    await w.auditor.request(recordId, caseB);
    await w.keyholders[0]!.approve(w.auditor.requestIdOf(recordId, caseA));

    let view = await w.backend.publicState();
    expect(recordDisclosureState(view, recordId)).toMatchObject({ approvals: 1, openable: false });
    expect(openableRecords(view)).toHaveLength(0);

    await w.keyholders[1]!.approve(w.auditor.requestIdOf(recordId, caseB));
    view = await w.backend.publicState();
    const state = recordDisclosureState(view, recordId);
    // Neither request shows two approvals, yet the auditor now holds two independent shares.
    expect(view.requests.map((r) => r.approvals.filter(Boolean).length)).toEqual([1, 1]);
    expect(state).toMatchObject({ approvals: 2, openable: true, approvedSlots: [true, true, false] });
    expect(state.requests).toHaveLength(2);
    expect(openableRecords(view).map((s) => s.recordId)).toEqual([recordId]);
  });

  it('reports nothing for a record no request names', async () => {
    const view = await w.backend.publicState();
    expect(recordDisclosureState(view, new Uint8Array(32))).toMatchObject({ approvals: 0, openable: false });
  });
});

describe('detecting a reused sealing scalar', () => {
  it('finds records that share an ephemeral point, and reports none when every scalar is fresh', async () => {
    const a = invoiceOf(4n, 10n);
    const b = invoiceOf(5n, 20n);
    for (const inv of [a, b]) await w.debtor.acknowledge(inv);
    const na = pureCircuits.nullifierOf(a);
    const nb = pureCircuits.nullifierOf(b);

    await w.seller.offer(a, w.financierA.holderTag(na), T0 + 7n * DAY);
    await w.seller.offer(b, w.financierA.holderTag(nb), T0 + 7n * DAY);
    expect(reusedSealingKeys(await w.backend.publicState())).toEqual([]);

    // A caller that pins its own scalar republishes the same ephemeral point, which cancels the
    // masks: subtracting the two ciphertexts shows which fields the records share.
    const c = invoiceOf(6n, 10n);
    await w.debtor.acknowledge(c);
    const nc = pureCircuits.nullifierOf(c);
    const reused = randomScalar();
    await w.seller.offer(c, w.financierA.holderTag(nc), T0 + 7n * DAY, { ephemeral: reused });
    const d = invoiceOf(7n, 30n);
    await w.debtor.acknowledge(d);
    const nd = pureCircuits.nullifierOf(d);
    await w.seller.offer(d, w.financierA.holderTag(nd), T0 + 7n * DAY, { ephemeral: reused });

    const view = await w.backend.publicState();
    const found = reusedSealingKeys(view);
    expect(found).toHaveLength(1);
    expect(found[0]!.recordIds).toHaveLength(2);
    const [x, y] = found[0]!.recordIds.map((id) => findRecord(view, id)!);
    expect(x!.ct[0]).toBe(y!.ct[0]); // same debtor, visible without any key
    expect(x!.ct[1]).toBe(y!.ct[1]); // same seller
  });
});

describe('lender nonces', () => {
  it('a lender issues 32 unpredictable bytes, and the seller refuses anything else', async () => {
    const nonce = w.financierA.newLenderNonce();
    expect(nonce).toHaveLength(32);
    expect(hex(nonce)).not.toBe('0'.repeat(64));
    expect(hex(w.financierA.newLenderNonce())).not.toBe(hex(nonce));

    const inv = invoiceOf(8n, 100_000n);
    await w.debtor.acknowledge(inv);
    const slots = [{ invoice: inv, holderTag: w.financierA.holderTag(pureCircuits.nullifierOf(inv)) }];
    const base = { lenderRef: new Uint8Array(32).fill(0x1d), floor: 0n, validUntil: T0 + 30n * DAY };
    expect(() => w.seller.certify(slots, { ...base, lenderNonce: new Uint8Array(8) })).toThrow(
      /lenderNonce must be 32 bytes/,
    );
    expect(() => w.seller.certify(slots, { ...base, lenderRef: new Uint8Array(4), lenderNonce: nonce })).toThrow(
      /lenderRef must be 32 bytes/,
    );
    await w.seller.certify(slots, { ...base, lenderNonce: nonce });
    expect((await w.backend.publicState()).counts.certificates).toBe(1);
  });
});
