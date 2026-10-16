// SPDX-License-Identifier: Apache-2.0
//
// Shared plumbing for the four commands: argument parsing, where files live, how key material
// and evidence are serialised, and how a wallet is unlocked.
//
// Two rules hold everywhere in this package. Secrets are written only under `cli/.secrets/`,
// which the repository ignores, and never printed. And every file the CLI writes into
// `deployments/` or `evidence/` is plain JSON with decimal strings for field elements and
// lower-case hex for byte strings, so a judge can read it without running anything.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mnemonicToSeedSync } from '@scure/bip39';
import {
  CHAIN_NETWORKS as SDK_CHAIN_NETWORKS,
  fromHex,
  formatDust,
  hex,
  NATIVE_TOKEN_COLOR,
  NETWORK_DESCRIPTORS,
  redactEndpoint,
  resolveEndpoints,
  resolveTransactions,
  SPECK_PER_DUST,
  type ChainNetwork,
  type NetworkEndpoints,
  type Point,
  type RegistryConstructorArgs,
  type StockAndFoilPrivateState,
  type TxAnchor,
} from '@stockandfoil/sdk';
import { pointFromJson, toJsonText, type DeploymentFile, type KeysFile } from './records.js';

// The file formats these commands read and write moved to ./records.ts when the local mainnet
// console (tools/mainnet-console) had to produce the same files from a browser: that module
// touches neither `node:fs` nor the SDK's runtime, so a bundler can load it. Re-exported here
// so every call site in this package is unchanged.
export {
  anchorToJson,
  COMPACT_VERSION,
  EXPLORERS,
  explorerFor,
  fileStamp,
  pointFromJson,
  pointToJson,
  serializeLedgerView,
  THRESHOLD,
  toJsonText,
  type DeploymentFile,
  type DisclosureEvidence,
  type EvidenceFile,
  type ExplorerTemplates,
  type KeysFile,
  type LedgerViewJson,
  type PointJson,
  type SponsorshipEvidence,
  type StepRecord,
  type TxAnchorJson,
} from './records.js';

export const CHAIN_NETWORKS: readonly ChainNetwork[] = SDK_CHAIN_NETWORKS;

export { formatDust, redactEndpoint, resolveTransactions, SPECK_PER_DUST, type TxAnchor };

/** A message the user can act on; the entry point prints it without a stack trace. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

// ---------------------------------------------------------------------------------------- paths

export const CLI_DIR = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const REPO_ROOT = resolve(CLI_DIR, '..');
export const SECRETS_DIR = join(CLI_DIR, '.secrets');
export const DEPLOYMENTS_DIR = join(CLI_DIR, 'deployments');
export const EVIDENCE_DIR = join(CLI_DIR, 'evidence');

/** Compiled proving keys and ZKIR, as the ZK config provider expects them. */
export const ZK_ASSETS_PATH = join(REPO_ROOT, 'contract', 'src', 'managed', 'stock-and-foil');

/**
 * Where to read `keys/` and `zkir/` from. Defaults to the compiler's output directory, and can be
 * pointed elsewhere with `--zk-assets` or `MIDNIGHT_ZK_ASSETS` — useful when the artifacts are
 * staged somewhere else (the web app serves its own copy) or when a concurrent `compile:fast`,
 * which writes no proving keys, would otherwise pull them out from under a long run.
 */
export function zkAssetsPath(args: Args): string {
  const path = flagValue(args, 'zk-assets') ?? process.env.MIDNIGHT_ZK_ASSETS ?? ZK_ASSETS_PATH;
  const keys = join(path, 'keys');
  if (!existsSync(keys) || readdirSync(keys).filter((n) => n.endsWith('.verifier')).length === 0) {
    throw new UsageError(
      `no proving keys under ${keys}. Run \`npm run compile\` (the full build; \`compile:fast\` ` +
        'skips the keys), or point --zk-assets at a directory that has keys/ and zkir/.',
    );
  }
  return path;
}

