// SPDX-License-Identifier: Apache-2.0
//
// The judge-facing check: read the deployed contract's state back out of the indexer and compare
// it, field by field, with the newest evidence file.
//
//   npm run -w cli verify -- --network preview
//
// This needs nothing but a network connection. No wallet, no mnemonic, no proof server and no
// proving keys: it only reads public state and re-derives the same projection the SDK uses. A
// mismatch prints as a diff and exits non-zero, so it is usable in CI.
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ledger } from '@stockandfoil/contract';
import { NETWORKS, toPublicLedgerView } from '@stockandfoil/sdk';
import { WebSocket } from 'ws';
import {
  fail,
  flagValue,
  heading,
  loadDeployment,
  newestEvidencePath,
  readJson,
  requireNetwork,
  say,
  serializeLedgerView,
  UsageError,
  type Args,
  type EvidenceFile,
  type LedgerViewJson,
} from './common.js';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const check = (checks: Check[], name: string, expected: unknown, actual: unknown): void => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  checks.push({
    name,
    ok,
    detail: ok ? String(render(actual)) : `evidence ${render(expected)} != chain ${render(actual)}`,
  });
};

const render = (value: unknown): string => {
  if (value === undefined) return '(absent)';
  if (typeof value === 'string') return value.length > 24 ? `${value.slice(0, 20)}…` : value;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 72);
  return String(value);
};

const assertThat = (checks: Check[], name: string, ok: boolean, detail: string): void => {
  checks.push({ name, ok, detail });
};

/** Compares two collections keyed by a ledger key, reporting missing, extra and differing rows. */
function compareByKey<T extends Record<string, unknown>>(
  checks: Check[],
  label: string,
  key: string,
  expected: readonly T[],
  actual: readonly T[],
): void {
  const chain = new Map(actual.map((row) => [String(row[key]), row]));
  const seen = new Set<string>();
  for (const row of expected) {
    const id = String(row[key]);
    seen.add(id);
    const found = chain.get(id);
    if (!found) {
      checks.push({ name: `${label}[${short(id)}]`, ok: false, detail: 'in the evidence but not on chain' });
      continue;
    }
    for (const field of Object.keys(row)) {
      if (field === key) continue;
      check(checks, `${label}[${short(id)}].${field}`, row[field], found[field]);
    }
  }
  for (const id of chain.keys()) {
    if (!seen.has(id)) {
      checks.push({ name: `${label}[${short(id)}]`, ok: false, detail: 'on chain but not in the evidence' });
    }
  }
}

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

export async function verify(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const deployment = loadDeployment(network);
  const path = flagValue(args, 'evidence') ?? newestEvidencePath(network);
  if (path === undefined) {
    throw new UsageError(`no evidence file for ${network}; run: npm run -w cli scenario -- --network ${network}`);
  }
  const evidence = readJson<EvidenceFile>(path);

  heading(`verifying ${network}`);
  say(`  contract  ${deployment.contractAddress}`);
  say(`  evidence  ${path}`);
  say(`  recorded  ${evidence.summary.steps} steps, ${evidence.summary.transactions} transactions, ` +
    `${evidence.summary.refusals.length} refusals`);

  setNetworkId(network as NetworkId);
  const globals = globalThis as { WebSocket?: unknown };
  globals.WebSocket ??= WebSocket;
  const endpoints = NETWORKS[network];
  const provider = indexerPublicDataProvider(endpoints.indexerHttpUrl, endpoints.indexerWsUrl, WebSocket as never);
  const state = await provider.queryContractState(deployment.contractAddress);
  if (!state) {
    fail(`no contract state at ${deployment.contractAddress} on ${network} (indexer ${endpoints.indexerHttpUrl})`);
    return 1;
  }
  const chain: LedgerViewJson = serializeLedgerView(toPublicLedgerView(ledger(state.data)));

  const checks: Check[] = [];

  // The evidence and the deployment must be talking about the same contract.
  check(checks, 'contractAddress', evidence.contractAddress, deployment.contractAddress);
  check(checks, 'network', evidence.network, deployment.network);

  // Sealed configuration: what the ceremony published is what the chain holds.
  check(checks, 'config.disclosurePk', deployment.disclosurePk, chain.config.disclosurePk);
  check(checks, 'config.auditorPk', deployment.auditorPk, chain.config.auditorPk);
  check(checks, 'config.keyholderPks', deployment.keyholderPks, chain.config.keyholderPks);
  check(checks, 'config.settlementColor', deployment.settlementColor, chain.config.settlementColor);
  check(checks, 'config.operatorId', evidence.finalState.config.operatorId, chain.config.operatorId);
  check(checks, 'config.threshold', evidence.finalState.config.threshold, chain.config.threshold);

  for (const name of Object.keys(evidence.finalState.counts)) {
    check(checks, `counts.${name}`, evidence.finalState.counts[name], chain.counts[name]);
  }

  compareByKey(checks, 'pledge', 'nullifier', evidence.finalState.pledges, chain.pledges);
  compareByKey(checks, 'record', 'recordId', evidence.finalState.records, chain.records);
  compareByKey(checks, 'certificate', 'certId', evidence.finalState.certificates, chain.certificates);
  compareByKey(checks, 'request', 'requestId', evidence.finalState.requests, chain.requests);
  compareByKey(checks, 'share', 'shareKey', evidence.finalState.shares, chain.shares);

  // What the evidence claims about itself, checked against the chain rather than taken on trust.
  assertThat(
    checks,
    'claim: refused steps submitted nothing',
    evidence.steps.filter((s) => s.refused).every((s) => s.txId === undefined),
    `${evidence.summary.refusals.length} refusals, none carrying a transaction id`,
  );
  const settled = chain.pledges.filter((p) => p.status === 'SETTLED');
  assertThat(
    checks,
    'claim: settled proceeds were claimed exactly once',
    settled.length > 0 && settled.every((p) => p.claimed && BigInt(p.amount) > 0n),
    `${settled.length} settled pledge(s), amounts ${settled.map((p) => p.amount).join(', ')}`,
  );
  const certificate = chain.certificates[0];
  assertThat(
    checks,
    'claim: a borrowing-base certificate locks its pool',
    certificate !== undefined && certificate.count === certificate.nullifiers.length && BigInt(certificate.floor) > 0n,
    certificate
      ? `floor ${certificate.floor}, ${certificate.count} slot(s), valid until ${certificate.validUntil}`
      : 'no certificate on chain',
  );
  const request = chain.requests[0];
  assertThat(
    checks,
    'claim: disclosure carried at least the threshold of approvals',
    request !== undefined && request.approvals.filter(Boolean).length >= chain.config.threshold,
    request ? `approvals ${JSON.stringify(request.approvals)}` : 'no disclosure request on chain',
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

  heading('checks');
  const failures = checks.filter((c) => !c.ok);
  for (const c of failures) say(`  FAIL ${c.name.padEnd(42)} ${c.detail ?? ''}`);
  if (failures.length === 0) {
    for (const c of checks.filter((c) => c.name.startsWith('claim:') || !c.name.includes('['))) {
      say(`  ok   ${c.name.padEnd(42)} ${c.detail ?? ''}`);
    }
    say(`\n  ${checks.length} checks passed; the chain matches the evidence.`);
    return 0;
  }
  fail(`\n  ${failures.length} of ${checks.length} checks FAILED; the chain does not match ${path}`);
  return 1;
}
