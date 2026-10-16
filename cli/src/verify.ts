// SPDX-License-Identifier: Apache-2.0
//
// The judge-facing check: read the deployed contract's state back out of the indexer and
// compare it with the evidence a run wrote.
//
//   npm run -w cli verify -- --network preview
//
// This needs nothing but a network connection. No wallet, no mnemonic, no proof server and no
// proving keys: it only reads public state and re-derives the same projection the SDK uses. A
// mismatch prints as a diff and exits non-zero, so it is usable in CI.
//
// ---------------------------------------------------------------------------------------------
// What "matches" means, and why it is not equality
//
// An evidence file is a photograph of a public ledger at one moment. The ledger then keeps
// going: somebody else runs the sponsorship demo, a second registry declares this one a peer,
// a later scenario adds a receivable. None of that makes the photograph false, and the first
// version of this command said it did — it compared the chain to the snapshot field for field
// and reported four FAILs the day a federation run added one acknowledgment and one peer entry
// to a registry whose evidence predated both.
//
// So the question it asks is monotonic: **is everything this evidence recorded still on chain
// and unchanged, and has nothing it recorded gone backwards?** Every marker, status, claimed
// flag, certificate, approval and the disclosure equality is still checked exactly, and any of
// them changing or disappearing is still a loud failure. What is no longer a failure is the
// chain having *more* than the evidence saw. That surplus is reported as an informational line,
// and where another evidence file for the same network explains it, by name.
//
// `--exact` restores strict equality, for our own regression runs against a devnet where
// nothing else is supposed to touch the contract.
// ---------------------------------------------------------------------------------------------
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ledger } from '@stockandfoil/contract';
import { toPublicLedgerView, type ChainNetwork } from '@stockandfoil/sdk';
import { WebSocket } from 'ws';
import {
  cliEndpoints,
  DEPLOYMENTS_DIR,
  EVIDENCE_DIR,
  fail,
  flagSet,
  flagValue,
  heading,
  instanceOf,
  loadDeployment,
  newestEvidencePath,
  readJson,
  redactEndpoint,
  requireNetwork,
  say,
  scopeOf,
  serializeLedgerView,
  UsageError,
  type Args,
  type EvidenceFile,
  type LedgerViewJson,
} from './common.js';

type Severity = 'ok' | 'fail' | 'info';

interface Check {
  name: string;
  severity: Severity;
  detail?: string;
}

const render = (value: unknown): string => {
  if (value === undefined) return '(absent)';
  if (typeof value === 'string') return value.length > 24 ? `${value.slice(0, 20)}…` : value;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 72);
  return String(value);
};

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

/** An exact field comparison. Always a failure when it differs, in either mode. */
const check = (checks: Check[], name: string, expected: unknown, actual: unknown): void => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  checks.push({
    name,
    severity: ok ? 'ok' : 'fail',
    detail: ok ? String(render(actual)) : `evidence ${render(expected)} != chain ${render(actual)}`,
  });
};

const assertThat = (checks: Check[], name: string, ok: boolean, detail: string): void => {
  checks.push({ name, severity: ok ? 'ok' : 'fail', detail });
};

// ------------------------------------------------------------------- explaining the surplus

/** Another evidence file for this network, which may account for something newer on chain. */
interface Sibling {
  path: string;
  name: string;
  kind: string;
  /** Contracts this file is about. */
  contracts: string[];
  /** Circuits it recorded, per contract — a cross-registry run touches two. */
  circuitsByContract: Map<string, string[]>;
  /** The whole file as text, for "does this mention that key" lookups. */
  raw: string;
  at: string;
}

