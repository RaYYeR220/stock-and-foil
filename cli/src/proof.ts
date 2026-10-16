// SPDX-License-Identifier: Apache-2.0
//
// Regenerates the evidence sections of PROOF.md from the files the CLI wrote.
//
//   npm run -w cli proof -- --network preview
//
// PROOF.md used to be typed out by hand from the console output of a run. That worked once and
// then rotted: a redeploy means twenty-odd transaction hashes, block heights and timings change
// at the same moment, and a document a reader is supposed to check against the chain is exactly
// the wrong place for a transcription error. Everything between the generated markers is
// therefore derived from `cli/deployments/<network>.json`, the newest
// `cli/evidence/<network>-*.json`, and the newest `cli/evidence/sponsored-<network>-*.json` if
// there is one. The prose around the markers stays hand-written.
//
// It reads files and writes one file. No network, no wallet.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDust, type ChainNetwork } from '@stockandfoil/sdk';
import {
  EVIDENCE_DIR,
  explorerFor,
  flagValue,
  heading,
  loadDeployment,
  newestEvidencePath,
  readJson,
  REPO_ROOT,
  requireNetwork,
  say,
  UsageError,
  type Args,
  type DeploymentFile,
  type EvidenceFile,
  type ExplorerTemplates,
  type StepRecord,
} from './common.js';
import { readdirSync } from 'node:fs';

const PROOF_PATH = join(REPO_ROOT, 'PROOF.md');

const begin = (network: ChainNetwork): string => `<!-- BEGIN GENERATED ${network} -->`;
const end = (network: ChainNetwork): string => `<!-- END GENERATED ${network} -->`;

/** `2026-09-15T17:38:30.000Z` as `17:38:30Z`, or the whole stamp when a date is wanted. */
const clock = (iso: string | undefined): string => (iso === undefined ? '-' : `${iso.slice(11, 19)}Z`);
const stamp = (iso: string | undefined): string =>
  iso === undefined ? '-' : `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;

const short = (hash: string | undefined): string => (hash === undefined ? '-' : `${hash.slice(0, 12)}...`);

/** A transaction as a link to the explorer, by hash, because the explorer 404s on an identifier. */
function txLink(explorer: ExplorerTemplates | undefined, hash: string | undefined): string {
  if (hash === undefined) return '-';
  if (explorer === undefined) return `\`${short(hash)}\``;
  return `[\`${short(hash)}\`](${explorer.tx.replace('{txHash}', hash)})`;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** Newest sponsorship evidence for a network, if the proof has been run. */
function newestSponsoredPath(network: ChainNetwork): string | undefined {
  if (!existsSync(EVIDENCE_DIR)) return undefined;
  const names = readdirSync(EVIDENCE_DIR)
    .filter((n) => n.startsWith(`sponsored-${network}-`) && n.endsWith('.json'))
    .sort();
  const newest = names.at(-1);
  return newest === undefined ? undefined : join(EVIDENCE_DIR, newest);
}

interface SponsoredEvidence {
  contractAddress: string;
  at: string;
  claim: string;
  actingWallet: {
    address: string;
    dustSpeckBefore: string;
    dustSpeckAfter: string;
    nightStar: string;
    registeredForDustGeneration: number;
  };
  sponsor: { endpoint: string };
  steps: Array<{
    circuit: string;
    label: string;
    txId: string;
    txHash?: string;
    blockHeight?: number;
    blockTimestamp?: string;
    feeSpeck?: string;
    sponsorReportedFeeSpeck?: string;
  }>;
  totalSponsoredFeeSpeck?: string;
}

// ------------------------------------------------------------------------------------ sections

/**
 * How to follow a link in the tables below.
 *
 * Worth saying once rather than leaving a reader to discover it: the two identifiers a Midnight
 * transaction has are not interchangeable, and the explorer only knows one of them.
 */
function readingTheLinks(explorer: ExplorerTemplates | undefined): string {
  if (explorer === undefined) {
    return [
      '### Reading the links',
      '',
      'This network has no public explorer, so the tables below carry transaction identifiers and',
      'block heights only.',
    ].join('\n');
  }
  return [
    '### Reading the links',
    '',
    'midnight-js reports a transaction *identifier* (the value a contract call is keyed by);',
    'Midnight Explorer indexes by the transaction *hash* and answers a lookup by identifier with a',
    '404. The evidence file carries both for every transaction, and the links below use the hash.',
    'The templates are recorded in the deployment file under `explorer`:',
    '',
    '```',
    `tx           ${explorer.tx}`,
    `contract     ${explorer.contract}`,
    `block        ${explorer.block}`,
    `subscanBlock ${explorer.subscanBlock}`,
    '```',
    '',
    'Subscan gets a block template only. `/block/<height>` resolves, but `/extrinsic/<ledger tx',
    'hash>` renders the same empty page for a real hash as for thirty-two zero bytes: a Midnight',
    '*ledger* transaction hash is not the Substrate extrinsic hash Subscan keys on, so there is no',
    'honest per-transaction Subscan link for this chain.',
  ].join('\n');
}

