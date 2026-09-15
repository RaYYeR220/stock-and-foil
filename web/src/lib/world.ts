// SPDX-License-Identifier: Apache-2.0
//
// The Sandbox world. One `SimulatorBackend` runs the real compiled circuits in this tab — no
// chain, no wallet, no proving — and every persona workspace, the guided replay and the ledger
// explorer all drive that same world, so an action taken in one surface is visible in the others.
//
// Two things a chain cannot give a demo are used here: block time is set by the page, and the
// whole world can be snapshotted and restored, which is what "replay from here" rewinds.
import { pureCircuits } from '@stockandfoil/contract';
import {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  SellerClient,
  SimulatorBackend,
  generatePersona,
  generateRegistryKeys,
  toHex,
  type Invoice,
  type PublicLedgerView,
  type RegistryKeys,
  type SimulatorSnapshot,
  type StockAndFoilPrivateState,
} from './sdk.js';

/** 2026-09-15T00:00:00Z. A fixed start, so every run of the demo reads the same dates. */
export const T0 = 1_789_430_400n;
export const DAY = 86_400n;

export const CASE_REF = new Uint8Array(32).fill(0xc7);
export const LENDER_REF = new Uint8Array(32).fill(0x1d);
export const LENDER_NONCE = new Uint8Array(32).fill(0x2e);

/** Every role the app can act as. `keyholders` is a bench of three, shown together. */
export type PersonaId =
  | 'operator'
  | 'debtor'
  | 'seller'
  | 'financier-a'
  | 'financier-b'
  | 'auditor'
  | 'keyholders';

export interface PersonaMeta {
  id: PersonaId;
  /** Party name as it would appear on paper. */
  name: string;
  /** What this party is, in the trade's own words. */
  role: string;
  sees: string[];
  blind: string[];
  summary: string;
}

export const PERSONAS: readonly PersonaMeta[] = [
  {
    id: 'operator',
    name: 'Registry consortium',
    role: 'Operator',
    summary:
      'Admits buyers and financiers after off-chain know-your-business checks. It cannot pledge, settle or open a record.',
    sees: ['Who it admitted', 'Public counts and roots'],
    blind: ['Every invoice', 'Who pledged what to whom', 'The contents of any sealed record'],
  },
  {
    id: 'debtor',
    name: 'Ardmore Retail Group',
    role: 'Debtor — the buyer who owes',
    summary:
      'Acknowledges a payable at one amount and one due date, then pays it through the contract so the money reaches whoever financed it.',
    sees: ['Its own payables', 'What it acknowledged and when'],
    blind: ['Which financier holds a pledge', 'What its supplier was paid for the receivable'],
  },
  {
    id: 'seller',
    name: 'Kestrel Components',
    role: 'Seller — the supplier being financed',
    summary:
      'Issues invoices with the salt that keeps them untestable, offers acknowledged receivables to one financier at a time, and certifies a borrowing base.',
    sees: ['Its own invoice book', 'Holder tags financiers gave it', 'Which of its receivables are encumbered'],
    blind: ["Another seller's book", 'Whether a refusal came from a rival financier or from the ledger'],
  },
  {
    id: 'financier-a',
    name: 'Meridian Factoring',
    role: 'Financier A — first to fund',
    summary:
      'Issues a fresh holder tag per pledge during diligence, checks the receivable is free, accepts the offer, and later releases it or takes the proceeds.',
    sees: ['Its own pledges', 'Whether any receivable it is shown is already encumbered'],
    blind: ["Another financier's book", 'Who holds a pledge it was refused', 'Any invoice it was not shown'],
  },
  {
    id: 'financier-b',
    name: 'Calder Credit',
    role: 'Financier B — the second lender',
    summary:
      'The lender First Brands would have hit second. It can ask the registry whether a receivable is spoken for, and that answer carries nothing else.',
    sees: ['Its own pledges', 'A yes or no on encumbrance'],
    blind: ['Who holds the first pledge', 'When it was taken', 'What it is worth'],
  },
  {
    id: 'auditor',
    name: 'Halloran & Reeve',
    role: 'Auditor — trustee investigator',
    summary:
      'Asks for one specific sealed record. The request is public; the contents arrive only after two of three keyholders approve, and then prove themselves against the ledger.',
    sees: ['Every sealed record id', 'Requests and approvals', 'The contents of records it has opened'],
    blind: ['Any record it has not had approved', 'Anything about records it never requested'],
  },
  {
    id: 'keyholders',
    name: 'Keyholder bench',
    role: 'Keyholders — operator, court, regulator',
    summary:
      'Three parties each hold one share of the disclosure key. Two must approve on the ledger before a record can be opened, and approving is a public act.',
    sees: ['Which record a disclosure was asked for'],
    blind: ['The contents of the record', "Each other's shares"],
  },
];