function readSiblings(network: ChainNetwork, exclude: string): Sibling[] {
  const out: Sibling[] = [];
  const dirs: Array<[string, string]> = [
    [EVIDENCE_DIR, 'evidence'],
    [DEPLOYMENTS_DIR, 'deployment'],
  ];
  for (const [dir, kindHint] of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      if (!file.endsWith('.json') || path === exclude) continue;
      if (!file.includes(network)) continue;
      let raw: string;
      let parsed: Record<string, unknown>;
      try {
        raw = readFileSync(path, 'utf8');
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
      const registries = (parsed.registries as Array<{ contractAddress?: string }> | undefined) ?? [];
      const contracts = [
        ...(typeof parsed.contractAddress === 'string' ? [parsed.contractAddress] : []),
        ...registries.map((r) => r.contractAddress).filter((a): a is string => typeof a === 'string'),
      ];
      // A cross-registry run records steps against two different contracts, and its steps say
      // which by role ("B (Harbour)"). Attributing every circuit to every contract it mentions
      // would tell a reader that the federation run acknowledged an invoice in registry A,
      // which it did not.
      const steps = (parsed.steps as Array<{ circuit?: string; registry?: string }> | undefined) ?? [];
      const byRole = new Map(
        (parsed.registries as Array<{ role?: string; contractAddress?: string }> | undefined)?.flatMap((r) =>
          typeof r.role === 'string' && typeof r.contractAddress === 'string' ? [[r.role, r.contractAddress]] : [],
        ) ?? [],
      );
      const circuitsByContract = new Map<string, string[]>();
      for (const step of steps) {
        if (typeof step.circuit !== 'string') continue;
        const role = typeof step.registry === 'string' ? step.registry.split(' ')[0] : undefined;
        const target =
          (role !== undefined ? byRole.get(role) : undefined) ??
          (typeof parsed.contractAddress === 'string' ? parsed.contractAddress : undefined);
        if (target === undefined) continue;
        const list = circuitsByContract.get(target) ?? [];
        if (!list.includes(step.circuit)) list.push(step.circuit);
        circuitsByContract.set(target, list);
      }
      out.push({
        path,
        name: `cli/${kindHint === 'evidence' ? 'evidence' : 'deployments'}/${file}`,
        kind: typeof parsed.kind === 'string' ? parsed.kind : kindHint,
        contracts,
        circuitsByContract,
        raw,
        at: String(parsed.at ?? parsed.finishedAt ?? parsed.deployedAt ?? ''),
      });
    }
  }
  return out;
}

/** Which sibling files mention a particular ledger key. */
const mentioning = (siblings: readonly Sibling[], key: string): Sibling[] =>
  siblings.filter((s) => s.raw.includes(key));

/** Which sibling files touched this contract after the evidence was written. */
const laterOn = (siblings: readonly Sibling[], contract: string, after: string): Sibling[] =>
  siblings.filter((s) => s.contracts.includes(contract) && s.at > after);

const nameList = (siblings: readonly Sibling[]): string =>
  siblings.length === 0 ? '' : siblings.map((s) => s.name).join(', ');

/**
 * Which circuit adds a row to which ledger map.
 *
 * Written out rather than inferred, so that an explanation of a surplus names the call that
 * actually caused it instead of every call that happened afterwards. A circuit that only
 * changes an existing row — `accept`, `release`, `payInvoice`, the claims — adds nothing and is
 * deliberately absent.
 */
const GROWS: Readonly<Record<string, readonly string[]>> = {
  admitDebtor: ['debtors'],
  admitFinancier: ['financiers'],
  registerPeer: ['peers'],
  acknowledge: ['acks', 'ackNullifiers'],
  offer: ['pledges', 'records'],
  certifyBorrowingBase: ['certificates'],
  requestDisclosure: ['requests'],
  approveDisclosure: ['shares'],
  openCase: ['cases'],
  approveCase: ['shares'],
};

/** The later runs whose calls could have grown this particular count, and which calls. */
function blamedFor(count: string, later: readonly Sibling[], contract: string): string {
  const named = later
    .map((s) => {
      const circuits = (s.circuitsByContract.get(contract) ?? []).filter((c) => GROWS[c]?.includes(count));
      return circuits.length === 0 ? undefined : `${s.name} (${circuits.join(', ')})`;
    })
    .filter((x): x is string => x !== undefined);
  if (named.length > 0) return named.join('; ');
  // No call we know of grows this map. Say what else happened rather than inventing a cause.
  return later.length === 0 ? '' : `later activity on this contract: ${later.map((s) => s.name).join(', ')}`;
}

// ------------------------------------------------------------------------------- comparisons

interface CompareOptions {
  exact: boolean;
  siblings: readonly Sibling[];
}

/**
 * Counts of a ledger map.
 *
 * Monotonic: the chain holding more than the evidence saw is normal and informational; holding
 * *fewer* means something the evidence recorded is gone, which the row checks below will name.
 */
