// SPDX-License-Identifier: Apache-2.0
//
// Deployment, and the wallet wiring the scenario reuses.
//
// A deploy here is *staged*, and that is not a style choice. A Midnight block caps how many bytes
// one transaction may write; this contract's verifier keys run to tens of kilobytes and a deploy
// carrying all of them is rejected outright. So the first transaction carries the constructor and
// six keys, and one `VerifierKeyInsert` maintenance transaction per remaining circuit adds the
// rest, each printed as it lands. The count follows the number of circuits rather than being
// fixed. The deployer can do this because it holds the contract's maintenance authority, whose
// signing key lives in the LevelDB private-state store under `cli/.secrets/`.
// Lose that directory and the contract can never be maintained again.
import { existsSync } from 'node:fs';
import {
  createProviders,
  NetworkBackend,
  sponsoredWalletAdapter,
  VERIFIER_KEYS_PER_TX,
  type ChainNetwork,
  type NetworkEndpoints,
  type RegistryProviders,
  type WalletAdapter,
} from '@stockandfoil/sdk';
import {
  createHeadlessWallet,
  installWebSocket,
  levelPrivateState,
  nodeZkConfigProvider,
  type HeadlessWallet,
} from '@stockandfoil/sdk/node';
import {
  blockfrostTokenFlag,
  cliEndpoints,
  COMPACT_VERSION,
  deploymentPath,
  explorerFor,
  flagSet,
  flagValue,
  guardRealValueNetwork,
  heading,
  loadMnemonic,
  loadRegistryKeys,
  note,
  privateStatePassword,
  instanceOf,
  privateStatePath,
  redactEndpoint,
  scopeOf,
  requireNetwork,
  resolveTransactions,
  say,
  seedHexOf,
  settlementColorHex,
  UsageError,
  writeJson,
  zkAssetsPath,
  type Args,
  type DeploymentFile,
  type RegistryKeyMaterial,
} from './common.js';

/** A wallet, its providers, and the ids of every transaction they submitted, in order. */
export interface WalletSession {
  wallet: HeadlessWallet;
  providers: RegistryProviders;
  /** Transaction ids as they were submitted. A staged deploy produces seven. */
  submitted: string[];
  keys: RegistryKeyMaterial;
  /** Directory the proving keys and ZKIR were read from. */
  assets: string;
  /** Resolved endpoints, Blockfrost token included. Redact before printing. */
  endpoints: NetworkEndpoints;
  close(): Promise<void>;
}

export interface OpenWalletOptions {
  /**
   * Route submission through a DUST sponsor at this URL. The wallet then balances only the
   * shielded and unshielded sides and needs no DUST of its own.
   */
  sponsorUrl?: string;
  /** Bearer token the sponsor's allowlist expects, if it is configured with API keys. */
  sponsorApiKey?: string;
  /** Mnemonic to unlock instead of the one `--mnemonic-file` / `MIDNIGHT_MNEMONIC` names. */
  mnemonic?: string;
  /** Do not wait for the wallet to hold DUST. Required for a sponsored, zero-DUST wallet. */
  requireDust?: boolean;
  /** Called once the wallet is open, before any transaction is built. */
  onReady?: (wallet: HeadlessWallet) => Promise<void> | void;
  /**
   * Which registry on this network. `undefined` is the primary one; a name selects a second,
   * independent deployment with its own ceremony keys and its own private-state store.
   */
  instance?: string;
}

/**
 * Unlocks the fee-paying wallet and builds the provider bundle.
 *
 * `submitTx` is wrapped so the CLI sees every transaction id the SDK submits. That is the only
 * way to report the six maintenance transactions: they are submitted deep inside midnight-js's
 * maintenance interface, which does not hand their ids back.
 */
export async function openWallet(
  args: Args,
  network: ChainNetwork,
  options: OpenWalletOptions = {},
): Promise<WalletSession> {
  const assets = zkAssetsPath(args);
  const instance = options.instance ?? instanceOf(args);
  const scope = scopeOf(network, instance);
  const keys = loadRegistryKeys(network, instance);
  const mnemonic = options.mnemonic ?? loadMnemonic(args);
  const sponsorUrl = options.sponsorUrl ?? flagValue(args, 'sponsor');
  const endpoints = cliEndpoints(args, network);

  installWebSocket();
  // A public network is synced from genesis on every invocation — preview took about fifteen
  // minutes at ~236k blocks — so the default here is generous rather than the SDK's ten minutes.
  const syncTimeoutMs = Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000;
  note(
    `unlocking the fee-paying wallet and syncing against ${network} ` +
      `(indexer ${redactEndpoint(endpoints.indexerHttpUrl)}); ` +
      `a public network syncs from genesis, which takes ~15 minutes (timeout ${syncTimeoutMs / 60_000} min)`,
  );
  const wallet = await createHeadlessWallet({
    seedHex: seedHexOf(mnemonic),
    network,
    endpoints,
    syncTimeoutMs,
    // A sponsored wallet balances only shielded and unshielded, and holds no DUST on purpose.
    payDustFees: sponsorUrl === undefined,
    requireDust: options.requireDust ?? sponsorUrl === undefined,
    onSyncProgress: (p) =>
      note(
        `syncing ${p.percent}%  shielded ${p.shielded.applied}/${p.shielded.target}  ` +
          `dust ${p.dust.applied}/${p.dust.target}`,
      ),
  });
  note(`wallet ready: ${wallet.address}`);
  await options.onReady?.(wallet);

  const submitted: string[] = [];
  const base: WalletAdapter =
    sponsorUrl === undefined
      ? wallet.adapter
      : sponsoredWalletAdapter(wallet.adapter, {
          endpoint: sponsorUrl,
          apiKey: options.sponsorApiKey ?? flagValue(args, 'sponsor-api-key') ?? process.env.SPONSOR_API_KEY,
          caller: `cli:${network}`,
          onSponsored: (result) =>
            note(`sponsor paid ${result.feeSpeck ?? '?'} SPECK for ${result.circuits.join(', ')}`),
        });
  const recording: WalletAdapter = {
    ...base,
    async submitTx(tx) {
      const txId = await base.submitTx(tx);
      submitted.push(txId);
      return txId;
    },
  };

  const providers = createProviders({
    network,
    wallet: recording,
    endpoints,
    zkConfigProvider: nodeZkConfigProvider(assets),
    privateStateProvider: levelPrivateState({
      path: privateStatePath(scope),
      password: privateStatePassword(),
      accountId: wallet.adapter.getCoinPublicKey(),
    }),
    webSocket: globalThis.WebSocket,
  });

  return { wallet, providers, submitted, keys, assets, endpoints, close: () => wallet.close() };
}

