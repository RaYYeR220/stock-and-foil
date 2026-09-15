// SPDX-License-Identifier: Apache-2.0
//
// Network mode: a real Midnight wallet, a real proof server and a deployed contract.
//
// Everything here is best-effort and honest about it. The DApp Connector is enumerated rather than
// hardcoded to one wallet, the Bech32m address decoding is loaded lazily so that a missing or
// changed wallet-sdk cannot break the Sandbox, and every failure surfaces as a named reason the
// banner can print instead of a stack trace.
import {
  NetworkBackend,
  createProviders,
  dappConnectorWalletAdapter,
  fetchZkConfigProvider,
  NETWORKS,
  type ChainNetwork,
  type DAppConnectorWallet,
} from '@stockandfoil/sdk';
import { injectedWallets, type WalletOption } from './wallets.js';

interface ConnectedWallet extends DAppConnectorWallet {
  getConfiguration?(): Promise<{
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
    networkId: string;
  }>;
  hintUsage?(methods: string[]): Promise<void>;
}

export class NetworkModeError extends Error {
  constructor(
    readonly reason:
      | 'NO_WALLET'
      | 'CONNECT_REFUSED'
      | 'NO_PROOF_SERVER'
      | 'NO_DEPLOYMENT'
      | 'NO_ZK_ARTIFACTS'
      | 'ADDRESS_FORMAT'
      | 'CONNECT_FAILED',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NetworkModeError';
  }
}

/** Whether a proof server answers at `url`. Lace proves off-device and needs one running. */
export async function probeProofServer(url: string, timeoutMs = 2500): Promise<boolean> {
  const abort = AbortSignal.timeout(timeoutMs);
  for (const path of ['/health', '/']) {
    try {
      const response = await fetch(new URL(path, url), { signal: abort, mode: 'cors' });
      if (response.ok) return true;
    } catch {
      // try the next path; a CORS rejection is indistinguishable from an absent server here
    }
  }
  return false;
}

