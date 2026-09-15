// SPDX-License-Identifier: Apache-2.0
//
// The guided First Brands replay, run against a real network with real proofs.
//
// This is the product's claim executed end to end: a debtor acknowledges a $2,300 receivable, a
// seller finances it, and the three frauds that cost First Brands' financiers $2.3B — a forged
// invoice, the same invoice inflated tenfold, and the same invoice pledged twice — are refused
// while the transaction is being built. Nothing fraudulent reaches the chain, so the refusals
// have no transaction id: that absence is the evidence.
//
// One funded wallet pays every fee. The personas are not wallets at all; they are private-state
// identities, each proving knowledge of a secret whose hash is on the ledger. That is why a
// financier can check whether a receivable is already financed without learning anything else.
//
// The run is resumable. Every completed step is written to `cli/.secrets/<network>-scenario.json`
// with the persona keys and invoices it used, so a dropped connection costs one step, not the
// whole scenario; `--from <step>` replays from a chosen point and `--fresh` starts over.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pureCircuits } from '@stockandfoil/contract';
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
  NETWORKS,
  randomBytes32,
  type ChainNetwork,
  type Invoice,
  type RefusalCode,
  type Role,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '@stockandfoil/sdk';
import { connectDeployed } from './deploy.js';
import {
  COMPACT_VERSION,
  EVIDENCE_DIR,
  explorerFor,
  fileStamp,
  flagSet,
  flagValue,
  heading,
  loadDeployment,
  money,
  note,
  readJson,
  requireNetwork,
  resolveTransactions,
  runStatePath,
  say,
  serializeLedgerView,
  UsageError,
  writeJson,
  type Args,
  type DisclosureEvidence,
  type EvidenceFile,
  type StepRecord,
} from './common.js';

const DAY = 86_400n;

/** Minor units, so 230_000 is $2,300.00 — the First Brands invoice scale. */
const INVOICE_AMOUNT = 230_000n;
/** The tenfold inflation the affidavit describes. */
const INFLATED_AMOUNT = 2_300_000n;
const FORGED_AMOUNT = 500_000n;

/**
 * The borrowing base fills all four slots.
 *
 * A certificate has four fixed slots and the contract allows fewer to be used, but a partly
 * filled pool cannot be proved on a real network: the untaken branch of an unused slot leaves a
 * zeroed curve point in the public transcript, and the proof server rejects it while
 * preprocessing ("Point should be part of the subgroup"). The simulator does not preprocess ZKIR
 * and so accepts it, which is why the contract's own suite passes with three slots. A full pool
 * is the shape the evidence run therefore uses; see PROOF.md's honest limits.
 */
const POOL_KEYS = ['2001', '2002', '2003', '2004'] as const;
const POOL_AMOUNTS = [100_000n, 200_000n, 300_000n, 400_000n] as const;
const POOL_TOTAL = POOL_AMOUNTS.reduce((a, b) => a + b, 0n);
const POOL_FLOOR = 800_000n;
/** A floor the pool cannot support, so the certificate is refused before it locks anything. */
const OVERSTATED_FLOOR = 1_500_000n;

interface Outcome {
  txId?: string;
  blockHeight?: number;
  refused?: RefusalCode;
  durationMs: number;
  note?: string;
}

interface StepDef {
  id: string;
  label: string;
  circuit: string;
  persona: string;
  run(): Promise<Outcome>;
}

interface InvoiceJson {
  debtorId: string;
  sellerId: string;
  invoiceNo: string;
  amount: string;
  dueDate: string;
  salt: string;
}

