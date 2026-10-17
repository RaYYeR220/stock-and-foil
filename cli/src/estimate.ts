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
//   3. Those exact bytes are priced by **the target chain itself**, through
//      `midnightRuntimeApi.getTransactionCost`. No wallet, no sync, no account: one WebSocket
//      and a round trip per transaction. No scaling factor, no guessed constant, and no local
//      model of parameters the chain may not be running.
//
// That last point is the whole reason this command was rewritten. It used to price locally with
// `WalletFacade.calculateTransactionFee`, which is `Transaction.fees` against
// `LedgerParameters.initialParameters()` — the ledger's *baseline* set, which no public network
// runs. For our eleven deployment transactions that reads **15.70 DUST** where mainnet's own
// runtime says **0.002008 DUST**: wrong by a factor of about **7,800**, in the expensive
// direction. It cost most of a day and nearly sent someone to buy tokens they did not need.
// The baseline figure is still available behind `--offline`, labelled as what it is, printed
// beside the chain's answer whenever both exist, and never used as the estimate.
//
// If the target network has no reachable RPC this command says so and exits non-zero. It does
// not fall back to the baseline figure, because that fallback is the original mistake.
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
import { LedgerParameters } from '@midnight-ntwrk/ledger-v8';
import { NodeUnreachable, openNodePricer } from './nodecost.js';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { Binding, FinalizedTransaction, Proof, SignatureEnabled } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  CHAIN_NETWORKS,
  cliEndpoints,
  fail,
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
  /** What the target chain's own runtime says these bytes cost, in SPECK. The answer. */
  targetFeeSpeck?: bigint;
  /**
   * `Transaction.fees` against `LedgerParameters.initialParameters()`, in SPECK.
   *
   * Printed for comparison only. It is the ledger's baseline parameter set, which no public
   * network runs, and it reads thousands of times too high. Never used as the estimate.
   */
  baselineFeeSpeck?: bigint;
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
  const raws = await fetchRawTransactions(referenceEndpoints.indexerHttpUrl, priced.map((t) => t.identifier));
  say(`  raw bytes read  ${raws.size} of ${priced.length} transactions`);

  // The baseline figure, computed locally. Shown for comparison, never used as the answer.
  const baselineParams = LedgerParameters.initialParameters();
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
      tx.baselineFeeSpeck = (deserialized as unknown as { fees(p: unknown): bigint }).fees(baselineParams);
    } catch (error) {
      tx.problem = `could not read it: ${(error as Error).message}`;
    }
  }

  if (offline) {
    printReport(network, reference, priced, undefined, args, undefined);
    const path = writeReport(network, reference, evidencePath, priced, undefined, args);
    say(`
written to ${path}`);
    say('');
    say(`  --offline: nothing was asked of ${network}. The only prices above are what ${reference}`);
    say('  charged and the ledger BASELINE figure. The baseline is NOT what any live chain charges:');
    say('  it read ~7,800x too high on our deployment (15.7 DUST against 0.002). Do not budget from it.');
    say(`  Re-run without --offline to get ${network}'s own answer.`);
    return 0;
  }

  // The answer: the target chain's own price for these exact bytes.
  const targetEndpoints = cliEndpoints(args, network);
  say(`  target chain    ${network} (${redactEndpoint(targetEndpoints.nodeUrl)})`);
  let pricer;
  try {
    pricer = await openNodePricer(targetEndpoints.nodeUrl);
  } catch (error) {
    if (!(error instanceof NodeUnreachable)) throw error;
    fail(`
${error.message}`);
    fail('');
    fail(`Nothing was priced. The estimate is NOT falling back to the local baseline figure,`);
    fail('because that figure is the ledger’s baseline parameter set, which no public network');
    fail(`runs — on our deployment it read ~7,800x too high (15.7 DUST against 0.002). Fix the RPC and re-run, or pass`);
    fail('--offline to see the reference prices and the baseline figure, clearly labelled.');
    return 2;
  }
  say(`  priced by       ${pricer.chain}, through its own midnightRuntimeApi.getTransactionCost`);

  try {
    for (const tx of priced) {
      const raw = raws.get(tx.identifier);
      if (raw === undefined) continue;
      const quote = await pricer.quote(raw);
      if (quote.speck === undefined) tx.problem = `the chain would not price it: ${quote.error ?? 'no reason given'}`;
      else tx.targetFeeSpeck = quote.speck;
    }
  } finally {
    await pricer.close();
  }

  // The wallet is now needed only for the balance, so an estimate works without one.
  const dustSpeck = await readWalletDust(args, network, targetEndpoints);
  printReport(network, reference, priced, dustSpeck, args, pricer.chain);
  const path = writeReport(network, reference, evidencePath, priced, dustSpeck, args);
  say(`
written to ${path}`);
  if (dustSpeck === undefined) return 0;
  return dustSpeck >= requiredSpeck(priced, args) ? 0 : 2;
}

/**
 * The target wallet's DUST, when a mnemonic is available.
 *
 * Opening a wallet means syncing it, which on a public network is many minutes, so this is
 * skipped entirely unless the caller supplied a mnemonic. Pricing no longer needs it: that is
 * what made this command runnable by someone who holds no keys at all.
 */
