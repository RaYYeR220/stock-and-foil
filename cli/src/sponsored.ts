// SPDX-License-Identifier: Apache-2.0
//
// Proof, on a real network, that a party holding zero DUST can use the registry.
//
//   npm run -w sponsor start        # in another terminal, with a funded wallet
//   npm run -w cli sponsored -- --network preview --sponsor http://127.0.0.1:7391
//
// The claim is specific, so the evidence is too. A wallet is created from a seed of its own,
// never funded and never registered for DUST generation. Before anything is built, its DUST
// balance is read from the chain and the run aborts unless it is exactly zero — the point is
// not that it *should* be empty but that it *was*, at the moment it transacted. That wallet
// then proves, balances only the shielded and unshielded sides, signs and binds a real circuit
// call. The sponsor adds the DUST, submits, and reports what it paid. Afterwards the acting
// wallet's balance is read again: still zero, because it never paid anything.
//
// Everything lands in `cli/evidence/sponsored-<network>-<stamp>.json`, in the same shape and
// with the same explorer anchors as the scenario's own evidence, so a reader checks it the same
// way.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
  createProviders,
  DebtorClient,
  formatDust,
  generatePersona,
  hex,
  NetworkBackend,
  OperatorClient,
  resolveTransactions,
  SellerClient,
  SponsorError,
  sponsoredWalletAdapter,
  type ChainNetwork,
  type Invoice,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '@stockandfoil/sdk';
import { createHeadlessWallet, levelPrivateState, nodeZkConfigProvider } from '@stockandfoil/sdk/node';
import {
  cliEndpoints,
  COMPACT_VERSION,
  EVIDENCE_DIR,
  explorerFor,
  fileStamp,
  flagValue,
  guardRealValueNetwork,
  heading,
  loadDeployment,
  loadMnemonic,
  loadRegistryKeys,
  note,
  privateStatePassword,
  privateStatePath,
  readJson,
  redactEndpoint,
  requireNetwork,
  say,
  SECRETS_DIR,
  seedHexOf,
  UsageError,
  writeJson,
  zkAssetsPath,
  type Args,
} from './common.js';

/** Where the throwaway zero-DUST wallet's mnemonic is kept, so a re-run reuses the same one. */
const actingWalletPath = (network: ChainNetwork): string => join(SECRETS_DIR, `${network}-zero-dust-wallet.json`);

interface ActingWalletFile {
  network: ChainNetwork;
  note: string;
  mnemonic: string;
  createdAt: string;
}

/**
 * The mnemonic of the acting wallet.
 *
 * Generated on first use and kept under `cli/.secrets/`, which the repository ignores. It is
 * deliberately *not* the fee-paying wallet: that one has DUST, and a demo run from it would
 * prove nothing.
 */
function actingMnemonic(args: Args, network: ChainNetwork): string {
  const explicit = flagValue(args, 'acting-mnemonic-file');
  if (explicit !== undefined) {
    return loadMnemonic({ command: args.command, flags: new Map([['mnemonic-file', explicit]]) });
  }
  const path = actingWalletPath(network);
  if (existsSync(path)) return readJson<ActingWalletFile>(path).mnemonic;
  const mnemonic = generateMnemonic(wordlist, 256);
  writeJson(path, {
    network,
    note:
      'Throwaway wallet for the DUST-sponsorship proof. It is never funded and never registered ' +
      'for DUST generation; that is the whole point. Not for value of any kind.',
    mnemonic,
    createdAt: new Date().toISOString(),
  } satisfies ActingWalletFile);
  return mnemonic;
}

interface SponsoredStep {
  id: string;
  circuit: string;
  persona: string;
  label: string;
  txId: string;
  txHash?: string;
  blockHeight?: number;
  blockTimestamp?: string;
  feeSpeck?: string;
  sponsorReportedFeeSpeck?: string;
  durationMs: number;
}

