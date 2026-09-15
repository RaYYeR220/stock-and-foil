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
  fromHex,
  hex,
  NATIVE_TOKEN_COLOR,
  type ChainNetwork,
  type Point,
  type PublicLedgerView,
  type RegistryConstructorArgs,
  type StockAndFoilPrivateState,
} from '@stockandfoil/sdk';

/** Compact toolchain the committed artifacts were produced with. */
export const COMPACT_VERSION = '0.31.1';

/** Threshold of the disclosure key: two of three keyholders. */
export const THRESHOLD = 2;

export const CHAIN_NETWORKS: readonly ChainNetwork[] = ['undeployed', 'preview', 'preprod'];

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

export function writeJson(path: string, value: unknown): void {
  ensureDir(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

// ------------------------------------------------------------------------------------- deployment

export interface DeploymentFile {
  network: ChainNetwork;
  contractAddress: string;
  deployTx: string;
  maintenanceTxs: Array<{ circuit: string; txId: string }>;
  deployedAt: string;
  keyholderPks: [PointJson, PointJson, PointJson];
  auditorPk: PointJson;
  disclosurePk: PointJson;
  settlementColor: string;
  compactVersion: string;
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
  };
}

// -------------------------------------------------------------------------------- evidence file

export interface StepRecord {
  id: string;
  label: string;
  circuit: string;
  persona: string;
  txId?: string;
  blockHeight?: number;
  refused?: string;
  durationMs: number;
  at: string;
  note?: string;
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

export interface EvidenceFile {
  project: string;
  network: ChainNetwork;
  contractAddress: string;
  compactVersion: string;
  startedAt: string;
  finishedAt: string;
  steps: StepRecord[];
  summary: {
    steps: number;
    transactions: number;
    refusals: Array<{ id: string; label: string; circuit: string; code: string }>;
    firstBlockHeight?: number;
    lastBlockHeight?: number;
    totalDurationMs: number;
  };
  disclosure?: DisclosureEvidence;
  finalState: LedgerViewJson;
}
