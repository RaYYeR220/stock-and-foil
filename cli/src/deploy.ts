// SPDX-License-Identifier: Apache-2.0
//
// Deployment, and the wallet wiring the scenario reuses.
//
// A deploy here is *staged*, and that is not a style choice. A Midnight block caps how many bytes
// one transaction may write; this contract's twelve verifier keys total about 26 kB and a deploy
// carrying all of them is rejected outright. So the first transaction carries the constructor and
// six keys, and six `VerifierKeyInsert` maintenance transactions add the rest — seven in total,
// each printed as it lands. The deployer can do that because it holds the contract's maintenance
// authority, whose signing key lives in the LevelDB private-state store under `cli/.secrets/`.
// Lose that directory and the contract can never be maintained again.
import { existsSync } from 'node:fs';
import {
  createProviders,
  NetworkBackend,
  VERIFIER_KEYS_PER_TX,
  type ChainNetwork,
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
  COMPACT_VERSION,
  deploymentPath,
  flagSet,
  flagValue,
  heading,
  loadMnemonic,
  loadRegistryKeys,
  note,
  privateStatePassword,
  privateStatePath,
  requireNetwork,
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
  close(): Promise<void>;
}

/**
 * Unlocks the fee-paying wallet and builds the provider bundle.
 *
 * `submitTx` is wrapped so the CLI sees every transaction id the SDK submits. That is the only
 * way to report the six maintenance transactions: they are submitted deep inside midnight-js's
 * maintenance interface, which does not hand their ids back.
 */
export async function openWallet(args: Args, network: ChainNetwork): Promise<WalletSession> {
  const assets = zkAssetsPath(args);
  const keys = loadRegistryKeys(network);
  const mnemonic = loadMnemonic(args);

  installWebSocket();
  // A public network is synced from genesis on every invocation — preview took about fifteen
  // minutes at ~236k blocks — so the default here is generous rather than the SDK's ten minutes.
  const syncTimeoutMs = Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000;
  note(
    `unlocking the fee-paying wallet and syncing against ${network}; ` +
      `a public network syncs from genesis, which takes ~15 minutes (timeout ${syncTimeoutMs / 60_000} min)`,
  );
  const wallet = await createHeadlessWallet({ seedHex: seedHexOf(mnemonic), network, syncTimeoutMs });
  note(`wallet ready: ${wallet.address}`);

  const submitted: string[] = [];
  const recording: WalletAdapter = {
    ...wallet.adapter,
    balanceTx: (...a: Parameters<WalletAdapter['balanceTx']>) => wallet.adapter.balanceTx(...a),
    async submitTx(tx) {
      const txId = await wallet.adapter.submitTx(tx);
      submitted.push(txId);
      return txId;
    },
  };

  const providers = createProviders({
    network,
    wallet: recording,
    zkConfigProvider: nodeZkConfigProvider(assets),
    privateStateProvider: levelPrivateState({
      path: privateStatePath(network),
      password: privateStatePassword(),
      accountId: wallet.adapter.getCoinPublicKey(),
    }),
    webSocket: globalThis.WebSocket,
  });

  return { wallet, providers, submitted, keys, assets, close: () => wallet.close() };
}

export async function deploy(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const path = deploymentPath(network);
  if (existsSync(path) && !flagSet(args, 'force')) {
    throw new UsageError(`${path} already exists; pass --force to deploy a second registry over it`);
  }
  const perTx = Number(flagValue(args, 'verifier-keys-per-tx') ?? VERIFIER_KEYS_PER_TX);

  const session = await openWallet(args, network);
  try {
    heading(`deploying the registry to ${network}`);
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
    const maintenanceTxs = maintenanceCircuits.map((circuit, i) => ({
      circuit,
      txId: session.submitted[i + 1] ?? '',
    }));

    const publicMaterial = session.keys.file.publicMaterial;
    const file: DeploymentFile = {
      network,
      contractAddress: backend.contractAddress,
      deployTx,
      maintenanceTxs,
      deployedAt: new Date().toISOString(),
      keyholderPks: publicMaterial.keyholderPks,
      auditorPk: publicMaterial.auditorPk,
      disclosurePk: publicMaterial.disclosurePk,
      settlementColor: settlementColorHex(),
      compactVersion: COMPACT_VERSION,
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
    say(`next: npm run -w cli scenario -- --network ${network}`);
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
): Promise<{ session: WalletSession; backend: NetworkBackend }> {
  const session = await openWallet(args, network);
  const backend = await NetworkBackend.connect({
    network,
    providers: session.providers,
    compiledAssetsPath: session.assets,
    contractAddress,
  });
  return { session, backend };
}
