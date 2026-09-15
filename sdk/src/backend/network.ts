// SPDX-License-Identifier: Apache-2.0
//
// The network backend: the same `RegistryBackend` surface, running against a deployed contract
// through midnight-js 4.1.1. Role clients cannot tell it apart from the simulator.
//
// Two things are worth knowing. Each persona gets its own private-state id, so the witnesses of
// a call see only that persona's secret — a financier's process never holds the seller's key.
// And a refusal is raised while the circuit runs locally, before proving and before submission:
// the fraudulent transaction is never built, let alone paid for.
import {
  createCircuitMaintenanceTxInterfaces,
  deployContract,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as RT from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger,
  pureCircuits,
  witnesses,
  type CallInputs,
  type Ledger,
  type StockAndFoilPrivateState,
} from '@stockandfoil/contract';
import { hex } from '../bytes.js';
import type { RegistryConstructorArgs } from '../crypto/keys.js';
import { rethrowAsRefusal } from '../errors.js';
import type { MerklePath, NetworkName, PublicLedgerView, RegistryBackend, TxReceipt } from '../types.js';
import { NETWORKS, type ChainNetwork, type NetworkEndpoints, type RegistryProviders } from './providers.js';
import { toPublicLedgerView } from './view.js';

/** A contract instance bound to one persona's private state. */
interface PersonaContract {
  callTx: Record<string, ((...args: unknown[]) => Promise<{ public: { txId: string; blockHeight: number } }>) | undefined>;
}

/**
 * Private-state id of a persona. The secret itself never becomes part of the key: the id is a
 * domain-separated SHA-256 of it, using `operatorIdOf` purely as a key-derivation function.
 */
export const defaultPrivateStateId = (persona: StockAndFoilPrivateState): string =>
  `${persona.role}-${hex(pureCircuits.operatorIdOf(persona.secretKey)).slice(0, 16)}`;

export interface NetworkBackendOptionsBase {
  network: ChainNetwork;
  providers: RegistryProviders;
  /**
   * Directory (Node) or base path (browser) holding the compiled `keys/` and `zkir/` of this
   * contract; must match what the ZK config provider was built with.
   */
  compiledAssetsPath: string;
  endpoints?: Partial<NetworkEndpoints>;
  /** Override how a persona maps to a private-state id. */
  privateStateId?: (persona: StockAndFoilPrivateState) => string;
}

export interface NetworkDeployOptions extends NetworkBackendOptionsBase {
  constructorArgs: RegistryConstructorArgs;
  /** Private state the deploy transaction runs under. */
  operator: StockAndFoilPrivateState;
  /**
   * How many verifier keys one transaction may carry. See `VERIFIER_KEYS_PER_TX`: a Midnight
   * block caps how many bytes a transaction may write, and all twelve keys of this contract do
   * not fit in one deploy. Lower it if a deploy is refused as exhausting the block limits.
   */
  verifierKeysPerTx?: number;
  /** Called once per transaction while a staged deployment runs, for CLI progress output. */
  onProgress?: (step: { stage: 'deploy' | 'verifier-key'; circuit?: string; index: number; total: number }) => void;
}

export interface NetworkConnectOptions extends NetworkBackendOptionsBase {
  contractAddress: string;
}

type CompiledStockAndFoil = ReturnType<typeof compileStockAndFoil>;

interface InitialState {
  currentContractState: RT.ContractState;
}

/** Structural view of the compiled contract class, enough to subset it. */
interface ContractShape {
  provableCircuits: Record<string, unknown>;
  initialState(...args: unknown[]): InitialState;
}

type AnyContract = new (w: unknown) => ContractShape;

/** Circuit ids in the order the contract declares them. */
export const CIRCUIT_IDS: readonly string[] = Object.keys(
  new (Contract as unknown as AnyContract)(witnesses).provableCircuits,
);

/**
 * How many of this contract's verifier keys fit in one transaction.
 *
 * A Midnight block limits the bytes a transaction may write (50,000 on the networks we target,
 * and a single transaction may claim only part of that). The twelve verifier keys of Stock &
 * Foil total about 26 kB, and a deploy carrying all of them is refused by the node with
 * "Transaction would exhaust the block limits". Six keys deploy comfortably; the rest are added
 * afterwards with maintenance transactions, which the deployer can do because it is the
 * contract's maintenance authority.
 */
