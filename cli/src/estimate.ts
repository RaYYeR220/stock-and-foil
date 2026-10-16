// SPDX-License-Identifier: Apache-2.0
//
// What a full deploy plus scenario will cost in DUST, before a single SPECK is spent.
//
//   npm run -w cli estimate -- --network mainnet --mnemonic-file ../infra/.secrets/mainnet-wallet.json
//   npm run -w cli estimate -- --network mainnet --offline      # no wallet, reference prices only
//
// The method, because an estimate nobody can check is worth nothing:
//
//   1. A previous run of the *same* deploy and the *same* scenario is already on chain — on
//      preview, by default. Its evidence file names every transaction it produced.
//   2. The indexer serves each of those transactions' `raw` bytes. They are the real, proven,
//      balanced transactions, with real verifier keys and real transcripts — not a model of one.
//   3. Those exact bytes are priced against the *target* network's wallet with the ledger's own
//      cost function (`WalletFacade.calculateTransactionFee`, which is `Transaction.fees` under
//      the target's ledger parameters). No scaling factor, no guessed constant.
//
// What this does not capture: the mainnet transactions will not be byte-identical. Different
// keys, addresses, salts and timestamps move a transaction's size by a few bytes, and a contract
// whose state has grown costs marginally more to call. The report says so and applies an explicit
// safety margin instead of pretending otherwise.
//
// Nothing here submits anything, and `--offline` does not even open a wallet, so this is safe to
// run against mainnet before the DUST has landed.
import {
  fetchRawTransactions,
  formatDust,
  fromHex,
  resolveTransactions,
  SPECK_PER_DUST,
  type ChainNetwork,
} from '@stockandfoil/sdk';
import { createHeadlessWallet } from '@stockandfoil/sdk/node';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { Binding, FinalizedTransaction, Proof, SignatureEnabled } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  CHAIN_NETWORKS,
  cliEndpoints,
  fileStamp,
  flagSet,
  flagValue,
  heading,
  loadDeployment,
  loadMnemonic,
  newestEvidencePath,
  readJson,
  redactEndpoint,
  requireNetwork,
  say,
  seedHexOf,
  UsageError,
  writeJson,
  EVIDENCE_DIR,
  type Args,
  type EvidenceFile,
} from './common.js';
import { join } from 'node:path';

/** Default headroom over the priced total, as a percentage. Transactions are not byte-identical. */
const DEFAULT_MARGIN_PERCENT = 25;

interface PricedTx {
  label: string;
  circuit: string;
  identifier: string;
  /** What it cost on the reference network, in SPECK, as that chain recorded it. */
  referenceFeeSpeck?: bigint;
  /** What the same bytes cost under the target network's ledger parameters, in SPECK. */
  targetFeeSpeck?: bigint;
  bytes?: number;
  problem?: string;
}

const sum = (values: Array<bigint | undefined>): bigint =>
  values.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);

function referenceNetwork(args: Args): ChainNetwork {
  const value = flagValue(args, 'reference') ?? 'preview';
  if (!CHAIN_NETWORKS.includes(value as ChainNetwork)) {
    throw new UsageError(`unknown --reference "${value}"; expected one of ${CHAIN_NETWORKS.join(', ')}`);
  }
  return value as ChainNetwork;
}

