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
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  PrivateStateId,
  PrivateStateProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import {
  createKeystore,
  DustAddress,
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
import {
  resolveEndpoints,
  type ChainNetwork,
  type Environment,
  type NetworkEndpoints,
} from './endpoints.js';
import { SPECK_PER_DUST } from './indexer.js';
import { type WalletAdapter } from './providers.js';

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
  /** Blockfrost project token; required on `preprod` and `mainnet`. */
  blockfrostToken?: string;
  /** Environment the token is read from when it was not passed; usually `process.env`. */
  env?: Environment;
  /** How long to wait for the wallet to sync. */
  syncTimeoutMs?: number;
  /**
   * Whether this wallet pays its own DUST fees. Default `true`.
   *
   * `false` balances only `['shielded','unshielded']`, which is the user half of the
   * sponsorship pattern: the transaction is funded, signed and bound but still owes its fee.
   * Such a wallet is not required to hold any DUST, so `requireDust` defaults to `false` too.
   */
  payDustFees?: boolean;
  /**
   * Whether to wait for the wallet to actually hold a DUST coin before returning. Defaults to
   * `payDustFees`. Set it `false` to inspect a wallet that is still waiting for DUST to
   * generate — `balance` does exactly that, which is the whole point of the command.
   */
  requireDust?: boolean;
  /** Skip waiting for a complete sync. Balances are then whatever has been applied so far. */
  requireSync?: boolean;
}

/** What a wallet holds, in the units the chain uses and in human ones. */
export interface WalletBalances {
  network: ChainNetwork;
  /** NIGHT in its atomic unit (STAR, 10^6 per NIGHT). */
  nightStar: bigint;
  night: string;
  /** Spendable DUST in SPECK (10^15 per DUST) at the time of reading. */
  dustSpeck: bigint;
  dust: string;
  dustCoins: number;
  /** NIGHT UTXOs already registered for DUST generation, and those not yet registered. */
  nightUtxosRegistered: number;
  nightUtxosUnregistered: number;
  synced: boolean;
  readAt: string;
}

export interface HeadlessWallet {
  adapter: WalletAdapter;
  /** Bech32m unshielded address of the fee payer. */
  address: string;
  /** Bech32m DUST address — what a cNIGHT registration points at. */
  dustAddress: string;
  /** Unshielded address bytes, which is what a claim circuit pays to. */
  payTo: UserAddress;
  /** A snapshot of NIGHT and DUST right now. */
  balances(): Promise<WalletBalances>;
  /**
   * The DUST this transaction alone would cost, in SPECK. Accurate only for proven transactions,
   * which is what the cost estimate feeds it.
   */
  calculateFee(tx: FinalizedTransaction): Promise<bigint>;
  /** The DUST cost including the balancing transaction the fee itself needs. */
  estimateFee(tx: FinalizedTransaction): Promise<bigint>;
  /**
   * Sponsor side of DUST sponsorship: take somebody else's bound, fee-less transaction, balance
   * only `['dust']` against this wallet, sign and finalize it. The result is submittable and
   * still carries the user's own binding, so nothing about the call can have changed.
   */
  addDustFees(tx: FinalizedTransaction): Promise<FinalizedTransaction>;
  /** Submits a finalized transaction and returns its identifier. */
  submit(tx: FinalizedTransaction): Promise<string>;
  close(): Promise<void>;
}

/** `1234567` STAR rendered as `1.234567`. */
const formatUnits = (value: bigint, decimals: number): string => {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction === '' ? `${whole}` : `${whole}.${fraction}`;
};

/**
 * Starts a wallet-sdk 1.2.0 facade and exposes it as a `WalletAdapter`.
 *
 * `balanceTx` signs the recipe between balancing and finalizing. That step is not optional here:
 * `payInvoice` calls `receiveUnshielded`, and a transaction with unshielded inputs is rejected
 * unless the recipe carries the payer's signature.
 */
export async function createHeadlessWallet(options: HeadlessWalletOptions): Promise<HeadlessWallet> {
  installWebSocket();
  const endpoints = resolveEndpoints(options.network, {
    blockfrostToken: options.blockfrostToken,
    env: options.env,
    overrides: options.endpoints,
  });
  const payDustFees = options.payDustFees ?? true;
  const requireDust = options.requireDust ?? payDustFees;
  const requireSync = options.requireSync ?? true;

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
  const isSynced = (s: any): boolean =>
    complete(s.shielded.progress) && complete(s.unshielded.progress) && complete(s.dust.progress);

  if (requireSync) {
    await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.filter((s: any) => isSynced(s) && (!requireDust || s.dust.availableCoins.length > 0)),
        Rx.timeout(options.syncTimeoutMs ?? 600_000),
      ),
    );
  }

  const currentState = (): Promise<any> =>
    Rx.firstValueFrom(wallet.state().pipe(Rx.timeout(options.syncTimeoutMs ?? 600_000)));

  const adapter: WalletAdapter = {
    paysDustFees: payDustFees,
    getCoinPublicKey: () => shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl: Date = ttlOneHour()) {
      // `tokenKindsToBalance` is the whole of DUST sponsorship. Leaving DUST out produces a
      // transaction that is complete and bound but unpaid — exactly what a sponsor completes.
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl, tokenKindsToBalance: payDustFees ? 'all' : ['shielded', 'unshielded'] } as any,
      );
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
    dustAddress: DustAddress.encodePublicKey(options.network as any, dustSecretKey.publicKey) as unknown as string,
    payTo,
    async balances(): Promise<WalletBalances> {
      const s = await currentState();
      const now = new Date();
      const nightStar: bigint = s.unshielded.balances[ledgerApi.unshieldedToken().raw] ?? 0n;
      let dustSpeck = 0n;
      // `balance(now)` projects generation forward and throws while the dust tree is still
      // catching up. A wallet with no DUST yet is the normal case for this call, not an error.
      try {
        dustSpeck = s.dust.balance(now) as bigint;
      } catch {
        dustSpeck = 0n;
      }
      const coins: Array<{ meta: { registeredForDustGeneration: boolean } }> = s.unshielded.availableCoins ?? [];
      const unregistered = coins.filter((c) => !c.meta.registeredForDustGeneration).length;
      return {
        network: options.network,
        nightStar,
        night: formatUnits(nightStar, 6),
        dustSpeck,
        dust: formatUnits(dustSpeck, 15),
        dustCoins: s.dust.availableCoins?.length ?? 0,
        nightUtxosRegistered: coins.length - unregistered,
        nightUtxosUnregistered: unregistered,
        synced: isSynced(s),
        readAt: now.toISOString(),
      };
    },
    calculateFee: (tx) => wallet.calculateTransactionFee(tx as any) as Promise<bigint>,
    estimateFee: (tx) => wallet.estimateTransactionFee(tx as any, dustSecretKey) as Promise<bigint>,
    async addDustFees(tx: FinalizedTransaction): Promise<FinalizedTransaction> {
      const recipe = await wallet.balanceFinalizedTransaction(
        tx as any,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttlOneHour(), tokenKindsToBalance: ['dust'] } as any,
      );
      const signed = await wallet.signRecipe(recipe, (data: any) => keystore.signData(data));
      return (await wallet.finalizeRecipe(signed)) as FinalizedTransaction;
    },
    submit: (tx) => wallet.submitTransaction(tx as any) as Promise<string>,
    close: () => wallet.stop(),
  };
}

export { SPECK_PER_DUST };