export const VERIFIER_KEYS_PER_TX = 6;

function compileStockAndFoil(compiledAssetsPath: string, circuits: readonly string[] = CIRCUIT_IDS) {
  const ctor = circuits.length === CIRCUIT_IDS.length ? Contract : subsetContract(circuits);
  return CompiledContract.make('StockAndFoil', ctor as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(compiledAssetsPath as never),
  );
}

/**
 * A contract that publishes only some of its circuits at deploy time: `provableCircuits` decides
 * which verifier keys the deploy transaction carries, and the initial contract state is rebuilt
 * with only those entry points, because an entry point with no verifier key is not a valid
 * deployment. The remaining circuits are added afterwards with `VerifierKeyInsert` maintenance
 * transactions, which create their entry points.
 */
function subsetContract(circuits: readonly string[]): AnyContract {
  const keep = new Set(circuits);
  const Base = Contract as unknown as AnyContract;
  return class SubsetContract extends Base {
    constructor(w: unknown) {
      super(w);
      this.provableCircuits = Object.fromEntries(
        Object.entries(this.provableCircuits).filter(([id]) => keep.has(id)),
      );
    }

    override initialState(...args: unknown[]): InitialState {
      const result = super.initialState(...args);
      const full = result.currentContractState;
      const trimmed = new RT.ContractState();
      trimmed.data = full.data;
      for (const id of circuits) {
        const operation = full.operation(id);
        if (operation) trimmed.setOperation(id, operation);
      }
      return { ...result, currentContractState: trimmed };
    }
  } as unknown as AnyContract;
}

export class NetworkBackend implements RegistryBackend {
  readonly network: NetworkName;
  readonly contractAddress: string;
  /** Transaction that created the contract, when this instance deployed it. */
  readonly deployTxId?: string;

  private readonly providers: RegistryProviders;
  private readonly compiled: CompiledStockAndFoil;
  private readonly endpoints: NetworkEndpoints;
  private readonly privateStateIdOf: (persona: StockAndFoilPrivateState) => string;
  private readonly bound = new Map<string, Promise<PersonaContract>>();

  private constructor(options: NetworkBackendOptionsBase & { contractAddress: string; deployTxId?: string }) {
    this.network = options.network;
    this.contractAddress = options.contractAddress;
    this.deployTxId = options.deployTxId;
    this.providers = options.providers;
    this.compiled = compileStockAndFoil(options.compiledAssetsPath);
    this.endpoints = { ...NETWORKS[options.network], ...options.endpoints };
    this.privateStateIdOf = options.privateStateId ?? defaultPrivateStateId;
    this.providers.privateStateProvider.setContractAddress(options.contractAddress);
  }

  /**
   * Deploys a fresh registry and returns a backend bound to it.
   *
   * The deployment is staged: the first transaction carries the constructor and as many verifier
   * keys as a block will accept, and one maintenance transaction per remaining circuit adds the
   * rest. By the time this resolves the contract carries all twelve keys, so an ordinary
   * `findDeployedContract` verifies against it.
   */
  static async deploy(options: NetworkDeployOptions): Promise<NetworkBackend> {
    const args = options.constructorArgs;
    const perTx = options.verifierKeysPerTx ?? VERIFIER_KEYS_PER_TX;
    const first = CIRCUIT_IDS.slice(0, Math.max(1, perTx));
    const rest = CIRCUIT_IDS.slice(first.length);
    const progress = options.onProgress ?? (() => {});
    const total = 1 + rest.length;

    const privateStateId = (options.privateStateId ?? defaultPrivateStateId)(options.operator);
    progress({ stage: 'deploy', index: 1, total });
    const deployed = await deployContract(options.providers as never, {
      compiledContract: compileStockAndFoil(options.compiledAssetsPath, first) as never,
      privateStateId,
      initialPrivateState: options.operator,
      args: [args.operatorId, args.disclosurePk, args.keyholderPks, args.auditorPk, args.settlementColor],
    } as never);
    const data = (deployed as unknown as { deployTxData: { public: { contractAddress: string; txId?: string } } })
      .deployTxData.public;

    if (rest.length > 0) {
      const maintenance = createCircuitMaintenanceTxInterfaces(
        options.providers as never,
        compileStockAndFoil(options.compiledAssetsPath) as never,
        data.contractAddress,
      ) as unknown as Record<string, { insertVerifierKey(key: Uint8Array): Promise<unknown> }>;
      for (const [i, circuit] of rest.entries()) {
        progress({ stage: 'verifier-key', circuit, index: i + 2, total });
        const key = await options.providers.zkConfigProvider.getVerifierKey(circuit);
        await maintenance[circuit]!.insertVerifierKey(key);
      }
    }

    return new NetworkBackend({ ...options, contractAddress: data.contractAddress, deployTxId: data.txId });
  }

