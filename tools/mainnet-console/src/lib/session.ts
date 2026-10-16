// SPDX-License-Identifier: Apache-2.0
//
// One connected session: the wallet, the providers it drives, and the private state that has
// to outlive the tab.
//
// The provider bundle is the SDK's `createProviders`, with two substitutions that are the whole
// point of this console:
//
//   proofProvider   1AM's, from `getProvingProvider`. No local proof server runs here; the
//                   wallet's ProofStation proves and then pays the DUST fee.
//   endpoints       the dev server's `/bf` proxy, not the URLs the wallet reports. 1AM's
//                   `getConfiguration()` still names `indexer.mainnet.midnight.network`, which
//                   Midnight decommissioned on 2026-09-30 and which now answers
//                   410 ENDPOINT_DECOMMISSIONED. Reads go through Blockfrost or they do not
//                   happen, and the Blockfrost credential stays in Node.
import {
  createProviders,
  dappConnectorWalletAdapter,
  fetchZkConfigProvider,
  fromHex,
  NetworkBackend,
  type NetworkEndpoints,
  type RegistryConstructorArgs,
  type RegistryProviders,
  type StockAndFoilPrivateState,
  type WalletAdapter,
} from '@stockandfoil/sdk';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { pointFromJson, type KeysFile } from '../../../../cli/src/records.js';
import { getPrivateState, putPrivateState } from './api.js';
import { ConsoleStop } from './state.js';
import { addressCodecs, readWallet, type OneAmConnectedAPI, type WalletReading } from './wallet.js';

/** Where the staged proving material is served. Absolute: `FetchZkConfigProvider` parses it as a URL. */
export const ZK_BASE_URL = new URL('/zk', globalThis.location?.origin ?? 'http://127.0.0.1:5174').toString();

/**
 * The key material the ceremony dealt, in the shape the role clients and the constructor take.
 * The CLI equivalent is `loadRegistryKeys`, which reads the same file from disk.
 */
export interface RegistryKeyMaterial {
  file: KeysFile;
  operator: StockAndFoilPrivateState;
  auditor: StockAndFoilPrivateState;
  keyholders: [StockAndFoilPrivateState, StockAndFoilPrivateState, StockAndFoilPrivateState];
  constructorArgs: RegistryConstructorArgs;
}

export function keysFromFile(file: KeysFile): RegistryKeyMaterial {
  const keyholders = file.secrets.keyholders.map((k) => ({
    role: 'keyholder' as const,
    secretKey: fromHex(k.secretKey),
    scalar: BigInt(k.share),
  }));
  if (keyholders.length !== 3) throw new Error(`the key file holds ${keyholders.length} keyholders, expected 3`);
  return {
    file,
    operator: { role: 'operator', secretKey: fromHex(file.secrets.operatorSk) },
    auditor: {
      role: 'auditor',
      secretKey: fromHex(file.secrets.auditorSk),
      scalar: BigInt(file.secrets.auditorScalar),
    },
    keyholders: keyholders as RegistryKeyMaterial['keyholders'],
    constructorArgs: {
      operatorId: fromHex(file.publicMaterial.operatorId),
      disclosurePk: pointFromJson(file.publicMaterial.disclosurePk),
      keyholderPks: file.publicMaterial.keyholderPks.map(pointFromJson) as RegistryConstructorArgs['keyholderPks'],
      auditorPk: pointFromJson(file.publicMaterial.auditorPk),
      settlementColor: fromHex(file.publicMaterial.settlementColor),
    },
  };
}

/**
 * Private state that survives the tab.
 *
 * The in-memory provider the SDK ships is right for a web session and wrong for this: a staged
 * deployment inserts ten verifier keys with maintenance transactions *after* the deploy, and
 * only the holder of the deployer's signing key may insert one. That key is generated inside
 * `deployContract` and handed to `setSigningKey`. Lose it and the contract can never be
 * maintained again — the same warning `docs/MAINNET.md` gives about
 * `cli/.secrets/mainnet-private-state/`, which is the CLI's version of this file.
 *
 * Writes are awaited rather than debounced. The whole file is a few kilobytes and the server is
 * on loopback; a write that is still in flight when the tab closes is the one failure mode this
 * exists to prevent.
 */
export async function persistentPrivateState(): Promise<
  PrivateStateProvider<PrivateStateId, StockAndFoilPrivateState>
> {
  const loaded = await getPrivateState();
  const states = new Map<string, StockAndFoilPrivateState>(
    Object.entries((loaded?.states ?? {}) as Record<string, StockAndFoilPrivateState>),
  );
  const signingKeys = new Map<string, SigningKey>(
    Object.entries((loaded?.signingKeys ?? {}) as Record<string, SigningKey>),
  );
  let scope: ContractAddress | undefined;
  const key = (id: PrivateStateId): string => `${scope ?? ''}:${id}`;

  const flush = (): Promise<unknown> =>
    putPrivateState({
      version: 1,
      states: Object.fromEntries(states) as Record<string, unknown>,
      signingKeys: Object.fromEntries(signingKeys) as Record<string, unknown>,
    });

  const unsupported = (what: string): never => {
    throw new Error(`the console's private state provider cannot ${what}`);
  };

  return {
    setContractAddress: (address) => {
      scope = address;
    },
    set: async (id, state) => {
      states.set(key(id), state);
      await flush();
    },
    get: async (id) => states.get(key(id)) ?? null,
    remove: async (id) => {
      states.delete(key(id));
      await flush();
    },
    clear: async () => {
      states.clear();
      await flush();
    },
    setSigningKey: async (address, signingKey) => {
      signingKeys.set(address, signingKey);
      await flush();
    },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => {
      signingKeys.delete(address);
      await flush();
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
      await flush();
    },
    exportPrivateStates: async () => unsupported('export private states'),
    importPrivateStates: async () => unsupported('import private states'),
    exportSigningKeys: async () => unsupported('export signing keys'),
    importSigningKeys: async () => unsupported('import signing keys'),
  };
}

