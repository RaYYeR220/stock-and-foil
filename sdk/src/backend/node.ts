// SPDX-License-Identifier: Apache-2.0
//
// Node-only helpers: a headless wallet, filesystem ZK artifacts and LevelDB-backed private state.
// Nothing else in the SDK imports this module, so a browser bundle never pulls in `fs` or `ws`.
// Import it as `@stockandfoil/sdk/node`.
//
// The wallet-sdk facade types its configuration and its wallet parts loosely, so the calls that
// cross into it are the one place in the SDK that uses `any`; everything this module hands back
// is fully typed.
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as ledgerApi from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  PrivateStateId,
  PrivateStateProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import {
  createKeystore,
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  mergeWalletEntries,
  PublicKey,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
} from '@midnight-ntwrk/wallet-sdk';
import type { StockAndFoilPrivateState } from '@stockandfoil/contract';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { userAddress, type UserAddress } from '../bytes.js';
import { NETWORKS, type ChainNetwork, type NetworkEndpoints, type WalletAdapter } from './providers.js';

/** The wallet SDK talks to the node over a WebSocket the Node runtime does not provide. */
export function installWebSocket(): void {
  const global = globalThis as { WebSocket?: unknown };
  global.WebSocket ??= WebSocket;
}

/** Proving keys and ZKIR read from `<directory>/keys` and `<directory>/zkir`. */
export const nodeZkConfigProvider = (directory: string): ZKConfigProvider<string> =>
  new NodeZkConfigProvider<string>(directory);

export interface LevelPrivateStateOptions {
  /** Directory of the LevelDB store. Keep it out of version control. */
  path: string;
  storeName?: string;
  /** Encrypts the store at rest; the level provider enforces a minimum strength. */
  password: string;
  /** Scopes the store to one wallet, as the coin public key of the fee payer. */
  accountId: string;
}

/** Private state that survives between CLI invocations, one entry per persona id. */
export const levelPrivateState = (
  options: LevelPrivateStateOptions,
): PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState> =>
  levelPrivateStateProvider<PrivateStateId, StockAndFoilPrivateState>({
    midnightDbName: options.path,
    privateStateStoreName: options.storeName ?? 'stock-and-foil',
    privateStoragePasswordProvider: () => options.password,
    accountId: options.accountId,
  } as any);

export interface HeadlessWalletOptions {
  /** 64-byte hex seed of the account that pays the fees. */
  seedHex: string;
  network: ChainNetwork;
  endpoints?: Partial<NetworkEndpoints>;
  /** How long to wait for the wallet to sync and hold DUST. */
  syncTimeoutMs?: number;
}

export interface HeadlessWallet {
  adapter: WalletAdapter;
  /** Bech32m unshielded address of the fee payer. */
  address: string;
  /** Unshielded address bytes, which is what a claim circuit pays to. */
  payTo: UserAddress;
  close(): Promise<void>;
}

/**
 * Starts a wallet-sdk 1.2.0 facade and exposes it as a `WalletAdapter`.
 *
 * `balanceTx` signs the recipe between balancing and finalizing. That step is not optional here:
 * `payInvoice` calls `receiveUnshielded`, and a transaction with unshielded inputs is rejected
 * unless the recipe carries the payer's signature.
 */
export async function createHeadlessWallet(options: HeadlessWalletOptions): Promise<HeadlessWallet> {
  installWebSocket();
  const endpoints = { ...NETWORKS[options.network], ...options.endpoints };

  const hd = HDWallet.fromSeed(Buffer.from(options.seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('the wallet seed is not a valid 64-byte hex string');
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('could not derive wallet keys from the seed');
  const keys = derived.keys;

  const shieldedSecretKeys = ledgerApi.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledgerApi.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const keystore = createKeystore(keys[Roles.NightExternal], options.network as any);

  const wallet = await WalletFacade.init({
    configuration: {
      networkId: options.network,
      indexerClientConnection: {
        indexerHttpUrl: endpoints.indexerHttpUrl,
        indexerWsUrl: endpoints.indexerWsUrl,
      },
      provingServerUrl: new URL(endpoints.proofServerUrl),
      relayURL: new URL(endpoints.nodeUrl),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
      costParameters: { additionalFeeOverhead: 1_000n, feeBlocksMargin: 5 },
    },
    shielded: (cfg: any) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg: any) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg: any) =>
      DustWallet(cfg).startWithSecretKey(dustSecretKey, ledgerApi.LedgerParameters.initialParameters().dust),
  } as any);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  const complete = (progress: any): boolean =>
    typeof progress?.isStrictlyComplete === 'function' && progress.isStrictlyComplete();
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter(
        (s: any) =>
          complete(s.shielded.progress) &&
          complete(s.unshielded.progress) &&
          complete(s.dust.progress) &&
          s.dust.availableCoins.length > 0,
      ),
      Rx.timeout(options.syncTimeoutMs ?? 600_000),
    ),
  );

  const adapter: WalletAdapter = {
    getCoinPublicKey: () => shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl: Date = ttlOneHour()) {
      const recipe = await wallet.balanceUnboundTransaction(tx, { shieldedSecretKeys, dustSecretKey }, { ttl });
      const signed = await wallet.signRecipe(recipe, (data: any) => keystore.signData(data));
      return wallet.finalizeRecipe(signed) as any;
    },
    submitTx: (tx: any) => wallet.submitTransaction(tx) as any,
    async userAddress() {
      return payTo;
    },
    close: () => wallet.stop(),
  };

  const raw = keystore.getAddress() as unknown;
  const payTo = userAddress(typeof raw === 'string' ? raw : new Uint8Array((raw as { bytes: Uint8Array }).bytes));
  return {
    adapter,
    address: keystore.getBech32Address().asString(),
    payTo,
    close: () => wallet.stop(),
  };
}
