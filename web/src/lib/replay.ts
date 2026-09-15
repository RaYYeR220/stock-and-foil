// SPDX-License-Identifier: Apache-2.0
//
// The guided replay: the First Brands sequence, step by step, against the real compiled circuits.
// Every step is one or more genuine circuit calls on the Sandbox world — the refusals below are
// the contract's own asserts firing while the transaction is being built, not UI copy.
import { pureCircuits } from '@stockandfoil/contract';
import {
  findCertificate,
  findPledge,
  toHex,
  userAddress,
  type RefusalCode,
  type TxReceipt,
} from './sdk.js';
import { day, money, shortField, shortHex } from './format.js';
import { CASE_REF, DAY, LENDER_NONCE, LENDER_REF, SandboxWorld, type PersonaId } from './world.js';

export interface Fact {
  label: string;
  value: string;
  mono?: boolean;
}

export interface ReplayStep {
  id: string;
  actor: PersonaId;
  title: string;
  /** What is happening, in the product's voice. */
  body: string;
  cta: string;
  /** Set when the step is meant to be refused; the contract must produce exactly this code. */
  refusal?: RefusalCode;
  /** What this step writes to the public ledger. */
  chain: string;
  /** What never leaves the parties. */
  kept: string;
  run(w: SandboxWorld): Promise<Fact[]>;
  /** Extra facts to show after a refusal — usually what the refused party did and did not learn. */
  onRefused?(w: SandboxWorld): Promise<Fact[]>;
}

const A_ADDRESS = userAddress(new Uint8Array(32).fill(0xa1));
const SELLER_ADDRESS = userAddress(new Uint8Array(32).fill(0x5e));

const receiptFacts = (receipts: TxReceipt[]): Fact[] =>
  receipts.map((r) => ({ label: r.circuit, value: `accepted in ${r.durationMs} ms`, mono: true }));

async function pledgeFacts(w: SandboxWorld, ref: string): Promise<Fact[]> {
  const view = await w.publicState();
  const pledge = findPledge(view, w.nullifier(ref));
  if (!pledge) return [];
  return [
    { label: 'Pledge marker', value: shortHex(pledge.nullifier), mono: true },
    { label: 'Status', value: pledge.status },
    { label: 'Holder tag', value: shortField(BigInt(pledge.holderTag)), mono: true },
  ];
}

/**
 * The seventeen steps. Nothing here is scripted output: each `run` calls the SDK, which calls the
 * contract, and the step is refused or accepted on what the circuit decides.
 */
