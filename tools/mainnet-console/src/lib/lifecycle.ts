// SPDX-License-Identifier: Apache-2.0
//
// The ceremony and the lifecycle, ordered so that the meaningful part lands first.
//
// The CLI's `scenario` is thirty-odd steps and proves everything. This is not that, and the
// difference is deliberate: a sponsor can stop paying at any point, so the run is ordered by
// what it would be worst to be missing. Admissions, one acknowledgment, one offer, one
// acceptance, the double-pledge refusal, then the 2-of-3 disclosure. If the sponsor cuts us off
// after six transactions, what is on chain is still the product's claim end to end.
//
// Two steps raise no wallet prompt at all, and both are load-bearing:
//
//   the refusal   The contract asserts while the circuit runs *locally*. The fraudulent
//                 transaction is never built, never proved, never submitted and never paid
//                 for. The absence of a transaction id is the evidence.
//   the opening   The auditor recombines two keyholder shares in this tab and checks the
//                 plaintext against the ledger's own marker. Nothing goes on chain.
//
// Settlement — `payInvoice` and the claims — is not here. Those circuits move unshielded NIGHT,
// and 1AM sponsors the DUST fee, not the principal. Running them would need a mainnet wallet
// with real NIGHT in it, which is the thing this whole console exists to avoid needing.
import {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  REFUSAL_MESSAGES,
  SellerClient,
  findPledge,
  fromHex,
  generatePersona,
  hex,
  isRefusal,
  randomBytes32,
  type Invoice,
  type NetworkBackend,
  type RefusalCode,
  type Role,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '@stockandfoil/sdk';
import { pureCircuits } from '@stockandfoil/contract';
import type { DisclosureEvidence, StepRecord } from '../../../../cli/src/records.js';
import type { RegistryKeyMaterial } from './session.js';
import type { ConsoleState, InvoiceJson, LifecycleState } from './state.js';

const DAY = 86_400n;

/** $2,300.00 in minor units: the First Brands invoice scale the whole project is built around. */
const INVOICE_AMOUNT = 230_000n;
const INVOICE_NO = 1001n;

export interface Outcome {
  txId?: string;
  blockHeight?: number;
  refused?: RefusalCode;
  durationMs: number;
  note?: string;
}

export interface LifecycleStep {
  id: string;
  label: string;
  /** Why this transaction, and why here in the order. Shown before the prompt goes up. */
  why: string;
  circuit: string;
  persona: string;
  /** False for the two steps that never reach the wallet. */
  prompts: boolean;
  run(): Promise<Outcome>;
}

const toInvoiceJson = (i: Invoice): InvoiceJson => ({
  debtorId: i.debtorId.toString(),
  sellerId: i.sellerId.toString(),
  invoiceNo: i.invoiceNo.toString(),
  amount: i.amount.toString(),
  dueDate: i.dueDate.toString(),
  salt: i.salt.toString(),
});

const fromInvoiceJson = (i: InvoiceJson): Invoice => ({
  debtorId: BigInt(i.debtorId),
  sellerId: BigInt(i.sellerId),
  invoiceNo: BigInt(i.invoiceNo),
  amount: BigInt(i.amount),
  dueDate: BigInt(i.dueDate),
  salt: BigInt(i.salt),
});

const personaOf = (role: Role, secretKeyHex: string): StockAndFoilPrivateState => ({
  role,
  secretKey: fromHex(secretKeyHex),
});

const asOutcome = (receipt: TxReceipt): Outcome => ({
  txId: receipt.txId,
  blockHeight: receipt.blockHeight,
  durationMs: receipt.durationMs,
});

const money = (minorUnits: bigint): string =>
  `$${(Number(minorUnits) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Runs a call that must be refused.
 *
 * The contract asserts while the circuit runs locally, so this never submits anything — which
 * is exactly what the step is there to show. An accepted call here is a failure of the product,
 * not of the console, and is raised as one.
 */
async function expectRefusal(code: RefusalCode, thunk: () => Promise<unknown>): Promise<Outcome> {
  const startedAt = Date.now();
  try {
    await thunk();
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isRefusal(error) && error.code === code) {
      return { refused: error.code, durationMs, note: REFUSAL_MESSAGES[code] };
    }
    throw error;
  }
  throw new Error(`expected the contract to refuse with ${code}, but the call was accepted`);
}

/** One planned step, without the closure that runs it: the console can show this before a backend exists. */
export type PlannedStep = Omit<LifecycleStep, 'run'>;

/**
 * The order, and the reason for it.
 *
 * Read top to bottom it is the product's claim: a member buyer, a committed invoice, a pledge,
 * a lender taking it up, the second pledge refused, and a disclosure nobody could have done
 * alone. Each `why` is what the console shows above the wallet prompt, so the operator is
 * approving a sentence rather than a hex blob.
 */
export const LIFECYCLE_PLAN: readonly PlannedStep[] = [
  {
    id: 'admit-debtor',
    label: 'Operator admits the debtor after off-chain KYB',
    why:
      'The registry is a closed membership. Nothing else can happen until the buyer is a member, ' +
      'and the ledger gets a leaf, never an identity.',
    circuit: 'admitDebtor',
    persona: 'operator',
    prompts: true,
  },
  {
    id: 'admit-financier-a',
    label: 'Operator admits financier A',
    why: 'The financier proves membership anonymously when it accepts, so it has to be in the tree first.',
    circuit: 'admitFinancier',
    persona: 'operator',
    prompts: true,
  },
  {
    id: `acknowledge-${INVOICE_NO}`,
    label: `Debtor acknowledges invoice #${INVOICE_NO} for ${money(INVOICE_AMOUNT)}`,
    why:
      'One leaf committing to buyer, supplier, number, amount, due date and a secret salt. This is ' +
      'what makes a forged or an inflated invoice unfinanceable: neither has a leaf.',
    circuit: 'acknowledge',
    persona: 'debtor',
    prompts: true,
  },
  {
    id: `offer-${INVOICE_NO}-a`,
    label: `Seller offers #${INVOICE_NO} to financier A`,
    why:
      'One proof carries four claims: the invoice is the seller\u2019s, the buyer acknowledged exactly ' +
      'it, its one-time marker is unused, and the offer expires before the invoice is due. The pledge ' +
      'record is sealed to the disclosure key in the same transaction.',
    circuit: 'offer',
    persona: 'seller',
    prompts: true,
  },
  {
    id: `accept-${INVOICE_NO}-a`,
    label: 'Financier A accepts: the receivable is pledged',
    why:
      'The financier proves membership anonymously and that the offer was addressed to it, using a ' +
      'per-pledge tag that cannot be linked to its other pledges.',
    circuit: 'accept',
    persona: 'financierA',
    prompts: true,
  },
  {
    id: 'fraud-double-pledge',
    label: `Double pledge: #${INVOICE_NO} offered to financier B while A holds it`,
    why:
      'The headline refusal, and it raises no prompt. The contract asserts while the circuit runs in ' +
      'this tab, so the fraudulent transaction is never built, never proved, never submitted and never ' +
      'paid for. Financier B would learn one bit: already encumbered. Not by whom.',
    circuit: 'offer',
    persona: 'seller',
    prompts: false,
  },
  {
    id: 'request-disclosure',
    label: `Auditor requests disclosure of invoice #${INVOICE_NO}'s sealed record`,
    why: 'A record cannot be read without the request being public. This is that request.',
    circuit: 'requestDisclosure',
    persona: 'auditor',
    prompts: true,
  },
  {
    id: 'approve-keyholder-1',
    label: 'Keyholder 1 approves the disclosure on the ledger',
    why:
      'One of three. Its decryption share is published sealed to the auditor and proved correct ' +
      'in-circuit.',
    circuit: 'approveDisclosure',
    persona: 'keyholder1',
    prompts: true,
  },
  {
    id: 'approve-keyholder-3',
    label: 'Keyholder 3 approves: the 2-of-3 threshold is met',
    why: 'Two of three. No single keyholder could have opened this, and the whole exchange is on chain.',
    circuit: 'approveDisclosure',
    persona: 'keyholder3',
    prompts: true,
  },
  {
    id: 'open-disclosure',
    label: 'Auditor opens the record and it proves itself against the ledger',
    why:
      'Off chain, no prompt. The recombined plaintext recomputes the marker the ledger already keys the ' +
      'pledge by, so a doctored disclosure fails here rather than being believed.',
    circuit: 'verifyDisclosure (off chain)',
    persona: 'auditor',
    prompts: false,
  },
];

