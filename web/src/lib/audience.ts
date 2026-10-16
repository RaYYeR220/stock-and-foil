// SPDX-License-Identifier: Apache-2.0
//
// Who stands to benefit. Four named jobs, not four personas: for each one, the decision they are
// stuck with today, the thing the registry hands them, and the thing they stop having to send to
// anyone. The persona workspaces in `/app` dramatise the same four seats, so the names here match
// the organisations in `world.ts`.

export interface Beneficiary {
  /** Two digits, printed as the card's index. */
  n: string;
  /** The job title, in the words that job uses about itself. */
  who: string;
  /** The organisation archetype the job sits in, named the way the demo names it. */
  at: string;
  /** What they are stuck with today, in one line. */
  today: string;
  /** What the registry gives them, in one line. */
  gets: string;
  /** What they no longer have to hand to anybody, in one line. */
  stops: string;
  /** The workspace that lets a visitor take this seat. */
  to: string;
  seat: string;
}

export const BENEFICIARIES: readonly Beneficiary[] = [
  {
    n: '01',
    who: 'The credit officer',
    at: 'at a factoring company · Meridian Factoring',
    today: 'Funds the invoice on the borrower’s word that nobody else is holding it.',
    gets: 'A yes or no on whether this receivable is already pledged — before the money leaves.',
    stops: 'Circulating the invoice, the debtor or the client list to a rival lender to find out.',
    to: '/app/financier-b',
    seat: 'Take the second lender’s seat',
  },
  {
    n: '02',
    who: 'The CFO',
    at: 'of the supplier · Kestrel Components',
    today: 'Pays a fraud premium set by what the lender cannot check.',
    gets: 'An invoice a financier can confirm is unencumbered, priced on the receivable and not the doubt.',
    stops: 'Handing the whole debtor-by-debtor ledger to every lender that asks to see the book.',
    to: '/app/seller',
    seat: 'Take the supplier’s seat',
  },
  {
    n: '03',
    who: 'The accounts-payable team',
    at: 'at the buyer · Ardmore Retail Group',
    today: 'Verifies the same invoice by telephone for every financier in the chain.',
    gets: 'One acknowledgment, made once, and payment that reaches whoever holds the debt now.',
    stops: 'Confirming payables to callers it has no way to authenticate.',
    to: '/app/debtor',
    seat: 'Take the buyer’s seat',
  },
  {
    n: '04',
    who: 'The insolvency practitioner',
    at: 'appointed over the estate · Halloran & Reeve',
    today: 'Rebuilds who was owed what from six banks’ paperwork, months after the money went.',
    gets: 'One record opened under a case reference, with two of three keyholders’ approval on the ledger.',
    stops: 'Chasing every financier in the chain to reconstruct a pledge history by hand.',
    to: '/app/auditor',
    seat: 'Take the trustee’s seat',
  },
];
