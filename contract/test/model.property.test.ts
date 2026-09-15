// SPDX-License-Identifier: Apache-2.0
//
// Model-based property test: random command sequences over 3 invoices and 2 financiers are
// replayed against a reference model that predicts, for every call, either the new public state
// or the exact refusal code. Every command also re-checks the registry's three core invariants:
// at most one live encumbrance per invoice, SETTLED is terminal, and proceeds leave the registry
// exactly once and only to the modelled payee.
import fc, { type Command } from 'fast-check';
import { expect, it } from 'vitest';
import {
  DAY,
  pure,
  received,
  sent,
  sentTo,
  setupRegistry,
  userAddress,
  type CircuitResult,
  type Registry,
} from './harness.js';
import { PledgeStatus, type Invoice } from '../src/index.js';

type Status = 'NONE' | 'OFFERED' | 'PLEDGED' | 'RELEASED' | 'SETTLED';
type Payee = 'A' | 'B' | 'seller';

const FINANCIERS = ['A', 'B'] as const;
const ADDRESS = { A: userAddress(0xa1), B: userAddress(0xb2), seller: userAddress(0x5e) };
/** Invoices are due far out; the offer command deliberately also generates expiries beyond that. */
const DUE_IN = 2_000n * DAY;

interface InvoiceModel {
  acked: boolean;
  status: Status;
  holder: 'A' | 'B' | null;
  expiry: bigint;
  payee: Payee | null;
  amount: bigint;
  claimed: boolean;
  everSettled: boolean;
  paidOut: bigint;
}

interface Model {
  time: bigint;
  start: bigint;
  /** Certificates attempted so far; used to keep every lender nonce fresh. */
  certs: number;
  invoices: InvoiceModel[];
}

interface Real {
  r: Registry;
  invoices: Invoice[];
  nullifiers: Uint8Array[];
}

const LEDGER_STATUS: Record<Status, PledgeStatus | null> = {
  NONE: null,
  OFFERED: PledgeStatus.OFFERED,
  PLEDGED: PledgeStatus.PLEDGED,
  RELEASED: PledgeStatus.RELEASED,
  SETTLED: PledgeStatus.SETTLED,
};

const other = (f: 'A' | 'B'): 'A' | 'B' => (f === 'A' ? 'B' : 'A');

const tagOf = (s: Real, f: 'A' | 'B', i: number): bigint =>
  (f === 'A' ? s.r.financierA : s.r.financierB).holderTag(s.nullifiers[i]!);

const payeeTagOf = (s: Real, payee: Payee, i: number): bigint =>
  payee === 'seller' ? pure.sellerPayeeTagOf(s.r.seller.id, s.nullifiers[i]!) : tagOf(s, payee, i);

/** Outcomes the run actually exercised, so a model that predicts nothing cannot pass silently. */
const seen = new Map<string, number>();

function refusalOf(fn: () => CircuitResult): { code?: string; res?: CircuitResult } {
  try {
    return { res: fn() };
  } catch (e) {
    const text = `${(e as Error)?.message ?? e} ${(e as { cause?: Error })?.cause?.message ?? ''}`;
    const m = /failed assert: ([A-Z_]+)/.exec(text);
    if (!m) throw e;
    return { code: m[1] };
  }
}

/** Runs a call and asserts the contract agreed with the model about success or refusal. */
function expectOutcome(label: string, expected: string | null, fn: () => CircuitResult): CircuitResult | undefined {
  const kind = `${label.split('(')[0]}:${expected ?? 'OK'}`;
  seen.set(kind, (seen.get(kind) ?? 0) + 1);
  const { code, res } = refusalOf(fn);
  expect(code ?? null, `${label}: expected ${expected ?? 'success'}`).toBe(expected);
  return res;
}

