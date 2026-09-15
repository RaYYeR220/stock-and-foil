// SPDX-License-Identifier: Apache-2.0
//
// Integration against a running Midnight devnet, with real proofs. Skipped unless DEVNET=1,
// so the ordinary suite needs no node, no indexer and no proof server.
//
//   DEVNET=1 DEVNET_SEED=<64-byte hex seed of a funded account> npm run -w sdk test:devnet
//
// Requires a node on :9944, an indexer on :8088 and a proof server on :6300, and the compiled
// proving keys under contract/src/managed/stock-and-foil (run `npm run compile` first).
import { pureCircuits } from '@stockandfoil/contract';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NetworkBackend } from '../src/backend/network.js';
import { createProviders, type RegistryProviders, type WalletAdapter } from '../src/backend/providers.js';
import { generatePersona, generateRegistryKeys, type RegistryKeys } from '../src/crypto/keys.js';
import { Refusal } from '../src/errors.js';
import { DebtorClient, FinancierClient, OperatorClient, SellerClient } from '../src/roles/index.js';
import { findPledge, type Invoice } from '../src/types.js';

const ENABLED = process.env.DEVNET === '1';
const SEED = process.env.DEVNET_SEED ?? '';
const DAY = 86_400n;
const MINUTES = 60_000;

const ZK_PATH = resolve(fileURLToPath(new URL('../../contract/src/managed/stock-and-foil', import.meta.url)));

interface Devnet {
  keys: RegistryKeys;
  backend: NetworkBackend;
  providers: RegistryProviders;
  wallet: { adapter: WalletAdapter; close(): Promise<void> };
  operator: OperatorClient;
  debtor: DebtorClient;
  seller: SellerClient;
  financier: FinancierClient;
  now: bigint;
}

let devnet: Devnet;

describe.skipIf(!ENABLED)('devnet integration', () => {
  beforeAll(async () => {
    if (!SEED) throw new Error('set DEVNET_SEED to the hex seed of a funded undeployed account');
    // Imported lazily: this module is Node-only and must not load during the browser-safe suite.
    const { createHeadlessWallet, levelPrivateState, nodeZkConfigProvider } = await import('../src/backend/node.js');

    const wallet = await createHeadlessWallet({ seedHex: SEED, network: 'undeployed' });
    const providers = createProviders({
      network: 'undeployed',
      wallet: wallet.adapter,
      zkConfigProvider: nodeZkConfigProvider(ZK_PATH),
      privateStateProvider: levelPrivateState({
        path: join(mkdtempSync(join(tmpdir(), 'snf-devnet-')), 'private-state'),
        password: 'Stock-And-Foil-Devnet-Local-2026!',
        accountId: wallet.adapter.getCoinPublicKey(),
      }),
    });

    const keys = generateRegistryKeys();
    const backend = await NetworkBackend.deploy({
      network: 'undeployed',
      providers,
      compiledAssetsPath: ZK_PATH,
      constructorArgs: keys.constructorArgs,
      operator: keys.operator,
    });

    devnet = {
      keys,
      backend,
      providers,
      wallet,
      operator: new OperatorClient(backend, keys.operator),
      debtor: new DebtorClient(backend, generatePersona('debtor')),
      seller: new SellerClient(backend, generatePersona('seller')),
      financier: new FinancierClient(backend, generatePersona('financier')),
      now: await backend.now(),
    };
  }, 10 * MINUTES);

  afterAll(async () => {
    await devnet?.wallet.close();
  }, 2 * MINUTES);

  it('deploys a registry whose sealed configuration reads back through the indexer', async () => {
    expect(devnet.backend.contractAddress).toMatch(/^[0-9a-f]+$/);
    const view = await devnet.backend.publicState();
    expect(view.config.disclosurePk).toEqual(devnet.keys.ceremony.disclosurePk);
    expect(view.config.auditorPk).toEqual(devnet.keys.auditor.publicKey);
    expect(view.config.threshold).toBe(2);
    expect(view.counts).toMatchObject({ debtors: 0, financiers: 0, acks: 0, pledges: 0 });
  });

  it('admits a debtor and a financier with real proofs', async () => {
    const admitDebtor = await devnet.operator.admitDebtor(devnet.debtor.leaf);
    expect(admitDebtor).toMatchObject({ circuit: 'admitDebtor', network: 'undeployed' });
    expect(admitDebtor.txId).toBeTruthy();
    expect(admitDebtor.blockHeight).toBeGreaterThan(0);

    await devnet.operator.admitFinancier(devnet.financier.leaf);
    const view = await devnet.backend.publicState();
    expect(view.counts).toMatchObject({ debtors: 1, financiers: 1 });
  }, 10 * MINUTES);

  it('refuses a forged invoice locally, without submitting anything', async () => {
    const forged: Invoice = devnet.seller.issueInvoice({
      debtorId: devnet.debtor.id,
      invoiceNo: 9999n,
      amount: 500_000n,
      dueDate: devnet.now + 90n * DAY,
    });
    const before = (await devnet.backend.publicState()).counts.pledges;
    const error = await devnet.seller
      .offer(forged, devnet.financier.holderTag(pureCircuits.nullifierOf(forged)), devnet.now + 7n * DAY)
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Refusal).code).toBe('NOT_ACKNOWLEDGED');
    expect((await devnet.backend.publicState()).counts.pledges).toBe(before);
  }, 5 * MINUTES);

  it('acknowledge, offer and accept reach the chain and read back as PLEDGED', async () => {
    const invoice = devnet.seller.issueInvoice({
      debtorId: devnet.debtor.id,
      invoiceNo: 1001n,
      amount: 230_000n,
      dueDate: devnet.now + 90n * DAY,
    });
    const nullifier = pureCircuits.nullifierOf(invoice);

    const acknowledged = await devnet.debtor.acknowledge(invoice);
    expect(acknowledged.txId).toBeTruthy();
    expect((await devnet.backend.publicState()).counts.acks).toBe(1);
    expect(await devnet.backend.pathForAck(pureCircuits.ackLeafOf(invoice))).toBeDefined();

    const expiry = (await devnet.backend.now()) + 7n * DAY;
    const holderTag = devnet.financier.holderTag(nullifier);
    const offered = await devnet.seller.offer(invoice, holderTag, expiry);
    expect(offered.txId).toBeTruthy();

    const afterOffer = await devnet.backend.publicState();
    expect(findPledge(afterOffer, nullifier)).toMatchObject({ status: 'OFFERED', holderTag: String(holderTag) });
    expect(afterOffer.counts.records).toBe(1);
    expect(await devnet.financier.checkEncumbrance(invoice)).toBe('ENCUMBERED');

    const accepted = await devnet.financier.accept(nullifier);
    expect(accepted.txId).toBeTruthy();
    expect(findPledge(await devnet.backend.publicState(), nullifier)?.status).toBe('PLEDGED');
  }, 20 * MINUTES);
});
