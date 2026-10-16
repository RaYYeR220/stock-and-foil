// SPDX-License-Identifier: Apache-2.0
//
// The cross-registry run: two independent registries on one network, and the question a lender
// puts to both of them.
//
//   npm run -w cli ceremony   -- --network preview --instance b
//   npm run -w cli deploy     -- --network preview --instance b
//   npm run -w cli federation -- --network preview --peer-instance b
//
// The standing objection to an encumbrance registry is that it only works once every competing
// financier has joined the same one, which is a consortium sale a startup cannot make. The
// answer is a property of the marker, not of the business development: a pledge marker is
// `H("pledge", fingerprint)` and the fingerprint is a function of the invoice and its parties
// alone — no registry identity, no operator key, no deployment salt. The same receivable
// therefore has the same marker in every Stock & Foil registry, and one lender can ask all of
// them without any of them federating, sharing state or agreeing to anything.
//
// This command stops that being an argument. It uses two genuinely separate deployments — two
// ceremonies, two operators, two sets of keyholders — declares each as the other's peer on
// chain, and then shows three things in order:
//
//   1. the marker for one receivable is byte-identical in both registries;
//   2. registry B's contract **cannot** refuse that receivable, because B's ledger has never
//      heard of A's pledge, and the transaction proving that is recorded rather than hidden;
//   3. the lender's cross-registry check is what catches it, and a receivable pledged nowhere
//      comes back free from both.
//
// Point 2 is the honest part. A reader who is told only that "the registry refuses double
// pledges" and then discovers that a second registry happily accepts the same receivable has
// caught us overclaiming. Better to put it in the evidence ourselves and show what closes it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pureCircuits } from '@stockandfoil/contract';
import {
  createProviders,
  DebtorClient,
  findPledge,
  FinancierClient,
  fromHex,
  generatePersona,
  hex,
  isRefusal,
  NetworkBackend,
  OperatorClient,
  randomBytes32,
  REFUSAL_MESSAGES,
  resolveTransactions,
  SellerClient,
  type ChainNetwork,
  type FederatedEncumbrance,
  type Invoice,
  type RefusalCode,
  type RegistryProviders,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '@stockandfoil/sdk';
import { createHeadlessWallet, levelPrivateState, nodeZkConfigProvider } from '@stockandfoil/sdk/node';
import {
  anchorToJson,
  cliEndpoints,
  COMPACT_VERSION,
  EVIDENCE_DIR,
  explorerFor,
  fileStamp,
  flagValue,
  guardRealValueNetwork,
  heading,
  instanceOf,
  loadDeployment,
  loadMnemonic,
  loadRegistryKeys,
  note,
  privateStatePassword,
  privateStatePath,
  readJson,
  redactEndpoint,
  requireNetwork,
  runStatePath,
  say,
  scopeOf,
  SECRETS_DIR,
  seedHexOf,
  UsageError,
  writeJson,
  zkAssetsPath,
  type Args,
} from './common.js';

const DAY = 86_400n;

/** One registry in the run, with everything needed to act inside it. */
interface Registry {
  role: 'A' | 'B';
  name: string;
  scope: string;
  contractAddress: string;
  operatorId: string;
  backend: NetworkBackend;
  providers: RegistryProviders;
  operator: StockAndFoilPrivateState;
}

interface FederationStep {
  id: string;
  label: string;
  circuit: string;
  registry: string;
  persona: string;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  refused?: string;
  note?: string;
  durationMs: number;
}

interface VerdictJson {
  subject: string;
  nullifier: string;
  here: { contractAddress: string; encumbrance: string; unreachable: boolean };
  peers: Array<{ contractAddress: string; encumbrance: string; unreachable: boolean }>;
  encumberedAnywhere: boolean;
  complete: boolean;
}

/** Persisted so a re-run uses the same lender and the same control invoice. */
interface FederationState {
  network: ChainNetwork;
  peerInstance: string;
  createdAt: string;
  lenderSecretKey: string;
  controlSalt: string;
  peerLabels: { aToB: string; aToBSalt: string; bToA: string; bToASalt: string };
}

interface ScenarioRunState {
  contractAddress: string;
  personas: Record<'debtor' | 'seller' | 'financierA' | 'financierB', string>;
  invoices: Record<string, { debtorId: string; sellerId: string; invoiceNo: string; amount: string; dueDate: string; salt: string }>;
}

const toInvoice = (raw: ScenarioRunState['invoices'][string]): Invoice => ({
  debtorId: BigInt(raw.debtorId),
  sellerId: BigInt(raw.sellerId),
  invoiceNo: BigInt(raw.invoiceNo),
  amount: BigInt(raw.amount),
  dueDate: BigInt(raw.dueDate),
  salt: BigInt(raw.salt),
});

const verdictJson = (subject: string, f: FederatedEncumbrance): VerdictJson => ({
  subject,
  nullifier: f.nullifier,
  here: { contractAddress: f.here.contractAddress, encumbrance: f.here.encumbrance, unreachable: f.here.unreachable },
  peers: f.peers.map((p) => ({
    contractAddress: p.contractAddress,
    encumbrance: p.encumbrance,
    unreachable: p.unreachable,
  })),
  encumberedAnywhere: f.encumberedAnywhere,
  complete: f.complete,
});

function loadState(network: ChainNetwork, peerInstance: string): FederationState {
  const path = join(SECRETS_DIR, `${network}-federation.json`);
  if (existsSync(path)) return readJson<FederationState>(path);
  const state: FederationState = {
    network,
    peerInstance,
    createdAt: new Date().toISOString(),
    lenderSecretKey: hex(generatePersona('financier').secretKey),
    controlSalt: randomBytes32().reduce((acc, b) => acc + BigInt(b), 0n).toString(),
    peerLabels: {
      aToB: hex(randomBytes32()),
      aToBSalt: hex(randomBytes32()),
      bToA: hex(randomBytes32()),
      bToASalt: hex(randomBytes32()),
    },
  };
  writeJson(path, state);
  return state;
}

export async function federation(args: Args): Promise<number> {
  const network = requireNetwork(args);
  guardRealValueNetwork(args, network, 'running the cross-registry demonstration');
  const instanceA = instanceOf(args);
  const instanceB = flagValue(args, 'peer-instance') ?? 'b';
  if (instanceB === instanceA) {
    throw new UsageError('--peer-instance must name a different registry than --instance');
  }
  const scopeA = scopeOf(network, instanceA);
  const scopeB = scopeOf(network, instanceB);

  const deploymentA = loadDeployment(network, instanceA);
  const deploymentB = loadDeployment(network, instanceB);
  const keysA = loadRegistryKeys(network, instanceA);
  const keysB = loadRegistryKeys(network, instanceB);
  const endpoints = cliEndpoints(args, network);
  const assets = zkAssetsPath(args);
  const state = loadState(network, instanceB);

  // The parties come from registry A's own scenario run: the same real-world debtor and the
  // same real-world seller, because a marker is only comparable across registries when the
  // parties behind it are the same. That is not a contrivance — a debtor that deals with two
  // financiers uses one identity with both.
  const runPath = runStatePath(scopeA);
  if (!existsSync(runPath)) {
    throw new UsageError(
      `no scenario run for ${scopeA}; the cross-registry demonstration reuses its debtor, its ` +
        `seller and one of its pledged receivables.\nRun: npm run -w cli scenario -- --network ${network}`,
    );
  }
  const run = readJson<ScenarioRunState>(runPath);
  if (run.contractAddress !== deploymentA.contractAddress) {
    throw new UsageError(
      `${runPath} is a run against ${run.contractAddress}, but ${scopeA} is deployed at ` +
        `${deploymentA.contractAddress}. Re-run the scenario first.`,
    );
  }
  const subjectKey = flagValue(args, 'subject') ?? '2001';
  const subjectRaw = run.invoices[subjectKey];
  if (subjectRaw === undefined) {
    throw new UsageError(`${runPath} has no invoice #${subjectKey}; it holds ${Object.keys(run.invoices).join(', ')}`);
  }
  const subject = toInvoice(subjectRaw);

  heading(`cross-registry demonstration on ${network}`);
  say(`  registry A   ${scopeA}  ${deploymentA.contractAddress}`);
  say(`  registry B   ${scopeB}  ${deploymentB.contractAddress}`);
  say(`  subject      invoice #${subject.invoiceNo}, pledged in A`);
  say(`  indexer      ${redactEndpoint(endpoints.indexerHttpUrl)}`);
  if (deploymentA.contractAddress === deploymentB.contractAddress) {
    throw new UsageError('both instances point at the same contract; deploy a second registry first');
  }

  note('unlocking the fee-paying wallet and syncing');
  const wallet = await createHeadlessWallet({
    seedHex: seedHexOf(loadMnemonic(args)),
    network,
    endpoints,
    syncTimeoutMs: Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000,
    onSyncProgress: (p) =>
      note(`syncing ${p.percent}%  shielded ${p.shielded.applied}/${p.shielded.target}  dust ${p.dust.applied}/${p.dust.target}`),
  });

  try {
    // One wallet pays for both registries, but each gets its own provider bundle: the
    // private-state provider is scoped to a contract address, and sharing one between two
    // backends would quietly file registry B's witnesses under registry A.
    const bundleFor = (scope: string): RegistryProviders =>
      createProviders({
        network,
        endpoints,
        wallet: wallet.adapter,
        zkConfigProvider: nodeZkConfigProvider(assets),
        privateStateProvider: levelPrivateState({
          path: privateStatePath(scope),
          password: privateStatePassword(),
          accountId: wallet.adapter.getCoinPublicKey(),
        }),
        webSocket: globalThis.WebSocket,
      });

    const providersA = bundleFor(scopeA);
    const providersB = bundleFor(scopeB);
    const registryA: Registry = {
      role: 'A',
      name: flagValue(args, 'name-a') ?? 'Stock & Foil',
      scope: scopeA,
      contractAddress: deploymentA.contractAddress,
      operatorId: keysA.file.publicMaterial.operatorId,
      providers: providersA,
      operator: keysA.operator,
      backend: await NetworkBackend.connect({
        network,
        providers: providersA,
        compiledAssetsPath: assets,
        contractAddress: deploymentA.contractAddress,
        endpoints,
      }),
    };
    const registryB: Registry = {
      role: 'B',
      name: flagValue(args, 'name-b') ?? 'Harbour',
      scope: scopeB,
      contractAddress: deploymentB.contractAddress,
      operatorId: keysB.file.publicMaterial.operatorId,
      providers: providersB,
      operator: keysB.operator,
      backend: await NetworkBackend.connect({
        network,
        providers: providersB,
        compiledAssetsPath: assets,
        contractAddress: deploymentB.contractAddress,
        endpoints,
      }),
    };

    const debtor = { role: 'debtor' as const, secretKey: fromHex(run.personas.debtor) };
    const seller = { role: 'seller' as const, secretKey: fromHex(run.personas.seller) };
    const lender = { role: 'financier' as const, secretKey: fromHex(state.lenderSecretKey) };

    const operatorA = new OperatorClient(registryA.backend, registryA.operator);
    const operatorB = new OperatorClient(registryB.backend, registryB.operator);
    const debtorInB = new DebtorClient(registryB.backend, debtor);
    const sellerInB = new SellerClient(registryB.backend, seller);
    const lenderInB = new FinancierClient(registryB.backend, lender);

    const steps: FederationStep[] = [];
    const record = async (
      id: string,
      label: string,
      circuit: string,
      registry: 'A' | 'B',
      persona: string,
      run_: () => Promise<{ receipt?: TxReceipt; refused?: RefusalCode; note?: string }>,
    ): Promise<void> => {
      note(`${id}: ${label}`);
      const startedAt = Date.now();
      const outcome = await run_();
      steps.push({
        id,
        label,
        circuit,
        registry: `${registry} (${registry === 'A' ? registryA.name : registryB.name})`,
        persona,
        txId: outcome.receipt?.txId,
        blockHeight: outcome.receipt?.blockHeight,
        refused: outcome.refused,
        note: outcome.note,
        durationMs: Date.now() - startedAt,
      });
      const last = steps.at(-1)!;
      if (last.refused) say(`        REFUSED ${last.refused} — no transaction was submitted`);
      else if (last.txId) say(`        tx ${last.txId} in block ${last.blockHeight}`);
      if (last.note) say(`        ${last.note}`);
    };

    const expectRefusal = async (
      code: RefusalCode,
      thunk: () => Promise<unknown>,
    ): Promise<{ refused: RefusalCode; note: string }> => {
      try {
        await thunk();
      } catch (error) {
        if (isRefusal(error) && error.code === code) return { refused: error.code, note: REFUSAL_MESSAGES[code] };
        throw error;
      }
      throw new Error(`expected ${code}, but the call was accepted`);
    };

    // ------------------------------------------------------------------ peer declarations
    await record('register-peer-a', `${registryA.name} declares ${registryB.name} a peer`, 'registerPeer', 'A', 'operator A', async () => {
      const declared = await operatorA.registerPeer(
        fromHex(registryB.contractAddress),
        fromHex(state.peerLabels.aToB),
        fromHex(state.peerLabels.aToBSalt),
      );
      return {
        receipt: declared.receipt,
        note: `the ledger holds B's address and the label commitment ${hex(declared.labelCommit).slice(0, 18)}..., not A's name for it`,
      };
    });

    await record('register-peer-b', `${registryB.name} declares ${registryA.name} a peer`, 'registerPeer', 'B', 'operator B', async () => {
      const declared = await operatorB.registerPeer(
        fromHex(registryA.contractAddress),
        fromHex(state.peerLabels.bToA),
        fromHex(state.peerLabels.bToASalt),
      );
      return {
        receipt: declared.receipt,
        note: 'declared on both sides, so a lender that finds either registry finds the other',
      };
    });

    // ------------------------------------------------------------------ B admits the parties
    await record('admit-debtor-b', `${registryB.name} admits the same debtor after its own KYB`, 'admitDebtor', 'B', 'operator B', async () => {
      try {
        return { receipt: await operatorB.admitDebtor(debtorInB.leaf), note: 'the same real-world debtor, admitted independently by a second operator' };
      } catch (error) {
        if (isRefusal(error)) return { refused: error.code, note: 'already admitted by an earlier run' };
        throw error;
      }
    });

    await record('admit-lender-b', `${registryB.name} admits a lender that banks only with it`, 'admitFinancier', 'B', 'operator B', async () => {
      try {
        return { receipt: await operatorB.admitFinancier(lenderInB.leaf) };
      } catch (error) {
        if (isRefusal(error)) return { refused: error.code, note: 'already admitted by an earlier run' };
        throw error;
      }
    });

    // ------------------------------------------------------------------ the marker
    const markerA = pureCircuits.nullifierOf(subject);
    await record(
      'acknowledge-b',
      `The debtor acknowledges invoice #${subject.invoiceNo} in ${registryB.name} too`,
      'acknowledge',
      'B',
      'debtor',
      async () => {
        try {
          return {
            receipt: await debtorInB.acknowledge(subject),
            note: 'same invoice, same parties, same salt — so the same fingerprint and the same marker',
          };
        } catch (error) {
          if (isRefusal(error)) return { refused: error.code, note: 'already acknowledged in B by an earlier run' };
          throw error;
        }
      },
    );


    // ------------------------------------------------------------------ B cannot refuse it
    const now = await registryB.backend.now();
    const expiry = now + 7n * DAY;
    const tagLender = lenderInB.holderTag(markerA);
    await record(
      'offer-b',
      `The seller offers the already-pledged receivable in ${registryB.name}`,
      'offer',
      'B',
      'seller',
      async () => {
        try {
          return {
            receipt: await sellerInB.offer(subject, tagLender, expiry),
            note:
              `ACCEPTED, and that is the finding: ${registryB.name}'s ledger has never heard of the pledge in ` +
              `${registryA.name}, so its contract cannot refuse this. Nothing inside a single registry can. ` +
              'What catches it is the next step.',
          };
        } catch (error) {
          if (isRefusal(error)) return { refused: error.code, note: 'already offered in B by an earlier run' };
          throw error;
        }
      },
    );

    await record(
      'double-pledge-within-b',
      `A second offer of the same receivable inside ${registryB.name} is refused`,
      'offer',
      'B',
      'seller',
      async () =>
        expectRefusal('ALREADY_ENCUMBERED', () =>
          sellerInB.offer(subject, lenderInB.holderTag(markerA), expiry),
        ),
    );

    // ------------------------------------------------------------------ the marker, as the
    // two ledgers actually key it
    //
    // Recomputing `nullifierOf` twice in this process would prove nothing — it is the same pure
    // function called twice. What is worth recording is that two independently deployed
    // contracts, each having run the circuit inside its own proof, ended up keying their entry
    // by the same 32 bytes. So both ledgers are read and their own keys compared.
    const markerInA = findPledge(await registryA.backend.publicState(), markerA)?.nullifier;
    const markerInB = findPledge(await registryB.backend.publicState(), markerA)?.nullifier;
    const markersIdentical = markerInA !== undefined && markerInA === markerInB;
    say(`
  marker on A's ledger   ${markerInA ?? '(absent)'}`);
    say(`  marker on B's ledger   ${markerInB ?? '(absent)'}`);
    say(`  identical              ${markersIdentical ? 'yes' : 'NO'}`);

    // ------------------------------------------------------------------ the lender asks both
    let encumberedVerdict: FederatedEncumbrance | undefined;
    await record(
      'check-across-encumbered',
      `The ${registryB.name} lender asks every registry it knows before advancing`,
      'checkEncumbranceAcross (off chain)',
      'B',
      'lender',
      async () => {
        encumberedVerdict = await lenderInB.checkEncumbranceAcross(subject, [registryA.backend]);
        const peers = encumberedVerdict.peers
          .map((p) => `${p.contractAddress.slice(0, 10)}...: ${p.unreachable ? 'unreachable' : p.encumbrance}`)
          .join('; ');
        return {
          note:
            `here (${registryB.name}) ${encumberedVerdict.here.encumbrance}; ${peers}. ` +
            `encumberedAnywhere=${encumberedVerdict.encumberedAnywhere}, complete=${encumberedVerdict.complete}. ` +
            'The lender declines; it learns one bit and nothing else — not the holder, not the amount, not since when.',
        };
      },
    );

    // ------------------------------------------------------------------ the negative control
    const control: Invoice = {
      ...subject,
      invoiceNo: subject.invoiceNo + 770_000n,
      salt: BigInt(state.controlSalt),
    };
    let freeVerdict: FederatedEncumbrance | undefined;
    await record(
      'check-across-free',
      'The same check on a receivable nobody has pledged',
      'checkEncumbranceAcross (off chain)',
      'B',
      'lender',
      async () => {
        freeVerdict = await lenderInB.checkEncumbranceAcross(control, [registryA.backend]);
        return {
          note:
            `marker ${freeVerdict.nullifier.slice(0, 18)}... is FREE in both registries, ` +
            `encumberedAnywhere=${freeVerdict.encumberedAnywhere}. The check says no when the answer is no.`,
        };
      },
    );

    if (encumberedVerdict === undefined || freeVerdict === undefined) {
      throw new Error('the cross-registry checks did not produce a verdict');
    }
    if (!encumberedVerdict.encumberedAnywhere) {
      throw new Error('the pledged receivable was not reported as encumbered anywhere; the demonstration failed');
    }
    if (freeVerdict.encumberedAnywhere) {
      throw new Error('the control receivable was reported as encumbered; the demonstration failed');
    }
    if (!markersIdentical) {
      throw new Error(
        `the two ledgers do not key the receivable by the same marker: A has ${markerInA ?? 'nothing'}, ` +
          `B has ${markerInB ?? 'nothing'}. The demonstration failed.`,
      );
    }

    // ------------------------------------------------------------------ evidence
    const anchors = await resolveTransactions(
      endpoints.indexerHttpUrl,
      steps.map((s) => s.txId).filter((id): id is string => id !== undefined),
    );
    for (const step of steps) {
      if (step.txId === undefined) continue;
      const anchor = anchors.get(step.txId);
      step.txHash = anchor?.txHash;
      step.blockHeight = anchor?.blockHeight ?? step.blockHeight;
    }

    const path = join(EVIDENCE_DIR, `federation-${network}-${fileStamp()}.json`);
    writeJson(path, {
      project: 'Stock & Foil',
      kind: 'cross-registry-encumbrance-check',
      network,
      compactVersion: COMPACT_VERSION,
      at: new Date().toISOString(),
      explorer: deploymentA.explorer ?? explorerFor(network),
      claim:
        'Two independent registries, two ceremonies, two operators. The same receivable has the ' +
        'same pledge marker in both, because a marker is a function of the invoice and its ' +
        'parties alone. The second registry cannot refuse a receivable pledged in the first — ' +
        'its ledger has never heard of it — and the transaction showing that is recorded here. ' +
        "What stops the double pledge is the lender's cross-registry check, which returns one " +
        'bit per registry and nothing else.',
      registries: [
        { role: 'A', name: registryA.name, scope: registryA.scope, contractAddress: registryA.contractAddress, operatorId: registryA.operatorId },
        { role: 'B', name: registryB.name, scope: registryB.scope, contractAddress: registryB.contractAddress, operatorId: registryB.operatorId },
      ],
      marker: {
        nullifier: hex(markerA),
        invoiceNo: subject.invoiceNo.toString(),
        computedInA: markerInA ?? '(absent)',
        computedInB: markerInB ?? '(absent)',
        identical: markersIdentical,
      },
      steps,
      verdicts: [
        verdictJson(`Invoice #${subject.invoiceNo}, pledged in ${registryA.name}`, encumberedVerdict),
        verdictJson(`Invoice #${control.invoiceNo}, pledged nowhere`, freeVerdict),
      ],
      deploymentAnchors: {
        a: anchorToJson({ identifier: deploymentA.deployTx, txHash: deploymentA.deployTxHash }),
        b: anchorToJson({ identifier: deploymentB.deployTx, txHash: deploymentB.deployTxHash }),
      },
    });

    heading('result');
    say(`  marker                 ${hex(markerA)}`);
    say(`  keyed by both ledgers  ${markersIdentical ? 'yes' : 'NO'}`);
    say(`  pledged receivable     encumberedAnywhere=${encumberedVerdict.encumberedAnywhere}, complete=${encumberedVerdict.complete}`);
    say(`  control receivable     encumberedAnywhere=${freeVerdict.encumberedAnywhere}, complete=${freeVerdict.complete}`);
    say(`\nevidence written to ${path}`);
    say(`next: npm run -w cli proof -- --network ${network}`);
    return 0;
  } finally {
    await wallet.close();
  }
}
