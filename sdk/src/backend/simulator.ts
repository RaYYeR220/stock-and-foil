// SPDX-License-Identifier: Apache-2.0
//
// The in-process backend. It runs the real compiled circuits through `compact-runtime` with no
// proving and no network, which makes it both the test harness and the browser Sandbox: nothing
// here touches `fs`, `process` or any other Node-only API.
//
// Two things the network can't give a demo are added on top of `RegistryBackend`: block time is
// set by the caller rather than by a chain, and the whole world can be snapshotted and restored
// so a guided replay can be rewound.
import * as RT from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger,
  witnesses,
  type CallInputs,
  type Ledger,
  type StockAndFoilPrivateState,
} from '@stockandfoil/contract';
import { hex, NATIVE_TOKEN_COLOR } from '../bytes.js';
import type { RegistryConstructorArgs } from '../crypto/keys.js';
import { rethrowAsRefusal } from '../errors.js';
import type {
  MerklePath,
  NetworkName,
  PublicLedgerView,
  RegistryBackend,
  TxReceipt,
} from '../types.js';
import { toPublicLedgerView } from './view.js';

/** The simulator has no wallet, so every call runs under the same placeholder coin key. */
const COIN_PUBLIC_KEY = '0'.repeat(64);

type CircuitResult = RT.CircuitResults<StockAndFoilPrivateState, unknown>;
type ContractState = RT.ChargedState | RT.ContractState;

/** A complete world: the contract state and the clock the circuits read. */
export interface SimulatorSnapshot {
  readonly state: ContractState;
  readonly now: bigint;
}

export interface SimulatorDeployOptions {
  /** Sealed constructor arguments, as `generateRegistryKeys()` produces them. */
  constructorArgs: RegistryConstructorArgs;
  /** Private state the constructor runs under; only the operator's secret is used. */
  operator: StockAndFoilPrivateState;
  /** Initial block time in unix seconds. Defaults to the host clock. */
  now?: bigint;
}

type EffectKey = { raw: string } | [{ raw: string }, { address: string } | undefined];

function effectTotal(result: CircuitResult, kind: string, color: Uint8Array): bigint {
  const effects = (result.context.currentQueryContext as unknown as { effects?: Record<string, Map<EffectKey, bigint>> })
    .effects;
  const want = hex(color);
  let total = 0n;
  for (const [key, value] of effects?.[kind] ?? new Map<EffectKey, bigint>()) {
    const token = Array.isArray(key) ? key[0] : key;
    if (token.raw === want) total += value;
  }
  return total;
}

/**
 * In-process registry. `SimulatorBackend.deploy` runs the contract constructor; every later call
 * evolves the state in memory, and a refused call leaves the state untouched because the assert
 * throws before the new state is adopted.
 */
export class SimulatorBackend implements RegistryBackend {
  readonly network: NetworkName = 'simulator';
  readonly contractAddress: string;
  readonly settlementColor: Uint8Array;
  /** The world as it was immediately after deployment; `reset()` returns to it. */
  readonly genesis: SimulatorSnapshot;

  private readonly contract = new Contract(witnesses);
  private state: ContractState;
  private clock: bigint;
  private lastResult?: CircuitResult;

  private constructor(state: ContractState, now: bigint, settlementColor: Uint8Array, address: string) {
    this.state = state;
    this.clock = now;
    this.settlementColor = settlementColor;
    this.contractAddress = address;
    this.genesis = { state, now };
  }

  static deploy(options: SimulatorDeployOptions): SimulatorBackend {
    const args = options.constructorArgs;
    const contract = new Contract(witnesses);
    const initial = contract.initialState(
      RT.createConstructorContext(options.operator, COIN_PUBLIC_KEY),
      args.operatorId,
      args.disclosurePk,
      args.keyholderPks,
      args.auditorPk,
      args.settlementColor,
    );
    return new SimulatorBackend(
      initial.currentContractState,
      options.now ?? BigInt(Math.floor(Date.now() / 1000)),
      args.settlementColor ?? NATIVE_TOKEN_COLOR,
      RT.dummyContractAddress(),
    );
  }

  // ------------------------------------------------------------------------------- RegistryBackend

  async call(
    persona: StockAndFoilPrivateState,
    circuit: string,
    args: unknown[],
    inputs?: CallInputs,
  ): Promise<TxReceipt> {
    const started = Date.now();
    const circuits = this.contract.impureCircuits as unknown as Record<
      string,
      ((context: RT.CircuitContext<StockAndFoilPrivateState>, ...rest: unknown[]) => CircuitResult) | undefined
    >;
    const fn = circuits[circuit];
    if (!fn) throw new Error(`circuit ${circuit} is not exported by the contract`);

    const context = RT.createCircuitContext<StockAndFoilPrivateState>(
      this.contractAddress,
      COIN_PUBLIC_KEY,
      this.state,
      { ...persona, call: inputs },
      undefined,
      undefined,
      Number(this.clock),
    );
    let result: CircuitResult;
    try {
      result = fn(context, ...args);
    } catch (error) {
      // The state is only adopted on success, so a refused call changes nothing.
      rethrowAsRefusal(error, circuit);
    }
    this.state = result.context.currentQueryContext.state;
    this.lastResult = result;
    return {
      circuit,
      network: this.network,
      durationMs: Date.now() - started,
      unshielded: {
        received: effectTotal(result, 'unshieldedInputs', this.settlementColor),
        sent: effectTotal(result, 'unshieldedOutputs', this.settlementColor),
      },
    };
  }

  async publicState(): Promise<PublicLedgerView> {
    return toPublicLedgerView(this.ledgerState());
  }

  async pathForAck(leaf: Uint8Array): Promise<MerklePath | undefined> {
    return this.ledgerState().acks.findPathForLeaf(leaf);
  }

  async pathForMember(tree: 'debtors' | 'financiers', leaf: Uint8Array): Promise<MerklePath | undefined> {
    return this.ledgerState()[tree].findPathForLeaf(leaf);
  }

  async now(): Promise<bigint> {
    return this.clock;
  }

  // --------------------------------------------------------------------------- Simulator extras

  /** Block time the next call will see, without awaiting. */
  currentTime(): bigint {
    return this.clock;
  }

  /** Moves block time to an absolute unix second. Time may move backwards: this is a sandbox. */
  advanceTo(unixSeconds: bigint): void {
    this.clock = unixSeconds;
  }

  /** Moves block time forward by a number of seconds. */
  advanceBy(seconds: bigint): void {
    this.clock += seconds;
  }

  snapshot(): SimulatorSnapshot {
    return { state: this.state, now: this.clock };
  }

  restore(snapshot: SimulatorSnapshot): void {
    this.state = snapshot.state;
    this.clock = snapshot.now;
    this.lastResult = undefined;
  }

  /** Back to the world as deployed: no participants, no acknowledgments, original clock. */
  reset(): void {
    this.restore(this.genesis);
  }

  /** The projected ledger, for explorers and tests that want the raw ADTs. */
  ledgerState(): Ledger {
    return ledger(this.state instanceof RT.ContractState ? this.state.data : this.state);
  }

  /** Raw result of the most recent successful call, for tests inspecting circuit effects. */
  lastCall(): CircuitResult | undefined {
    return this.lastResult;
  }
}