async function readWalletDust(
  args: Args,
  network: ChainNetwork,
  endpoints: ReturnType<typeof cliEndpoints>,
): Promise<bigint | undefined> {
  const hasMnemonic = flagValue(args, 'mnemonic-file') !== undefined || process.env.MIDNIGHT_MNEMONIC;
  if (!hasMnemonic) {
    say('  wallet          none given, so the balance is not checked (pass --mnemonic-file to compare)');
    return undefined;
  }
  say('  opening the target wallet to read its DUST balance...');
  const wallet = await createHeadlessWallet({
    seedHex: seedHexOf(loadMnemonic(args)),
    network,
    endpoints,
    syncTimeoutMs: Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000,
    requireDust: false,
    requireSync: !flagSet(args, 'no-sync'),
  });
  try {
    return (await wallet.balances()).dustSpeck;
  } finally {
    await wallet.close();
  }
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
  chain: string | undefined,
): void {
  heading('per transaction, in SPECK');
  say(
    `  ${'circuit'.padEnd(24)} ${'bytes'.padStart(7)} ${`${reference} paid`.padStart(14)} ` +
      `${'BASELINE (not live)'.padStart(18)} ${(chain ? `${network} says` : `${network} price`).padStart(16)}`,
  );
  for (const tx of priced) {
    const ref = tx.referenceFeeSpeck === undefined ? '-' : tx.referenceFeeSpeck.toString();
    const base = tx.baselineFeeSpeck === undefined ? '-' : tx.baselineFeeSpeck.toString();
    const target = tx.targetFeeSpeck === undefined ? (tx.problem ? '!' : '-') : tx.targetFeeSpeck.toString();
    say(
      `  ${tx.circuit.slice(0, 24).padEnd(24)} ${String(tx.bytes ?? '-').padStart(7)} ${ref.padStart(14)} ` +
        `${base.padStart(18)} ${target.padStart(16)}`,
    );
  }
  for (const tx of priced.filter((t) => t.problem)) say(`  ! ${tx.circuit}: ${tx.problem}`);

  const referenceTotal = sum(priced.map((t) => t.referenceFeeSpeck));
  const baselineTotal = sum(priced.map((t) => t.baselineFeeSpeck));
  const targetTotal = sum(priced.map((t) => t.targetFeeSpeck));
  const required = requiredSpeck(priced, args);

  heading('totals');
  say(`  ${reference} actually paid        ${referenceTotal} SPECK (${formatDust(referenceTotal)} DUST)`);
  if (baselineTotal > 0n) {
    say(`  ledger BASELINE (not live)  ${baselineTotal} SPECK (${formatDust(baselineTotal)} DUST)`);
  }
  if (targetTotal > 0n) {
    say(`  ${(chain ?? network).slice(0, 24).padEnd(26)}${targetTotal} SPECK (${formatDust(targetTotal)} DUST)`);
    if (baselineTotal > 0n && targetTotal > 0n) {
      say(`  the baseline is ${(Number(baselineTotal) / Number(targetTotal)).toFixed(0)}x the chain's own price`);
    }
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
  say('  Two caveats, stated rather than hidden.');
  say('');
  say("  These are the reference run's exact transactions re-priced, not the transactions that");
  say('  will actually be built. Keys, addresses, salts and a larger contract state move the');
  say(`  real cost by a few percent, which is what the ${marginPercent(args)}% margin is for.`);
  say('');
  say('  The BASELINE column is NOT an estimate and is printed only so nobody mistakes it for');
  say("  one. It is Transaction.fees against LedgerParameters.initialParameters(), the ledger's");
  say('  baseline parameter set, which no public network runs. It reads thousands of times the');
  say("  chain's own price: ~7,800x on our deployment (15.7 DUST against 0.002), and that is the");
  say('  mistake this command exists to stop. The answer is the column the chain supplied.');
  say('');
  say('  1 DUST = 10^15 SPECK.');
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
  const baselineTotal = sum(priced.map((t) => t.baselineFeeSpeck));
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
      'ledger bytes and priced by the target node via midnightRuntimeApi.getTransactionCost ' +
      '(targetFeeSpeck; absent under --offline). baselineFeeSpeck is Transaction.fees against ' +
      'LedgerParameters.initialParameters(), a baseline set no public network runs, recorded for ' +
      'comparison only and never the estimate. Nothing was built, proven or submitted.',
    estimatedAt: new Date().toISOString(),
    marginPercent: marginPercent(args),
    transactions: priced.map((t) => ({
      circuit: t.circuit,
      label: t.label,
      identifier: t.identifier,
      bytes: t.bytes,
      referenceFeeSpeck: t.referenceFeeSpeck?.toString(),
      baselineFeeSpeck: t.baselineFeeSpeck?.toString(),
      targetFeeSpeck: t.targetFeeSpeck?.toString(),
      problem: t.problem,
    })),
    totals: {
      referenceFeeSpeck: referenceTotal.toString(),
      baselineFeeSpeck: baselineTotal.toString(),
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