export async function estimate(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const reference = referenceNetwork(args);
  if (reference === network) {
    say(`note: --reference is ${reference}, the same network being estimated; the "target" column`);
    say('      is then just a re-pricing of what the chain already charged.\n');
  }

  // ------------------------------------------------------------------ the reference run
  const evidencePath = flagValue(args, 'evidence') ?? newestEvidencePath(reference);
  if (evidencePath === undefined) {
    throw new UsageError(
      `no evidence file for ${reference}, so there is nothing to price.\n` +
        `Run the scenario on ${reference} first, or point --evidence at an evidence file, or pass ` +
        `--reference <network> for one that has a run.`,
    );
  }
  const evidence = readJson<EvidenceFile>(evidencePath);
  const referenceEndpoints = cliEndpoints(args, reference);

  const deployTxs: PricedTx[] = [
    {
      label: 'deploy: constructor + first verifier keys',
      circuit: 'deploy',
      identifier: evidence.deployment.deployTx.identifier,
    },
    ...evidence.deployment.maintenanceTxs.map((tx) => ({
      label: `maintenance: insert verifier key for ${tx.circuit}`,
      circuit: `+key ${tx.circuit}`,
      identifier: tx.identifier,
    })),
  ];
  const stepTxs: PricedTx[] = evidence.steps
    .filter((step) => step.txId !== undefined)
    .map((step) => ({ label: step.label, circuit: step.circuit, identifier: step.txId! }));
  const priced = [...deployTxs, ...stepTxs].filter((tx) => tx.identifier !== '');

  heading(`cost estimate for a full deploy + scenario on ${network}`);
  say(`  reference run   ${evidencePath}`);
  say(`  reference chain ${reference} (${redactEndpoint(referenceEndpoints.indexerHttpUrl)})`);
  say(`  transactions    ${deployTxs.length} deployment + ${stepTxs.length} scenario = ${priced.length}`);

  // What the reference chain actually charged, straight from the indexer.
  const anchors = await resolveTransactions(referenceEndpoints.indexerHttpUrl, priced.map((t) => t.identifier));
  for (const tx of priced) tx.referenceFeeSpeck = anchors.get(tx.identifier)?.feeSpeck;

  // ------------------------------------------------------------------ re-price on the target
  const offline = flagSet(args, 'offline');
  if (!offline) {
    const raws = await fetchRawTransactions(referenceEndpoints.indexerHttpUrl, priced.map((t) => t.identifier));
    say(`  raw bytes read  ${raws.size} of ${priced.length} transactions`);

    const targetEndpoints = cliEndpoints(args, network);
    say(`  target chain    ${network} (${redactEndpoint(targetEndpoints.indexerHttpUrl)})`);
    say('  opening the target wallet to read its ledger parameters and DUST balance...');

    const wallet = await createHeadlessWallet({
      seedHex: seedHexOf(loadMnemonic(args)),
      network,
      endpoints: targetEndpoints,
      syncTimeoutMs: Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000,
      requireDust: false,
      requireSync: !flagSet(args, 'no-sync'),
    });
    try {
      for (const tx of priced) {
        const raw = raws.get(tx.identifier);
        if (raw === undefined) {
          tx.problem = 'the reference indexer has no raw bytes for this transaction';
          continue;
        }
        try {
          const bytes = fromHex(raw.startsWith('0x') ? raw.slice(2) : raw);
          tx.bytes = bytes.length;
          const deserialized = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
            'signature',
            'proof',
            'binding',
            bytes,
          ) as FinalizedTransaction;
          tx.targetFeeSpeck = await wallet.calculateFee(deserialized);
        } catch (error) {
          tx.problem = `could not price it: ${(error as Error).message}`;
        }
      }

      const balances = await wallet.balances();
      printReport(network, reference, priced, balances.dustSpeck, args);
      const path = writeReport(network, reference, evidencePath, priced, balances.dustSpeck, args);
      say(`\nwritten to ${path}`);
      return balances.dustSpeck >= requiredSpeck(priced, args) ? 0 : 2;
    } finally {
      await wallet.close();
    }
  }

  printReport(network, reference, priced, undefined, args);
  const path = writeReport(network, reference, evidencePath, priced, undefined, args);
  say(`\nwritten to ${path}`);
  say(`\nThis is the reference network's own prices. Re-run without --offline, with a ${network}`);
  say('wallet, to price the same transactions under that network\'s ledger parameters.');
  return 0;
}

const marginPercent = (args: Args): number => Number(flagValue(args, 'margin-percent') ?? DEFAULT_MARGIN_PERCENT);

function requiredSpeck(priced: readonly PricedTx[], args: Args): bigint {
  const total = sum(priced.map((t) => t.targetFeeSpeck ?? t.referenceFeeSpeck));
  return (total * BigInt(100 + marginPercent(args))) / 100n;
}