export interface ConsoleSession {
  api: OneAmConnectedAPI;
  walletName: string;
  apiVersion?: string;
  /** What the wallet says the network and its own endpoints are. Shown, not used, for reads. */
  reportedNetworkId: string;
  reportedIndexerUri: string;
  proverServerUri: string;
  reading: WalletReading;
  providers: RegistryProviders;
  endpoints: NetworkEndpoints;
  /** Every transaction id the adapter submitted this session, in order. */
  submitted: string[];
  zkBaseUrl: string;
}

export interface OpenSessionOptions {
  initial: { name?: string; apiVersion?: string; connect(networkId: string): Promise<OneAmConnectedAPI> };
  /** Called with every transaction id as it is submitted, so the UI can show it live. */
  onSubmitted?: (txId: string) => void;
}

export class WalletNetworkMismatch extends ConsoleStop {
  constructor(readonly reported: string) {
    super(
      `the wallet reports network "${reported}", not "mainnet". Switch the 1AM extension to ` +
        'Mainnet and reconnect; nothing will be signed against the wrong chain.',
      'console',
    );
    this.name = 'ConsoleStop';
  }
}

/** Connects, reads the wallet, and builds the provider bundle. Raises no wallet prompt to sign. */
export async function openSession(options: OpenSessionOptions): Promise<ConsoleSession> {
  const api = await options.initial.connect('mainnet');
  const config = await api.getConfiguration();
  if (config.networkId !== 'mainnet') throw new WalletNetworkMismatch(config.networkId);

  const reading = await readWallet(api);
  const { decodeKey, decodeAddress } = await addressCodecs('mainnet');

  const base = dappConnectorWalletAdapter(
    api,
    {
      coinPublicKey: reading.shieldedCoinPublicKey,
      encryptionPublicKey: reading.shieldedEncryptionPublicKey,
    },
    // 1AM balances with DUST from its own pool, so the wallet does pay the fee — from the
    // registry's point of view this is an ordinary self-funded wallet that happens to hold no
    // DUST of its own. `payFees: false` here would be a lie and would break balancing.
    { decodeKey, decodeAddress, payFees: true },
  );

  const submitted: string[] = [];
  const wallet: WalletAdapter = {
    ...base,
    async submitTx(tx) {
      const txId = await base.submitTx(tx);
      submitted.push(txId);
      options.onSubmitted?.(txId);
      return txId;
    },
  };

  const origin = globalThis.location.origin;
  const wsOrigin = origin.replace(/^http/, 'ws');
  const endpoints: NetworkEndpoints = {
    // Blockfrost, through the dev server, which holds the project token.
    indexerHttpUrl: `${origin}/bf`,
    indexerWsUrl: `${wsOrigin}/bf/ws`,
    // Nothing in this console dials the node: midnight-js reads through the indexer and the
    // wallet submits. It is overridden anyway so that `resolveEndpoints` needs no token here.
    nodeUrl: `${wsOrigin}/bf/rpc`,
    // Where proving actually happens, for the record. No local proof server is contacted.
    proofServerUrl: config.proverServerUri ?? 'https://api.1am.xyz',
  };

  const zkConfigProvider = fetchZkConfigProvider(ZK_BASE_URL);
  const provingProvider = await api.getProvingProvider(zkConfigProvider);
  const providers = createProviders({
    network: 'mainnet',
    wallet,
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider as never),
    privateStateProvider: await persistentPrivateState(),
    endpoints,
  });

  return {
    api,
    walletName: options.initial.name ?? '1AM',
    apiVersion: options.initial.apiVersion,
    reportedNetworkId: config.networkId,
    reportedIndexerUri: config.indexerUri,
    proverServerUri: endpoints.proofServerUrl,
    reading,
    providers,
    endpoints,
    submitted,
    zkBaseUrl: ZK_BASE_URL,
  };
}

/**
 * Re-attaches to a registry this console already deployed, after a reload.
 *
 * The private state comes back from `cli/.secrets/mainnet-console-private-state.json`, so the
 * personas and the deployer's signing key are the ones the earlier session used.
 */
export const connectRegistry = (session: ConsoleSession, contractAddress: string): Promise<NetworkBackend> =>
  NetworkBackend.connect({
    network: 'mainnet',
    providers: session.providers,
    compiledAssetsPath: session.zkBaseUrl,
    contractAddress,
    endpoints: session.endpoints,
  });
