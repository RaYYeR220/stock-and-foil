// SPDX-License-Identifier: Apache-2.0
//
// Provider wiring for the network backend. Everything in this file is browser-safe: no `fs`,
// no `process`, no `ws`. The two pieces that differ between a CLI and a browser — where ZK
// artifacts come from and where the private state is kept — are injected, and the Node-only
// implementations live in `./node.ts`, which a browser bundle never imports.
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  Binding,
  FinalizedTransaction,
  Proof,
  SignatureEnabled,
  TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  MidnightProviders,
  PrivateStateId,
  PrivateStateProvider,
  ProofProvider,
  PublicDataProvider,
  UnboundTransaction,
  WalletProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import type { StockAndFoilPrivateState } from '@stockandfoil/contract';
import { fromHex, hex, type UserAddress } from '../bytes.js';

/** Networks the SDK knows how to reach. `simulator` needs no providers at all. */
export type ChainNetwork = 'undeployed' | 'preview' | 'preprod';

export interface NetworkEndpoints {
  indexerHttpUrl: string;
  indexerWsUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
}

/**
 * Defaults per network. `undeployed` is a devnet running on this machine; the public ones point
 * at the Midnight-operated services. A caller can override any field.
 */
export const NETWORKS: Record<ChainNetwork, NetworkEndpoints> = {
  undeployed: {
    indexerHttpUrl: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWsUrl: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    nodeUrl: 'ws://127.0.0.1:9944',
    proofServerUrl: 'http://127.0.0.1:6300',
  },
  preview: {
    indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    nodeUrl: 'wss://rpc.preview.midnight.network',
    proofServerUrl: 'http://127.0.0.1:6300',
  },
  preprod: {
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeUrl: 'wss://rpc.preprod.midnight.network',
    proofServerUrl: 'http://127.0.0.1:6300',
  },
};

/** `certifyBorrowingBase` needs 25–30 s of proving, so the 300 s default is not enough headroom. */
export const DEFAULT_PROOF_TIMEOUT_MS = 1_800_000;

/**
 * Everything the SDK needs from a wallet, and nothing more. A headless wallet-sdk facade (CLI)
 * and a DApp Connector wallet (browser) both reduce to these four methods, which are exactly
 * midnight-js's `WalletProvider` and `MidnightProvider`.
 *
 * Implementers must keep one rule from the spike: a transaction that *receives* unshielded funds
 * — `payInvoice` does — has to be signed between balancing and finalizing, otherwise the node
 * rejects it. The headless adapter in `./node.ts` does this with `signRecipe`.
 */
export interface WalletAdapter extends WalletProvider {
  /** Submits a balanced, finalized transaction and returns its id. */
  submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
  /** The 32-byte unshielded address to pay claims to, when the wallet can supply one. */
  userAddress?(): Promise<UserAddress>;
  /** Releases wallet resources, if any. */
  close?(): Promise<void>;
}

/** The provider bundle a `NetworkBackend` runs on. */
export interface RegistryProviders
  extends MidnightProviders<string, PrivateStateId, StockAndFoilPrivateState> {
  privateStateProvider: PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState>;
  publicDataProvider: PublicDataProvider;
  zkConfigProvider: ZKConfigProvider<string>;
  proofProvider: ProofProvider;
  walletProvider: WalletAdapter;
  midnightProvider: WalletAdapter;
}

export interface CreateProvidersOptions {
  network: ChainNetwork;
  wallet: WalletAdapter;
  /** Where the proving keys and ZKIR come from: `FetchZkConfigProvider` or the Node one. */
  zkConfigProvider: ZKConfigProvider<string>;
  /** Where per-persona private state is kept. Defaults to an in-memory store. */
  privateStateProvider?: PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState>;
  endpoints?: Partial<NetworkEndpoints>;
  proofTimeoutMs?: number;
  /**
   * WebSocket implementation for the indexer subscription. Browsers have one; Node does not, so
   * `createHeadlessWallet` installs `ws` globally — pass one here for any other Node caller.
   */
  webSocket?: typeof WebSocket;
}

/**
 * Builds the provider bundle and pins the global network id, which the ledger uses to encode
 * addresses. Call this once per process or page.
 */