function printReport(
  network: ChainNetwork,
  reference: ChainNetwork,
  priced: readonly PricedTx[],
  dustSpeck: bigint | undefined,
  args: Args,
): void {
  heading('per transaction, in SPECK');
  say(`  ${'circuit'.padEnd(26)} ${'bytes'.padStart(8)} ${`${reference} paid`.padStart(16)} ${`${network} price`.padStart(16)}`);
  for (const tx of priced) {
    const ref = tx.referenceFeeSpeck === undefined ? '-' : tx.referenceFeeSpeck.toString();
    const target = tx.targetFeeSpeck === undefined ? (tx.problem ? '!' : '-') : tx.targetFeeSpeck.toString();
    say(`  ${tx.circuit.slice(0, 26).padEnd(26)} ${String(tx.bytes ?? '-').padStart(8)} ${ref.padStart(16)} ${target.padStart(16)}`);
  }
  for (const tx of priced.filter((t) => t.problem)) say(`  ! ${tx.circuit}: ${tx.problem}`);

  const referenceTotal = sum(priced.map((t) => t.referenceFeeSpeck));
  const targetTotal = sum(priced.map((t) => t.targetFeeSpeck));
  const required = requiredSpeck(priced, args);

  heading('totals');
  say(`  ${reference} actually paid        ${referenceTotal} SPECK (${formatDust(referenceTotal)} DUST)`);
  if (targetTotal > 0n) {
    say(`  priced on ${network.padEnd(20)} ${targetTotal} SPECK (${formatDust(targetTotal)} DUST)`);
  }
  say(`  with a ${marginPercent(args)}% margin${' '.repeat(Math.max(0, 15 - String(marginPercent(args)).length))} ${required} SPECK (${formatDust(required)} DUST)`);

  if (dustSpeck !== undefined) {
    say(`  wallet holds                ${dustSpeck} SPECK (${formatDust(dustSpeck)} DUST)`);
    if (dustSpeck >= required) {
      const headroom = dustSpeck - required;
      say(`\n  ENOUGH. ${formatDust(headroom)} DUST of headroom beyond the margin.`);
      say(`  Next: npm run -w cli deploy -- --network ${network} --yes-mainnet`);
    } else {
      const short = required - dustSpeck;
      say(`\n  NOT ENOUGH. Short by ${short} SPECK (${formatDust(short)} DUST).`);
      say(`  Watch it arrive with: npm run -w cli balance -- --network ${network} --watch 60`);
    }
  }
  say('');
  say('  Caveat, stated rather than hidden: these are the reference run\'s exact transactions');
  say('  re-priced, not the transactions that will actually be built. Keys, addresses, salts and');
  say(`  a larger contract state move the real cost by a few percent, which is what the ${marginPercent(args)}% margin`);
  say('  is for. 1 DUST = 10^15 SPECK.');
}

function writeReport(
  network: ChainNetwork,
  reference: ChainNetwork,
  evidencePath: string,
  priced: readonly PricedTx[],
  dustSpeck: bigint | undefined,
  args: Args,
): string {
  const path = join(EVIDENCE_DIR, `estimate-${network}-${fileStamp()}.json`);
  const referenceTotal = sum(priced.map((t) => t.referenceFeeSpeck));
  const targetTotal = sum(priced.map((t) => t.targetFeeSpeck));
  const required = requiredSpeck(priced, args);
  writeJson(path, {
    project: 'Stock & Foil',
    kind: 'dust-cost-estimate',
    network,
    reference,
    referenceEvidence: evidencePath,
    method:
      'Each transaction of the reference run was read back from the reference indexer as raw ' +
      'ledger bytes and re-priced with the target wallet\'s own cost function. Nothing was built, ' +
      'proven or submitted.',
    estimatedAt: new Date().toISOString(),
    marginPercent: marginPercent(args),
    transactions: priced.map((t) => ({
      circuit: t.circuit,
      label: t.label,
      identifier: t.identifier,
      bytes: t.bytes,
      referenceFeeSpeck: t.referenceFeeSpeck?.toString(),
      targetFeeSpeck: t.targetFeeSpeck?.toString(),
      problem: t.problem,
    })),
    totals: {
      referenceFeeSpeck: referenceTotal.toString(),
      targetFeeSpeck: targetTotal.toString(),
      requiredWithMarginSpeck: required.toString(),
      requiredWithMarginDust: formatDust(required),
      walletDustSpeck: dustSpeck?.toString(),
      sufficient: dustSpeck === undefined ? undefined : dustSpeck >= required,
      speckPerDust: SPECK_PER_DUST.toString(),
    },
  });
  return path;
}
