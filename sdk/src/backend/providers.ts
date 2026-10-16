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
import { hexOnlyCodec, type AddressCodecs } from './address.js';
import {
  resolveEndpoints,
  type ChainNetwork,
  type Environment,
  type NetworkEndpoints,
} from './endpoints.js';

// The network table moved to ./endpoints.ts when preprod and mainnet went behind Blockfrost.
// Re-exported here so that `import { NETWORKS } from '@stockandfoil/sdk'` keeps working.
export {
  blockfrostTokenFor,
  BlockfrostTokenMismatchError,
  CHAIN_NETWORKS,
  isChainNetwork,
  MissingBlockfrostTokenError,
  NETWORK_DESCRIPTORS,
  NETWORKS,
  redactEndpoint,
  redactEndpoints,
  requiresBlockfrostToken,
  resolveEndpoints,
  type ChainNetwork,
  type Environment,
  type NetworkDescriptor,
  type NetworkEndpoints,
  type ResolveEndpointsOptions,
} from './endpoints.js';

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
  /**
   * Whether `balanceTx` also pays the DUST fee.
   *
   * `true` (the default reading when it is absent) is an ordinary self-funded wallet. `false`
   * means the adapter balanced only the shielded and unshielded token kinds and the transaction
   * still owes its fee — the shape a sponsor expects, and the only shape
   * `sponsoredWalletAdapter` will wrap. Making it part of the type is what stops a zero-DUST
   * demo from silently becoming a self-funded one.
   */
  readonly paysDustFees?: boolean;
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
  /**
   * Where proofs are generated. Defaults to the HTTP proof server at `endpoints.proofServerUrl`,
   * which is where every self-hosted caller proves, because a proof server sees witness data in
   * the clear.
   *
   * A wallet that proves on the caller's behalf — 1AM hands one back from `getProvingProvider` —
   * passes its own provider here instead, and no local proof server is contacted.
   */
  proofProvider?: ProofProvider;
  /** Where per-persona private state is kept. Defaults to an in-memory store. */
  privateStateProvider?: PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState>;
  endpoints?: Partial<NetworkEndpoints>;
  /** Blockfrost project token, required on `preprod` and `mainnet` unless `endpoints` carries one. */
  blockfrostToken?: string;
  /** Environment to read the token from when it was not passed; a Node caller passes `process.env`. */
  env?: Environment;
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
 *
 * On `preprod` and `mainnet` the indexer and node URLs are Blockfrost's and carry a project
 * token; `resolveEndpoints` raises `MissingBlockfrostTokenError` here rather than letting a
 * provider discover a 403 halfway through a deploy.
 */
export function createProviders(options: CreateProvidersOptions): RegistryProviders {
  const endpoints = resolveEndpoints(options.network, {
    blockfrostToken: options.blockfrostToken,
    env: options.env,
    overrides: options.endpoints,
  });
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
    proofProvider:
      options.proofProvider ??
      httpClientProofProvider(endpoints.proofServerUrl, zkConfigProvider, {
        timeout: options.proofTimeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS,
      }),
    walletProvider: options.wallet,
    midnightProvider: options.wallet,
  };
}

/**
 * ZK artifacts served over HTTP, as a browser build does from `/keys` and `/zkir`.
 *
 * The bound `fetch` is not decoration. `FetchZkConfigProvider` defaults to the `fetch` it
 * imports from `cross-fetch`, which in a browser bundle is the bare global, and calling it as
 * a method of the provider throws
 *
 *   TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
 *
 * Node has no such receiver check, so this fails only in a browser, and only when something
 * actually reads a key — which for us was the deploy transaction, one click after a preflight
 * that had already fetched the identical URL by hand and found it fine. 1AM's developer guide
 * passes `fetch.bind(window)` for exactly this reason.
 */
export const fetchZkConfigProvider = (baseUrl: string): ZKConfigProvider<string> =>
  new FetchZkConfigProvider<string>(baseUrl, globalThis.fetch.bind(globalThis));

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

