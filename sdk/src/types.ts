// SPDX-License-Identifier: Apache-2.0
//
// The contract-facing vocabulary of the SDK: what a backend is, what the public ledger looks
// like from outside, and what a role client does. Role clients are written once against
// `RegistryBackend` and run unchanged on the in-process simulator and on a Midnight network.
import type { JubjubPoint, MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
import {
  PledgeStatus,
  type CallInputs,
  type Bytes32,
  type Invoice,
  type Role,
  type StockAndFoilPrivateState,
} from '@stockandfoil/contract';
import { toHex } from './bytes.js';

export { PledgeStatus };
export type { Bytes32, CallInputs, Invoice, Role, StockAndFoilPrivateState };

/** A point on the embedded Jubjub curve, as circuits and `pureCircuits` exchange them. */
export type Point = JubjubPoint;

/** A Merkle inclusion path as `findPathForLeaf` returns it. */
export type MerklePath = MerkleTreePath<Uint8Array>;

/** Where a backend runs. `simulator` is in-process; the rest are Midnight network ids. */
export type NetworkName = 'simulator' | 'undeployed' | 'preview' | 'preprod';

/** Public statuses, as strings, so views and evidence files never carry enum ordinals. */
export type PledgeStatusName = 'OFFERED' | 'PLEDGED' | 'RELEASED' | 'SETTLED';

export const PLEDGE_STATUS_NAMES: readonly PledgeStatusName[] = ['OFFERED', 'PLEDGED', 'RELEASED', 'SETTLED'];

export const pledgeStatusName = (status: PledgeStatus | bigint | number): PledgeStatusName =>
  PLEDGE_STATUS_NAMES[Number(status)] ?? 'OFFERED';

/** What one accepted circuit call produced. Refused calls throw a `Refusal` instead. */
export interface TxReceipt {
  circuit: string;
  network: NetworkName;
  durationMs: number;
  txId?: string;
  blockHeight?: number;
  /** Unshielded value the call moved, when the backend can observe it (simulator). */
  unshielded?: { received: bigint; sent: bigint };
}

/** Sealed deploy-time configuration, readable by anyone. */
export interface RegistryConfig {
  operatorId: string;
  disclosurePk: Point;
  keyholderPks: [Point, Point, Point];
  auditorPk: Point;
  settlementColor: string;
  threshold: number;
}

/** One receivable as the public ledger holds it: a nullifier, a status and unlinkable tags. */
export interface PledgeView {
  nullifier: string;
  status: PledgeStatusName;
  holderTag: string;
  expiry: bigint;
  recordId: string;
  payeeTag: string;
  amount: bigint;
  claimed: boolean;
}

/** A sealed pledge record. Only the disclosure key opens `ct`. */
export interface RecordView {
  recordId: string;
  version: number;
  E: Point;
  ct: bigint[];
}

export interface CertificateView {
  certId: string;
  borrowerCommit: string;
  lenderRef: string;
  floor: bigint;
  count: number;
  validUntil: bigint;
  /** Nullifiers the pool locked; unused slots are omitted. */
  nullifiers: string[];
}

export interface RequestView {
  requestId: string;
  recordId: string;
  caseRef: string;
  approvals: [boolean, boolean, boolean];
}

/** One keyholder's sealed decryption share, addressed by `shareKeyOf(requestId, index)`. */
export interface ShareView {
  shareKey: string;
  version: number;
  E2: Point;
  ct: bigint[];
}

/** Everything the chain reveals: counts, unlinkable tags, ciphertexts. No invoice data. */
export interface PublicLedgerView {
  counts: {
    debtors: number;
    financiers: number;
    acks: number;
    ackNullifiers: number;
    pledges: number;
    records: number;
    certificates: number;
    requests: number;
    shares: number;
  };
  config: RegistryConfig;
  pledges: PledgeView[];
  records: RecordView[];
  certificates: CertificateView[];
  requests: RequestView[];
  shares: ShareView[];
}

/**
 * The one interface both backends implement. `call` runs a circuit as `persona`, with
 * `inputs` supplying the witness data that circuit needs, and throws a `Refusal` when the
 * contract rejects the call — always before anything is proved or submitted.
 */
export interface RegistryBackend {
  readonly network: NetworkName;
  readonly contractAddress: string;
  call(
    persona: StockAndFoilPrivateState,
    circuit: string,
    args: unknown[],
    inputs?: CallInputs,
  ): Promise<TxReceipt>;
  publicState(): Promise<PublicLedgerView>;
  pathForAck(leaf: Uint8Array): Promise<MerklePath | undefined>;
  pathForMember(tree: 'debtors' | 'financiers', leaf: Uint8Array): Promise<MerklePath | undefined>;
  /** Block time in unix seconds, as the circuits see it. */
  now(): Promise<bigint>;
}

// ---------------------------------------------------------------------------------------------
// View lookups

export const findPledge = (view: PublicLedgerView, nullifier: Uint8Array | string): PledgeView | undefined =>
  view.pledges.find((p) => p.nullifier === toHex(nullifier));

export const findRecord = (view: PublicLedgerView, recordId: Uint8Array | string): RecordView | undefined =>
  view.records.find((r) => r.recordId === toHex(recordId));

export const findCertificate = (view: PublicLedgerView, certId: Uint8Array | string): CertificateView | undefined =>
  view.certificates.find((c) => c.certId === toHex(certId));

export const findRequest = (view: PublicLedgerView, requestId: Uint8Array | string): RequestView | undefined =>
  view.requests.find((r) => r.requestId === toHex(requestId));

export const findShare = (view: PublicLedgerView, shareKey: Uint8Array | string): ShareView | undefined =>
  view.shares.find((s) => s.shareKey === toHex(shareKey));

/** Whether a receivable is available to pledge, tying up collateral, or already settled. */
export type Encumbrance = 'FREE' | 'ENCUMBERED' | 'SETTLED';

/** The encumbrance a pledge entry represents at block time `now`. */
export function encumbranceOf(pledge: PledgeView | undefined, now: bigint): Encumbrance {
  if (!pledge) return 'FREE';
  if (pledge.status === 'SETTLED') return 'SETTLED';
  if (pledge.status === 'RELEASED') return 'FREE';
  if (pledge.status === 'OFFERED' && now >= pledge.expiry) return 'FREE';
  return 'ENCUMBERED';
}