/** The registry's public state must match the model after every single command. */
function checkLedger(m: Model, s: Real): void {
  const L = s.r.ledger();
  m.invoices.forEach((inv, i) => {
    const n = s.nullifiers[i]!;
    const expected = LEDGER_STATUS[inv.status];
    if (expected === null) {
      expect(L.pledges.member(n)).toBe(false);
      return;
    }
    const p = L.pledges.lookup(n);
    expect(p.status).toBe(expected);
    expect(p.claimed).toBe(inv.claimed);
    expect(p.amount).toBe(inv.status === 'SETTLED' ? inv.amount : 0n);
    if (inv.holder) expect(p.holderTag).toBe(tagOf(s, inv.holder, i));
    if (inv.payee) expect(p.payeeTag).toBe(payeeTagOf(s, inv.payee, i));

    // Invariant 1: at most one live encumbrance per invoice — the map holds a single entry per
    // nullifier, and at most one of the two financiers can hold it.
    const live = p.status === PledgeStatus.PLEDGED || (p.status === PledgeStatus.OFFERED && m.time < p.expiry);
    const holders = FINANCIERS.filter((f) => p.holderTag === tagOf(s, f, i));
    expect(holders.length).toBeLessThanOrEqual(1);
    if (live) expect(holders).toHaveLength(1);

    // Invariant 2: SETTLED is terminal.
    if (inv.everSettled) expect(p.status).toBe(PledgeStatus.SETTLED);

    // Invariant 3: proceeds leave the registry at most once, and only after settlement.
    expect(inv.paidOut).toBeLessThanOrEqual(inv.amount);
    if (inv.paidOut > 0n) expect(p.status).toBe(PledgeStatus.SETTLED);
  });
}

/**
 * Commands carry a random invoice index and a `focus` flag. When focused, the index is remapped
 * onto an invoice that is actually in the state this command cares about — otherwise a random
 * 24-command sequence almost never reaches a pledged or settled invoice. Unfocused commands keep
 * the raw index, so refusals stay just as well covered. The remapping only reads the model, so
 * replay and shrinking stay deterministic.
 */
abstract class RegistryCommand implements Command<Model, Real> {
  constructor(
    readonly raw: number,
    readonly focus: boolean,
  ) {}
  check(): boolean {
    return true;
  }
  /** Invoice states this command is interested in. */
  protected abstract wants(inv: InvoiceModel): boolean;
  protected target(m: Model): number {
    if (!this.focus) return this.raw;
    const candidates = m.invoices.flatMap((inv, k) => (this.wants(inv) ? [k] : []));
    return candidates.length === 0 ? this.raw : candidates[this.raw % candidates.length]!;
  }
  protected label(): string {
    return `${this.raw}${this.focus ? '*' : ''}`;
  }
  abstract run(m: Model, s: Real): void;
  abstract toString(): string;
}

class Acknowledge extends RegistryCommand {
  protected wants(inv: InvoiceModel): boolean {
    return !inv.acked;
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const expected = inv.acked ? 'ALREADY_ACKNOWLEDGED' : null;
    expectOutcome(this.toString(), expected, () => s.r.debtor.acknowledge(s.invoices[i]!));
    if (!expected) inv.acked = true;
    checkLedger(m, s);
  }
  toString(): string {
    return `Acknowledge(${this.label()})`;
  }
}

class Offer extends RegistryCommand {
  constructor(
    raw: number,
    focus: boolean,
    readonly f: 'A' | 'B',
    readonly days: bigint,
  ) {
    super(raw, focus);
  }
  protected wants(inv: InvoiceModel): boolean {
    return inv.acked && inv.status !== 'SETTLED';
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const expiry = m.time + this.days * DAY;
    const encumbered = inv.status === 'PLEDGED' || (inv.status === 'OFFERED' && m.time < inv.expiry);
    const expected = !inv.acked
      ? 'NOT_ACKNOWLEDGED'
      : expiry > m.start + DUE_IN
        ? 'INVOICE_OVERDUE'
        : inv.status === 'SETTLED'
          ? 'ALREADY_SETTLED'
          : encumbered
            ? 'ALREADY_ENCUMBERED'
            : null;
    const financier = this.f === 'A' ? s.r.financierA : s.r.financierB;
    expectOutcome(this.toString(), expected, () =>
      s.r.seller.offer(s.invoices[i]!, financier.holderTag(s.nullifiers[i]!), expiry),
    );
    if (!expected) {
      inv.status = 'OFFERED';
      inv.holder = this.f;
      inv.expiry = expiry;
    }
    checkLedger(m, s);
  }
  toString(): string {
    return `Offer(${this.label()}, ${this.f}, +${this.days}d)`;
  }
}

