// SPDX-License-Identifier: Apache-2.0
//
// The browser half of the preflight, and the dry run.
//
// Everything in this file stops short of a signature. That is the contract it makes with the
// operator: run it as often as you like, on mainnet, and nothing will be built, proved,
// balanced or submitted. The first irreversible act in this console is a wallet dialog the
// operator has read.
import { CIRCUIT_IDS, chainTimeSeconds, formatDust, VERIFIER_KEYS_PER_TX } from '@stockandfoil/sdk';
import type { Check } from '../../server/preflight.js';
import { DEPLOY_TOTAL, describeDeployTx } from './deploy.js';
import { FROZEN_CIRCUITS, VERIFIER_KEYS_IN_DEPLOY_TX } from './frozen.js';
import { LIFECYCLE_PLAN, LIFECYCLE_PROMPTS } from './lifecycle.js';
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
    return ok(
      'zk-http',
      'Proving keys over HTTP',
      `served from ${base} with Access-Control-Allow-Origin: ${cors ?? 'absent'}. 1AM's proving ` +
        'provider fetches these; its guide requires the CORS header.',
    );
  } catch (cause) {
    return fail('zk-http', 'Proving keys over HTTP', `could not be fetched: ${(cause as Error).message}`);
  }
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
      `chain time ${new Date(Number(seconds) * 1000).toISOString()} via ${session.endpoints.indexerHttpUrl} ` +
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
export async function dryRun(session: ConsoleSession, serverChecks: Check[]): Promise<DryRun> {
  const checks: Check[] = [
    ...serverChecks,
    checkLoadedContract(),
    ...checkWallet(session),
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
