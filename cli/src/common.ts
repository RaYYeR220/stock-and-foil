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
  type PublicLedgerView,
  type RegistryConstructorArgs,
  type StockAndFoilPrivateState,
  type TxAnchor,
} from '@stockandfoil/sdk';

/** Compact toolchain the committed artifacts were produced with. */
export const COMPACT_VERSION = '0.31.1';

/** Threshold of the disclosure key: two of three keyholders. */
export const THRESHOLD = 2;

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

export const keysPath = (network: ChainNetwork): string => join(SECRETS_DIR, `${network}-keys.json`);
export const runStatePath = (network: ChainNetwork): string => join(SECRETS_DIR, `${network}-scenario.json`);
export const deploymentPath = (network: ChainNetwork): string => join(DEPLOYMENTS_DIR, `${network}.json`);

/**
 * LevelDB store holding one private state per persona plus the deployer's signing key. The
 * signing key is what makes the deployer the contract's maintenance authority, and a staged
 * deployment inserts six verifier keys with maintenance transactions after the deploy — so this
 * directory has to survive between `deploy` and any later maintenance.
 */
export const privateStatePath = (network: ChainNetwork): string => join(SECRETS_DIR, `${network}-private-state`);

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

export interface PointJson {
  x: string;
  y: string;
}

export const pointToJson = (p: Point): PointJson => ({ x: p.x.toString(), y: p.y.toString() });
export const pointFromJson = (p: PointJson): Point => ({ x: BigInt(p.x), y: BigInt(p.y) });

const NON_ASCII = /[\u0080-\uffff]/g;

/**
 * Writes JSON as pure ASCII, escaping anything above U+007F as `\uXXXX`.
 *
 * The file is still UTF-8 and still decodes to the same characters, but a reader that guesses a
 * legacy code page — a Windows console at CP1251, a build step that forgets an encoding — cannot
 * turn an em dash into mojibake, because there are no multi-byte sequences left to misread.
 */