function compareCount(
  checks: Check[],
  name: string,
  expected: number,
  actual: number,
  explain: (count: string) => string,
  options: CompareOptions,
): void {
  if (options.exact || actual === expected) {
    check(checks, name, expected, actual);
    return;
  }
  if (actual < expected) {
    checks.push({
      name,
      severity: 'fail',
      detail: `the ledger shrank: evidence recorded ${expected}, chain holds ${actual}`,
    });
    return;
  }
  const surplus = actual - expected;
  const why = explain(name.replace(/^counts\./, ''));
  checks.push({
    name,
    severity: 'info',
    detail:
      `${expected} recorded, ${actual} on chain (+${surplus} newer than this evidence)` +
      (why === '' ? '' : ` — ${why}`),
  });
}

/**
 * Collections keyed by a ledger key.
 *
 * Every row the evidence recorded must still be there, field for field. A row the chain has and
 * the evidence does not is later activity, not a contradiction.
 */
function compareByKey<T extends Record<string, unknown>>(
  checks: Check[],
  label: string,
  key: string,
  expected: readonly T[],
  actual: readonly T[],
  options: CompareOptions,
): void {
  const chain = new Map(actual.map((row) => [String(row[key]), row]));
  const seen = new Set<string>();
  for (const row of expected) {
    const id = String(row[key]);
    seen.add(id);
    const found = chain.get(id);
    if (!found) {
      checks.push({
        name: `${label}[${short(id)}]`,
        severity: 'fail',
        detail: 'in the evidence but no longer on chain',
      });
      continue;
    }
    for (const field of Object.keys(row)) {
      if (field === key) continue;
      check(checks, `${label}[${short(id)}].${field}`, row[field], found[field]);
    }
  }
  for (const id of chain.keys()) {
    if (seen.has(id)) continue;
    if (options.exact) {
      checks.push({ name: `${label}[${short(id)}]`, severity: 'fail', detail: 'on chain but not in the evidence' });
      continue;
    }
    const from = nameList(mentioning(options.siblings, id));
    checks.push({
      name: `${label}[${short(id)}]`,
      severity: 'info',
      detail: from === '' ? 'on chain, newer than this evidence' : `on chain, recorded by ${from}`,
    });
  }
}

// --------------------------------------------------------------------------------- the command