export async function deploy(args: Args): Promise<number> {
  const network = requireNetwork(args);
  guardRealValueNetwork(args, network, 'deploying the registry');
  const instance = instanceOf(args);
  const scope = scopeOf(network, instance);
  const path = deploymentPath(scope);
  if (existsSync(path) && !flagSet(args, 'force')) {
    throw new UsageError(`${path} already exists; pass --force to deploy a second registry over it`);
  }
  const perTx = Number(flagValue(args, 'verifier-keys-per-tx') ?? VERIFIER_KEYS_PER_TX);

  const session = await openWallet(args, network);
  try {
    heading(`deploying the registry to ${scope}`);
    const maintenanceCircuits: string[] = [];
    const backend = await NetworkBackend.deploy({
      network,
      providers: session.providers,
      compiledAssetsPath: session.assets,
      constructorArgs: session.keys.constructorArgs,
      operator: session.keys.operator,
      verifierKeysPerTx: perTx,
      onProgress: ({ stage, circuit, index, total }) => {
        if (stage === 'deploy') {
          note(`tx ${index}/${total}  deploy: constructor and the first ${perTx} verifier keys`);
        } else {
          maintenanceCircuits.push(circuit!);
          note(`tx ${index}/${total}  maintenance: insert verifier key for ${circuit}`);
        }
      },
    });

    const deployTx = backend.deployTxId ?? session.submitted[0];
    if (!deployTx) throw new Error('the deploy transaction produced no transaction id');
    const maintenanceIds = maintenanceCircuits.map((_, i) => session.submitted[i + 1] ?? '');

    // Explorers key transactions by hash, midnight-js reports identifiers. Resolving them here
    // makes the deployment file linkable on its own, without reading an evidence file next to it.
    const anchors = await resolveTransactions(session.endpoints.indexerHttpUrl, [deployTx, ...maintenanceIds]);
    const maintenanceTxs = maintenanceCircuits.map((circuit, i) => ({
      circuit,
      txId: maintenanceIds[i]!,
      txHash: anchors.get(maintenanceIds[i]!)?.txHash,
    }));

    const publicMaterial = session.keys.file.publicMaterial;
    const file: DeploymentFile = {
      network,
      contractAddress: backend.contractAddress,
      deployTx,
      deployTxHash: anchors.get(deployTx)?.txHash,
      maintenanceTxs,
      deployedAt: new Date().toISOString(),
      keyholderPks: publicMaterial.keyholderPks,
      auditorPk: publicMaterial.auditorPk,
      disclosurePk: publicMaterial.disclosurePk,
      settlementColor: settlementColorHex(),
      compactVersion: COMPACT_VERSION,
      explorer: explorerFor(network),
    };
    writeJson(path, file);

    heading('deployed');
    say(`  contract   ${file.contractAddress}`);
    say(`  deploy tx  ${file.deployTx}`);
    for (const tx of file.maintenanceTxs) say(`  +key ${tx.circuit.padEnd(21)} ${tx.txId}`);

    const state = await backend.publicState();
    say(`\n  sealed configuration read back through the indexer:`);
    say(`    operatorId      ${state.config.operatorId}`);
    say(`    disclosurePk.x  ${state.config.disclosurePk.x}`);
    say(`    threshold       ${state.config.threshold} of 3`);
    say(`    counts          ${JSON.stringify(state.counts)}`);
    say(`\nwritten to ${path}`);
    say(
      `next: npm run -w cli scenario -- --network ${network}` +
        (instance === undefined ? '' : ` --instance ${instance}`),
    );
    return 0;
  } finally {
    await session.close();
  }
}

/** Connects to the registry recorded in `deployments/<network>.json` with a funded wallet. */
export async function connectDeployed(
  args: Args,
  network: ChainNetwork,
  contractAddress: string,
  options: OpenWalletOptions = {},
): Promise<{ session: WalletSession; backend: NetworkBackend }> {
  const session = await openWallet(args, network, options);
  const backend = await NetworkBackend.connect({
    network,
    providers: session.providers,
    compiledAssetsPath: session.assets,
    contractAddress,
    endpoints: session.endpoints,
    blockfrostToken: blockfrostTokenFlag(args),
    env: process.env,
  });
  return { session, backend };
}
