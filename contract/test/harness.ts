// SPDX-License-Identifier: Apache-2.0
//
// In-process simulator harness: deploys the compiled contract with compact-runtime,
// swaps private state per persona, controls block time and exposes ledger reads.
import * as RT from '@midnight-ntwrk/compact-runtime';
import { expect } from 'vitest';
import {
  Contract,
  ledger,
  pureCircuits,
  witnesses,
  type CallInputs,
  type Invoice,
  type Ledger,
  type StockAndFoilPrivateState,
} from '../src/index.js';
import {
  FIELD_MODULUS,
  randomBytes32,
  randomField,
  randomScalar,
  splitSecret,
  type Share,
} from '../../sdk/src/crypto/scalar.js';

export const DAY = 86_400n;
/** 2026-09-21T00:00:00Z — default block time for tests. */
export const T0 = 1_790_035_200n;
const COIN_PK = '0'.repeat(64);

export type Point = { x: bigint; y: bigint };
export type Bytes = Uint8Array;
export type CircuitResult = RT.CircuitResults<StockAndFoilPrivateState, unknown>;

export const pure = pureCircuits;
export const modP = (x: bigint): bigint => ((x % FIELD_MODULUS) + FIELD_MODULUS) % FIELD_MODULUS;
export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** Unshielded token color used by tests: the native token (all-zero raw type). */
export const NATIVE_COLOR = new Uint8Array(32);

export function refusalOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    const text = `${(e as Error)?.message ?? e} ${(e as { cause?: Error })?.cause?.message ?? ''}`;
    const m = /failed assert: ([A-Z_]+)/.exec(text);
    if (m) return m[1];
    throw e;
  }
  return undefined;
}

/** Asserts that `fn` is refused by a circuit assert carrying exactly `code`. */
export function expectRefusal(fn: () => unknown, code: string): void {
  expect(refusalOf(fn)).toBe(code);
}

export interface DeployParams {
  operatorSk: Bytes;
  disclosurePk: Point;
  keyholderPks: [Point, Point, Point];
  auditorPk: Point;
  settlementColor: Bytes;
  now?: bigint;
}

export class Harness {
  readonly contract = new Contract(witnesses);
  readonly address = RT.dummyContractAddress();
  state: RT.ChargedState | RT.ContractState;
  now: bigint;
  last?: CircuitResult;

  private constructor(state: RT.ContractState, now: bigint) {
    this.state = state;
    this.now = now;
  }

  static deploy(p: DeployParams): Harness {
    const contract = new Contract(witnesses);
    const ps: StockAndFoilPrivateState = { role: 'operator', secretKey: p.operatorSk };
    const init = contract.initialState(
      RT.createConstructorContext(ps, COIN_PK),
      pure.operatorIdOf(p.operatorSk),
      p.disclosurePk,
      p.keyholderPks,
      p.auditorPk,
      p.settlementColor,
    );
    return new Harness(init.currentContractState, p.now ?? T0);
  }

  setTime(unixSeconds: bigint): void {
    this.now = unixSeconds;
  }

  advance(seconds: bigint): void {
    this.now += seconds;
  }

  /** Runs an impure circuit as `persona`; state advances only when the circuit succeeds. */
  call(persona: StockAndFoilPrivateState, circuit: string, args: unknown[], inputs?: CallInputs): CircuitResult {
    const ps: StockAndFoilPrivateState = { ...persona, call: inputs };
    const ctx = RT.createCircuitContext(this.address, COIN_PK, this.state, ps, undefined, undefined, Number(this.now));
    const fn = (this.contract.impureCircuits as Record<string, (...a: unknown[]) => CircuitResult>)[circuit];
    if (!fn) throw new Error(`circuit ${circuit} is not exported by the contract`);
    const res = fn(ctx, ...args);
    this.state = res.context.currentQueryContext.state;
    this.last = res;
    return res;
  }