export async function verify(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const instance = instanceOf(args);
  const scope = scopeOf(network, instance);
  const exact = flagSet(args, 'exact');
  const deployment = loadDeployment(network, instance);

  const endpoints = cliEndpoints(args, network);
  setNetworkId(network as NetworkId);
  const globals = globalThis as { WebSocket?: unknown };
  globals.WebSocket ??= WebSocket;
  const provider = indexerPublicDataProvider(endpoints.indexerHttpUrl, endpoints.indexerWsUrl, WebSocket as never);
  const state = await provider.queryContractState(deployment.contractAddress);
  if (!state) {
    fail(
      `no contract state at ${deployment.contractAddress} on ${scope} ` +
        `(indexer ${redactEndpoint(endpoints.indexerHttpUrl)})`,
    );
    return 1;
  }
  const chain: LedgerViewJson = serializeLedgerView(toPublicLedgerView(ledger(state.data)));

  const evidencePath = flagValue(args, 'evidence') ?? newestEvidencePath(scope);
  if (evidencePath === undefined) {
    return verifyDeploymentOnly(args, scope, network, instance, deployment, chain, endpoints.indexerHttpUrl);
  }
  const evidence = readJson<EvidenceFile>(evidencePath);
  const siblings = readSiblings(network, evidencePath);
  const options: CompareOptions = { exact, siblings };
  const later = laterOn(siblings, deployment.contractAddress, evidence.finishedAt);
  const explainCount = (count: string): string => blamedFor(count, later, deployment.contractAddress);

  heading(`verifying ${scope}`);
  say(`  contract  ${deployment.contractAddress}`);
  say(`  evidence  ${evidencePath}`);
  say(`  indexer   ${redactEndpoint(endpoints.indexerHttpUrl)}`);
  say(
    `  recorded  ${evidence.summary.steps} steps, ${evidence.summary.transactions} transactions, ` +
      `${evidence.summary.refusals.length} refusals`,
  );
  say(
    exact
      ? '  mode      exact — the chain must equal the evidence, nothing more'
      : '  mode      monotonic — everything recorded must still hold; later activity is reported, not failed',
  );

  const checks: Check[] = [];

  // The evidence and the deployment must be talking about the same contract.
  check(checks, 'contractAddress', evidence.contractAddress, deployment.contractAddress);
  check(checks, 'network', evidence.network, deployment.network);

  // Sealed configuration: what the ceremony published is what the chain holds. This can never
  // change, so it is compared exactly in both modes.
  check(checks, 'config.disclosurePk', deployment.disclosurePk, chain.config.disclosurePk);
  check(checks, 'config.auditorPk', deployment.auditorPk, chain.config.auditorPk);
  check(checks, 'config.keyholderPks', deployment.keyholderPks, chain.config.keyholderPks);
  check(checks, 'config.settlementColor', deployment.settlementColor, chain.config.settlementColor);
  check(checks, 'config.operatorId', evidence.finalState.config.operatorId, chain.config.operatorId);
  check(checks, 'config.threshold', evidence.finalState.config.threshold, chain.config.threshold);

  for (const name of Object.keys(evidence.finalState.counts)) {
    compareCount(
      checks,
      `counts.${name}`,
      evidence.finalState.counts[name]!,
      chain.counts[name] ?? 0,
      explainCount,
      options,
    );
  }

  compareByKey(checks, 'pledge', 'nullifier', evidence.finalState.pledges, chain.pledges, options);
  compareByKey(checks, 'record', 'recordId', evidence.finalState.records, chain.records, options);
  compareByKey(checks, 'certificate', 'certId', evidence.finalState.certificates, chain.certificates, options);
  compareByKey(checks, 'request', 'requestId', evidence.finalState.requests, chain.requests, options);
  compareByKey(checks, 'share', 'shareKey', evidence.finalState.shares, chain.shares, options);
  compareByKey(checks, 'peer', 'address', evidence.finalState.peers ?? [], chain.peers, options);
  compareByKey(checks, 'case', 'caseRef', evidence.finalState.cases ?? [], chain.cases, options);

  // What the evidence claims about itself, checked against the chain rather than taken on trust.
  assertThat(
    checks,
    'claim: refused steps submitted nothing',
    evidence.steps.filter((s) => s.refused).every((s) => s.txId === undefined),
    `${evidence.summary.refusals.length} refusals, none carrying a transaction id`,
  );
  // Scoped to the pledges this evidence recorded: a later run's settled pledge is not this
  // evidence's claim to make.
  const recorded = new Set(evidence.finalState.pledges.map((p) => p.nullifier));
  const settled = chain.pledges.filter((p) => recorded.has(p.nullifier) && p.status === 'SETTLED');
  assertThat(
    checks,
    'claim: settled proceeds were claimed exactly once',
    settled.length > 0 && settled.every((p) => p.claimed && BigInt(p.amount) > 0n),
    `${settled.length} settled pledge(s) from this run, amounts ${settled.map((p) => p.amount).join(', ')}`,
  );
  const recordedCerts = new Set(evidence.finalState.certificates.map((c) => c.certId));
  const certificate = chain.certificates.find((c) => recordedCerts.has(c.certId));
  assertThat(
    checks,
    'claim: a borrowing-base certificate locks its pool',
    certificate !== undefined && certificate.count === certificate.nullifiers.length && BigInt(certificate.floor) > 0n,
    certificate
      ? `floor ${certificate.floor}, ${certificate.count} slot(s), valid until ${certificate.validUntil}`
      : 'no certificate from this run on chain',
  );
  const recordedRequests = new Set(evidence.finalState.requests.map((r) => r.requestId));
  const request = chain.requests.find((r) => recordedRequests.has(r.requestId));
  assertThat(
    checks,
    'claim: disclosure carried at least the threshold of approvals',
    request !== undefined && request.approvals.filter(Boolean).length >= chain.config.threshold,
    request ? `approvals ${JSON.stringify(request.approvals)}` : 'no disclosure request from this run on chain',
  );
  assertThat(
    checks,
    'claim: the opened record recomputed the on-ledger nullifier',
    evidence.disclosure?.verified === true &&
      evidence.disclosure.recomputedNullifier === evidence.disclosure.ledgerNullifier,
    evidence.disclosure
      ? `${evidence.disclosure.recomputedNullifier} == ${evidence.disclosure.ledgerNullifier}`
      : 'the evidence records no disclosure',
  );

  return report(checks, evidencePath, exact ? 'exact' : 'monotonic');
}