/**
 * Which registry on a network we are talking about.
 *
 * One network can hold more than one Stock & Foil registry, and that is not a hypothetical: the
 * federation answer — a lender asks every registry it knows, because a pledge marker is a
 * function of the invoice and of nothing else — can only be *shown* with two of them. So every
 * per-registry file is scoped by `<network>` for the primary registry and `<network>-<instance>`
 * for any other, and `--instance <name>` selects one.
 *
 * The instance name is part of a file name, so it is restricted to characters that cannot
 * escape the directory or collide with the timestamp in an evidence file name.
 */
export type RegistryScope = string;

const INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,15}$/;

export function instanceOf(args: Args): string | undefined {
  const value = flagValue(args, 'instance');
  if (value === undefined) return undefined;
  if (!INSTANCE_NAME.test(value)) {
    throw new UsageError(
      `--instance "${value}" is not a usable name; use 1-16 characters of a-z, 0-9 and "-", ` +
        'starting with a letter or digit.',
    );
  }
  return value;
}

/** `preview` for the primary registry, `preview-b` for `--instance b`. */
export const scopeOf = (network: ChainNetwork, instance?: string): RegistryScope =>
  instance === undefined ? network : `${network}-${instance}`;

/** The scope this invocation is working on, from `--network` and `--instance`. */
export const requireScope = (args: Args, network?: ChainNetwork): RegistryScope =>
  scopeOf(network ?? requireNetwork(args), instanceOf(args));

export const keysPath = (scope: RegistryScope): string => join(SECRETS_DIR, `${scope}-keys.json`);
export const runStatePath = (scope: RegistryScope): string => join(SECRETS_DIR, `${scope}-scenario.json`);
export const deploymentPath = (scope: RegistryScope): string => join(DEPLOYMENTS_DIR, `${scope}.json`);

/**
 * LevelDB store holding one private state per persona plus the deployer's signing key. The
 * signing key is what makes the deployer the contract's maintenance authority, and a staged
 * deployment inserts six verifier keys with maintenance transactions after the deploy — so this
 * directory has to survive between `deploy` and any later maintenance.
 */
export const privateStatePath = (scope: RegistryScope): string => join(SECRETS_DIR, `${scope}-private-state`);

export const ensureDir = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

// ------------------------------------------------------------------------------------ arguments

export interface Args {
  command: string;
  flags: Map<string, string | true>;
}

/** `command --flag value --other=value --switch` — enough for four commands. */
export function parseArgs(argv: readonly string[]): Args {
  const [command = '', ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > 0) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(token.slice(2), next);
      i += 1;
    } else {
      flags.set(token.slice(2), true);
    }
  }
  return { command, flags };
}

export const flagValue = (args: Args, name: string): string | undefined => {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
};

export const flagSet = (args: Args, name: string): boolean => args.flags.has(name);

export function requireNetwork(args: Args): ChainNetwork {
  const value = flagValue(args, 'network');
  if (!value) throw new UsageError(`--network is required (one of ${CHAIN_NETWORKS.join(', ')})`);
  if (!CHAIN_NETWORKS.includes(value as ChainNetwork)) {
    throw new UsageError(`unknown network "${value}"; expected one of ${CHAIN_NETWORKS.join(', ')}`);
  }
  return value as ChainNetwork;
}

// ------------------------------------------------------------------------------ endpoints

/**
 * The Blockfrost project token for this invocation, if one was given on the command line.
 *
 * Nothing else reads it. `cliEndpoints` passes `process.env` alongside, so the usual path is
 * `BLOCKFROST_PROJECT_ID_PREPROD` / `BLOCKFROST_PROJECT_ID_MAINNET` in the environment and no
 * flag at all — a token on a command line ends up in the shell history.
 */
export const blockfrostTokenFlag = (args: Args): string | undefined => flagValue(args, 'blockfrost-token');

/**
 * Where to connect for this network, with the Blockfrost token resolved.
 *
 * Raises `MissingBlockfrostTokenError` for `preprod` and `mainnet` when no token is available,
 * with a message naming the environment variable and the flag. That failure arrives in under a
 * millisecond instead of as a 403 twenty minutes into a wallet sync.
 */