export function writeJson(path: string, value: unknown): void {
  ensureDir(resolve(path, '..'));
  const json = JSON.stringify(value, null, 2).replace(
    NON_ASCII,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  writeFileSync(path, `${json}\n`, 'utf8');
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// ----------------------------------------------------------------------------------- key material

export interface KeysFile {
  network: ChainNetwork;
  createdAt: string;
  compactVersion: string;
  threshold: number;
  /** Everything that is sealed into the ledger and may be published. */
  publicMaterial: {
    operatorId: string;
    disclosurePk: PointJson;
    keyholderPks: [PointJson, PointJson, PointJson];
    auditorPk: PointJson;
    settlementColor: string;
  };
  /** Never leaves `cli/.secrets/`. The ceremony's master secret is not among them: it is discarded. */
  secrets: {
    operatorSk: string;
    auditorSk: string;
    auditorScalar: string;
    keyholders: Array<{ index: number; share: string; secretKey: string }>;
  };
}

export interface RegistryKeyMaterial {
  file: KeysFile;
  operator: StockAndFoilPrivateState;
  auditor: StockAndFoilPrivateState;
  keyholders: [StockAndFoilPrivateState, StockAndFoilPrivateState, StockAndFoilPrivateState];
  constructorArgs: RegistryConstructorArgs;
}

export function loadRegistryKeys(network: ChainNetwork): RegistryKeyMaterial {
  const path = keysPath(network);
  if (!existsSync(path)) {
    throw new UsageError(`no key material for ${network}; run: npm run -w cli ceremony -- --network ${network}`);
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

/**
 * URL templates for a network's block explorer, so a front end does not have to guess them.
 *
 * `{txHash}` is the transaction **hash**, not the midnight-js transaction *identifier* that
 * `deployTx` and `maintenanceTxs[].txId` carry: Midnight Explorer indexes by hash and answers a
 * lookup by identifier with a 404. That is why every evidence step and every deployment anchor
 * carries `txHash` alongside the identifier, and why a reader must substitute the hash here.
 *
 * Subscan gets only a block template. It resolves `/block/<height>` — the page differs from the
 * one a nonexistent height returns — but `/extrinsic/<ledger tx hash>` renders the same empty
 * shell for a real hash as for thirty-two zero bytes: a Midnight *ledger* transaction hash is not
 * the Substrate extrinsic hash Subscan keys on, so there is no honest per-transaction link there.
 * Checked against preview on 2026-09-15; preprod is the same software and the same shapes.
 */
export interface ExplorerTemplates {
  /** Midnight Explorer, keyed by transaction hash. */
  tx: string;
  /** Midnight Explorer, keyed by contract address. */
  contract: string;
  /** Midnight Explorer, keyed by block height. */
  block: string;
  /** Subscan, keyed by block height — the only Subscan shape that resolves for this chain. */
  subscanBlock: string;
}

export const EXPLORERS: Record<ChainNetwork, ExplorerTemplates | undefined> = {
  // A local devnet has no explorer.
  undeployed: undefined,
  preview: {
    tx: 'https://preview.midnightexplorer.com/transactions/{txHash}',
    contract: 'https://preview.midnightexplorer.com/contracts/{address}',
    block: 'https://preview.midnightexplorer.com/blocks/{height}',
    subscanBlock: 'https://midnight-preview.subscan.io/block/{height}',
  },
  preprod: {
    tx: 'https://preprod.midnightexplorer.com/transactions/{txHash}',
    contract: 'https://preprod.midnightexplorer.com/contracts/{address}',
    block: 'https://preprod.midnightexplorer.com/blocks/{height}',
    subscanBlock: 'https://midnight-preprod.subscan.io/block/{height}',
  },
  // Mainnet drops the sub-domain on both explorers. Route shapes checked 2026-10-16: a
  // contract page and a block page both answer 200, and Subscan lives at midnight.subscan.io.
  mainnet: {
    tx: 'https://midnightexplorer.com/transactions/{txHash}',
    contract: 'https://midnightexplorer.com/contracts/{address}',
    block: 'https://midnightexplorer.com/blocks/{height}',
    subscanBlock: 'https://midnight.subscan.io/block/{height}',
  },
};

export const explorerFor = (network: ChainNetwork): ExplorerTemplates | undefined => EXPLORERS[network];

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

export interface DeploymentFile {
  network: ChainNetwork;
  contractAddress: string;
  deployTx: string;
  /** Explorer key of `deployTx`, resolved through the indexer; absent if it could not be read. */
  deployTxHash?: string;
  maintenanceTxs: Array<{ circuit: string; txId: string; txHash?: string }>;
  deployedAt: string;
  keyholderPks: [PointJson, PointJson, PointJson];
  auditorPk: PointJson;
  disclosurePk: PointJson;
  settlementColor: string;
  compactVersion: string;
  /** Explorer URL templates for this network; absent on a local devnet. */
  explorer?: ExplorerTemplates;
}

export function loadDeployment(network: ChainNetwork): DeploymentFile {
  const path = deploymentPath(network);
  if (!existsSync(path)) {
    throw new UsageError(`no deployment for ${network}; run: npm run -w cli deploy -- --network ${network}`);
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

/** Newest evidence file for a network, by file name (which carries an ISO timestamp). */
export function newestEvidencePath(network: ChainNetwork): string | undefined {
  if (!existsSync(EVIDENCE_DIR)) return undefined;
  const names = readdirSync(EVIDENCE_DIR)
    .filter((name) => name.startsWith(`${network}-`) && name.endsWith('.json'))
    .sort();
  const newest = names.at(-1);
  return newest === undefined ? undefined : join(EVIDENCE_DIR, newest);
}

/** File-name-safe ISO timestamp: `2026-09-15T14-31-02Z`. */
export const fileStamp = (date = new Date()): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');

// ------------------------------------------------------------------------------- public ledger

/**
 * The public ledger as JSON: field elements as decimal strings, byte strings as hex.
 *
 * Every collection is sorted by its ledger key. Compact `Map` iteration is not insertion ordered,
 * so two reads of the same state can hand back the same entries in a different order — sorting is
 * what makes `verify` a comparison of state rather than of luck.
 */
export interface LedgerViewJson {
  counts: Record<string, number>;
  config: {
    operatorId: string;
    disclosurePk: PointJson;
    keyholderPks: PointJson[];
    auditorPk: PointJson;
    settlementColor: string;
    threshold: number;
  };
  pledges: Array<{
    nullifier: string;
    status: string;
    holderTag: string;
    expiry: string;
    recordId: string;
    payeeTag: string;
    amount: string;
    claimed: boolean;
  }>;
  records: Array<{ recordId: string; version: number; E: PointJson; ct: string[] }>;
  certificates: Array<{
    certId: string;
    borrowerCommit: string;
    lenderRef: string;
    floor: string;
    count: number;
    validUntil: string;
    nullifiers: string[];
  }>;
  requests: Array<{ requestId: string; recordId: string; caseRef: string; approvals: boolean[] }>;
  shares: Array<{ shareKey: string; version: number; E2: PointJson; ct: string[] }>;
  /** Peer registries this operator declares it recognises. */
  peers: Array<{ address: string; labelCommit: string }>;
  /** Disclosure cases: a fixed set of records a keyholder approves once rather than per record. */
  cases: Array<{ caseRef: string; count: number; recordIds: string[]; approvals: boolean[] }>;
}

const byKey =
  <T>(key: (value: T) => string) =>
  (a: T, b: T): number =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

export function serializeLedgerView(view: PublicLedgerView): LedgerViewJson {
  return {
    counts: { ...view.counts },
    config: {
      operatorId: view.config.operatorId,
      disclosurePk: pointToJson(view.config.disclosurePk),
      keyholderPks: view.config.keyholderPks.map(pointToJson),
      auditorPk: pointToJson(view.config.auditorPk),
      settlementColor: view.config.settlementColor,
      threshold: view.config.threshold,
    },
    pledges: view.pledges
      .map((p) => ({
        nullifier: p.nullifier,
        status: p.status,
        holderTag: p.holderTag,
        expiry: p.expiry.toString(),
        recordId: p.recordId,
        payeeTag: p.payeeTag,
        amount: p.amount.toString(),
        claimed: p.claimed,
      }))
      .sort(byKey((p) => p.nullifier)),
    records: view.records
      .map((r) => ({ recordId: r.recordId, version: r.version, E: pointToJson(r.E), ct: r.ct.map(String) }))
      .sort(byKey((r) => r.recordId)),
    certificates: view.certificates
      .map((c) => ({
        certId: c.certId,
        borrowerCommit: c.borrowerCommit,
        lenderRef: c.lenderRef,
        floor: c.floor.toString(),
        count: c.count,
        validUntil: c.validUntil.toString(),
        nullifiers: [...c.nullifiers].sort(),
      }))
      .sort(byKey((c) => c.certId)),
    requests: view.requests
      .map((q) => ({ requestId: q.requestId, recordId: q.recordId, caseRef: q.caseRef, approvals: [...q.approvals] }))
      .sort(byKey((q) => q.requestId)),
    shares: view.shares
      .map((s) => ({ shareKey: s.shareKey, version: s.version, E2: pointToJson(s.E2), ct: s.ct.map(String) }))
      .sort(byKey((s) => s.shareKey)),
    peers: view.peers
      .map((p) => ({ address: p.address, labelCommit: p.labelCommit }))
      .sort(byKey((p) => p.address)),
    cases: view.cases
      .map((c) => ({
        caseRef: c.caseRef,
        count: c.count,
        recordIds: [...c.recordIds],
        approvals: [...c.approvals],
      }))
      .sort(byKey((c) => c.caseRef)),
  };
}

// --------------------------------------------------------------------------- explorer anchors
//
// `TxAnchor` and `resolveTransactions` moved into the SDK (`sdk/src/backend/indexer.ts`) when
// the indexer turned `Transaction` into an interface: `transactionResult` and the fee now need
// an inline `... on RegularTransaction` fragment, the fee field is spelled differently on
// preview (`fee`) and on the Blockfrost-served networks (`fees { paidFees }`), and the sponsor
// service needs the same reads. They are re-exported above so the call sites here are unchanged.

// -------------------------------------------------------------------------------- evidence file

export interface StepRecord {
  id: string;
  label: string;
  circuit: string;
  persona: string;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  blockHash?: string;
  blockTimestamp?: string;
  refused?: string;
  durationMs: number;
  at: string;
  note?: string;
  /** DUST this step actually paid, in SPECK, as the indexer reports it. */
  feeSpeck?: string;
  /** Set when a sponsor paid the fee instead of the run's own wallet. */
  sponsored?: boolean;
}

export interface DisclosureEvidence {
  requestId: string;
  recordId: string;
  caseRef: string;
  approvals: boolean[];
  shamirIndices: number[];
  /** Recomputed from the opened plaintext; must equal the nullifier the pledge is keyed by. */
  recomputedNullifier?: string;
  ledgerNullifier?: string;
  fingerprint?: string;
  ackLeaf?: string;
  recordIdMatches: boolean;
  verified: boolean;
  openedInvoice: { invoiceNo: string; amount: string; dueDate: string };
  holderTagMatchesLedger: boolean;
}

/**
 * What a sponsored run proves: a wallet that holds no DUST transacted anyway.
 *
 * The zero-DUST claim is recorded as a reading taken from the acting wallet *at the moment it
 * submitted*, not as an assertion. `actingWalletDustSpeck` is what that wallet held; if it is
 * not 0 the claim is not made.
 */
export interface SponsorshipEvidence {
  endpoint: string;
  /** Bech32m unshielded address of the wallet that proved, balanced, signed and bound. */
  actingWallet: string;
  /** DUST the acting wallet held, in SPECK. The whole point is that this is "0". */
  actingWalletDustSpeck: string;
  /** DUST the acting wallet held after the run; still zero, because it never paid. */
  actingWalletDustSpeckAfter?: string;
  /** Bech32m unshielded address of the wallet that paid. */
  sponsorWallet?: string;
  sponsorDustSpeckBefore?: string;
  sponsorDustSpeckAfter?: string;
  steps: Array<{ id: string; circuit: string; txId: string; txHash?: string; feeSpeck?: string }>;
  totalSponsoredFeeSpeck?: string;
  totalSponsoredFeeDust?: string;
}

export interface EvidenceFile {
  project: string;
  network: ChainNetwork;
  contractAddress: string;
  compactVersion: string;
  startedAt: string;
  finishedAt: string;
  /** Explorer URL templates for this network; absent on a local devnet. */
  explorer?: ExplorerTemplates;
  /** The seven transactions that put this contract on chain, resolved to explorer anchors. */
  deployment: {
    deployTx: TxAnchor;
    maintenanceTxs: Array<TxAnchor & { circuit: string }>;
  };
  steps: StepRecord[];
  summary: {
    steps: number;
    transactions: number;
    refusals: Array<{ id: string; label: string; circuit: string; code: string }>;
    firstBlockHeight?: number;
    lastBlockHeight?: number;
    totalDurationMs: number;
    /** DUST the whole run cost, in SPECK, summed from what the indexer reports per transaction. */
    totalFeeSpeck?: string;
    totalFeeDust?: string;
  };
  /** Present when any step was submitted by a fee sponsor rather than by the run's own wallet. */
  sponsorship?: SponsorshipEvidence;
  disclosure?: DisclosureEvidence;
  finalState: LedgerViewJson;
}