interface RunState {
  network: ChainNetwork;
  contractAddress: string;
  startedAt: string;
  now0: string;
  personas: Record<'debtor' | 'seller' | 'financierA' | 'financierB', string>;
  constants: { caseRef: string; lenderRef: string; lenderNonce: string };
  invoices: Record<string, InvoiceJson>;
  steps: StepRecord[];
  disclosure?: DisclosureEvidence;
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

/**
 * Runs a call that must be refused, and records the refusal. The contract asserts while the
 * circuit runs locally, so this never submits anything — which is exactly what the step proves.
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

export async function scenario(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const deployment = loadDeployment(network);
  const statePath = runStatePath(network);

  let saved: RunState | undefined;
  if (existsSync(statePath) && !flagSet(args, 'fresh')) {
    const candidate = readJson<RunState>(statePath);
    if (candidate.contractAddress === deployment.contractAddress) saved = candidate;
    else note('the saved run belongs to a different contract; starting a fresh run');
  }

  const { session, backend } = await connectDeployed(args, network, deployment.contractAddress);
  try {
    // ------------------------------------------------------------------ personas and invoices
    const personas = {
      debtor: saved ? personaOf('debtor', saved.personas.debtor) : generatePersona('debtor'),
      seller: saved ? personaOf('seller', saved.personas.seller) : generatePersona('seller'),
      financierA: saved ? personaOf('financier', saved.personas.financierA) : generatePersona('financier'),
      financierB: saved ? personaOf('financier', saved.personas.financierB) : generatePersona('financier'),
    };

    const operator = new OperatorClient(backend, session.keys.operator);
    const debtor = new DebtorClient(backend, personas.debtor);
    const seller = new SellerClient(backend, personas.seller);
    const financierA = new FinancierClient(backend, personas.financierA);
    const financierB = new FinancierClient(backend, personas.financierB);
    const auditor = new AuditorClient(backend, session.keys.auditor);
    const keyholders = session.keys.keyholders.map((p, i) => new KeyholderClient(backend, p, i as 0 | 1 | 2));

    const now0 = saved ? BigInt(saved.now0) : await backend.now();
    const dueDate = now0 + 90n * DAY;
    const expiry = now0 + 7n * DAY;
    const validUntil = now0 + 30n * DAY;

    // Invoices are rebuilt from the saved run where one exists — the salt must survive, or the
    // fingerprint changes and the chain no longer recognises the acknowledgment.
    const invoiceSpecs = [
      { key: '1001', invoiceNo: 1001n, amount: INVOICE_AMOUNT },
      { key: '9999', invoiceNo: 9999n, amount: FORGED_AMOUNT },
      ...POOL_KEYS.map((key, i) => ({ key, invoiceNo: BigInt(key), amount: POOL_AMOUNTS[i]! })),
    ];
    const invoices: Record<string, Invoice> = {};
    for (const spec of invoiceSpecs) {
      const stored = saved?.invoices[spec.key];
      invoices[spec.key] = stored
        ? fromInvoiceJson(stored)
        : seller.issueInvoice({ debtorId: debtor.id, invoiceNo: spec.invoiceNo, amount: spec.amount, dueDate });
    }

    const constants = saved?.constants ?? {
      caseRef: hex(randomBytes32()),
      lenderRef: hex(randomBytes32()),
      lenderNonce: hex(randomBytes32()),
    };
    const caseRef = fromHex(constants.caseRef);
    const lenderRef = fromHex(constants.lenderRef);
    const lenderNonce = fromHex(constants.lenderNonce);

    const state: RunState = {
      network,
      contractAddress: deployment.contractAddress,
      startedAt: saved?.startedAt ?? new Date().toISOString(),
      now0: now0.toString(),
      personas: {
        debtor: hex(personas.debtor.secretKey),
        seller: hex(personas.seller.secretKey),
        financierA: hex(personas.financierA.secretKey),
        financierB: hex(personas.financierB.secretKey),
      },
      constants,
      invoices: Object.fromEntries(Object.entries(invoices).map(([k, v]) => [k, toInvoiceJson(v)])),
      steps: saved?.steps ?? [],
      disclosure: saved?.disclosure,
    };

    const invoice = (key: string): Invoice => {
      const found = invoices[key];
      if (!found) throw new Error(`the run state has no invoice #${key}`);
      return found;
    };

    const main = invoice('1001');
    const forged = invoice('9999');
    const inflated: Invoice = { ...main, amount: INFLATED_AMOUNT };
    const mainNullifier = pureCircuits.nullifierOf(main);
    const tagA = financierA.holderTag(mainNullifier);
    const tagB = financierB.holderTag(mainNullifier);
    const poolSlots = POOL_KEYS.map((key) => {
      const inv = invoice(key);
      return { invoice: inv, holderTag: financierA.holderTag(pureCircuits.nullifierOf(inv)) };
    });

    /** The record the pledge currently points at; after the re-offer that is financier B's. */
    const currentRecordId = async (): Promise<Uint8Array> => {
      const pledge = findPledge(await backend.publicState(), mainNullifier);
      if (!pledge) throw new Error('invoice #1001 has no pledge on the ledger yet');
      return fromHex(pledge.recordId);
    };
    const currentRequestId = async (): Promise<Uint8Array> => auditor.requestIdOf(await currentRecordId(), caseRef);

