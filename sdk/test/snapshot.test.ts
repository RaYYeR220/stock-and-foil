// SPDX-License-Identifier: Apache-2.0
//
// The snapshot codec, which is what lets a browser keep a sandbox world across a reload. The
// things that can silently go wrong here are all type-shaped: a bigint that comes back as a
// number, a byte string that comes back as an object of numbered keys, or a contract state that
// deserializes into something the circuits then refuse to run against. Each one is asserted.
import { pureCircuits } from '@stockandfoil/contract';
import { describe, expect, it } from 'vitest';
import { SimulatorBackend } from '../src/backend/simulator.js';
import { decodeSnapshot, encodeSnapshot } from '../src/backend/snapshot.js';
import { hex } from '../src/bytes.js';
import { generatePersona, generateRegistryKeys, type RegistryKeys } from '../src/crypto/keys.js';
import { DebtorClient, FinancierClient, OperatorClient, SellerClient } from '../src/roles/index.js';
import type { Invoice, StockAndFoilPrivateState } from '../src/types.js';

const DAY = 86_400n;
/** 2026-09-21T00:00:00Z. */
const T0 = 1_790_035_200n;

interface Sandbox {
  keys: RegistryKeys;
  backend: SimulatorBackend;
  debtor: DebtorClient;
  seller: SellerClient;
  financier: FinancierClient;
  invoice: Invoice;
}

const deploy = (keys: RegistryKeys): SimulatorBackend =>
  SimulatorBackend.deploy({ constructorArgs: keys.constructorArgs, operator: keys.operator, now: T0 });

/** A world with one receivable acknowledged, offered and pledged: every ledger map is populated. */
async function sandbox(): Promise<Sandbox> {
  const keys = generateRegistryKeys();
  const backend = deploy(keys);
  const operator = new OperatorClient(backend, keys.operator);
  const debtor = new DebtorClient(backend, generatePersona('debtor'));
  const seller = new SellerClient(backend, generatePersona('seller'));
  const financier = new FinancierClient(backend, generatePersona('financier'));
  await operator.admitDebtor(debtor.leaf);
  await operator.admitFinancier(financier.leaf);
  const invoice = seller.issueInvoice({
    debtorId: debtor.id,
    invoiceNo: 1001n,
    amount: 230_000n,
    dueDate: T0 + 90n * DAY,
    salt: 0x51a17_0001n,
  });
  await debtor.acknowledge(invoice);
  const nullifier = pureCircuits.nullifierOf(invoice);
  await seller.offer(invoice, financier.holderTag(nullifier), T0 + 7n * DAY);
  await financier.accept(nullifier);
  return { keys, backend, debtor, seller, financier, invoice };
}

describe('the snapshot codec', () => {
  it('round-trips bigints and byte strings wherever they appear', () => {
    const value = {
      scalar: 2n ** 200n + 7n,
      zero: 0n,
      bytes: new Uint8Array([0, 1, 0xfe, 0xff]),
      empty: new Uint8Array(0),
      nested: { points: [{ x: 1n, y: 2n ** 64n }], leaves: [new Uint8Array(32).fill(0xc7)] },
      plain: { name: 'Kestrel Components', count: 3, flag: true, missing: null },
    };
    const back = decodeSnapshot<typeof value>(encodeSnapshot(value));

    expect(back.scalar).toBe(2n ** 200n + 7n);
    expect(back.zero).toBe(0n);
    expect(back.bytes).toBeInstanceOf(Uint8Array);
    expect([...back.bytes]).toEqual([0, 1, 0xfe, 0xff]);
    expect(back.empty).toBeInstanceOf(Uint8Array);
    expect(back.empty.length).toBe(0);
    expect(back.nested.points[0]!.y).toBe(2n ** 64n);
    expect(hex(back.nested.leaves[0]!)).toBe(hex(new Uint8Array(32).fill(0xc7)));
    expect(back.plain).toEqual({ name: 'Kestrel Components', count: 3, flag: true, missing: null });
  });

  it('keeps a bigint a bigint rather than a number', () => {
    // 2^53 + 1 is the first integer a double cannot hold: the failure this test exists for is a
    // codec that writes bigints as JSON numbers and silently rounds every field element.
    const big = 9_007_199_254_740_993n;
    const back = decodeSnapshot<{ big: bigint }>(encodeSnapshot({ big }));
    expect(typeof back.big).toBe('bigint');
    expect(back.big).toBe(big);
  });

  it('round-trips the keys and the invoices a sandbox holds', async () => {
    const world = await sandbox();
    const payload = { keys: world.keys, personas: [world.seller.persona], book: [world.invoice] };
    const back = decodeSnapshot<typeof payload>(encodeSnapshot(payload));

    expect(hex(back.keys.operator.secretKey)).toBe(hex(world.keys.operator.secretKey));
    expect(back.keys.auditor.scalar).toBe(world.keys.auditor.scalar);
    expect(back.keys.ceremony.shares.map((s) => s.value)).toEqual(world.keys.ceremony.shares.map((s) => s.value));
    expect(back.keys.constructorArgs.disclosurePk).toEqual(world.keys.constructorArgs.disclosurePk);
    expect(back.book[0]).toEqual(world.invoice);

    // The restored persona still derives the same secrets, which is the whole point of keeping it.
    const persona: StockAndFoilPrivateState = back.personas[0]!;
    const seller = new SellerClient(world.backend, persona);
    expect(seller.id).toBe(world.seller.id);
    expect(hex(pureCircuits.nullifierOf(back.book[0]!))).toBe(hex(pureCircuits.nullifierOf(world.invoice)));
  });

  it('restores a ledger into a registry deployed a second time', async () => {
    const world = await sandbox();
    const before = await world.backend.publicState();
    const text = encodeSnapshot(world.backend.snapshot());

    // What a reload does: the same keys deploy the same registry again, and the stored world is
    // restored on top of it.
    const reloaded = deploy(world.keys);
    expect((await reloaded.publicState()).counts.pledges).toBe(0);
    reloaded.restore(decodeSnapshot(text));

    const after = await reloaded.publicState();
    expect(after).toEqual(before);
    expect(after.counts.pledges).toBe(1);
    expect(await reloaded.now()).toBe(T0);

    // And the restored state is live: a circuit runs against it and the ledger moves on.
    const financier = new FinancierClient(reloaded, world.financier.persona);
    const nullifier = pureCircuits.nullifierOf(world.invoice);
    await financier.release(nullifier);
    expect((await reloaded.publicState()).pledges[0]!.status).toBe('RELEASED');
  });

  it('carries the block time the sandbox was left at', async () => {
    const world = await sandbox();
    world.backend.advanceBy(30n * DAY);
    const reloaded = deploy(world.keys);
    reloaded.restore(decodeSnapshot(encodeSnapshot(world.backend.snapshot())));
    expect(await reloaded.now()).toBe(T0 + 30n * DAY);
  });

  it('throws on anything it did not write, so a host can fall back to a fresh world', async () => {
    const world = await sandbox();
    const text = encodeSnapshot(world.backend.snapshot());
    expect(() => decodeSnapshot('')).toThrow();
    expect(() => decodeSnapshot('{"now":')).toThrow();
    expect(() => decodeSnapshot(text.slice(0, text.length - 40))).toThrow();
    expect(() => decodeSnapshot('{"state":{"#state":"00ff"},"now":{"#bigint":"1"}}')).toThrow();
  });
});