export const personaMeta = (id: PersonaId): PersonaMeta => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]!;

/** An invoice as the Sandbox keeps it: the private document, plus a human reference. */
export interface BookEntry {
  /** Reference the parties would quote to each other; not on the ledger. */
  ref: string;
  invoice: Invoice;
  /** Why this one exists in the demo, for the workspaces to show. */
  note?: string;
  /** The invoice was fabricated by the seller and never sent to the buyer. */
  fabricated?: boolean;
}

const fixedInvoice = (
  seller: SellerClient,
  debtorId: bigint,
  o: { invoiceNo: bigint; amount: bigint; dueDays: bigint; salt: bigint },
): Invoice =>
  seller.issueInvoice({
    debtorId,
    invoiceNo: o.invoiceNo,
    amount: o.amount,
    dueDate: T0 + o.dueDays * DAY,
    salt: o.salt,
  });

/**
 * A deployed registry plus the six role clients and the invoice book the demo starts from.
 *
 * The salts are fixed rather than random so that resetting the world reproduces exactly the same
 * nullifiers, which is what makes "replay from here" and the screenshots repeatable. A real seller
 * draws them from `randomField()`.
 */
export class SandboxWorld {
  readonly keys: RegistryKeys;
  readonly backend: SimulatorBackend;
  readonly operator: OperatorClient;
  readonly debtor: DebtorClient;
  readonly seller: SellerClient;
  readonly financierA: FinancierClient;
  readonly financierB: FinancierClient;
  readonly auditor: AuditorClient;
  readonly keyholders: [KeyholderClient, KeyholderClient, KeyholderClient];
  /** Invoices the parties know about. Never on the ledger; the workspaces read it. */
  book: BookEntry[];
  /** Bumped whenever the world changes, so React can re-read it. */
  revision = 0;

  private constructor(keys: RegistryKeys, backend: SimulatorBackend, identities?: SandboxIdentities) {
    this.keys = keys;
    this.backend = backend;
    this.operator = new OperatorClient(backend, keys.operator);
    this.debtor = new DebtorClient(backend, identities?.debtor ?? generatePersona('debtor'));
    this.seller = new SellerClient(backend, identities?.seller ?? generatePersona('seller'));
    this.financierA = new FinancierClient(backend, identities?.financierA ?? generatePersona('financier'));
    this.financierB = new FinancierClient(backend, identities?.financierB ?? generatePersona('financier'));
    this.auditor = new AuditorClient(backend, keys.auditor.persona);
    this.keyholders = keys.keyholders.map(
      (persona, i) => new KeyholderClient(backend, persona, i as 0 | 1 | 2),
    ) as [KeyholderClient, KeyholderClient, KeyholderClient];
    this.book = this.openingBook();
  }

  /**
   * Deploys a registry. Given `identities` — the secrets of a world this tab has already built —
   * it deploys the same one again: same operator id, same membership leaves, same invoice
   * fingerprints, which is what makes a stored ledger meaningful after a reload.
   */
  static create(identities?: SandboxIdentities): SandboxWorld {
    const keys = identities?.registry ?? generateRegistryKeys();
    const backend = SimulatorBackend.deploy({
      constructorArgs: keys.constructorArgs,
      operator: keys.operator,
      now: T0,
    });
    return new SandboxWorld(keys, backend, identities);
  }

  /** Every secret this world runs on. Enough, with a ledger snapshot, to rebuild it exactly. */
  identities(): SandboxIdentities {
    return {
      registry: this.keys,
      debtor: this.debtor.persona,
      seller: this.seller.persona,
      financierA: this.financierA.persona,
      financierB: this.financierB.persona,
    };
  }