    const openDisclosure = async (): Promise<Outcome> => {
      const startedAt = Date.now();
      const requestId = await currentRequestId();
      const opened = await auditor.open(requestId);
      const ledgerPledge = findPledge(await backend.publicState(), mainNullifier);
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
      state.disclosure = evidence;
      if (!opened.verified) {
        throw new Error(
          `the opened record did not prove itself: recomputed ${evidence.recomputedNullifier ?? 'nothing'} ` +
            `against ledger nullifier ${evidence.ledgerNullifier ?? 'none'}`,
        );
      }
      if (opened.invoice.amount !== main.amount || opened.invoice.invoiceNo !== main.invoiceNo) {
        throw new Error('the opened record is not the invoice that was offered');
      }
      return {
        durationMs: Date.now() - startedAt,
        note:
          `shares ${opened.indices.join(' + ')} recombined; invoice #${opened.invoice.invoiceNo} ` +
          `${money(opened.invoice.amount)} recomputes nullifier ${evidence.recomputedNullifier}`,
      };
    };

    /**
     * The lender-side check the security audit added.
     *
     * A certificate proves its pool cleared a floor and names the markers it locked, but the
     * holder tag on each locked slot is a witness the *seller* supplies: nothing in the circuit
     * ties it to the lender named by `lenderRef`. So the addressee verifies from public state that
     * every slot really is an unexpired offer it can accept. Financier B, who is not the
     * addressee, runs the same check on the same certificate and gets `ok: false` — the negative
     * control that shows the check is doing work.
     */
    const checkCertificate = async (): Promise<Outcome> => {
      const startedAt = Date.now();
      const certId = financierA.certIdOf(lenderRef, lenderNonce);
      const mine = await financierA.checkCertificate(certId);
      const theirs = await financierB.checkCertificate(certId);
      if (!mine.found) throw new Error(`no certificate ${hex(certId)} on the ledger`);
      if (!mine.ok) {
        throw new Error(
          `the certificate does not lock its pool to the lender that asked for it: ` +
            `${JSON.stringify(mine.slots)}`,
        );
      }
      if (theirs.ok) throw new Error('a financier that is not the addressee accepted the certificate as its own');
      return {
        durationMs: Date.now() - startedAt,
        note:
          `certificate ${mine.certId.slice(0, 18)} floor ${money(mine.floor)}, ${mine.slots.length} slots, ` +
          `all live and addressed to the lender that asked for it; the same certificate checked by ` +
          `another financier reports ok=false (${theirs.slots.filter((s) => s.addressedToMe).length} of ` +
          `${theirs.slots.length} slots addressed to it)`,
      };
    };