export function createProviders(options: CreateProvidersOptions): RegistryProviders {
  const endpoints = { ...NETWORKS[options.network], ...options.endpoints };
  setNetworkId(options.network as NetworkId);
  const zkConfigProvider = options.zkConfigProvider;
  return {
    privateStateProvider: options.privateStateProvider ?? inMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(
      endpoints.indexerHttpUrl,
      endpoints.indexerWsUrl,
      options.webSocket as never,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(endpoints.proofServerUrl, zkConfigProvider, {
      timeout: options.proofTimeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS,
    }),
    walletProvider: options.wallet,
    midnightProvider: options.wallet,
  };
}

/** ZK artifacts served over HTTP, as a browser build does from `/keys` and `/zkir`. */
export const fetchZkConfigProvider = (baseUrl: string): ZKConfigProvider<string> =>
  new FetchZkConfigProvider<string>(baseUrl);

/**
 * Private state that lives only for this page or process. Enough for a browser session; the CLI
 * uses the LevelDB-backed provider from `./node.ts` so personas survive between commands.
 */
export function inMemoryPrivateStateProvider(): PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState> {
  const states = new Map<string, StockAndFoilPrivateState>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let scope: ContractAddress | undefined;
  const key = (id: PrivateStateId): string => `${scope ?? ''}:${id}`;
  const unsupported = (what: string): never => {
    throw new Error(`the in-memory private state provider cannot ${what}`);
  };
  return {
    setContractAddress: (address) => {
      scope = address;
    },
    set: async (id, state) => {
      states.set(key(id), state);
    },
    get: async (id) => states.get(key(id)) ?? null,
    remove: async (id) => {
      states.delete(key(id));
    },
    clear: async () => states.clear(),
    setSigningKey: async (address, signingKey) => {
      signingKeys.set(address, signingKey);
    },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => signingKeys.clear(),
    exportPrivateStates: async () => unsupported('export private states'),
    importPrivateStates: async () => unsupported('import private states'),
    exportSigningKeys: async () => unsupported('export signing keys'),
    importSigningKeys: async () => unsupported('import signing keys'),
  };
}

// ---------------------------------------------------------------------------------------------
// DApp Connector

/**
 * The subset of `@midnight-ntwrk/dapp-connector-api` 4.0.1's `ConnectedAPI` a registry needs.
 * Typed structurally so the browser bundle does not depend on the connector package.
 */
export interface DAppConnectorWallet {
  getShieldedAddresses(): Promise<{
    shieldedAddress: string;
    shieldedCoinPublicKey: string;
    shieldedEncryptionPublicKey: string;
  }>;
  getUnshieldedAddress(): Promise<{ unshieldedAddress: string }>;
  balanceUnsealedTransaction(tx: string, options?: { payFees?: boolean }): Promise<{ tx: string }>;
  submitTransaction(tx: string): Promise<void>;
}

export interface DAppConnectorOptions {
  /**
   * Turns the wallet's Bech32m shielded keys into the encodings midnight-js expects. Supply one
   * from `@midnight-ntwrk/wallet-sdk-address-format`; the default passes them through.
   */
  decodeKey?: (bech32m: string) => string;
  /** Turns the wallet's Bech32m unshielded address into the 32 bytes a claim circuit pays to. */
  decodeAddress?: (bech32m: string) => Uint8Array;
}

/**
 * Wraps a connected browser wallet as a `WalletAdapter`. The connector speaks hex-serialized
 * transactions, so this converts in both directions; the wallet signs and pays fees itself,
 * which covers the `signRecipe` step the headless adapter has to do by hand.
 */
export function dappConnectorWalletAdapter(
  wallet: DAppConnectorWallet,
  keys: { coinPublicKey: string; encryptionPublicKey: string },
  options: DAppConnectorOptions = {},
): WalletAdapter {
  const decodeKey = options.decodeKey ?? ((value: string) => value);
  return {
    getCoinPublicKey: () => decodeKey(keys.coinPublicKey),
    getEncryptionPublicKey: () => decodeKey(keys.encryptionPublicKey),
    async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
      const balanced = await wallet.balanceUnsealedTransaction(hex(tx.serialize()));
      return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        'signature',
        'proof',
        'binding',
        fromHex(balanced.tx),
      );
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      await wallet.submitTransaction(hex(tx.serialize()));
      return tx.identifiers()[0] ?? String(tx.transactionHash());
    },
    async userAddress(): Promise<UserAddress> {
      const { unshieldedAddress } = await wallet.getUnshieldedAddress();
      const decode = options.decodeAddress;
      if (!decode) throw new Error('supply decodeAddress to pay claims to a connector wallet');
      return { bytes: decode(unshieldedAddress) };
    },
  };
}