export async function sponsored(args: Args): Promise<number> {
  const network = requireNetwork(args);
  guardRealValueNetwork(args, network, 'running the sponsorship proof');
  const sponsorUrl = flagValue(args, 'sponsor') ?? process.env.SPONSOR_URL;
  if (sponsorUrl === undefined) {
    throw new UsageError(
      'pass --sponsor <url> (or set SPONSOR_URL) pointing at a running fee sponsor.\n' +
        'Start one with:  npm run -w sponsor start   (see sponsor/README.md)',
    );
  }
  const circuitName = flagValue(args, 'circuit') ?? 'acknowledge';
  const deployment = loadDeployment(network);
  const endpoints = cliEndpoints(args, network);
  const assets = zkAssetsPath(args);
  const keys = loadRegistryKeys(network);
  const syncTimeoutMs = Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000;

  heading(`zero-DUST sponsorship proof on ${network}`);
  say(`  contract   ${deployment.contractAddress}`);
  say(`  sponsor    ${sponsorUrl}`);
  say(`  indexer    ${redactEndpoint(endpoints.indexerHttpUrl)}`);

  // ----------------------------------------------------------------- the acting wallet
  note('unlocking the acting wallet (the one that must hold no DUST) and syncing');
  const acting = await createHeadlessWallet({
    seedHex: seedHexOf(actingMnemonic(args, network)),
    network,
    endpoints,
    syncTimeoutMs,
    // The two settings that make this a proof rather than a demo: balance everything except
    // DUST, and do not wait for DUST that is never going to arrive.
    payDustFees: false,
    requireDust: false,
  });

  try {
    const before = await acting.balances();
    say(`\n  acting wallet   ${acting.address}`);
    say(`  NIGHT           ${before.night}`);
    say(`  DUST            ${before.dust}  (${before.dustSpeck} SPECK)`);
    if (before.dustSpeck !== 0n) {
      throw new UsageError(
        `the acting wallet holds ${before.dustSpeck} SPECK of DUST, so a transaction from it ` +
          'would prove nothing. Use a wallet that was never registered for DUST generation, or ' +
          'pass --acting-mnemonic-file pointing at one.',
      );
    }
    say('  -> this wallet cannot pay a fee at all. Everything below is paid by the sponsor.');

    // ----------------------------------------------------------------- providers
    const providers = createProviders({
      network,
      endpoints,
      wallet: sponsoredWalletAdapter(acting.adapter, {
        endpoint: sponsorUrl,
        apiKey: flagValue(args, 'sponsor-api-key') ?? process.env.SPONSOR_API_KEY,
        caller: `cli-sponsored:${network}`,
        onSponsored: (result) => {
          sponsorFees.push(result.feeSpeck);
          note(
            `sponsor paid ${result.feeSpeck ?? '?'} SPECK ` +
              `(${formatDust(BigInt(result.feeSpeck ?? '0'))} DUST) for ${result.circuits.join(', ')}`,
          );
        },
      }),
      zkConfigProvider: nodeZkConfigProvider(assets),
      privateStateProvider: levelPrivateState({
        path: privateStatePath(network),
        password: privateStatePassword(),
        accountId: acting.adapter.getCoinPublicKey(),
      }),
      webSocket: globalThis.WebSocket,
    });
    const sponsorFees: Array<string | undefined> = [];

    const backend = await NetworkBackend.connect({
      network,
      providers,
      compiledAssetsPath: assets,
      contractAddress: deployment.contractAddress,
      endpoints,
    });

    // ----------------------------------------------------------------- the call
    //
    // `acknowledge` is the right circuit for this: it is the debtor's own confirmation that it
    // owes an invoice, made by a finance clerk at a mid-market company, and it is exactly the
    // party that will never hold NIGHT.
    const persona = await personaFor(args, circuitName, network);
    const now = await backend.now();
    const invoice: Invoice = new SellerClient(backend, generatePersona('seller')).issueInvoice({
      debtorId: new DebtorClient(backend, persona).id,
      invoiceNo: BigInt(Date.now() % 1_000_000),
      amount: 125_000n,
      dueDate: now + 60n * 86_400n,
    });

    // The debtor has to be admitted before it can acknowledge anything. That is an operator
    // call, the operator funds itself, and it is deliberately not on the sponsor's allowlist —
    // so it goes through a second, funded session rather than through the sponsor.
    await admitDebtor(args, network, endpoints, assets, deployment.contractAddress, keys.operator, persona);

    const steps: SponsoredStep[] = [];
    const debtor = new DebtorClient(backend, persona);
    note(`${circuitName}: the debtor acknowledges invoice #${invoice.invoiceNo} it owes`);
    let receipt: TxReceipt;
    try {
      receipt = await debtor.acknowledge(invoice);
    } catch (error) {
      if (error instanceof SponsorError) {
        say(`\n  the sponsor refused with ${error.code}: ${error.message}`);
        if (error.code === 'CIRCUIT_NOT_ALLOWED') {
          say('  Add the circuit to SPONSOR_CIRCUITS if that is what you intended.');
        }
        return 1;
      }
      throw error;
    }
    steps.push({
      id: 'sponsored-acknowledge',
      circuit: 'acknowledge',
      persona: 'debtor (zero DUST)',
      label: `A debtor holding no DUST acknowledges invoice #${invoice.invoiceNo}`,
      txId: receipt.txId!,
      blockHeight: receipt.blockHeight,
      durationMs: receipt.durationMs,
      sponsorReportedFeeSpeck: sponsorFees.at(-1) ?? undefined,
    });

    // ----------------------------------------------------------------- evidence
    const anchors = await resolveTransactions(endpoints.indexerHttpUrl, steps.map((s) => s.txId));
    for (const step of steps) {
      const anchor = anchors.get(step.txId);
      step.txHash = anchor?.txHash;
      step.blockHeight = anchor?.blockHeight ?? step.blockHeight;
      step.blockTimestamp = anchor?.blockTimestamp;
      step.feeSpeck = anchor?.feeSpeck?.toString();
    }

    const after = await acting.balances();
    const explorer = deployment.explorer ?? explorerFor(network);
    const totalSpeck = steps.reduce((sum, s) => sum + BigInt(s.feeSpeck ?? s.sponsorReportedFeeSpeck ?? '0'), 0n);

    const path = join(EVIDENCE_DIR, `sponsored-${network}-${fileStamp()}.json`);
    writeJson(path, {
      project: 'Stock & Foil',
      kind: 'dust-sponsorship-proof',
      network,
      contractAddress: deployment.contractAddress,
      compactVersion: COMPACT_VERSION,
      at: new Date().toISOString(),
      explorer,
      claim:
        'The acting wallet held 0 SPECK of DUST before and after this run, and could not have ' +
        'paid a fee. It proved, balanced the shielded and unshielded sides, signed and bound the ' +
        'transaction; a sponsor balanced the DUST and submitted it. The registry authenticates ' +
        'by secret knowledge, not by fee payer, so the sponsor bought a block slot and nothing else.',
      actingWallet: {
        address: acting.address,
        dustSpeckBefore: before.dustSpeck.toString(),
        dustSpeckAfter: after.dustSpeck.toString(),
        nightStar: after.nightStar.toString(),
        registeredForDustGeneration: after.nightUtxosRegistered,
      },
      sponsor: { endpoint: sponsorUrl },
      steps,
      totalSponsoredFeeSpeck: totalSpeck.toString(),
      totalSponsoredFeeDust: formatDust(totalSpeck),
    });

    heading('result');
    for (const step of steps) {
      say(`  ${step.circuit.padEnd(16)} tx ${step.txHash ?? step.txId} in block ${step.blockHeight}`);
      if (explorer && step.txHash) say(`  ${' '.repeat(16)} ${explorer.tx.replace('{txHash}', step.txHash)}`);
      say(`  ${' '.repeat(16)} fee ${step.feeSpeck ?? step.sponsorReportedFeeSpeck ?? '?'} SPECK, paid by the sponsor`);
    }
    say(`\n  acting wallet DUST: ${before.dustSpeck} SPECK before, ${after.dustSpeck} SPECK after.`);
    say(`  It never held any, and it transacted anyway.`);
    say(`\nevidence written to ${path}`);
    return after.dustSpeck === 0n ? 0 : 1;
  } finally {
    await acting.close();
  }
}