class Accept extends RegistryCommand {
  constructor(
    raw: number,
    focus: boolean,
    readonly asAddressee: boolean,
  ) {
    super(raw, focus);
  }
  protected wants(inv: InvoiceModel): boolean {
    return inv.status === 'OFFERED';
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const f = this.asAddressee ? (inv.holder ?? 'A') : other(inv.holder ?? 'A');
    const expected =
      inv.status !== 'OFFERED'
        ? 'NO_SUCH_OFFER'
        : inv.holder !== f
          ? 'NOT_ADDRESSEE'
          : m.time >= inv.expiry
            ? 'OFFER_EXPIRED'
            : null;
    const financier = f === 'A' ? s.r.financierA : s.r.financierB;
    expectOutcome(this.toString(), expected, () => financier.accept(s.nullifiers[i]!));
    if (!expected) inv.status = 'PLEDGED';
    checkLedger(m, s);
  }
  toString(): string {
    return `Accept(${this.label()}, ${this.asAddressee ? 'addressee' : 'outsider'})`;
  }
}

class Release extends RegistryCommand {
  constructor(
    raw: number,
    focus: boolean,
    readonly asHolder: boolean,
  ) {
    super(raw, focus);
  }
  protected wants(inv: InvoiceModel): boolean {
    return inv.status === 'PLEDGED';
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const f = this.asHolder ? (inv.holder ?? 'A') : other(inv.holder ?? 'A');
    const expected = inv.status !== 'PLEDGED' ? 'NOT_PLEDGED' : inv.holder !== f ? 'NOT_HOLDER' : null;
    const financier = f === 'A' ? s.r.financierA : s.r.financierB;
    expectOutcome(this.toString(), expected, () => financier.release(s.nullifiers[i]!));
    if (!expected) inv.status = 'RELEASED';
    checkLedger(m, s);
  }
  toString(): string {
    return `Release(${this.label()}, ${this.asHolder ? 'holder' : 'outsider'})`;
  }
}

class Pay extends RegistryCommand {
  protected wants(inv: InvoiceModel): boolean {
    return inv.acked && inv.status !== 'SETTLED';
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const expected = !inv.acked ? 'NOT_ACKNOWLEDGED' : inv.status === 'SETTLED' ? 'ALREADY_SETTLED' : null;
    const res = expectOutcome(this.toString(), expected, () => s.r.debtor.pay(s.invoices[i]!));
    if (!expected) {
      expect(received(res!)).toBe(inv.amount);
      inv.payee = inv.status === 'PLEDGED' ? inv.holder! : 'seller';
      inv.status = 'SETTLED';
      inv.everSettled = true;
    }
    checkLedger(m, s);
  }
  toString(): string {
    return `Pay(${this.label()})`;
  }
}

class Claim extends RegistryCommand {
  constructor(
    raw: number,
    focus: boolean,
    readonly pick: Payee | 'payee',
  ) {
    super(raw, focus);
  }
  protected wants(inv: InvoiceModel): boolean {
    return inv.status === 'SETTLED';
  }
  run(m: Model, s: Real): void {
    const i = this.target(m);
    const inv = m.invoices[i]!;
    const who: Payee = this.pick === 'payee' ? (inv.payee ?? 'seller') : this.pick;
    const expected =
      inv.status !== 'SETTLED'
        ? 'NOT_SETTLED'
        : inv.payee !== who
          ? 'NOT_PAYEE'
          : inv.claimed
            ? 'ALREADY_CLAIMED'
            : null;
    const to = ADDRESS[who];
    const n = s.nullifiers[i]!;
    const call = () =>
      who === 'seller' ? s.r.seller.claim(n, to) : (who === 'A' ? s.r.financierA : s.r.financierB).claim(n, to);
    const res = expectOutcome(this.toString(), expected, call);
    if (!expected) {
      expect(sent(res!)).toBe(inv.amount);
      expect(sentTo(res!, to)).toBe(inv.amount);
      inv.claimed = true;
      inv.paidOut += inv.amount;
    }
    checkLedger(m, s);
  }
  toString(): string {
    return `Claim(${this.label()}, ${this.pick})`;
  }
}