export interface DAppConnectorOptions extends Partial<AddressCodecs> {
  /**
   * How the wallet's keys and address are turned into what midnight-js takes.
   *
   * Build them with `loadAddressCodecs(networkId)` and spread them in. They are separate
   * functions per kind of value on purpose: the previous single `decodeKey` forced callers to
   * guess from the Bech32m type string which of the two shielded key classes to decode with,
   * and the guess that got written looked for 'esk' or 'enc' in a type that is spelled
   * `shield-epk`. Encoding mistakes of that shape are invisible to the type system, so the
   * shape that invites them is gone.
   *
   * Left out, the adapter accepts hex — which is what 1AM reports — and refuses anything else
   * by name rather than handing an encoding midnight-js will not convert to a call site that
   * does not convert it.
   */
  decodeCoinPublicKey?: (value: string) => string;
  decodeEncryptionPublicKey?: (value: string) => string;
  decodeAddress?: (value: string) => Uint8Array;
  /**
   * Whether the connected wallet pays the DUST fee. Default `true`.
   *
   * Set it to `false` for a sponsored flow: the connector is asked to balance with
   * `payFees: false`, so it funds the shielded and unshielded sides, signs and binds, and leaves
   * the fee to the sponsor. A wallet holding zero DUST can get this far and no further on its
   * own; wrap the result with `sponsoredWalletAdapter` to submit it.
   */
  payFees?: boolean;
}

/**
 * Raised when the wallet answers, but with something that is not what it promised.
 *
 * Distinct from a refusal: the wallet did not say no, it said something unusable. Naming that
 * separately matters to whoever is watching, because the two have different remedies.
 */
export class WalletResponseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'WalletResponseError';
  }
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
  const decodeCoin = options.decodeCoinPublicKey ?? hexOnlyCodec('coin public key');
  const decodeEncryption = options.decodeEncryptionPublicKey ?? hexOnlyCodec('encryption public key');
  const payFees = options.payFees ?? true;
  return {
    paysDustFees: payFees,
    // Hex, both of them, because midnight-js converts the coin public key on some call sites
    // and neither key on others. See ./address.ts.
    getCoinPublicKey: () => decodeCoin(keys.coinPublicKey),
    getEncryptionPublicKey: () => decodeEncryption(keys.encryptionPublicKey),
    async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
      const sent = hex(tx.serialize());
      const balanced = await wallet.balanceUnsealedTransaction(sent, { payFees });
      try {
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      } catch (cause) {
        // The wallet is supposed to fund, sign and *bind* the transaction, which changes its
        // binding from `embedded-fr` to `pedersen-schnorr`. Getting the unbound one back means
        // the wallet echoed our bytes or balanced without binding, and the deserializer's
        // complaint about a header tag is not a sentence an operator can act on.
        const unchanged = balanced.tx === sent;
        throw new WalletResponseError(
          `the wallet answered balanceUnsealedTransaction with ${balanced.tx.length / 2} bytes that ` +
            `are not a signed, proven, bound transaction${unchanged ? ' — in fact they are the exact bytes it was sent, unchanged' : ''}. ` +
            'A balanced transaction has to come back bound; this one did not.',
          cause,
        );
      }
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      await wallet.submitTransaction(hex(tx.serialize()));
      return tx.identifiers()[0] ?? String(tx.transactionHash());
    },
    async userAddress(): Promise<UserAddress> {
      const { unshieldedAddress } = await wallet.getUnshieldedAddress();
      const decode = options.decodeAddress;
      if (!decode) {
        throw new Error(
          'this adapter cannot turn the wallet’s unshielded address into the 32 bytes a claim ' +
            'pays to, because it was built without codecs. Build them with ' +
            '`loadAddressCodecs(networkId)` and pass them to dappConnectorWalletAdapter.',
        );
      }
      return { bytes: decode(unshieldedAddress) };
    },
  };
}