  as(persona: StockAndFoilPrivateState) {
    return { call: (circuit: string, args: unknown[], inputs?: CallInputs) => this.call(persona, circuit, args, inputs) };
  }

  ledgerState(): Ledger {
    const s = this.state;
    return ledger(s instanceof RT.ContractState ? s.data : s);
  }

  pathFor(tree: 'acks' | 'debtors' | 'financiers', leaf: Bytes) {
    return this.ledgerState()[tree].findPathForLeaf(leaf);
  }
}

// ---------------------------------------------------------------------------------------------
// Personas

export abstract class Persona {
  constructor(
    readonly r: Registry,
    readonly ps: StockAndFoilPrivateState,
  ) {}
  get sk(): Bytes {
    return this.ps.secretKey;
  }
  protected call(circuit: string, args: unknown[], inputs?: CallInputs): CircuitResult {
    return this.r.h.call(this.ps, circuit, args, inputs);
  }
}

export class Operator extends Persona {
  admitDebtor(leaf: Bytes) {
    return this.call('admitDebtor', [leaf]);
  }
  admitFinancier(leaf: Bytes) {
    return this.call('admitFinancier', [leaf]);
  }
}

export class Debtor extends Persona {
  get leaf(): Bytes {
    return pure.debtorLeaf(this.sk);
  }
  get id(): bigint {
    return pure.debtorIdOf(this.sk);
  }
  acknowledge(invoice: Invoice, inputs: CallInputs = {}) {
    return this.call('acknowledge', [], { invoice, ...inputs });
  }
  pay(invoice: Invoice, inputs: CallInputs = {}) {
    return this.call('payInvoice', [], { invoice, ...inputs });
  }
}

export class Seller extends Persona {
  get id(): bigint {
    return pure.sellerIdOf(this.sk);
  }
  issueInvoice(o: { debtor: Debtor; invoiceNo: bigint; amount: bigint; dueDate: bigint; salt?: bigint }): Invoice {
    return {
      debtorId: o.debtor.id,
      sellerId: this.id,
      invoiceNo: o.invoiceNo,
      amount: o.amount,
      dueDate: o.dueDate,
      salt: o.salt ?? randomField(),
    };
  }
  offer(invoice: Invoice, holderTag: bigint, expiry: bigint, inputs: CallInputs = {}) {
    return this.call('offer', [holderTag, expiry], { invoice, ephemeral: randomScalar(), ...inputs });
  }
  claim(n: Bytes, to: { bytes: Bytes }) {
    return this.call('claimAsSeller', [n, to]);
  }
  certify(
    slots: Array<{ invoice: Invoice; holderTag: bigint }>,
    o: { lenderRef: Bytes; lenderNonce: Bytes; floor: bigint; validUntil: bigint },
    inputs: CallInputs = {},
  ) {
    const pad4 = <T>(xs: T[], fill: T) => [0, 1, 2, 3].map((i) => xs[i] ?? fill) as [T, T, T, T];
    const zero: Invoice = { debtorId: 0n, sellerId: 0n, invoiceNo: 0n, amount: 0n, dueDate: 0n, salt: 0n };
    return this.call('certifyBorrowingBase', [o.lenderRef, o.lenderNonce, o.floor, o.validUntil], {
      invoices: pad4(slots.map((s) => s.invoice), zero),
      used: pad4(slots.map(() => true), false),
      holderTags: pad4(slots.map((s) => s.holderTag), 0n),
      ephemerals: [randomScalar(), randomScalar(), randomScalar(), randomScalar()],
      ...inputs,
    });
  }
}

export class Financier extends Persona {
  get leaf(): Bytes {
    return pure.financierLeaf(this.sk);
  }
  holderTag(n: Bytes): bigint {
    return pure.holderTagOf(this.sk, n);
  }
  accept(n: Bytes) {
    return this.call('accept', [n]);
  }
  release(n: Bytes) {
    return this.call('release', [n]);
  }
  claim(n: Bytes, to: { bytes: Bytes }) {
    return this.call('claimAsHolder', [n, to]);
  }
}