export const cliEndpoints = (args: Args, network: ChainNetwork): NetworkEndpoints =>
  resolveEndpoints(network, {
    blockfrostToken: blockfrostTokenFlag(args),
    env: process.env,
    allowPrefixMismatch: flagSet(args, 'allow-token-prefix-mismatch'),
    overrides: {
      indexerHttpUrl: flagValue(args, 'indexer-url'),
      nodeUrl: flagValue(args, 'node-url'),
      proofServerUrl: flagValue(args, 'proof-server-url') ?? process.env.MN_PROOF_SERVER_URL,
    },
  });

/**
 * Mainnet spends real value, so a command that can submit a transaction refuses to run against
 * it without being told twice. `--yes-mainnet` is the second time.
 */
export function guardRealValueNetwork(args: Args, network: ChainNetwork, what: string): void {
  if (!NETWORK_DESCRIPTORS[network].isRealValue) return;
  if (flagSet(args, 'yes-mainnet')) return;
  throw new UsageError(
    `${what} on mainnet spends real DUST and cannot be undone.
` +
      `Run \`npm run -w cli estimate -- --network mainnet\` first, then repeat this command with ` +
      `--yes-mainnet when the number is acceptable.`,
  );
}

// -------------------------------------------------------------------------------------- output

const started = Date.now();

const stamp = (): string => `${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s`;

export const say = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

export const note = (message: string): void => say(`[${stamp()}] ${message}`);

export const heading = (title: string): void => say(`\n=== ${title} ===`);

export const fail = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

