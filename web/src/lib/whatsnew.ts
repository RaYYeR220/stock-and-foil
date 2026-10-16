// SPDX-License-Identifier: Apache-2.0
//
// What changed in Wave 2, as a list rather than as prose, so that a reviewer can check it item by
// item and so that a new item is a data change rather than a page rewrite.
//
// The only rule this file has: `status: 'shipped'` means it is in the build you are looking at.
// Anything still being built stays `'in-flight'` and is printed under its own heading, saying
// plainly that it has not landed. Nothing here may claim a network, a sponsorship or a federation
// read that does not exist yet.

export type ChangeStatus = 'shipped' | 'in-flight';

export interface ChangeLink {
  label: string;
  /** An in-app route. */
  to?: string;
  /** An external URL, or a same-document anchor. */
  href?: string;
}

export interface Change {
  id: string;
  /** The thing itself, named. */
  title: string;
  /** What it is, for somebody who has not seen it. */
  what: string;
  /** Why it exists. Where that is a Wave 1 note, the note is quoted in `judge`. */
  why: string;
  /** The Wave 1 review, verbatim, when this item answers it. */
  judge?: { quote: string; source: string };
  status: ChangeStatus;
  /** Where to go and look. */
  links?: readonly ChangeLink[];
}

export const WAVE = {
  label: 'Wave 2',
  closes: '19 October 2026',
  previous: 'Wave 1',
} as const;

export const CHANGES: readonly Change[] = [
  {
    id: 'who-benefits',
    title: 'The landing page names who benefits',
    what: 'Four seats — the credit officer at a factoring company, the supplier’s CFO, the buyer’s accounts-payable team and the insolvency practitioner — each with what they are stuck with today, what the registry gives them, and the document they stop having to send to anyone. The hero sub-copy says who the product is for before it says what it does.',
    why: 'The one actionable note on our Wave 1 presentation was that it never said who gains. It said what the registry refuses, and left the reader to work out whose problem that was.',
    judge: {
      quote:
        'Its content accurately addressed the pain points. The presentation would be even better if it made it clearer who stands to benefit from using this.',
      source: 'Wave 1 review, Communication',
    },
    status: 'shipped',
    links: [{ label: 'Who stands to benefit', href: '/#who' }],
  },
  {
    id: 'federation',
    title: 'The cold-start answer, on the page and in the type system',
    what: 'A pledge marker is a deterministic function of the invoice, so the same receivable produces the same marker in every registry that exists. A lender computes it once and reads it against every registry address it holds — three independent reads, no shared operator, no data-sharing agreement. The page draws that, and a single factoring house running its own registry already catches the same invoice pledged twice across its own branches on day one.',
    why: 'The only criticism of the product in Wave 1 was that it needed everybody in one place before it was worth anything. That is a property of a shared database, not of this design, and the page now says so where the objection is raised.',
    judge: {
      quote:
        'The catch is scale: it only works once many competing financiers join the same registry, a consortium sale that’s hard for a startup.',
      source: 'Wave 1 review, Product',
    },
    status: 'shipped',
    links: [
      { label: 'It does not need a consortium', href: '/#federation' },
      { label: 'The refusal, run for real', to: '/app/replay' },
    ],
  },
  {
    id: 'legible-screens',
    title: 'Screens rebuilt to be read in a single still frame',
    what: 'Every route states in one line what it is, the page headings were cut to roughly half their height so the working surface is in frame, type sizes were raised across the key/value rows, step list, counts and outcomes, and the refusal and disclosure moments now sit directly under the heading instead of below the fold.',
    why: 'Wave 1 scored this project highest in the field on the automated frontend check and lowest in the field on UX. Nothing in the review mentions a single screen of ours, which is the signature of screens that were never read. Screenshots and a film are how this gets looked at, so the screens were rebuilt to survive being one frame.',
    status: 'shipped',
    links: [
      { label: 'The guided replay', to: '/app/replay' },
      { label: 'The public ledger', to: '/app/ledger' },
      { label: 'A workspace', to: '/app/seller' },
    ],
  },
  {
    id: 'mainnet-claim',
    title: 'The stale mainnet excuse is gone',
    what: 'The proof page used to say that mainnet deployment was gated by the Foundation’s review. Permissionless mainnet contract deployment went live on 28 September 2026, so that sentence stopped being true on the first day of this wave. It now says what is actually the case: the gate is open and this registry is not through it yet.',
    why: 'A stale excuse where the reviewer told the field to go to mainnet is worse than the missing deployment it was excusing.',
    status: 'shipped',
    links: [{ label: 'Proof', to: '/proof' }],
  },
  {
    id: 'changelog',
    title: 'This page',
    what: 'A changelog built from a typed list, with what each item is, why it exists and a link to the thing itself. Items still being built are listed below as unfinished rather than left out.',
    why: 'The rules ask for a clear explanation of what has changed since the previous submission, and the returning entries that moved up in this buildathon all answered the previous review point by point.',
    status: 'shipped',
    links: [{ label: 'The list this is built from', href: 'https://github.com/RaYYeR220/stock-and-foil/blob/main/web/src/lib/whatsnew.ts' }],
  },

  // ── not shipped ────────────────────────────────────────────────────────────
  // These stay 'in-flight' until the thing exists. Flip the status and add the link.
  {
    id: 'mainnet',
    title: 'The registry on Midnight mainnet',
    what: 'A mainnet deployment of the registry contract, with the address and an explorer link in the README and on the proof page, and a real lifecycle run against it.',
    why: 'Permissionless mainnet deployment opened on 28 September 2026, the first day of this wave, and the Wave 1 reviewer asked the field to use it.',
    judge: {
      quote:
        'Since you’ll soon be able to freely deploy contracts to the mainnet, please be sure to deploy your product there.',
      source: 'Wave 1 review, Business Development',
    },
    status: 'in-flight',
  },
  {
    id: 'sponsorship',
    title: 'Fee sponsorship, so a first-time user needs no DUST',
    what: 'A sponsored submission path, so that a party admitted to a registry can acknowledge or pledge without first holding the network’s fee token.',
    why: 'A credit officer is not going to acquire a fee token before checking whether an invoice is encumbered. Until this exists, network mode needs a funded wallet.',
    status: 'in-flight',
  },
  {
    id: 'circuits',
    title: 'Peer registration, batch acceptance and case-scoped disclosure',
    what: 'New circuits: registering a peer registry on-chain, accepting a batch of offers in one transaction, and scoping a disclosure to a case reference so that an approval cannot be reused for a second record.',
    why: 'The first is what turns the federation section from arithmetic into something a registry can advertise; the third closes a finding from this project’s own threat model.',
    status: 'in-flight',
  },
];

export const shipped = (): readonly Change[] => CHANGES.filter((c) => c.status === 'shipped');
export const inFlight = (): readonly Change[] => CHANGES.filter((c) => c.status === 'in-flight');