export class Auditor extends Persona {
  request(recordId: Bytes, caseRef: Bytes) {
    return this.call('requestDisclosure', [recordId, caseRef]);
  }
}

export class Keyholder extends Persona {
  constructor(
    r: Registry,
    ps: StockAndFoilPrivateState,
    readonly index: 0 | 1 | 2,
    readonly share: Share,
  ) {
    super(r, ps);
  }
  approve(requestId: Bytes, inputs: CallInputs = {}) {
    return this.call('approveDisclosure', [requestId, BigInt(this.index)], { ephemeral: randomScalar(), ...inputs });
  }
}

// ---------------------------------------------------------------------------------------------
// Registry fixture

export interface Registry {
  h: Harness;
  pure: typeof pureCircuits;
  disclosureSk: bigint;
  auditorSk: bigint;
  operator: Operator;
  debtor: Debtor;
  debtor2: Debtor;
  seller: Seller;
  seller2: Seller;
  financierA: Financier;
  financierB: Financier;
  auditor: Auditor;
  keyholders: [Keyholder, Keyholder, Keyholder];
  ledger(): Ledger;
  readonly now: bigint;
  advance(seconds: bigint): void;
  setTime(unixSeconds: bigint): void;
}

/** Deploys a fresh registry with generated keys; nobody is admitted yet. */
export function deployRegistry(o: { now?: bigint; settlementColor?: Bytes } = {}): Registry {
  const operatorSk = randomBytes32();
  const disclosureSk = randomScalar();
  const shares = splitSecret(disclosureSk, 2, 3);
  const auditorSk = randomScalar();
  const h = Harness.deploy({
    operatorSk,
    disclosurePk: pure.pubKeyOf(disclosureSk),
    keyholderPks: [pure.pubKeyOf(shares[0]!.value), pure.pubKeyOf(shares[1]!.value), pure.pubKeyOf(shares[2]!.value)],
    auditorPk: pure.pubKeyOf(auditorSk),
    settlementColor: o.settlementColor ?? NATIVE_COLOR,
    now: o.now,
  });
  const r = { h, pure, disclosureSk, auditorSk } as Registry;
  r.operator = new Operator(r, { role: 'operator', secretKey: operatorSk });
  r.debtor = new Debtor(r, { role: 'debtor', secretKey: randomBytes32() });
  r.debtor2 = new Debtor(r, { role: 'debtor', secretKey: randomBytes32() });
  r.seller = new Seller(r, { role: 'seller', secretKey: randomBytes32() });
  r.seller2 = new Seller(r, { role: 'seller', secretKey: randomBytes32() });
  r.financierA = new Financier(r, { role: 'financier', secretKey: randomBytes32() });
  r.financierB = new Financier(r, { role: 'financier', secretKey: randomBytes32() });
  r.auditor = new Auditor(r, { role: 'auditor', secretKey: randomBytes32(), scalar: auditorSk });
  r.keyholders = [0, 1, 2].map(
    (i) => new Keyholder(r, { role: 'keyholder', secretKey: randomBytes32(), scalar: shares[i]!.value }, i as 0 | 1 | 2, shares[i]!),
  ) as [Keyholder, Keyholder, Keyholder];
  r.ledger = () => h.ledgerState();
  Object.defineProperty(r, 'now', { get: () => h.now });
  r.advance = (s) => h.advance(s);
  r.setTime = (t) => h.setTime(t);
  return r;
}

/** Deploys a registry and admits debtor, debtor2, financier A and financier B. */
export function setupRegistry(o: { now?: bigint; settlementColor?: Bytes } = {}): Registry {
  const r = deployRegistry(o);
  r.operator.admitDebtor(r.debtor.leaf);
  r.operator.admitDebtor(r.debtor2.leaf);
  r.operator.admitFinancier(r.financierA.leaf);
  r.operator.admitFinancier(r.financierB.leaf);
  return r;
}