/**
 * A registry with no scenario of its own — a peer, say — still has something checkable: the
 * configuration its ceremony sealed into the ledger at deploy time.
 */
async function verifyDeploymentOnly(
  args: Args,
  scope: string,
  network: ChainNetwork,
  instance: string | undefined,
  deployment: ReturnType<typeof loadDeployment>,
  chain: LedgerViewJson,
  indexerUrl: string,
): Promise<number> {
  if (!flagSet(args, 'deployment-only')) {
    throw new UsageError(
      `no evidence file for ${scope}. Either run the scenario:\n` +
        `  npm run -w cli scenario -- --network ${network}` +
        (instance === undefined ? '' : ` --instance ${instance}`) +
        '\nor, for a registry that has no scenario of its own, check what its ceremony sealed:\n' +
        `  npm run -w cli verify -- --network ${network}` +
        (instance === undefined ? '' : ` --instance ${instance}`) +
        ' --deployment-only',
    );
  }

  heading(`verifying ${scope} (deployment only)`);
  say(`  contract  ${deployment.contractAddress}`);
  say(`  indexer   ${redactEndpoint(indexerUrl)}`);
  say('  mode      deployment-only — this registry has no scenario evidence, so what is checked');
  say('            is that the contract exists and holds the configuration its ceremony sealed');

  const checks: Check[] = [];
  check(checks, 'config.disclosurePk', deployment.disclosurePk, chain.config.disclosurePk);
  check(checks, 'config.auditorPk', deployment.auditorPk, chain.config.auditorPk);
  check(checks, 'config.keyholderPks', deployment.keyholderPks, chain.config.keyholderPks);
  check(checks, 'config.settlementColor', deployment.settlementColor, chain.config.settlementColor);
  assertThat(
    checks,
    'claim: the threshold is 2 of 3',
    chain.config.threshold === 2 && chain.config.keyholderPks.length === 3,
    `${chain.config.threshold} of ${chain.config.keyholderPks.length}`,
  );
  checks.push({ name: 'ledger counts', severity: 'info', detail: JSON.stringify(chain.counts) });
  for (const peer of chain.peers) {
    checks.push({ name: `peer[${short(peer.address)}]`, severity: 'info', detail: 'declared by this registry' });
  }
  return report(checks, undefined, 'deployment-only');
}

type Mode = 'monotonic' | 'exact' | 'deployment-only';

const CONCLUSION: Readonly<Record<Mode, string>> = {
  monotonic: 'everything the evidence records is still on chain and unchanged.',
  exact: 'the chain equals the evidence.',
  'deployment-only': 'the contract holds the configuration its ceremony sealed.',
};

const SURPLUS_HEADING: Readonly<Record<Mode, string>> = {
  monotonic: 'newer than this evidence (not failures)',
  exact: 'newer than this evidence (not failures)',
  'deployment-only': 'also on chain (informational)',
};

function report(checks: readonly Check[], evidencePath: string | undefined, mode: Mode): number {
  const failures = checks.filter((c) => c.severity === 'fail');
  const infos = checks.filter((c) => c.severity === 'info');
  const passes = checks.filter((c) => c.severity === 'ok');

  heading('checks');
  for (const c of failures) say(`  FAIL ${c.name.padEnd(42)} ${c.detail ?? ''}`);
  if (failures.length > 0) {
    fail(
      `\n  ${failures.length} of ${checks.length} checks FAILED; the chain contradicts ` +
        `${evidencePath ?? 'the deployment record'}`,
    );
    return 1;
  }

  for (const c of passes) {
    if (c.name.startsWith('claim:') || !c.name.includes('[')) say(`  ok   ${c.name.padEnd(42)} ${c.detail ?? ''}`);
  }
  if (infos.length > 0) {
    heading(SURPLUS_HEADING[mode]);
    for (const c of infos) say(`  +    ${c.name.padEnd(42)} ${c.detail ?? ''}`);
  }

  say(
    `\n  ${passes.length} checks passed${infos.length > 0 ? `, ${infos.length} informational` : ''}; ` +
      CONCLUSION[mode],
  );
  return 0;
}