  private openingBook(): BookEntry[] {
    const d = this.debtor.id;
    return [
      {
        ref: 'SF-2026-1001',
        invoice: fixedInvoice(this.seller, d, {
          invoiceNo: 1001n,
          amount: 230_000n,
          dueDays: 90n,
          salt: 0x51a17_0001n,
        }),
        note: 'The receivable the whole replay turns on.',
      },
      {
        ref: 'SF-2026-1002',
        invoice: fixedInvoice(this.seller, d, {
          invoiceNo: 1002n,
          amount: 120_000n,
          dueDays: 75n,
          salt: 0x51a17_0002n,
        }),
        note: 'Held back for the borrowing base.',
      },
      {
        ref: 'SF-2026-1003',
        invoice: fixedInvoice(this.seller, d, {
          invoiceNo: 1003n,
          amount: 90_000n,
          dueDays: 60n,
          salt: 0x51a17_0003n,
        }),
        note: 'Held back for the borrowing base.',
      },
      {
        ref: 'SF-2026-9999',
        invoice: fixedInvoice(this.seller, d, {
          invoiceNo: 9999n,
          amount: 500_000n,
          dueDays: 90n,
          salt: 0x51a17_9999n,
        }),
        note: 'Written by the supplier alone. The buyer has never seen it.',
        fabricated: true,
      },
    ];
  }

  entry(ref: string): BookEntry {
    const found = this.book.find((e) => e.ref === ref);
    if (!found) throw new Error(`no invoice ${ref} in the sandbox book`);
    return found;
  }

  invoice(ref: string): Invoice {
    return this.entry(ref).invoice;
  }

  nullifier(ref: string): Uint8Array {
    return pureCircuits.nullifierOf(this.invoice(ref));
  }

  ackLeaf(ref: string): Uint8Array {
    return pureCircuits.ackLeafOf(this.invoice(ref));
  }

  /** Adds an invoice the seller has just written. Returns its reference. */
  addInvoice(o: { invoiceNo: bigint; amount: bigint; dueDate: bigint }): BookEntry {
    const entry: BookEntry = {
      ref: `SF-2026-${o.invoiceNo}`,
      invoice: this.seller.issueInvoice({ debtorId: this.debtor.id, ...o }),
      note: 'Issued in this session.',
    };
    this.book = [...this.book, entry];
    return entry;
  }

  /** Which financier a holder tag belongs to, for surfaces that may legitimately know. */
  financier(id: 'financier-a' | 'financier-b'): FinancierClient {
    return id === 'financier-a' ? this.financierA : this.financierB;
  }

  publicState(): Promise<PublicLedgerView> {
    return this.backend.publicState();
  }

  now(): bigint {
    return this.backend.currentTime();
  }

  snapshot(): WorldSnapshot {
    return { ledger: this.backend.snapshot(), book: [...this.book] };
  }

  restore(snapshot: WorldSnapshot): void {
    this.backend.restore(snapshot.ledger);
    this.book = [...snapshot.book];
  }

  /** Admissions the registry has already made when a visitor arrives is a lie; this is a step. */
  async admitParties(): Promise<void> {
    await this.operator.admitDebtor(this.debtor.leaf);
    await this.operator.admitFinancier(this.financierA.leaf);
    await this.operator.admitFinancier(this.financierB.leaf);
  }
}

export interface WorldSnapshot {
  ledger: SimulatorSnapshot;
  book: BookEntry[];
}

/**
 * The secrets behind one sandbox world. The registry keys are sealed into the contract at
 * deployment; the other four are the parties the ledger only ever holds hashes of, and without
 * them a restored ledger is a set of markers nobody in the tab can act on.
 */
export interface SandboxIdentities {
  registry: RegistryKeys;
  debtor: StockAndFoilPrivateState;
  seller: StockAndFoilPrivateState;
  financierA: StockAndFoilPrivateState;
  financierB: StockAndFoilPrivateState;
}

/**
 * Whether anything has been recorded against the registry beyond who was admitted. Membership is
 * deliberately not counted: a world that has only admitted its parties is still a blank ledger.
 */
export const isEmptyRegistry = (view: PublicLedgerView | null): boolean =>
  !view ||
  view.counts.acks + view.counts.pledges + view.counts.records + view.counts.certificates + view.counts.requests === 0;

/** Contract-derived label for a record, used to seed its tally artwork. */
export const artSeed = (value: string | Uint8Array): string => (typeof value === 'string' ? value : toHex(value));