function deploymentTable(deployment: DeploymentFile, evidence: EvidenceFile): string {
  const explorer = deployment.explorer ?? evidence.explorer;
  const rows: string[] = [];
  const deploy = evidence.deployment.deployTx;
  rows.push(
    `| 1 | \`deploy\` - constructor + first verifier keys | ${txLink(explorer, deploy.txHash)} | ` +
      `${deploy.blockHeight ?? '-'} | ${stamp(deploy.blockTimestamp)} |`,
  );
  evidence.deployment.maintenanceTxs.forEach((tx, i) => {
    rows.push(
      `| ${i + 2} | \`VerifierKeyInsert\` - \`${tx.circuit}\` | ${txLink(explorer, tx.txHash)} | ` +
        `${tx.blockHeight ?? '-'} | ${stamp(tx.blockTimestamp)} |`,
    );
  });
  const total = 1 + evidence.deployment.maintenanceTxs.length;
  return [
    `### Deployment: ${total} transactions`,
    '',
    "A Midnight block caps the bytes one transaction may write, and this contract's verifier keys",
    'do not fit under it, so the deployment is staged: the deploy transaction carries the',
    `constructor and the first six keys, and ${total - 1} \`VerifierKeyInsert\` maintenance transactions`,
    "carry the rest. They are signed by the deployer's maintenance authority, whose key lives in",
    'the private-state store under `cli/.secrets/` and never leaves this machine.',
    '',
    '| # | Stage | Transaction | Block | Time (UTC) |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function scenarioTable(evidence: EvidenceFile): string {
  const explorer = evidence.explorer;
  const submitted = evidence.steps.filter((s) => s.txId !== undefined);
  const refusals = evidence.steps.filter((s) => s.refused !== undefined);
  const offChain = evidence.steps.filter((s) => s.txId === undefined && s.refused === undefined);

  const rows: string[] = [];
  let n = 0;
  for (const step of evidence.steps) {
    if (step.refused !== undefined) continue;
    n += 1;
    rows.push(
      `| ${n} | ${step.label} | \`${step.circuit}\` | ${step.persona} | ` +
        `${step.txId === undefined ? 'none' : txLink(explorer, step.txHash)} | ` +
        `${step.blockHeight ?? '-'} | ${clock(step.blockTimestamp ?? step.at)} | ${seconds(step.durationMs)} |`,
    );
  }

  return [
    `### The scenario: ${submitted.length} transactions`,
    '',
    `The First Brands replay, end to end. ${evidence.steps.length} steps: ${submitted.length} transactions,`,
    `${refusals.length} refusals that submitted nothing, and ${offChain.length} checks a party runs off chain`,
    'against public state. One funded wallet paid every fee; the personas are private-state',
    'identities, not wallets, each proving knowledge of a secret whose hash is on the ledger.',
    '',
    '"Proof + submit" is wall-clock from the CLI calling the circuit to the transaction being',
    'accepted, including proving on a local proof server.',
    '',
    '| # | Step | Circuit | Persona | Transaction | Block | Time (UTC) | Proof + submit |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function finalState(evidence: EvidenceFile): string {
  const c = evidence.finalState.counts;
  const settled = evidence.finalState.pledges.filter((p) => p.status === 'SETTLED');
  const named = Object.entries(c)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  const fee = evidence.summary.totalFeeSpeck;
  return [
    `Final public state after the run: ${named}.`,
    settled.length === 0
      ? ''
      : `${settled.length} pledge(s) \`SETTLED\` with \`claimed = true\`, amount(s) ` +
        `${settled.map((p) => p.amount).join(', ')}.`,
    fee === undefined
      ? ''
      : `The whole run cost **${fee} SPECK** (${formatDust(BigInt(fee))} DUST), read back from the ` +
        'indexer per transaction rather than asserted.',
  ]
    .filter((line) => line !== '')
    .join(' ');
}

function refusalsTable(evidence: EvidenceFile): string {
  const refusals = evidence.steps.filter((s): s is StepRecord & { refused: string } => s.refused !== undefined);
  return [
    '### Refusals: what was attempted, and what reached the chain',
    '',
    'Each of these ran the real circuit against the real ledger state. The contract asserts while',
    'the transaction is being *built*, so there is nothing to submit, nothing to mine and nothing',
    `to revert. **None of these ${refusals.length} has a transaction id, on any explorer, because none exists.**`,
    '`verify` re-checks that claim against the chain.',
    '',
    '| Refusal code | What was attempted | Circuit | Transaction submitted |',
    '|---|---|---|---|',
    ...refusals.map((s) => `| \`${s.refused}\` | ${s.label} | \`${s.circuit}\` | none |`),
  ].join('\n');
}

function offChainChecks(evidence: EvidenceFile): string {
  const checks = evidence.steps.filter((s) => s.txId === undefined && s.refused === undefined && s.note);
  if (checks.length === 0) return '';
  return [
    '### The checks a party runs for itself, off chain',
    '',
    'Neither of these submits anything. They read public state and reach a conclusion the reader',
    'can reach the same way.',
    '',
    ...checks.flatMap((s) => [`- **${s.label}** (\`${s.circuit}\`, ${s.persona}): ${s.note}`, '']),
  ]
    .join('\n')
    .trimEnd();
}

function disclosureTable(evidence: EvidenceFile): string {
  const d = evidence.disclosure;
  if (!d) return '';
  return [
    '### The disclosure, opened and self-proving',
    '',
    '| | |',
    '|---|---|',
    `| Request id | \`${d.requestId}\` |`,
    `| Record id | \`${d.recordId}\` |`,
    `| Case reference | \`${d.caseRef}\` |`,
    `| Approvals on the ledger | \`${JSON.stringify(d.approvals)}\` |`,
    `| Shamir indices recombined | ${d.shamirIndices.join(' + ')} |`,
    `| Opened invoice | #${d.openedInvoice.invoiceNo}, ${d.openedInvoice.amount} minor units, due ${d.openedInvoice.dueDate} |`,
    `| Fingerprint | \`${d.fingerprint ?? '-'}\` |`,
    `| Acknowledgment leaf | \`${d.ackLeaf ?? '-'}\` |`,
    `| Nullifier recomputed from the plaintext | \`${d.recomputedNullifier ?? '-'}\` |`,
    `| Nullifier the pledge is keyed by on chain | \`${d.ledgerNullifier ?? '-'}\` |`,
    '',
    'The two nullifiers are equal, which is the point: the auditor did not receive an invoice and',
    "take somebody's word for it - the plaintext it recovered rehashes to the exact public marker",
    'the registry has been tracking since the offer.',
  ].join('\n');
}

function sponsorshipSection(path: string | undefined, explorer: ExplorerTemplates | undefined): string {
  if (path === undefined) return '';
  const s = readJson<SponsoredEvidence>(path);
  const total = s.totalSponsoredFeeSpeck ?? '0';
  return [
    '### A party holding zero DUST transacted anyway',
    '',
    'Every Midnight transaction pays its fee in DUST; DUST is generated only by registered NIGHT,',
    'is non-transferable, and a contract cannot hold it. A debtor confirming an invoice their',
    'employer owes is a finance clerk, not a crypto user, and will not be made to acquire NIGHT',
    'first. The official sponsorship pattern removes that step without weakening anything: the',
    "contract authenticates by secret knowledge, so the sponsor's money buys a block slot and",
    'nothing else.',
    '',
    '| | |',
    '|---|---|',
    `| Acting wallet | \`${s.actingWallet.address}\` |`,
    `| Its DUST before | **${s.actingWallet.dustSpeckBefore} SPECK** |`,
    `| Its DUST after | **${s.actingWallet.dustSpeckAfter} SPECK** |`,
    `| Its NIGHT | ${s.actingWallet.nightStar} STAR, ${s.actingWallet.registeredForDustGeneration} UTXO(s) registered for DUST generation |`,
    `| Run at | ${stamp(s.at)} |`,
    `| Evidence | [\`${path.slice(path.lastIndexOf('evidence'))}\`](./cli/${path.slice(path.lastIndexOf('evidence')).replace(/\\/g, '/')}) |`,
    '',
    '| Circuit | Transaction | Block | Fee paid by the sponsor |',
    '|---|---|---|---|',
    ...s.steps.map(
      (step) =>
        `| \`${step.circuit}\` | ${txLink(explorer, step.txHash)} | ${step.blockHeight ?? '-'} | ` +
        `${step.feeSpeck ?? step.sponsorReportedFeeSpeck ?? '?'} SPECK |`,
    ),
    '',
    `Total paid by the sponsor: **${total} SPECK** (${formatDust(BigInt(total))} DUST).`,
    '',
    'The acting wallet was created from a seed of its own, never funded and never registered for',
    'DUST generation. Its balance was read from the chain *before* the run and the command aborts',
    'unless it is exactly zero — the claim is not that it ought to be empty but that it was, at the',
    'moment it transacted. It proved, balanced only the shielded and unshielded sides, signed and',
    'bound the transaction; the sponsor balanced the DUST and submitted. Its balance was read again',
    'afterwards and is still zero, because it never paid.',
  ].join('\n');
}

// --------------------------------------------------------------------------------------- render

function render(
  network: ChainNetwork,
  deployment: DeploymentFile,
  evidence: EvidenceFile,
  evidencePath: string,
  sponsoredPath: string | undefined,
): string {
  const explorer = deployment.explorer ?? evidence.explorer;
  const heights = evidence.steps.map((s) => s.blockHeight).filter((h): h is number => h !== undefined);
  const relative = (p: string): string => p.slice(p.lastIndexOf('evidence')).replace(/\\/g, '/');

  return [
    begin(network),
    '',
    '| | |',
    '|---|---|',
    `| Contract address | ${
      explorer
        ? `[\`${deployment.contractAddress}\`](${explorer.contract.replace('{address}', deployment.contractAddress)})`
        : `\`${deployment.contractAddress}\``
    } |`,
    `| Deployed at | ${stamp(deployment.deployedAt)} |`,
    `| Deployment record | [\`cli/deployments/${network}.json\`](./cli/deployments/${network}.json) |`,
    `| Evidence | [\`cli/${relative(evidencePath)}\`](./cli/${relative(evidencePath)}) |`,
    `| Scenario window | ${stamp(evidence.startedAt)} - ${stamp(evidence.finishedAt)}${
      heights.length > 0 ? `, blocks ${Math.min(...heights)} - ${Math.max(...heights)}` : ''
    } |`,
    `| Compact toolchain | ${evidence.compactVersion} |`,
    `| Disclosure threshold | ${evidence.finalState.config.threshold} of ${evidence.finalState.config.keyholderPks.length} keyholders |`,
    '',
    readingTheLinks(explorer),
    '',
    deploymentTable(deployment, evidence),
    '',
    scenarioTable(evidence),
    '',
    finalState(evidence),
    '',
    refusalsTable(evidence),
    '',
    offChainChecks(evidence),
    '',
    disclosureTable(evidence),
    ...(sponsoredPath === undefined ? [] : ['', sponsorshipSection(sponsoredPath, explorer)]),
    '',
    end(network),
  ]
    .filter((part) => part !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export async function proof(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const deployment = loadDeployment(network);
  const evidencePath = flagValue(args, 'evidence') ?? newestEvidencePath(network);
  if (evidencePath === undefined) {
    throw new UsageError(`no evidence file for ${network}; run: npm run -w cli scenario -- --network ${network}`);
  }
  const evidence = readJson<EvidenceFile>(evidencePath);
  if (evidence.contractAddress !== deployment.contractAddress) {
    throw new UsageError(
      `${evidencePath} is evidence for ${evidence.contractAddress}, but the deployment record says ` +
        `${deployment.contractAddress}. Re-run the scenario against the deployed contract before ` +
        'regenerating PROOF.md.',
    );
  }
  const sponsoredPath = newestSponsoredPath(network);
  const section = render(network, deployment, evidence, evidencePath, sponsoredPath);

  const target = flagValue(args, 'out') ?? PROOF_PATH;
  if (!existsSync(target)) throw new UsageError(`${target} does not exist`);
  const document = readFileSync(target, 'utf8');
  const from = document.indexOf(begin(network));
  const to = document.indexOf(end(network));
  if (from < 0 || to < 0) {
    throw new UsageError(
      `${target} has no generated region for ${network}. Add these two lines where the evidence ` +
        `belongs, and re-run:\n  ${begin(network)}\n  ${end(network)}`,
    );
  }
  const updated = document.slice(0, from) + section + document.slice(to + end(network).length);
  writeFileSync(target, updated, 'utf8');

  heading(`regenerated the ${network} evidence in ${target}`);
  say(`  contract      ${deployment.contractAddress}`);
  say(`  evidence      ${evidencePath}`);
  say(`  transactions  ${evidence.summary.transactions}`);
  say(`  refusals      ${evidence.summary.refusals.length}`);
  say(`  dust paid     ${evidence.summary.totalFeeSpeck ?? 'unknown'} SPECK`);
  say(`  sponsorship   ${sponsoredPath ?? 'no proof run yet'}`);
  return 0;
}