/** `230000` minor units rendered as `$2,300.00`, purely for the console narrative. */
export const money = (minorUnits: bigint): string =>
  `$${(Number(minorUnits) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// -------------------------------------------------------------------------------- serialisation

/** Writes one of the shared record formats, creating its directory. */
export function writeJson(path: string, value: unknown): void {
  ensureDir(resolve(path, '..'));
  writeFileSync(path, toJsonText(value), 'utf8');
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// ----------------------------------------------------------------------------------- key material

export interface RegistryKeyMaterial {
  file: KeysFile;
  operator: StockAndFoilPrivateState;
  auditor: StockAndFoilPrivateState;
  keyholders: [StockAndFoilPrivateState, StockAndFoilPrivateState, StockAndFoilPrivateState];
  constructorArgs: RegistryConstructorArgs;
}

export function loadRegistryKeys(network: ChainNetwork, instance?: string): RegistryKeyMaterial {
  const scope = scopeOf(network, instance);
  const path = keysPath(scope);
  if (!existsSync(path)) {
    throw new UsageError(
      `no key material for ${scope}; run: npm run -w cli ceremony -- --network ${network}` +
        (instance === undefined ? '' : ` --instance ${instance}`),
    );
  }
  const file = readJson<KeysFile>(path);
  const keyholders = file.secrets.keyholders.map((k) => ({
    role: 'keyholder' as const,
    secretKey: fromHex(k.secretKey),
    scalar: BigInt(k.share),
  }));
  if (keyholders.length !== 3) throw new Error(`${path} holds ${keyholders.length} keyholders, expected 3`);
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
      keyholderPks: file.publicMaterial.keyholderPks.map(pointFromJson) as [Point, Point, Point],
      auditorPk: pointFromJson(file.publicMaterial.auditorPk),
      settlementColor: fromHex(file.publicMaterial.settlementColor),
    },
  };
}

export const SETTLEMENT_COLOR = NATIVE_TOKEN_COLOR;
export const settlementColorHex = (): string => hex(SETTLEMENT_COLOR);

// ------------------------------------------------------------------------------------ explorers

// ------------------------------------------------------------------------------ network facts

/** Where funds come from on each network, in one sentence each, for the `balance` command. */
export const NETWORK_FACTS: Record<ChainNetwork, { dustHint: string }> = {
  undeployed: {
    dustHint: 'A local devnet funds itself from the genesis accounts; see infra/bin/fund-local-night.mts.',
  },
  preview: {
    dustHint:
      'Ask the faucet at https://midnight-tmnight-preview.nethermind.dev/ for tNIGHT, then register ' +
      'it for DUST generation; preview generates within minutes.',
  },
  preprod: {
    dustHint:
      'Ask the faucet at https://midnight-tmnight-preprod.nethermind.dev/ for tNIGHT, then register ' +
      'it for DUST generation. A cold preprod wallet also takes about 78 minutes to sync.',
  },
  mainnet: {
    dustHint:
      'There is no mainnet faucet. Register cNIGHT against this DUST address with the cNgD dApp at ' +
      'https://midnight-dust-mainnet.nethermind.io/ ; the registration finalizes on Cardano and ' +
      'reaches a Midnight node in about 12 hours, after which DUST accrues to roughly 5 per NIGHT ' +
      'over about a week.',
  },
};

// ------------------------------------------------------------------------------------- deployment

export function loadDeployment(network: ChainNetwork, instance?: string): DeploymentFile {
  const scope = scopeOf(network, instance);
  const path = deploymentPath(scope);
  if (!existsSync(path)) {
    throw new UsageError(
      `no deployment for ${scope}; run: npm run -w cli deploy -- --network ${network}` +
        (instance === undefined ? '' : ` --instance ${instance}`),
    );
  }
  return readJson<DeploymentFile>(path);
}

// ----------------------------------------------------------------------------------------- wallet

/**
 * The 24-word mnemonic of the account that pays every fee, from `MIDNIGHT_MNEMONIC` or from a
 * file named with `--mnemonic-file`. The file may be plain text or JSON with a `mnemonic` field,
 * which is what the wallet tooling writes. Nothing is echoed, and no path is ever committed.
 */
export function loadMnemonic(args: Args): string {
  const path = flagValue(args, 'mnemonic-file');
  const raw = path === undefined ? process.env.MIDNIGHT_MNEMONIC : readMnemonicFile(path);
  if (!raw || raw.trim() === '') {
    throw new UsageError(
      'no wallet mnemonic: set MIDNIGHT_MNEMONIC or pass --mnemonic-file <path to a 24-word mnemonic>',
    );
  }
  const words = raw.trim().split(/\s+/);
  if (words.length !== 24) throw new UsageError(`expected a 24-word mnemonic, got ${words.length} words`);
  return words.join(' ');
}

function readMnemonicFile(path: string): string {
  if (!existsSync(path)) throw new UsageError(`--mnemonic-file ${path} does not exist`);
  const text = readFileSync(path, 'utf8').trim();
  if (!text.startsWith('{')) return text;
  const parsed = JSON.parse(text) as { mnemonic?: string };
  if (!parsed.mnemonic) throw new UsageError(`${path} is JSON without a "mnemonic" field`);
  return parsed.mnemonic;
}

/** BIP-39 seed of a mnemonic, as `createHeadlessWallet` takes it. */
export const seedHexOf = (mnemonic: string): string => hex(mnemonicToSeedSync(mnemonic));

/**
 * Password for the LevelDB private-state store. It protects local testnet personas at rest, so a
 * documented default is enough; override it when the store is worth more than that.
 */
export const privateStatePassword = (): string =>
  process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD ?? 'Stock-And-Foil-Local-Private-State-2026!';

// ------------------------------------------------------------------------------------- evidence

/**
 * Newest evidence file for a registry, by file name (which carries an ISO timestamp).
 *
 * The timestamp match is not decoration: `preview-b-2026-...json` also begins with `preview-`,
 * so a prefix test alone would hand a second registry's evidence back as the first registry's
 * and `verify` would compare the wrong chain.
 */
export function newestEvidencePath(scope: RegistryScope): string | undefined {
  if (!existsSync(EVIDENCE_DIR)) return undefined;
  const wanted = new RegExp(`^${scope}-\\d{4}-\\d{2}-\\d{2}T[0-9-]+Z\\.json$`);
  const names = readdirSync(EVIDENCE_DIR)
    .filter((name) => wanted.test(name))
    .sort();
  const newest = names.at(-1);
  return newest === undefined ? undefined : join(EVIDENCE_DIR, newest);
}

// --------------------------------------------------------------------------- explorer anchors
//
// `TxAnchor` and `resolveTransactions` moved into the SDK (`sdk/src/backend/indexer.ts`) when
// the indexer turned `Transaction` into an interface: `transactionResult` and the fee now need
// an inline `... on RegularTransaction` fragment, the fee field is spelled differently on
// preview (`fee`) and on the Blockfrost-served networks (`fees { paidFees }`), and the sponsor
// service needs the same reads. They are re-exported above so the call sites here are unchanged.
