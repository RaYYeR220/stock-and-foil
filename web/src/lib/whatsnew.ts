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
    what: 'A pledge marker is a deterministic function of the invoice, so the same receivable produces the same marker in every registry that exists. A lender computes it once and reads it against every registry address it holds — three independent reads, no shared operator, no data-sharing agreement. The page draws that, the panel underneath it runs it against two live deployments, and a single factoring house running its own registry already catches the same invoice pledged twice across its own branches on day one.',
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
    id: 'registry-b',
    title: 'A second registry, run by somebody else',
    what: 'Harbour: a second deployment of the same contract on Midnight preview, from its own key ceremony — a different operator, a different disclosure key, a different three keyholders. Eleven transactions deployed it. Each registry has declared the other a peer on chain with `registerPeer`, so a lender that finds either one finds the other, and neither can read the other’s state.',
    why: 'Two addresses in one config file prove nothing about federation. Two deployments that cannot see each other, with one receivable keyed by the same marker in both, is the actual claim — and it is now a thing on a public testnet rather than an argument.',
    status: 'shipped',
    links: [
      {
        label: 'Harbour on the explorer',
        href: 'https://preview.midnightexplorer.com/contracts/2d8f8f23b311b9596354b92c4ac01805a8921cc9bd54daa950e49877890cccbd',
      },
      { label: 'Both registries, on the proof page', to: '/proof' },
    ],
  },
  {
    id: 'live-check',
    title: 'The cross-registry check, running in the visitor’s browser',
    what: 'The federation panel on the landing page is no longer a drawing. It reads both deployed contracts’ public state straight from the preview indexer, derives the verdict per registry the way a lender’s own client would, and prints the one bit the asking lender learns. Two markers from the recorded runs are there to try, and anything else can be pasted in. A registry that does not answer is printed as “no answer”, never as “free”.',
    why: 'The Wave 1 objection was that the idea needs a consortium. The strongest available rebuttal is not an explanation — it is two registries a reviewer can watch being asked, from their own machine, with nothing of ours in the path.',
    status: 'shipped',
    links: [
      { label: 'Run it', href: '/#check' },
      { label: 'The same check from the command line', to: '/proof' },
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

  {
    id: 'sponsorship',
    title: 'Fee sponsorship, so a first-time user needs no DUST',
    what: 'A sponsored submission path: the acting party proves the circuit, balances the shielded and unshielded sides, signs and binds, and a sponsor balances the DUST and submits. A wallet holding 0 SPECK before and 0 SPECK after acknowledged an invoice on preview; the sponsor paid 1 SPECK. The registry authenticates by secret knowledge, not by who paid, so the sponsor learns nothing.',
    why: 'A buyer’s accounts-payable clerk is not going to acquire a fee token to confirm that an invoice is real. Until this existed, network mode needed a funded wallet for every party.',
    status: 'shipped',
    links: [
      { label: 'What it is, on the landing page', href: '/#sponsorship' },
      {
        label: 'The zero-DUST transaction',
        href: 'https://preview.midnightexplorer.com/transactions/a46d2c3a01b49d1ebca0ef7c9bb65d0f3c5927623cfedad116550daeffd06e07',
      },
      { label: 'The wallet balances, before and after', to: '/proof' },
    ],
  },
  {
    id: 'circuits',
    title: 'Peer registration, batch acceptance and case-scoped disclosure',
    what: 'Three new circuits, taking the contract from twelve to sixteen: `registerPeer` records another registry’s address and a commitment to the label this one files it under; `acceptBatch` takes a batch of offers in one transaction; `openCase`/`approveCase` scope a disclosure to a case reference, so an approval cannot be reused for a second record. All sixteen are deployed on preview, in both registries.',
    why: 'The first is what turns the federation section from arithmetic into something a registry can advertise and a lender can discover. The third closes F-08 from this project’s own threat model — an approval that could be replayed against a record the keyholders never saw.',
    status: 'shipped',
    links: [
      {
        label: 'The sixteen-circuit deployment',
        href: 'https://github.com/RaYYeR220/stock-and-foil/blob/main/PROOF.md#preview-the-deployed-registry',
      },
      { label: 'Peer declarations and the verdicts', to: '/proof' },
      { label: 'Case-scoped disclosure, run in the browser', to: '/app/replay' },
    ],
  },

  // The mainnet entry is `shipped` for the write-up and the three fixes it produced, not for a
  // deployment: there is none, and nothing on this site may say otherwise. If the registry ever
  // does land on mainnet, that is a new entry with the address and an explorer link — this one
  // stays as the record of the attempt.
  {
    id: 'mainnet',
    title: 'Mainnet attempted: what we measured, and where it stopped',
    what: 'Three attempts to deploy the registry to Midnight mainnet, through the 1AM wallet, whose ProofStation proves and balances a transaction out of its own funded pool — because mainnet fees are paid in DUST, DUST comes from NIGHT held on Cardano, and we have no route to Cardano. Each attempt was built, proved and balanced correctly; the node took each one into its pool and then marked it `Invalid` about 75 seconds later. Nothing reached a block, nothing was spent, and all three are absent from the chain by hash and by identifier. Fees are excluded by the node’s own cost API: 0.002008 DUST for all eleven deployment transactions against the 1.000000 DUST the signer held. Block limits are excluded against mainnet’s live parameters. Every static cause — encoding, binding, segment structure — is excluded because a deliberately malformed payload is refused synchronously by the node while ours passes that gate and fails later. What remains is the state the transaction depends on: the DUST input and its spend proof, both chosen by the sponsoring service from a pool that is concurrently paying for other people’s transactions. That is on the other side of the boundary from us. The balanced transaction is kept on disk, re-submittable without re-proving, so the wallet’s authors have a reproduction.',
    why: 'Permissionless mainnet deployment opened on 28 September 2026, the first day of this wave, and the Wave 1 reviewer asked the field to use it. We are not deployed there, and the useful thing to publish is the measurement rather than the intention. The attempt also found three real bugs of our own — a key-decoding mismatch against the wallet address-format library, an unbound `fetch` that breaks in-browser proving, and a coin-public-key encoding that midnight-js converts on some paths and not others, which would have failed at transaction 2 of 11 after the first had landed. The first of those was in the shipped Network-mode code of this app and is fixed there too.',
    judge: {
      quote:
        'Since you’ll soon be able to freely deploy contracts to the mainnet, please be sure to deploy your product there.',
      source: 'Wave 1 review, Business Development',
    },
    status: 'shipped',
    links: [
      { label: 'The attempts and what they exclude', to: '/proof' },
      {
        label: 'docs/MAINNET.md — the runbook and where it stops',
        href: 'https://github.com/RaYYeR220/stock-and-foil/blob/main/docs/MAINNET.md',
      },
    ],
  },
];

export const shipped = (): readonly Change[] => CHANGES.filter((c) => c.status === 'shipped');
export const inFlight = (): readonly Change[] => CHANGES.filter((c) => c.status === 'in-flight');