export const REPLAY_STEPS: readonly ReplayStep[] = [
  {
    id: 'admit',
    actor: 'operator',
    title: 'The consortium admits three parties',
    body: 'A buyer and two financiers pass know-your-business checks off-chain. What reaches the registry is one leaf each — a hash of a secret only that party holds.',
    cta: 'Admit the parties',
    chain: 'Three membership leaves, and the roots that now include them.',
    kept: 'Who the parties are. A leaf is a hash, not a name.',
    async run(w) {
      const before = Date.now();
      await w.admitParties();
      const view = await w.publicState();
      return [
        { label: 'Debtor leaf', value: shortHex(toHex(w.debtor.leaf)), mono: true },
        { label: 'Financier A leaf', value: shortHex(toHex(w.financierA.leaf)), mono: true },
        { label: 'Financier B leaf', value: shortHex(toHex(w.financierB.leaf)), mono: true },
        { label: 'Members on the ledger', value: `${view.counts.debtors} debtor, ${view.counts.financiers} financiers` },
        { label: 'admitDebtor ×1, admitFinancier ×2', value: `accepted in ${Date.now() - before} ms`, mono: true },
      ];
    },
  },
  {
    id: 'acknowledge',
    actor: 'debtor',
    title: 'The buyer acknowledges $2,300.00',
    body: 'Ardmore Retail confirms it owes invoice 1001, at this amount, due on this date. This is the root of trust in the whole registry, and it is non-repudiable: the acknowledgment marker is public forever.',
    cta: 'Acknowledge invoice 1001',
    chain: 'One acknowledgment leaf, and a marker that stops the same invoice being acknowledged twice.',
    kept: 'The invoice itself: number, amount, due date, and which buyer owes it.',
    async run(w) {
      const entry = w.entry('SF-2026-1001');
      const receipt = await w.debtor.acknowledge(entry.invoice);
      const view = await w.publicState();
      return [
        { label: 'Amount acknowledged', value: money(entry.invoice.amount) },
        { label: 'Due', value: day(entry.invoice.dueDate) },
        { label: 'Acknowledgment leaf', value: shortHex(toHex(w.ackLeaf('SF-2026-1001'))), mono: true },
        { label: 'Acknowledgments on the ledger', value: String(view.counts.acks) },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'offer',
    actor: 'seller',
    title: 'The supplier offers it to Meridian Factoring',
    body: 'Kestrel proves, without showing the invoice, that it is acknowledged, not yet due, and not already pledged. The offer is addressed to one financier by a tag that financier issued during diligence.',
    cta: 'Offer invoice 1001',
    chain: 'A pledge marker set to offered, its holder tag and expiry, and a sealed copy of the record nobody can open yet.',
    kept: 'Every invoice field. The ledger never learns which receivable this marker stands for.',
    async run(w) {
      const invoice = w.invoice('SF-2026-1001');
      const n = w.nullifier('SF-2026-1001');
      const expiry = w.now() + 7n * DAY;
      const receipt = await w.seller.offer(invoice, w.financierA.holderTag(n), expiry);
      const view = await w.publicState();
      const pledge = findPledge(view, n)!;
      return [
        { label: 'Pledge marker', value: shortHex(pledge.nullifier), mono: true },
        { label: 'Offer expires', value: day(pledge.expiry) },
        { label: 'Sealed record', value: shortHex(pledge.recordId), mono: true },
        { label: 'Ciphertext fields', value: `${view.records[0]?.ct.length ?? 0} masked field elements` },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'accept',
    actor: 'financier-a',
    title: 'Meridian takes the pledge',
    body: 'The financier proves it is admitted to the registry and that the offer was addressed to it, by re-deriving the holder tag from its own secret. Nobody else can.',
    cta: 'Accept the offer',
    chain: 'The marker flips to pledged. No name, no amount, no link to this financier’s other pledges.',
    kept: 'Which financier this is, and everything it now holds.',
    async run(w) {
      const receipt = await w.financierA.accept(w.nullifier('SF-2026-1001'));
      const encumbrance = await w.financierB.checkEncumbrance(w.invoice('SF-2026-1001'));
      return [
        ...(await pledgeFacts(w, 'SF-2026-1001')),
        { label: 'What any other lender can now learn', value: encumbrance },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'forged',
    actor: 'seller',
    title: 'Fraud 1 — a forged invoice',
    body: 'The supplier writes invoice 9999 for $5,000.00 and offers it. The buyer has never seen it. There is no second half for this one to match.',
    cta: 'Offer a forged invoice',
    refusal: 'NOT_ACKNOWLEDGED',
    chain: 'Nothing. The transaction could not be built, so it never reached the chain.',
    kept: 'Everything — including the fact that an attempt was made.',
    async run(w) {
      const invoice = w.invoice('SF-2026-9999');
      const tag = w.financierB.holderTag(pureCircuits.nullifierOf(invoice));
      const receipt = await w.seller.offer(invoice, tag, w.now() + 7n * DAY);
      return receiptFacts([receipt]);
    },
    async onRefused(w) {
      const view = await w.publicState();
      return [
        { label: 'Pledge markers on the ledger', value: String(view.counts.pledges) },
        { label: 'Sealed records on the ledger', value: String(view.counts.records) },
        { label: 'Where the refusal happened', value: 'While the proof was being built, locally' },
      ];
    },
  },
  {
    id: 'inflated',
    actor: 'seller',
    title: 'Fraud 2 — the same invoice, ten times the value',
    body: 'Invoice 1001 again, re-priced from $2,300.00 to $23,000.00. The amount is part of what the buyer signed, so the re-priced document is a different invoice, and nothing acknowledges it.',
    cta: 'Pledge $23,000.00 against $2,300.00',
    refusal: 'NOT_ACKNOWLEDGED',
    chain: 'Nothing.',
    kept: 'The original $2,300.00 acknowledgment is untouched and still holds.',
    async run(w) {
      const inflated = { ...w.invoice('SF-2026-1001'), amount: 2_300_000n };
      const tag = w.financierB.holderTag(pureCircuits.nullifierOf(inflated));
      const receipt = await w.seller.offer(inflated, tag, w.now() + 7n * DAY);
      return receiptFacts([receipt]);
    },
    async onRefused(w) {
      const real = w.invoice('SF-2026-1001');
      const inflated = { ...real, amount: 2_300_000n };
      return [
        { label: 'Acknowledged marker', value: shortHex(toHex(pureCircuits.ackLeafOf(real))), mono: true },
        { label: 'Marker the inflated copy needs', value: shortHex(toHex(pureCircuits.ackLeafOf(inflated))), mono: true },
        { label: 'On the ledger', value: 'Only the first of those two exists' },
      ];
    },
  },
  {
    id: 'double',
    actor: 'seller',
    title: 'Fraud 3 — the same receivable, a second lender',
    body: 'The acknowledged invoice, offered again to Calder Credit. This is the fraud First Brands ran at scale, and the one no registry could catch without showing both lenders each other’s books.',
    cta: 'Try to pledge it twice',
    refusal: 'ALREADY_ENCUMBERED',
    chain: 'Nothing. The existing pledge is not touched and not disclosed.',
    kept: 'Who holds the first pledge, when it was taken, and what it is worth.',
    async run(w) {
      const n = w.nullifier('SF-2026-1001');
      const receipt = await w.seller.offer(w.invoice('SF-2026-1001'), w.financierB.holderTag(n), w.now() + 7n * DAY);
      return receiptFacts([receipt]);
    },
    async onRefused(w) {
      const encumbrance = await w.financierB.checkEncumbrance(w.invoice('SF-2026-1001'));
      return [
        { label: 'What Calder Credit learns', value: encumbrance },
        { label: 'Holder', value: 'withheld' },
        { label: 'Amount', value: 'withheld' },
        { label: 'Date of the first pledge', value: 'withheld' },
      ];
    },
  },
  {
    id: 'pay',
    actor: 'debtor',
    title: 'The buyer pays through the contract',
    body: 'Ardmore settles invoice 1001. The money lands in the contract, and the contract records who may take it out: the party holding the pledge, not the supplier who sold the receivable.',
    cta: 'Pay $2,300.00',
    chain: 'The marker flips to settled, with the amount and the payee tag. Settlement is unshielded: this is the one place an amount becomes public.',
    kept: 'Which invoice was paid, and who the payee is behind the tag.',
    async run(w) {
      const receipt = await w.debtor.pay(w.invoice('SF-2026-1001'));
      const view = await w.publicState();
      const pledge = findPledge(view, w.nullifier('SF-2026-1001'))!;
      const holderTag = w.financierA.holderTag(w.nullifier('SF-2026-1001'));
      return [
        { label: 'Received by the contract', value: money(receipt.unshielded?.received ?? 0n) },
        { label: 'Status', value: pledge.status },
        { label: 'Payee tag', value: shortField(BigInt(pledge.payeeTag)), mono: true },
        {
          label: 'Matches the holder tag of',
          value: BigInt(pledge.payeeTag) === holderTag ? 'Meridian Factoring, who funded it' : 'the seller',
        },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'divert',
    actor: 'seller',
    title: 'Fraud 4 — the supplier reaches for the proceeds',
    body: 'Diverted proceeds is the quiet fourth fraud: the buyer pays, the supplier pockets it, and the financier finds out at the wind-up. Here the supplier cannot prove the payee tag, so it cannot take the money.',
    cta: 'Claim the proceeds as the supplier',
    refusal: 'NOT_PAYEE',
    chain: 'Nothing. The funds stay in the contract.',
    kept: 'The identity of the party who can actually claim.',
    async run(w) {
      const receipt = await w.seller.claim(w.nullifier('SF-2026-1001'), SELLER_ADDRESS);
      return receiptFacts([receipt]);
    },
    async onRefused(w) {
      const n = w.nullifier('SF-2026-1001');
      return [
        { label: 'Payee tag the contract holds', value: shortField(w.financierA.holderTag(n)), mono: true },
        { label: 'Tag the supplier can prove', value: shortField(w.seller.payeeTagOf(n)), mono: true },
        { label: 'Proceeds', value: 'still in the contract' },
      ];
    },
  },
  {
    id: 'claim',
    actor: 'financier-a',
    title: 'The financier that funded it takes the money',
    body: 'Meridian proves the payee tag from its own secret and the contract pays out. The supplier was paid when it sold the receivable; the buyer’s payment goes to the lender.',
    cta: 'Claim the proceeds',
    chain: 'An unshielded payment of the invoice amount, and the marker recorded as claimed.',
    kept: 'That the recipient is Meridian, and that this pledge is one of its book.',
    async run(w) {
      const receipt = await w.financierA.claim(w.nullifier('SF-2026-1001'), A_ADDRESS);
      const view = await w.publicState();
      const pledge = findPledge(view, w.nullifier('SF-2026-1001'))!;
      return [
        { label: 'Paid out', value: money(receipt.unshielded?.sent ?? 0n) },
        { label: 'Claimed', value: pledge.claimed ? 'yes, once and only once' : 'no' },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'base-ack',
    actor: 'debtor',
    title: 'Two more payables acknowledged',
    body: 'Invoices 1002 and 1003, $1,200.00 and $900.00. The supplier is about to take them to a new lender as a borrowing base.',
    cta: 'Acknowledge 1002 and 1003',
    chain: 'Two more acknowledgment leaves.',
    kept: 'The amounts, the dates and the buyer’s payables position.',
    async run(w) {
      const a = await w.debtor.acknowledge(w.invoice('SF-2026-1002'));
      const b = await w.debtor.acknowledge(w.invoice('SF-2026-1003'));
      const view = await w.publicState();
      return [
        { label: 'Acknowledgments on the ledger', value: String(view.counts.acks) },
        ...receiptFacts([a, b]),
      ];
    },
  },
  {
    id: 'overstate',
    actor: 'seller',
    title: 'An overstated borrowing base',
    body: 'A borrowing-base certificate proves a pool of receivables clears a floor, without listing what is in it. Kestrel claims $2,500.00 over two invoices worth $2,100.00.',
    cta: 'Certify a $2,500.00 base',
    refusal: 'BELOW_FLOOR',
    chain: 'Nothing, and no invoice is locked. A refused certificate leaves the pool free.',
    kept: 'The line items — which is the whole point of a certificate.',
    async run(w) {
      const slots = ['SF-2026-1002', 'SF-2026-1003'].map((ref) => ({
        invoice: w.invoice(ref),
        holderTag: w.financierB.holderTag(w.nullifier(ref)),
      }));
      const receipt = await w.seller.certify(slots, {
        lenderRef: LENDER_REF,
        lenderNonce: LENDER_NONCE,
        floor: 250_000n,
        validUntil: w.now() + 30n * DAY,
      });
      return receiptFacts([receipt]);
    },
    async onRefused(w) {
      const view = await w.publicState();
      return [
        { label: 'Pool actually worth', value: money(210_000n) },
        { label: 'Floor claimed', value: money(250_000n) },
        { label: 'Certificates on the ledger', value: String(view.counts.certificates) },
      ];
    },
  },
  {
    id: 'certify',
    actor: 'seller',
    title: 'An honest borrowing base, locked to one lender',
    body: 'The same two invoices, a floor of $2,000.00. The certificate proves the pool clears the floor and locks each invoice to that lender as an offer it can take up. The lender learns a number, not a list.',
    cta: 'Certify a $2,000.00 base',
    chain: 'One certificate: a borrower commitment only this lender can test, the floor, how many invoices, and the expiry. Plus a locked pledge marker per invoice.',
    kept: 'Which invoices are in the pool, what each is worth, and who owes them.',
    async run(w) {
      const slots = ['SF-2026-1002', 'SF-2026-1003'].map((ref) => ({
        invoice: w.invoice(ref),
        holderTag: w.financierB.holderTag(w.nullifier(ref)),
      }));
      const receipt = await w.seller.certify(slots, {
        lenderRef: LENDER_REF,
        lenderNonce: LENDER_NONCE,
        floor: 200_000n,
        validUntil: w.now() + 30n * DAY,
      });
      const view = await w.publicState();
      const cert = findCertificate(view, pureCircuits.certIdOf(LENDER_REF, LENDER_NONCE));
      return [
        { label: 'Floor proved', value: money(cert?.floor ?? 0n) },
        { label: 'Invoices locked', value: String(cert?.count ?? 0) },
        { label: 'Valid until', value: cert ? day(cert.validUntil) : '—' },
        { label: 'Borrower commitment', value: shortHex(cert?.borrowerCommit), mono: true },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'request',
    actor: 'auditor',
    title: 'A trustee asks for one record',
    body: 'The bankruptcy trustee wants the sealed record behind invoice 1001’s pledge. It names the record and a case reference. Asking is a public act; it opens nothing by itself.',
    cta: 'Request the record',
    chain: 'The request, with the record id, the case reference and three empty approval slots.',
    kept: 'The contents of the record, which are still sealed to a key nobody holds alone.',
    async run(w) {
      const view = await w.publicState();
      const recordId = findPledge(view, w.nullifier('SF-2026-1001'))!.recordId;
      const receipt = await w.auditor.request(recordId, CASE_REF);
      return [
        { label: 'Record requested', value: shortHex(recordId), mono: true },
        { label: 'Case reference', value: shortHex(toHex(CASE_REF)), mono: true },
        { label: 'Approvals', value: '0 of 2 needed' },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'approve-one',
    actor: 'keyholders',
    title: 'One keyholder approves',
    body: 'Keyholder 1 proves it holds a share of the disclosure key and publishes its part of the answer, sealed to the auditor. One share is not a key: the auditor can try, and gets nothing.',
    cta: 'Approve as keyholder 1',
    chain: 'The approval, and one sealed decryption share.',
    kept: 'The share itself. It is proved in circuit and never published.',
    async run(w) {
      const view = await w.publicState();
      const recordId = findPledge(view, w.nullifier('SF-2026-1001'))!.recordId;
      const requestId = w.auditor.requestIdOf(recordId, CASE_REF);
      const receipt = await w.keyholders[0].approve(requestId);
      const attempt = await w.auditor.open(requestId);
      return [
        { label: 'Approvals', value: '1 of 2 needed' },
        { label: 'Auditor tries to open', value: attempt.verified ? 'opened' : 'nothing readable comes out' },
        { label: 'Self-check', value: attempt.verified ? 'passed' : 'fails, as it should' },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'approve-two',
    actor: 'keyholders',
    title: 'The threshold is met',
    body: 'Keyholder 3 approves. Two of three shares are now on the ledger, each sealed to the auditor’s key — so the approvals are public and the material is not.',
    cta: 'Approve as keyholder 3',
    chain: 'The second approval and its sealed share.',
    kept: 'Both shares’ plaintext, and the contents of the record until the auditor combines them.',
    async run(w) {
      const view = await w.publicState();
      const recordId = findPledge(view, w.nullifier('SF-2026-1001'))!.recordId;
      const requestId = w.auditor.requestIdOf(recordId, CASE_REF);
      const receipt = await w.keyholders[2].approve(requestId);
      const after = await w.publicState();
      const request = after.requests[0];
      return [
        {
          label: 'Approvals on the ledger',
          value: request ? request.approvals.map((a, i) => `${i + 1}${a ? '✓' : '·'}`).join('  ') : '—',
          mono: true,
        },
        { label: 'Sealed shares', value: String(after.counts.shares) },
        ...receiptFacts([receipt]),
      ];
    },
  },
  {
    id: 'open',
    actor: 'auditor',
    title: 'The record opens, and proves itself',
    body: 'The auditor combines the two shares, decrypts the record, and re-derives the invoice fingerprint from what came out. The pledge marker it recomputes has to equal the one the record was filed under — so a doctored disclosure fails on its own arithmetic.',
    cta: 'Open the record',
    chain: 'Nothing. Opening happens off-chain; the ledger already holds the trail that it was allowed.',
    kept: 'Everything, from everyone except this auditor on this record.',
    async run(w) {
      const view = await w.publicState();
      const recordId = findPledge(view, w.nullifier('SF-2026-1001'))!.recordId;
      const requestId = w.auditor.requestIdOf(recordId, CASE_REF);
      const opened = await w.auditor.open(requestId);
      if (!opened.verified) throw new Error('the record did not verify against the ledger');
      return [
        { label: 'Invoice number', value: String(opened.invoice.invoiceNo) },
        { label: 'Amount', value: money(opened.invoice.amount) },
        { label: 'Due', value: day(opened.invoice.dueDate) },
        { label: 'Shares combined', value: opened.indices.join(' and ') },
        { label: 'Recomputed pledge marker', value: shortHex(opened.nullifier), mono: true },
        { label: 'Filed on the ledger under', value: shortHex(opened.nullifier), mono: true },
        { label: 'Record id recomputes', value: opened.recordIdMatches ? 'yes' : 'no' },
        { label: 'Disclosure verified', value: opened.verified ? 'yes' : 'no' },
      ];
    },
  },
];

export const stepIndex = (id: string): number => REPLAY_STEPS.findIndex((s) => s.id === id);
