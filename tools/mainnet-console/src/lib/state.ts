// SPDX-License-Identifier: Apache-2.0
//
// What the console remembers between prompts, between reloads and between days.
//
// The operator approves every transaction by hand, so the gap between two transactions is not
// milliseconds — it is however long it takes a person to read a dialog, and sometimes it is
// "tomorrow". A closed tab, a declined prompt or a wallet that logs itself out must therefore
// cost one transaction, never the run. Everything needed to pick the run up again lives in
// this object, which is written to `cli/.secrets/mainnet-console.json` after every step.
//
// The persona secret keys are in here. That is why it goes under `cli/.secrets/`, which
// `.gitignore` excludes, and nowhere else: a resumed lifecycle has to prove knowledge of the
// *same* secrets, because the debtor's acknowledgment leaf and the seller's invoice
// fingerprint are functions of them. Regenerating them silently would leave a half-finished
// story on a chain with no faucet.
import type { DisclosureEvidence, StepRecord } from '../../../../cli/src/records.js';

export interface InvoiceJson {
  debtorId: string;
  sellerId: string;
  invoiceNo: string;
  amount: string;
  dueDate: string;
  salt: string;
}

/** How far the staged deployment got. Exactly what `NetworkBackend.deploy`'s `resume` takes. */
export interface DeployProgress {
  /** Set as soon as the deploy transaction has landed. */
  contractAddress?: string;
  deployTxId?: string;
  /** Circuits whose verifier key is on chain, in the order they were inserted. */
  insertedCircuits: string[];
  /** Transaction id per inserted circuit, for the deployment record. */
  maintenanceTxIds: Record<string, string>;
  /** Every id the wallet adapter submitted this run, in order; how ids are matched to steps. */
  submittedTxIds: string[];
  completedAt?: string;
  /** The last thing that went wrong, and whose refusal it was. */
  lastFailure?: RunFailure;
}

export interface LifecycleState {
  /** Chain time the run started from; the invoice's dates hang off it. */
  now0: string;
  personas: { debtor: string; seller: string; financierA: string; financierB: string };
  caseRef: string;
  invoice: InvoiceJson;
  /** Completed steps, in plan order. A step in here is never run again. */
  steps: StepRecord[];
  disclosure?: DisclosureEvidence;
  lastFailure?: RunFailure;
}

/**
 * A failure, attributed.
 *
 * "Whose refusal was it" is the question an operator actually has, and three different parties
 * can say no: the registry contract (a refusal code — the product working), the operator
 * (declining a wallet dialog), or 1AM's sponsor (policy, rate limit, an empty pool). They are
 * never merged, and none of them is retried automatically.
 */
export interface RunFailure {
  at: string;
  stepId: string;
  /** Who said no. */
  by: 'contract' | 'operator' | 'sponsor' | 'network' | 'console';
  /** The upstream text, verbatim, not a summary of it. */
  message: string;
  /** The refusal code, when the contract is the one refusing. */
  code?: string;
}

export interface ConsoleState {
  version: 1;
  network: 'mainnet';
  startedAt: string;
  deploy?: DeployProgress;
  lifecycle?: LifecycleState;
}

export const emptyState = (): ConsoleState => ({
  version: 1,
  network: 'mainnet',
  startedAt: new Date().toISOString(),
});

/**
 * A stop the console raises itself, carrying its own attribution.
 *
 * Guessing who refused from the text of an error is unavoidable for errors other people throw,
 * and avoidable for ours — so ours say.
 */
export class ConsoleStop extends Error {
  constructor(
    message: string,
    readonly by: RunFailure['by'] = 'console',
  ) {
    super(message);
    this.name = 'ConsoleStop';
  }
}

/**
 * Who refused, read off whatever the stack threw.
 *
 * Deliberately conservative: anything it cannot attribute is `network`, because a wrong
 * attribution is worse than an unspecific one. A sponsor refusal is recognised by the words
 * 1AM's ProofStation and the DApp connector actually use, and the message is carried through
 * untouched so the operator reads the upstream reason rather than this function's opinion of it.
 */
export function attribute(error: unknown, stepId: string): RunFailure {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const refusal = error as { name?: string; code?: string; by?: RunFailure['by'] };
  const at = new Date().toISOString();

  if (refusal?.name === 'ConsoleStop' && refusal.by) return { at, stepId, by: refusal.by, message };
  if (refusal?.name === 'Refusal' && typeof refusal.code === 'string') {
    return { at, stepId, by: 'contract', message, code: refusal.code };
  }
  if (
    /\b(user|operator)\b.*\b(reject|declin|denied|cancel)/.test(lower) ||
    /\b(reject|declin|denied|cancell?ed)\b.*\b(by the )?(user|wallet)\b/.test(lower) ||
    lower.includes('user rejected') ||
    lower.includes('request rejected')
  ) {
    return { at, stepId, by: 'operator', message };
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('policy') ||
    lower.includes('quota') ||
    lower.includes('insufficient dust') ||
    lower.includes('out of dust') ||
    lower.includes('balance-only') ||
    lower.includes('proofstation') ||
    lower.includes('wallet pool') ||
    lower.includes('sponsor')
  ) {
    return { at, stepId, by: 'sponsor', message };
  }
  return { at, stepId, by: 'network', message };
}

/** One line naming the party, for the banner. */
export const whoRefused = (failure: RunFailure): string =>
  ({
    contract: 'The Stock & Foil contract refused this call. Nothing was submitted and nothing was paid for.',
    operator: 'You declined the wallet prompt. Nothing was submitted.',
    sponsor: "1AM's sponsor refused to pay for this transaction. It is their refusal, not the contract's.",
    network: 'The network or the indexer failed. Nothing is known to have been submitted.',
    console: 'The console stopped before asking the wallet to sign anything.',
  })[failure.by];