    // ------------------------------------------------------------------------------- the steps
    const steps: StepDef[] = [
      {
        id: 'admit-debtor',
        label: 'Operator admits the debtor after off-chain KYB',
        circuit: 'admitDebtor',
        persona: 'operator',
        run: async () => asOutcome(await operator.admitDebtor(debtor.leaf)),
      },
      {
        id: 'admit-financier-a',
        label: 'Operator admits financier A',
        circuit: 'admitFinancier',
        persona: 'operator',
        run: async () => asOutcome(await operator.admitFinancier(financierA.leaf)),
      },
      {
        id: 'admit-financier-b',
        label: 'Operator admits financier B',
        circuit: 'admitFinancier',
        persona: 'operator',
        run: async () => asOutcome(await operator.admitFinancier(financierB.leaf)),
      },
      {
        id: 'acknowledge-1001',
        label: `Debtor acknowledges invoice #1001 for ${money(INVOICE_AMOUNT)}`,
        circuit: 'acknowledge',
        persona: 'debtor',
        run: async () => asOutcome(await debtor.acknowledge(main)),
      },
      {
        id: 'offer-1001-a',
        label: 'Seller offers #1001 to financier A',
        circuit: 'offer',
        persona: 'seller',
        run: async () => asOutcome(await seller.offer(main, tagA, expiry)),
      },
      {
        id: 'accept-1001-a',
        label: 'Financier A accepts: the receivable is pledged',
        circuit: 'accept',
        persona: 'financierA',
        run: async () => asOutcome(await financierA.accept(mainNullifier)),
      },
      {
        id: 'fraud-forged',
        label: 'Fraud 1, forged: an invoice the debtor never owed',
        circuit: 'offer',
        persona: 'seller',
        run: () =>
          expectRefusal('NOT_ACKNOWLEDGED', () =>
            seller.offer(forged, financierB.holderTag(pureCircuits.nullifierOf(forged)), expiry),
          ),
      },
      {
        id: 'fraud-inflated',
        label: `Fraud 2, inflated: #1001 re-priced tenfold to ${money(INFLATED_AMOUNT)}`,
        circuit: 'offer',
        persona: 'seller',
        run: () =>
          expectRefusal('NOT_ACKNOWLEDGED', () =>
            seller.offer(inflated, financierB.holderTag(pureCircuits.nullifierOf(inflated)), expiry),
          ),
      },
      {
        id: 'fraud-double-pledge',
        label: 'Fraud 3, double pledge: #1001 offered to financier B while A holds it',
        circuit: 'offer',
        persona: 'seller',
        run: () => expectRefusal('ALREADY_ENCUMBERED', () => seller.offer(main, tagB, expiry)),
      },
      {
        id: 'release-1001',
        label: 'Financier A releases the pledge',
        circuit: 'release',
        persona: 'financierA',
        run: async () => asOutcome(await financierA.release(mainNullifier)),
      },
      {
        id: 'offer-1001-b',
        label: 'Seller re-offers #1001, now legitimately, to financier B',
        circuit: 'offer',
        persona: 'seller',
        run: async () => asOutcome(await seller.offer(main, tagB, expiry)),
      },
      {
        id: 'accept-1001-b',
        label: 'Financier B accepts and funds the receivable',
        circuit: 'accept',
        persona: 'financierB',
        run: async () => asOutcome(await financierB.accept(mainNullifier)),
      },
      {
        id: 'pay-1001',
        label: `Debtor pays ${money(INVOICE_AMOUNT)} into the registry`,
        circuit: 'payInvoice',
        persona: 'debtor',
        run: async () => asOutcome(await debtor.pay(main)),
      },
      {
        id: 'fraud-seller-claim',
        label: 'Fraud 4, diversion: the seller tries to take proceeds that are pledged to financier B',
        circuit: 'claimAsSeller',
        persona: 'seller',
        run: () => expectRefusal('NOT_PAYEE', () => seller.claim(mainNullifier, session.wallet.payTo)),
      },
      {
        id: 'claim-1001-b',
        label: 'Financier B claims the proceeds; the seller cannot divert them',
        circuit: 'claimAsHolder',
        persona: 'financierB',
        run: async () => asOutcome(await financierB.claim(mainNullifier, session.wallet.payTo)),
      },
      ...POOL_KEYS.map((key, i) => ({
        id: `acknowledge-${key}`,
        label: `Debtor acknowledges invoice #${key} for ${money(POOL_AMOUNTS[i]!)}`,
        circuit: 'acknowledge',
        persona: 'debtor',
        run: async () => asOutcome(await debtor.acknowledge(invoice(key))),
      })),
      {
        id: 'certify-below-floor',
        label: `Borrowing base overstated: ${money(POOL_TOTAL)} of collateral claimed as ${money(OVERSTATED_FLOOR)}`,
        circuit: 'certifyBorrowingBase',
        persona: 'seller',
        run: () =>
          expectRefusal('BELOW_FLOOR', () =>
            seller.certify(poolSlots, { lenderRef, lenderNonce, floor: OVERSTATED_FLOOR, validUntil }),
          ),
      },
      {
        id: 'certify-pool',
        label: `Borrowing base: ${POOL_KEYS.length} invoices locked to one lender over a ${money(POOL_FLOOR)} floor`,
        circuit: 'certifyBorrowingBase',
        persona: 'seller',
        run: async () =>
          asOutcome(await seller.certify(poolSlots, { lenderRef, lenderNonce, floor: POOL_FLOOR, validUntil })),
      },
      {
        id: 'check-certificate',
        label: 'The lender checks the certificate really locks its pool to it, and only to it',
        circuit: 'checkCertificate (off chain)',
        persona: 'financierA',
        run: checkCertificate,
      },
      {
        id: 'accept-pool-2001',
        label: 'The pool lender takes up the first certified invoice',
        circuit: 'accept',
        persona: 'financierA',
        run: async () => asOutcome(await financierA.accept(pureCircuits.nullifierOf(invoice('2001')))),
      },
      {
        id: 'request-disclosure',
        label: "Auditor requests disclosure of invoice #1001's sealed record",
        circuit: 'requestDisclosure',
        persona: 'auditor',
        run: async () => asOutcome(await auditor.request(await currentRecordId(), caseRef)),
      },
      {
        id: 'approve-keyholder-1',
        label: 'Keyholder 1 approves the disclosure on the ledger',
        circuit: 'approveDisclosure',
        persona: 'keyholder1',
        run: async () => asOutcome(await keyholders[0]!.approve(await currentRequestId())),
      },
      {
        id: 'approve-keyholder-3',
        label: 'Keyholder 3 approves: the 2-of-3 threshold is met',
        circuit: 'approveDisclosure',
        persona: 'keyholder3',
        run: async () => asOutcome(await keyholders[2]!.approve(await currentRequestId())),
      },
      {
        id: 'open-disclosure',
        label: 'Auditor opens the record and it proves itself against the ledger',
        circuit: 'verifyDisclosure (off chain)',
        persona: 'auditor',
        run: openDisclosure,
      },
    ];

