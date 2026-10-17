// SPDX-License-Identifier: Apache-2.0
//
// The browser half of the preflight, and the dry run.
//
// Everything in this file stops short of a signature. That is the contract it makes with the
// operator: run it as often as you like, on mainnet, and nothing will be built, proved,
// balanced or submitted. The first irreversible act in this console is a wallet dialog the
// operator has read.
import {
  CIRCUIT_IDS,
  chainTimeSeconds,
  fetchZkConfigProvider,
  formatDust,
  VERIFIER_KEYS_PER_TX,
} from '@stockandfoil/sdk';
import type { Check, ServerPreflight } from '../../server/preflight.js';
import { DEPLOY_TOTAL, describeDeployTx } from './deploy.js';
import { FROZEN_CIRCUITS, VERIFIER_KEYS_IN_DEPLOY_TX } from './frozen.js';
import { LIFECYCLE_PLAN, LIFECYCLE_PROMPTS } from './lifecycle.js';
import { describeError } from './state.js';
import type { ConsoleSession } from './session.js';

const ok = (id: string, title: string, detail: string): Check => ({ id, title, status: 'ok', detail });
const warn = (id: string, title: string, detail: string): Check => ({ id, title, status: 'warn', detail });
const fail = (id: string, title: string, detail: string): Check => ({ id, title, status: 'fail', detail });

/**
 * The compiled contract this tab actually loaded, against the frozen build.
 *
 * `CIRCUIT_IDS` is read off the compiled contract's `provableCircuits`, so this catches the
 * case the server-side manifest check cannot: a `contract-info.json` that says sixteen while
 * the JavaScript next to it was built from something else.
 */
export function checkLoadedContract(): Check {
  const loaded = [...CIRCUIT_IDS];
  const sameOrder = loaded.length === FROZEN_CIRCUITS.length && loaded.every((c, i) => c === FROZEN_CIRCUITS[i]);
  if (!sameOrder) {
    return fail(
      'contract',
      'Contract loaded in this tab',
      `the compiled contract exports ${loaded.length} proving circuits and not the frozen sixteen in ` +
        `order. Loaded: ${loaded.join(', ')}.`,
    );
  }
  if (VERIFIER_KEYS_PER_TX !== VERIFIER_KEYS_IN_DEPLOY_TX) {
    return warn(
      'contract',
      'Contract loaded in this tab',
      `the SDK carries ${VERIFIER_KEYS_PER_TX} verifier keys per deploy, not the ` +
        `${VERIFIER_KEYS_IN_DEPLOY_TX} this console was written against; the deployment will be ` +
        `${1 + (loaded.length - VERIFIER_KEYS_PER_TX)} transactions, not ${DEPLOY_TOTAL}.`,
    );
  }
  return ok(
    'contract',
    'Contract loaded in this tab',
    `sixteen circuits in the frozen order; ${VERIFIER_KEYS_PER_TX} keys ride in the deploy and ` +
      `${loaded.length - VERIFIER_KEYS_PER_TX} follow as maintenance transactions.`,
  );
}

/** That the staged proving material is reachable over HTTP from this origin, with CORS. */
export async function checkZkOverHttp(zkBaseUrl: string): Promise<Check> {
  const base = zkBaseUrl.endsWith('/') ? zkBaseUrl : `${zkBaseUrl}/`;
  try {
    const probes = await Promise.all(
      ['keys/offer.verifier', 'keys/offer.prover', 'zkir/offer.bzkir'].map(async (path) => {
        const response = await fetch(new URL(path, base), { method: 'HEAD' });
        return { path, ok: response.ok, cors: response.headers.get('access-control-allow-origin') };
      }),
    );
    const broken = probes.filter((p) => !p.ok);
    if (broken.length > 0) {
      return fail('zk-http', 'Proving keys over HTTP', `${broken.map((p) => p.path).join(', ')} did not answer 200.`);
    }
    const cors = probes[0]?.cors;

    // And then the same thing through the provider the deploy actually uses. A reachable URL
    // is not the same fact as a readable verifier key: the deploy reads these through
    // `FetchZkConfigProvider`, and the first time that was exercised in a browser it failed
    // while a plain `fetch` of the identical URL succeeded. Probing the real path is the whole
    // lesson of that bug.
    const provider = fetchZkConfigProvider(zkBaseUrl);
    const [verifier, zkir] = await Promise.all([provider.getVerifierKey('offer'), provider.getZKIR('offer')]);
    const verifierBytes = (verifier as unknown as { length?: number }).length ?? 0;
    const zkirBytes = (zkir as unknown as { length?: number }).length ?? 0;
    if (verifierBytes === 0) {
      return fail('zk-http', 'Proving keys over HTTP', 'the provider read a verifier key of zero bytes.');
    }
    return ok(
      'zk-http',
      'Proving keys over HTTP',
      `served from ${base} with Access-Control-Allow-Origin: ${cors ?? 'absent'}, and read back ` +
        `through the deploy's own provider: offer.verifier ${verifierBytes} bytes, offer.bzkir ` +
        `${zkirBytes} bytes. 1AM's proving provider fetches these; its guide requires the CORS header.`,
    );
  } catch (cause) {
    return fail(
      'zk-http',
      'Proving keys over HTTP',
      `the compiled material could not be read: ${describeError(cause)}`,
    );
  }
}