/**
 * The borrowing-base certificate is a pool offer: it locks every chosen invoice to one lender in
 * a single call, so the model has to predict the refusal of the *first* slot that fails.
 */
class Certify extends RegistryCommand {
  constructor(
    raw: number,
    focus: boolean,
    readonly mask: number,
    readonly f: 'A' | 'B',
    readonly days: bigint,
    readonly greedy: boolean,
  ) {
    super(raw, focus);
  }
  protected wants(inv: InvoiceModel): boolean {
    return inv.acked && inv.status !== 'SETTLED';
  }
  private free(inv: InvoiceModel, time: bigint): boolean {
    return !(inv.status === 'PLEDGED' || (inv.status === 'OFFERED' && time < inv.expiry));
  }
  run(m: Model, s: Real): void {
    const chosen = [0, 1, 2].filter((k) => (this.mask >> k) & 1);
    const slots = this.focus
      ? chosen.filter((k) => this.wants(m.invoices[k]!) && this.free(m.invoices[k]!, m.time))
      : chosen;
    const validUntil = m.time + this.days * DAY;
    const total = slots.reduce((sum, k) => sum + m.invoices[k]!.amount, 0n);
    const floor = this.greedy ? total + 1n : total;

    let expected: string | null = null;
    if (slots.length === 0) {
      expected = 'EMPTY_POOL';
    } else {
      for (const k of slots) {
        const inv = m.invoices[k]!;
        if (!inv.acked) {
          expected = 'NOT_ACKNOWLEDGED';
          break;
        }
        if (validUntil > m.start + DUE_IN) {
          expected = 'INVOICE_OVERDUE';
          break;
        }
      }
      if (!expected && this.greedy) expected = 'BELOW_FLOOR';
      if (!expected) {
        for (const k of slots) {
          const inv = m.invoices[k]!;
          if (inv.status === 'SETTLED') {
            expected = 'ALREADY_SETTLED';
            break;
          }
          if (!this.free(inv, m.time)) {
            expected = 'ALREADY_ENCUMBERED';
            break;
          }
        }
      }
    }

    const financier = this.f === 'A' ? s.r.financierA : s.r.financierB;
    const lenderNonce = new Uint8Array(32);
    lenderNonce[0] = m.certs & 0xff;
    m.certs += 1;
    expectOutcome(this.toString(), expected, () =>
      s.r.seller.certify(
        slots.map((k) => ({ invoice: s.invoices[k]!, holderTag: financier.holderTag(s.nullifiers[k]!) })),
        { lenderRef: new Uint8Array(32).fill(0x1d), lenderNonce, floor, validUntil },
      ),
    );
    if (!expected) {
      for (const k of slots) {
        const inv = m.invoices[k]!;
        inv.status = 'OFFERED';
        inv.holder = this.f;
        inv.expiry = validUntil;
      }
    }
    checkLedger(m, s);
  }
  toString(): string {
    return `Certify(${this.mask.toString(2)}${this.focus ? '*' : ''}, ${this.f}, +${this.days}d${this.greedy ? ', greedy' : ''})`;
  }
}

class AdvanceTime extends RegistryCommand {
  constructor(readonly days: bigint) {
    super(0, false);
  }
  protected wants(): boolean {
    return false;
  }
  run(m: Model, s: Real): void {
    m.time += this.days * DAY;
    s.r.setTime(m.time);
    checkLedger(m, s);
  }
  toString(): string {
    return `AdvanceTime(+${this.days}d)`;
  }
}

