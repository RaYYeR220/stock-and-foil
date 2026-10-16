// SPDX-License-Identifier: Apache-2.0
//
// The file formats: what a deployment record, an evidence file and a key file are, and how the
// values inside them are written down. Nothing here touches the filesystem, the network or
// `process`, and every import is `import type`, so this module can be loaded by a browser
// bundle and by a Vite dev-server plugin as well as by the CLI.
//
// That is the whole reason it exists as its own file. `verify` and `proof` read these files and
// compare them to the chain field by field, so anything else that writes one — the local
// mainnet console under `tools/mainnet-console`, which deploys through a browser wallet — has
// to produce the *same* shape, not a shape that looks similar. Sharing the serializer is what
// makes that true rather than hoped for.
//
// Two rules hold throughout: field elements and SPECK amounts are decimal strings, because they
// do not survive a double, and byte strings are lower-case hex.
import type { ChainNetwork, Point, PublicLedgerView, TxAnchor } from '@stockandfoil/sdk';

/** Compact toolchain the committed artifacts were produced with. */
export const COMPACT_VERSION = '0.31.1';

/** Threshold of the disclosure key: two of three keyholders. */
export const THRESHOLD = 2;

// -------------------------------------------------------------------------------- serialisation

export interface PointJson {
  x: string;
  y: string;
}

export const pointToJson = (p: Point): PointJson => ({ x: p.x.toString(), y: p.y.toString() });
export const pointFromJson = (p: PointJson): Point => ({ x: BigInt(p.x), y: BigInt(p.y) });

const NON_ASCII = /[\u0080-￿]/g;

/**
 * Renders a bigint as a decimal string, which is what every number in these files already is.
 *
 * `JSON.stringify` throws on a bigint rather than guessing, and the guess it would have to make
 * is the one this file format already documents. Making it explicit here means a value that
 * arrives as a bigint is written correctly instead of taking the whole run down at the last
 * line — which is exactly what it did once, after thirty-three transactions had already landed
 * on chain.
 */
const bigintToDecimalString = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value;

/**
 * One of these files as text: pure ASCII, with anything above U+007F escaped as `\uXXXX`.
 *
 * The file is still UTF-8 and still decodes to the same characters, but a reader that guesses a
 * legacy code page — a Windows console at CP1251, a build step that forgets an encoding —
 * cannot turn an em dash into mojibake, because there are no multi-byte sequences left to
 * misread. The trailing newline is part of the format.
 */
export function toJsonText(value: unknown): string {
  const json = JSON.stringify(value, bigintToDecimalString, 2).replace(
    NON_ASCII,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `${json}\n`;
}

/** File-name-safe ISO timestamp: `2026-09-15T14-31-02Z`. */
export const fileStamp = (date = new Date()): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');

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

// --------------------------------------------------------------------------------- public ledger

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

// --------------------------------------------------------------------------------- evidence file

/**
 * A `TxAnchor` as it appears in an evidence file: the fee as a decimal string rather than a
 * bigint, so the shape the reader sees is the shape the type promises.
 */
export interface TxAnchorJson {
  identifier: string;
  txHash?: string;
  blockHeight?: number;
  blockHash?: string;
  blockTimestamp?: string;
  feeSpeck?: string;
  status?: string;
}

export const anchorToJson = (anchor: TxAnchor): TxAnchorJson => ({
  identifier: anchor.identifier,
  txHash: anchor.txHash,
  blockHeight: anchor.blockHeight,
  blockHash: anchor.blockHash,
  blockTimestamp: anchor.blockTimestamp,
  feeSpeck: anchor.feeSpeck?.toString(),
  status: anchor.status,
});

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
  /** The transactions that put this contract on chain, resolved to explorer anchors. */
  deployment: {
    deployTx: TxAnchorJson;
    maintenanceTxs: Array<TxAnchorJson & { circuit: string }>;
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