/**
 * Can this wallet actually pay for the deployment?
 *
 * The question that two failed mainnet attempts came down to. The signer reported exactly
 * 1.000000 DUST while the deployment prices at some multiple of that, and the only symptom
 * was a transaction that sat in the pool for thirteen blocks and was then marked Invalid with
 * no reason attached. It is arithmetic, and it belongs before the first prompt.
 *
 * It is a warning rather than a failure when the wallet holds nothing at all, because a
 * sponsored flow is a real design in which the signer's own balance is beside the point — but
 * a wallet that reports *some* DUST and not enough is the case that burned us, and that is a
 * failure.
 */
export function checkAffordable(session: ConsoleSession, server: ServerPreflight): Check {
  const total = server.facts.deploymentSpeck ? BigInt(server.facts.deploymentSpeck) : undefined;
  const first = server.facts.deployTxSpeck ? BigInt(server.facts.deployTxSpeck) : undefined;
  const held = session.reading.dustBalanceSpeck;
  if (total === undefined || first === undefined) {
    return warn('affordable', 'Can the wallet pay for it', 'the deployment could not be priced, so this is unknown.');
  }
  const dust = (speck: bigint): string => `${formatDust(speck)} DUST`;

  if (held === 0n) {
    return warn(
      'affordable',
      'Can the wallet pay for it',
      `the deployment prices at ${dust(total)} and the signer holds none. That is the sponsored ` +
        "case and may be fine — 1AM's pool pays — but nothing here can confirm the pool will " +
        'cover it, and the chain will not say why if it does not.',
    );
  }
  if (held < first) {
    return fail(
      'affordable',
      'Can the wallet pay for it',
      `the signer holds ${dust(held)} and the deploy transaction alone prices at ${dust(first)} — ` +
        `${dust(total)} for all eleven. If the fee comes from this wallet's allowance rather than ` +
        'the sponsor pool, the first transaction cannot pay for itself. This is what a transaction ' +
        'that sits in the pool and is then marked Invalid looks like.',
    );
  }
  if (held < total) {
    return warn(
      'affordable',
      'Can the wallet pay for it',
      `the signer holds ${dust(held)}, enough for the deploy transaction (${dust(first)}) but not ` +
        `for all eleven (${dust(total)}). The run would stop part-way, with the contract on chain ` +
        'and missing verifier keys.',
    );
  }
  return ok(
    'affordable',
    'Can the wallet pay for it',
    `the signer holds ${dust(held)} against a priced ${dust(total)} for all eleven transactions.`,
  );
}

