// SPDX-License-Identifier: Apache-2.0
//
// The network backend: the same `RegistryBackend` surface, running against a deployed contract
// through midnight-js 4.1.1. Role clients cannot tell it apart from the simulator.
//
// Two things are worth knowing. Each persona gets its own private-state id, so the witnesses of
// a call see only that persona's secret — a financier's process never holds the seller's key.
// And a refusal is raised while the circuit runs locally, before proving and before submission:
// the fraudulent transaction is never built, let alone paid for.
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
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
}

export interface NetworkConnectOptions extends NetworkBackendOptionsBase {
  contractAddress: string;
}

type CompiledStockAndFoil = ReturnType<typeof compileStockAndFoil>;

function compileStockAndFoil(compiledAssetsPath: string) {
  const base = CompiledContract.make('StockAndFoil', Contract as never);
  return base.pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(compiledAssetsPath as never),
  );
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

  /** Deploys a fresh registry and returns a backend bound to it. */
  static async deploy(options: NetworkDeployOptions): Promise<NetworkBackend> {
    const args = options.constructorArgs;
    const privateStateId = (options.privateStateId ?? defaultPrivateStateId)(options.operator);
    const deployed = await deployContract(options.providers as never, {
      compiledContract: compileStockAndFoil(options.compiledAssetsPath) as never,
      privateStateId,
      initialPrivateState: options.operator,
      args: [args.operatorId, args.disclosurePk, args.keyholderPks, args.auditorPk, args.settlementColor],
    } as never);
    const data = (deployed as unknown as { deployTxData: { public: { contractAddress: string; txId?: string } } })
      .deployTxData.public;
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