    // ------------------------------------------------------------------------------ the runner
    const completed = new Map(state.steps.map((s) => [s.id, s]));
    const from = flagValue(args, 'from');
    if (from !== undefined) {
      const index = steps.findIndex((s) => s.id === from);
      if (index < 0) throw new UsageError(`unknown step "${from}"; steps are:\n  ${steps.map((s) => s.id).join('\n  ')}`);
      for (const step of steps.slice(index)) completed.delete(step.id);
    }

    const persist = (): void => {
      state.steps = steps.map((s) => completed.get(s.id)).filter((s): s is StepRecord => s !== undefined);
      writeJson(statePath, state);
    };

    heading(`guided replay on ${network} — ${deployment.contractAddress}`);
    say(`  ${steps.length} steps, ${completed.size} already recorded; run state at ${statePath}`);

    for (const step of steps) {
      const done = completed.get(step.id);
      if (done) {
        say(`  skip  ${step.id.padEnd(22)} ${done.refused ?? done.txId ?? 'done'}`);
        continue;
      }
      note(`${step.id}: ${step.label}`);
      let outcome: Outcome;
      try {
        outcome = await step.run();
      } catch (error) {
        persist();
        say(`\nstep ${step.id} failed. Fix the cause and resume with:`);
        say(`  npm run -w cli scenario -- --network ${network}`);
        throw error;
      }
      completed.set(step.id, {
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
      persist();
      const seconds = `${(outcome.durationMs / 1000).toFixed(1)}s`;
      if (outcome.refused) {
        say(`        REFUSED ${outcome.refused} in ${seconds} — no transaction was submitted`);
        say(`        ${outcome.note ?? ''}`);
      } else if (outcome.txId) {
        say(`        tx ${outcome.txId} in block ${outcome.blockHeight} (${seconds})`);
      } else {
        say(`        ${outcome.note ?? 'done'} (${seconds})`);
      }
    }

    // -------------------------------------------------------------------------------- evidence
    const finalState = serializeLedgerView(await backend.publicState());

    // Explorers index by transaction hash, midnight-js reports identifiers; the indexer maps one
    // to the other, so the evidence carries both for every transaction including the deployment.
    const deployIds = [deployment.deployTx, ...deployment.maintenanceTxs.map((t) => t.txId)];
    const stepIds = state.steps.map((s) => s.txId).filter((id): id is string => id !== undefined);
    const anchors = await resolveTransactions(NETWORKS[network].indexerHttpUrl, [...deployIds, ...stepIds]);
    const records = state.steps.map((step) => {
      const anchor = step.txId === undefined ? undefined : anchors.get(step.txId);
      return anchor === undefined
        ? step
        : {
            ...step,
            txHash: anchor.txHash,
            blockHeight: anchor.blockHeight ?? step.blockHeight,
            blockHash: anchor.blockHash,
            blockTimestamp: anchor.blockTimestamp,
          };
    });
    const heights = records.map((s) => s.blockHeight).filter((h): h is number => h !== undefined);
    const evidence: EvidenceFile = {
      project: 'Stock & Foil',
      network,
      contractAddress: deployment.contractAddress,
      compactVersion: COMPACT_VERSION,
      startedAt: state.startedAt,
      finishedAt: new Date().toISOString(),
      explorer: deployment.explorer ?? explorerFor(network),
      deployment: {
        deployTx: anchors.get(deployment.deployTx) ?? { identifier: deployment.deployTx },
        maintenanceTxs: deployment.maintenanceTxs.map((t) => ({
          circuit: t.circuit,
          ...(anchors.get(t.txId) ?? { identifier: t.txId }),
        })),
      },
      steps: records,
      summary: {
        steps: records.length,
        transactions: records.filter((s) => s.txId).length,
        refusals: records
          .filter((s) => s.refused)
          .map((s) => ({ id: s.id, label: s.label, circuit: s.circuit, code: s.refused! })),
        firstBlockHeight: heights.length > 0 ? Math.min(...heights) : undefined,
        lastBlockHeight: heights.length > 0 ? Math.max(...heights) : undefined,
        totalDurationMs: records.reduce((sum, s) => sum + s.durationMs, 0),
      },
      disclosure: state.disclosure,
      finalState,
    };
    const evidencePath = join(EVIDENCE_DIR, `${network}-${fileStamp()}.json`);
    writeJson(evidencePath, evidence);

    heading('summary');
    say(`  transactions   ${evidence.summary.transactions}`);
    say(`  refusals       ${evidence.summary.refusals.length}`);
    for (const refusal of evidence.summary.refusals) say(`    ${refusal.code.padEnd(20)} ${refusal.label}`);
    say(`  blocks         ${evidence.summary.firstBlockHeight} .. ${evidence.summary.lastBlockHeight}`);
    say(`  ledger counts  ${JSON.stringify(finalState.counts)}`);
    say(`  disclosure     ${state.disclosure?.verified ? 'opened and self-verified' : 'not verified'}`);
    say(`\nevidence written to ${evidencePath}`);
    say(`next: npm run -w cli verify -- --network ${network}`);
    return 0;
  } finally {
    await session.close();
  }
}