/**
 * A persona for the acting party, kept in `cli/.secrets/` so a re-run acknowledges a second
 * invoice as the same debtor instead of needing to be admitted again.
 */
async function personaFor(
  args: Args,
  circuit: string,
  network: ChainNetwork,
): Promise<StockAndFoilPrivateState> {
  void args;
  void circuit;
  const path = join(SECRETS_DIR, `${network}-sponsored-persona.json`);
  if (existsSync(path)) {
    const stored = readJson<{ role: 'debtor'; secretKey: string }>(path);
    return { role: 'debtor', secretKey: Buffer.from(stored.secretKey, 'hex') };
  }
  const persona = generatePersona('debtor');
  writeJson(path, { role: 'debtor', secretKey: hex(persona.secretKey) });
  return persona;
}

/**
 * Admits the acting debtor with the funded operator wallet.
 *
 * Two wallets, two sessions, on purpose. `admitDebtor` is the operator's own call and is not on
 * the sponsor's allowlist — an operator that cannot fund its own KYB decisions has a different
 * problem — so it runs from the funded wallet while the acknowledgement runs from the empty one.
 * Admitting a debtor twice is refused by the contract, which is why a refusal here is a skip.
 */
async function admitDebtor(
  args: Args,
  network: ChainNetwork,
  endpoints: ReturnType<typeof cliEndpoints>,
  assets: string,
  contractAddress: string,
  operatorState: StockAndFoilPrivateState,
  persona: StockAndFoilPrivateState,
): Promise<void> {
  note('admitting the debtor from the funded operator wallet (not sponsored)');
  const funded = await createHeadlessWallet({
    seedHex: seedHexOf(loadMnemonic(args)),
    network,
    endpoints,
    syncTimeoutMs: Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000,
  });
  try {
    const providers = createProviders({
      network,
      endpoints,
      wallet: funded.adapter,
      zkConfigProvider: nodeZkConfigProvider(assets),
      privateStateProvider: levelPrivateState({
        path: privateStatePath(network),
        password: privateStatePassword(),
        accountId: funded.adapter.getCoinPublicKey(),
      }),
      webSocket: globalThis.WebSocket,
    });
    const backend = await NetworkBackend.connect({ network, providers, compiledAssetsPath: assets, contractAddress, endpoints });
    const operator = new OperatorClient(backend, operatorState);
    const debtor = new DebtorClient(backend, persona);
    try {
      const receipt = await operator.admitDebtor(debtor.leaf);
      note(`debtor admitted in tx ${receipt.txId}`);
    } catch (error) {
      note(`debtor was already admitted (${error instanceof Error ? error.message : String(error)}); continuing`);
    }
  } finally {
    await funded.close();
  }
}