/** The wallet: present, on mainnet, with a proving provider and (expected) no DUST of its own. */
export function checkWallet(session: ConsoleSession): Check[] {
  const { reading } = session;
  const checks: Check[] = [
    session.reportedNetworkId === 'mainnet'
      ? ok(
          'wallet-network',
          'Wallet network',
          `${session.walletName} (DApp Connector ${session.apiVersion ?? 'unknown'}) reports mainnet.`,
        )
      : fail('wallet-network', 'Wallet network', `the wallet reports "${session.reportedNetworkId}".`),
    reading.dustBalanceSpeck === 0n
      ? ok(
          'dust',
          'DUST held by the signing wallet',
          '0 SPECK, as expected. The fee is paid by 1AM’s pool when it balances the transaction, ' +
            'so the signer never needs DUST — which is the only reason a mainnet deploy is possible ' +
            'here at all.',
        )
      : warn(
          'dust',
          'DUST held by the signing wallet',
          `${reading.dustBalanceSpeck} SPECK (${formatDust(reading.dustBalanceSpeck)} DUST), cap ` +
            `${reading.dustCapSpeck}. Not a problem — it just means this run will not demonstrate the ` +
            'zero-DUST claim.',
      ),
  ];

  checks.push(
    ok(
      'wallet-keys',
      'Wallet keys, decoded',
      `the wallet reports its keys in ${session.decoded.encoding}; they decode to coin ` +
        `${session.decoded.coinPublicKey.slice(0, 16)}… and encryption ` +
        `${session.decoded.encryptionPublicKey.slice(0, 16)}…, both as the hex midnight-js ` +
        'needs. Checked at connect time, because this is the first thing a deploy asks for.',
    ),
  );

  // The wallet's own endpoint table is shown because it is wrong, and knowing that it is wrong
  // is part of understanding what this console does.
  checks.push(
    session.reportedIndexerUri.includes('midnight.network')
      ? warn(
          'wallet-indexer',
          'Indexer the wallet reports',
          `${session.reportedIndexerUri} — decommissioned on 2026-09-30 and answering 410. This ` +
            'console ignores it and reads through Blockfrost via the dev server instead.',
        )
      : ok('wallet-indexer', 'Indexer the wallet reports', session.reportedIndexerUri),
  );
  return checks;
}

/** That the chain is readable from this page, through the proxy the run will use. */
export async function checkIndexerFromPage(session: ConsoleSession): Promise<Check> {
  try {
    const seconds = await chainTimeSeconds(session.endpoints.indexerHttpUrl);
    return ok(
      'indexer-page',
      'Indexer reachable from this page',
      `chain time ${new Date(Number(seconds) * 1000).toISOString()} via ${session.publicIndexerUrl} ` +
        '(the dev server attaches the Blockfrost token; this page never holds it).',
    );
  } catch (cause) {
    return fail('indexer-page', 'Indexer reachable from this page', (cause as Error).message);
  }
}

export interface PlannedTx {
  phase: 'deploy' | 'lifecycle';
  index: number;
  title: string;
  why: string;
  prompts: boolean;
}

/** Every transaction the whole run will produce, in order, with the two that never prompt marked. */
export function plannedTransactions(): PlannedTx[] {
  const deploy: PlannedTx[] = Array.from({ length: DEPLOY_TOTAL }, (_, i) => {
    const view = describeDeployTx(i + 1);
    return { phase: 'deploy' as const, index: view.index, title: view.title, why: view.why, prompts: true };
  });
  const lifecycle: PlannedTx[] = LIFECYCLE_PLAN.map((step, i) => ({
    phase: 'lifecycle' as const,
    index: i + 1,
    title: `${step.label} (${step.circuit}, as ${step.persona})`,
    why: step.why,
    prompts: step.prompts,
  }));
  return [...deploy, ...lifecycle];
}

export const TOTAL_PROMPTS = DEPLOY_TOTAL + LIFECYCLE_PROMPTS;

export interface DryRun {
  checks: Check[];
  planned: PlannedTx[];
  prompts: number;
  verdict: 'ready' | 'blocked' | 'warnings';
}

/**
 * Walks the whole flow and stops before the first signature.
 *
 * It connects (which 1AM may itself ask the operator to allow — that is a connection, not a
 * transaction), reads the wallet, reads the chain, fetches a real proving key over HTTP, and
 * lists all twenty-one units of work with their reasons. Then it stops.
 */
export async function dryRun(session: ConsoleSession, server: ServerPreflight): Promise<DryRun> {
  const checks: Check[] = [
    ...server.checks,
    checkLoadedContract(),
    ...checkWallet(session),
    checkAffordable(session, server),
    await checkZkOverHttp(session.zkBaseUrl),
    await checkIndexerFromPage(session),
    ok(
      'proving',
      'Proving route',
      `1AM's ProofStation at ${session.proverServerUri}. No local proof server is contacted, and the ` +
        'same service balances the transaction with DUST from its own pool.',
    ),
  ];
  const planned = plannedTransactions();
  const blocked = checks.some((c) => c.status === 'fail');
  return {
    checks,
    planned,
    prompts: planned.filter((p) => p.prompts).length,
    verdict: blocked ? 'blocked' : checks.some((c) => c.status === 'warn') ? 'warnings' : 'ready',
  };
}