/** Whether the compiled verifier material is being served, which `FetchZkConfigProvider` needs. */
export async function probeZkArtifacts(baseUrl: string, circuit = 'offer'): Promise<boolean> {
  try {
    const response = await fetch(new URL(`keys/${circuit}.verifier`, ensureSlash(baseUrl)), {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const ensureSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

/**
 * Bech32m → the encodings midnight-js wants. The wallet-sdk address format decodes into Node
 * Buffers, so this is imported lazily and behind a try: if it cannot load, Network mode says so
 * rather than taking the page down.
 */
async function addressCodecs(networkId: string): Promise<{
  decodeKey: (bech32m: string) => string;
  decodeAddress: (bech32m: string) => Uint8Array;
}> {
  try {
    const { Buffer } = await import('buffer');
    (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;
    const format = await import('@midnight-ntwrk/wallet-sdk-address-format');
    const { MidnightBech32m, ShieldedCoinPublicKey, ShieldedEncryptionPublicKey, UnshieldedAddress } = format;
    return {
      decodeKey: (value: string) => {
        const parsed = MidnightBech32m.parse(value);
        const target =
          parsed.type.includes('esk') || parsed.type.includes('enc')
            ? ShieldedEncryptionPublicKey
            : ShieldedCoinPublicKey;
        const key = parsed.decode(target as never, networkId) as unknown as { toHexString(): string };
        return key.toHexString();
      },
      decodeAddress: (value: string) => {
        const decoded = MidnightBech32m.parse(value).decode(UnshieldedAddress as never, networkId) as unknown as {
          data: Uint8Array;
        };
        return new Uint8Array(decoded.data);
      },
    };
  } catch (cause) {
    throw new NetworkModeError(
      'ADDRESS_FORMAT',
      'This build cannot decode the wallet’s Bech32m keys, so it cannot talk to a deployed contract.',
      { cause },
    );
  }
}

export interface ConnectOptions {
  walletKey: string;
  network: ChainNetwork;
  contractAddress: string;
  /** Where the compiled `keys/` and `zkir/` are served from. */
  zkBaseUrl: string;
  proofServerUrl?: string;
}

export interface NetworkSession {
  backend: NetworkBackend;
  wallet: WalletOption;
  unshieldedAddress: string;
  endpoints: { indexer: string; node: string; proofServer: string };
}

/**
 * Connects a wallet and a deployed contract. Each failure carries a reason the banner can explain
 * — the point of Network mode in a demo is that it is honest about what is missing.
 */
export async function connectNetwork(options: ConnectOptions): Promise<NetworkSession> {
  const api = injectedWallets()[options.walletKey];
  if (!api) throw new NetworkModeError('NO_WALLET', 'No Midnight wallet is injected into this page.');
  if (!options.contractAddress) {
    throw new NetworkModeError('NO_DEPLOYMENT', 'No deployed contract address is configured for this network.');
  }

  let connected: ConnectedWallet;
  try {
    connected = (await api.connect(options.network)) as ConnectedWallet;
  } catch (cause) {
    throw new NetworkModeError('CONNECT_REFUSED', 'The wallet refused the connection.', { cause });
  }
  await connected.hintUsage?.([
    'getShieldedAddresses',
    'getUnshieldedAddress',
    'balanceUnsealedTransaction',
    'submitTransaction',
  ]).catch(() => undefined);

  const config = await connected.getConfiguration?.().catch(() => undefined);
  const defaults = NETWORKS[options.network];
  const endpoints = {
    indexerHttpUrl: config?.indexerUri ?? defaults.indexerHttpUrl,
    indexerWsUrl: config?.indexerWsUri ?? defaults.indexerWsUrl,
    nodeUrl: config?.substrateNodeUri ?? defaults.nodeUrl,
    proofServerUrl: options.proofServerUrl ?? config?.proverServerUri ?? defaults.proofServerUrl,
  };

  if (!(await probeProofServer(endpoints.proofServerUrl))) {
    throw new NetworkModeError(
      'NO_PROOF_SERVER',
      `No proof server answered at ${endpoints.proofServerUrl}. Start one, or use Sandbox mode.`,
    );
  }
  if (!(await probeZkArtifacts(options.zkBaseUrl))) {
    throw new NetworkModeError(
      'NO_ZK_ARTIFACTS',
      `No proving keys are served from ${options.zkBaseUrl}. Run "npm run -w web zk:stage" before building for a network.`,
    );
  }

  const { decodeKey, decodeAddress } = await addressCodecs(options.network);
  const shielded = await connected.getShieldedAddresses();
  const { unshieldedAddress } = await connected.getUnshieldedAddress();

  const wallet = dappConnectorWalletAdapter(
    connected,
    { coinPublicKey: shielded.shieldedCoinPublicKey, encryptionPublicKey: shielded.shieldedEncryptionPublicKey },
    { decodeKey, decodeAddress },
  );

  try {
    const backend = await NetworkBackend.connect({
      network: options.network,
      contractAddress: options.contractAddress,
      compiledAssetsPath: options.zkBaseUrl,
      endpoints,
      providers: createProviders({
        network: options.network,
        wallet,
        zkConfigProvider: fetchZkConfigProvider(options.zkBaseUrl),
        endpoints,
      }),
    });
    return {
      backend,
      wallet: { key: options.walletKey, name: api.name ?? options.walletKey, apiVersion: api.apiVersion },
      unshieldedAddress,
      endpoints: {
        indexer: endpoints.indexerHttpUrl,
        node: endpoints.nodeUrl,
        proofServer: endpoints.proofServerUrl,
      },
    };
  } catch (cause) {
    throw new NetworkModeError(
      'CONNECT_FAILED',
      cause instanceof Error ? cause.message : 'Could not reach the deployed contract.',
      { cause },
    );
  }
}