/** Wallet prompts a full lifecycle raises: the plan minus the two steps that never reach the wallet. */
export const LIFECYCLE_PROMPTS = LIFECYCLE_PLAN.filter((s) => s.prompts).length;

/** Seeds a lifecycle, or rebuilds the one already under way from the saved run state. */
export async function prepareLifecycle(
  backend: NetworkBackend,
  keys: RegistryKeyMaterial,
  state: ConsoleState,
): Promise<{ steps: LifecycleStep[]; lifecycle: LifecycleState }> {
  const saved = state.lifecycle;

  const personas = {
    debtor: saved ? personaOf('debtor', saved.personas.debtor) : generatePersona('debtor'),
    seller: saved ? personaOf('seller', saved.personas.seller) : generatePersona('seller'),
    financierA: saved ? personaOf('financier', saved.personas.financierA) : generatePersona('financier'),
    financierB: saved ? personaOf('financier', saved.personas.financierB) : generatePersona('financier'),
  };

  const operator = new OperatorClient(backend, keys.operator);
  const debtor = new DebtorClient(backend, personas.debtor);
  const seller = new SellerClient(backend, personas.seller);
  const financierA = new FinancierClient(backend, personas.financierA);
  const financierB = new FinancierClient(backend, personas.financierB);
  const auditor = new AuditorClient(backend, keys.auditor);
  const keyholders = keys.keyholders.map((p, i) => new KeyholderClient(backend, p, i as 0 | 1 | 2));

  const now0 = saved ? BigInt(saved.now0) : await backend.now();
  const dueDate = now0 + 90n * DAY;
  // The CLI's scenario gives the offer a week, because it runs in one sitting. This one is
  // driven by hand and a resume can be days later, so the window is a month — still comfortably
  // inside the due date, which the circuit requires.
  const expiry = now0 + 30n * DAY;

  // The salt has to survive a resume: the acknowledgment leaf and the pledge marker are
  // functions of it, and a fresh one would make the chain stop recognising the invoice.
  const invoice = saved
    ? fromInvoiceJson(saved.invoice)
    : seller.issueInvoice({ debtorId: debtor.id, invoiceNo: INVOICE_NO, amount: INVOICE_AMOUNT, dueDate });
  const caseRef = saved ? fromHex(saved.caseRef) : randomBytes32();

  const lifecycle: LifecycleState = {
    now0: now0.toString(),
    personas: {
      debtor: hex(personas.debtor.secretKey),
      seller: hex(personas.seller.secretKey),
      financierA: hex(personas.financierA.secretKey),
      financierB: hex(personas.financierB.secretKey),
    },
    caseRef: hex(caseRef),
    invoice: toInvoiceJson(invoice),
    steps: saved?.steps ?? [],
    disclosure: saved?.disclosure,
  };

  const nullifier = pureCircuits.nullifierOf(invoice);
  const tagA = financierA.holderTag(nullifier);
  const tagB = financierB.holderTag(nullifier);

  const currentRecordId = async (): Promise<Uint8Array> => {
    const pledge = findPledge(await backend.publicState(), nullifier);
    if (!pledge) throw new Error(`invoice #${INVOICE_NO} has no pledge on the ledger yet`);
    return fromHex(pledge.recordId);
  };
  const currentRequestId = async (): Promise<Uint8Array> => auditor.requestIdOf(await currentRecordId(), caseRef);

  /** Opens the sealed record and makes it prove itself against the ledger. No transaction. */
  const openDisclosure = async (): Promise<Outcome> => {
    const startedAt = Date.now();
    const requestId = await currentRequestId();
    const opened = await auditor.open(requestId);
    const ledgerPledge = findPledge(await backend.publicState(), nullifier);
    const evidence: DisclosureEvidence = {
      requestId: hex(requestId),
      recordId: opened.recordId,
      caseRef: opened.caseRef,
      approvals: opened.approvals,
      shamirIndices: opened.indices,
      recomputedNullifier: opened.verification.nullifier,
      ledgerNullifier: opened.nullifier,
      fingerprint: opened.verification.fingerprint,
      ackLeaf: opened.verification.ackLeaf,
      recordIdMatches: opened.recordIdMatches,
      verified: opened.verified,
      openedInvoice: {
        invoiceNo: opened.invoice.invoiceNo.toString(),
        amount: opened.invoice.amount.toString(),
        dueDate: opened.invoice.dueDate.toString(),
      },
      holderTagMatchesLedger: String(opened.holderTag) === ledgerPledge?.holderTag,
    };
    lifecycle.disclosure = evidence;
    if (!opened.verified) {
      throw new Error(
        `the opened record did not prove itself: recomputed ${evidence.recomputedNullifier ?? 'nothing'} ` +
          `against ledger nullifier ${evidence.ledgerNullifier ?? 'none'}`,
      );
    }
    if (opened.invoice.amount !== invoice.amount || opened.invoice.invoiceNo !== invoice.invoiceNo) {
      throw new Error('the opened record is not the invoice that was offered');
    }
    return {
      durationMs: Date.now() - startedAt,
      note:
        `shares ${opened.indices.join(' + ')} recombined; invoice #${opened.invoice.invoiceNo} ` +
        `${money(opened.invoice.amount)} recomputes nullifier ${evidence.recomputedNullifier}`,
    };
  };

  const runners: Record<string, () => Promise<Outcome>> = {
    'admit-debtor': async () => asOutcome(await operator.admitDebtor(debtor.leaf)),
    'admit-financier-a': async () => asOutcome(await operator.admitFinancier(financierA.leaf)),
    [`acknowledge-${INVOICE_NO}`]: async () => asOutcome(await debtor.acknowledge(invoice)),
    [`offer-${INVOICE_NO}-a`]: async () => asOutcome(await seller.offer(invoice, tagA, expiry)),
    [`accept-${INVOICE_NO}-a`]: async () => asOutcome(await financierA.accept(nullifier)),
    'fraud-double-pledge': () => expectRefusal('ALREADY_ENCUMBERED', () => seller.offer(invoice, tagB, expiry)),
    'request-disclosure': async () => asOutcome(await auditor.request(await currentRecordId(), caseRef)),
    'approve-keyholder-1': async () => asOutcome(await keyholders[0]!.approve(await currentRequestId())),
    'approve-keyholder-3': async () => asOutcome(await keyholders[2]!.approve(await currentRequestId())),
    'open-disclosure': openDisclosure,
  };

  const steps: LifecycleStep[] = LIFECYCLE_PLAN.map((planned) => {
    const run = runners[planned.id];
    if (!run) throw new Error(`the lifecycle plan names a step with no runner: ${planned.id}`);
    return { ...planned, run };
  });

  return { steps, lifecycle };
}

/** A completed step, in the shape an evidence file records it. */
export const toStepRecord = (step: LifecycleStep, outcome: Outcome): StepRecord => ({
  id: step.id,
  label: step.label,
  circuit: step.circuit,
  persona: step.persona,
  txId: outcome.txId,
  blockHeight: outcome.blockHeight,
  refused: outcome.refused,
  durationMs: outcome.durationMs,
  at: new Date().toISOString(),
  note: outcome.note,
});

/** Wallet prompts the remaining steps will raise. */
export const promptsRemaining = (steps: LifecycleStep[], done: ReadonlySet<string>): number =>
  steps.filter((s) => s.prompts && !done.has(s.id)).length;