  /** Connects to a registry someone already deployed. */
  static async connect(options: NetworkConnectOptions): Promise<NetworkBackend> {
    return new NetworkBackend(options);
  }

  // ------------------------------------------------------------------------------- RegistryBackend

  async call(
    persona: StockAndFoilPrivateState,
    circuit: string,
    args: unknown[],
    inputs?: CallInputs,
  ): Promise<TxReceipt> {
    const started = Date.now();
    const privateStateId = this.privateStateIdOf(persona);
    const contract = await this.contractFor(privateStateId, persona);
    const fn = contract.callTx[circuit];
    if (!fn) throw new Error(`circuit ${circuit} is not exported by the contract`);

    // The witnesses read the private state through the provider, so the per-call inputs are
    // written immediately before the circuit runs.
    await this.providers.privateStateProvider.set(privateStateId, { ...persona, call: inputs });
    try {
      const result = await fn(...args);
      return {
        circuit,
        network: this.network,
        durationMs: Date.now() - started,
        txId: result.public.txId,
        blockHeight: result.public.blockHeight,
      };
    } catch (error) {
      rethrowAsRefusal(error, circuit);
    }
  }

  async publicState(): Promise<PublicLedgerView> {
    return toPublicLedgerView(await this.ledgerState());
  }

  async pathForAck(leaf: Uint8Array): Promise<MerklePath | undefined> {
    return (await this.ledgerState()).acks.findPathForLeaf(leaf);
  }

  async pathForMember(tree: 'debtors' | 'financiers', leaf: Uint8Array): Promise<MerklePath | undefined> {
    return (await this.ledgerState())[tree].findPathForLeaf(leaf);
  }

  /** Block time the chain is at, in unix seconds, read from the indexer's latest block. */
  async now(): Promise<bigint> {
    const response = await fetch(this.endpoints.indexerHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ block { timestamp } }' }),
    });
    if (!response.ok) throw new Error(`indexer returned ${response.status} for the latest block`);
    const body = (await response.json()) as { data?: { block?: { timestamp?: number } } };
    const timestamp = body.data?.block?.timestamp;
    if (timestamp === undefined) throw new Error('indexer returned no block timestamp');
    return BigInt(Math.floor(timestamp / 1000));
  }

  // ------------------------------------------------------------------------------- Network extras

  /** The projected ledger as the indexer serves it. */
  async ledgerState(): Promise<Ledger> {
    const state = await this.providers.publicDataProvider.queryContractState(this.contractAddress);
    if (!state) throw new Error(`no contract state at ${this.contractAddress}`);
    return ledger(state.data);
  }

  /** Forgets the cached per-persona contract handles, e.g. after rotating a persona's key. */
  clearPersonaCache(): void {
    this.bound.clear();
  }

  private contractFor(privateStateId: string, persona: StockAndFoilPrivateState): Promise<PersonaContract> {
    const existing = this.bound.get(privateStateId);
    if (existing) return existing;
    const found = findDeployedContract(this.providers as never, {
      compiledContract: this.compiled as never,
      contractAddress: this.contractAddress,
      privateStateId,
      initialPrivateState: persona,
    } as never).then((contract) => contract as unknown as PersonaContract);
    this.bound.set(privateStateId, found);
    return found;
  }
}