const index = fc.integer({ min: 0, max: 2 });
const focus = fc.boolean();
const financier = fc.constantFrom('A' as const, 'B' as const);
const days = fc.bigInt({ min: 1n, max: 60n });
/** Mostly sane offer horizons, sometimes one that outlives the invoice. */
const offerDays = fc.oneof(
  { arbitrary: days, weight: 4 },
  { arbitrary: fc.bigInt({ min: 2_001n, max: 4_000n }), weight: 1 },
);

const commands = [
  fc.tuple(index, focus).map(([i, k]) => new Acknowledge(i, k)),
  fc.tuple(index, focus, financier, offerDays).map(([i, k, f, d]) => new Offer(i, k, f, d)),
  fc.tuple(index, focus, fc.boolean()).map(([i, k, b]) => new Accept(i, k, b)),
  fc.tuple(index, focus, fc.boolean()).map(([i, k, b]) => new Release(i, k, b)),
  fc.tuple(index, focus).map(([i, k]) => new Pay(i, k)),
  fc
    .tuple(index, focus, fc.constantFrom('payee' as const, 'A' as const, 'B' as const, 'seller' as const))
    .map(([i, k, w]) => new Claim(i, k, w)),
  fc
    .tuple(index, focus, fc.integer({ min: 0, max: 7 }), financier, offerDays, fc.boolean())
    .map(([i, k, mask, f, d, greedy]) => new Certify(i, k, mask, f, d, greedy)),
  days.map((d) => new AdvanceTime(d)),
];

/** Every outcome the model can predict must actually occur, or the suite proves nothing. */
const REQUIRED_COVERAGE = [
  'Acknowledge:OK',
  'Acknowledge:ALREADY_ACKNOWLEDGED',
  'Offer:OK',
  'Offer:NOT_ACKNOWLEDGED',
  'Offer:ALREADY_ENCUMBERED',
  'Offer:ALREADY_SETTLED',
  'Offer:INVOICE_OVERDUE',
  'Accept:OK',
  'Accept:NO_SUCH_OFFER',
  'Accept:NOT_ADDRESSEE',
  'Accept:OFFER_EXPIRED',
  'Release:OK',
  'Release:NOT_PLEDGED',
  'Release:NOT_HOLDER',
  'Pay:OK',
  'Pay:ALREADY_SETTLED',
  'Pay:NOT_ACKNOWLEDGED',
  'Claim:OK',
  'Claim:NOT_SETTLED',
  'Claim:NOT_PAYEE',
  'Claim:ALREADY_CLAIMED',
  'Certify:OK',
  'Certify:EMPTY_POOL',
  'Certify:BELOW_FLOOR',
  'Certify:NOT_ACKNOWLEDGED',
  'Certify:INVOICE_OVERDUE',
  'Certify:ALREADY_ENCUMBERED',
  'Certify:ALREADY_SETTLED',
];

it('random lifecycles agree with the reference model and keep the registry invariants', { timeout: 600_000 }, () => {
  fc.assert(
    fc.property(fc.commands(commands, { maxCommands: 32, size: 'max' }), (cmds) => {
      fc.modelRun(() => {
        const r = setupRegistry();
        const invoices = [1n, 2n, 3n].map((no, k) =>
          r.seller.issueInvoice({
            debtor: r.debtor,
            invoiceNo: no,
            amount: 100_000n * BigInt(k + 1),
            dueDate: r.now + DUE_IN,
          }),
        );
        const model: Model = {
          time: r.now,
          start: r.now,
          certs: 0,
          invoices: invoices.map((inv) => ({
            acked: false,
            status: 'NONE',
            holder: null,
            expiry: 0n,
            payee: null,
            amount: inv.amount,
            claimed: false,
            everSettled: false,
            paidOut: 0n,
          })),
        };
        return { model, real: { r, invoices, nullifiers: invoices.map((inv) => pure.nullifierOf(inv)) } };
      }, cmds);
    }),
    // Fixed seed: the coverage assertions below have to hold on every run, not on most runs.
    { numRuns: 200, seed: 0x5f0117, endOnFailure: true },
  );

  for (const outcome of REQUIRED_COVERAGE) {
    expect(seen.get(outcome) ?? 0, `command outcome never exercised: ${outcome}`).toBeGreaterThan(0);
  }
});
