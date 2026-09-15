// SPDX-License-Identifier: Apache-2.0
//
// Checks anyone can run against the public ledger. They exist because two of the registry's
// guarantees are not enforced by a circuit and so have to be *observable* instead:
//
//   * a record is only secret if its sealing key was fresh, and a repeated ephemeral point is
//     visible to everyone (`reusedSealingKeys`);
//   * a decryption share is bound to a *record*, not to the request that asked for it, so the
//     approvals of one request understate how far a record has actually been opened
//     (`recordDisclosureState`).
//
// Nothing here needs a secret: an explorer, a keyholder about to approve, or a financier sizing
// up a registry can all run them from `backend.publicState()`.
import { toHex } from './bytes.js';
import type { Point, PublicLedgerView, RecordView, RequestView } from './types.js';

/** Records that were sealed under the same ephemeral point, which is a leak (see below). */
export interface ReusedSealingKey {
  E: Point;
  recordIds: string[];
}

/**
 * Groups records by their ephemeral point `E`.
 *
 * A sealed record is a one-time pad: `ct_j = field_j + maskOf(e·disclosurePk, j)`. Two records
 * sealed with the same `e` therefore carry the same masks, and subtracting their ciphertexts
 * cancels them — an observer with no key at all learns which fields are equal, for example that
 * two receivables share a debtor or a seller. The contract cannot detect it (the scalar is a
 * witness and freshness is not a provable property), but `E` is stored in the clear, so a repeat
 * is plain to see. The SDK always draws a fresh scalar; a non-empty result means a caller
 * supplied its own and reused it.
 */
export function reusedSealingKeys(view: Pick<PublicLedgerView, 'records'>): ReusedSealingKey[] {
  const groups = new Map<string, RecordView[]>();
  for (const record of view.records) {
    const key = `${record.E.x}:${record.E.y}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()]
    .filter((records) => records.length > 1)
    .map((records) => ({ E: records[0]!.E, recordIds: records.map((r) => r.recordId) }));
}

/** How far one sealed record has been opened, counting every request that names it. */
export interface RecordDisclosureState {
  recordId: string;
  /** Requests on this record, in ledger order. */
  requests: RequestView[];
  /** Keyholder slots that approved *any* request for this record. */
  approvedSlots: [boolean, boolean, boolean];
  /** How many distinct keyholders have contributed a share for this record. */
  approvals: number;
  /** Two distinct keyholders have contributed, so the auditor can reconstruct `S = sk·E`. */
  openable: boolean;
}

/**
 * The disclosure state of a record, which is *not* what any single request shows.
 *
 * A keyholder publishes `D_i = s_i·E`, and `E` belongs to the record, not to the request. So two
 * requests against one record with one approval each give the auditor two independent shares and
 * open it, while both requests still read `[true,false,false]` and `[false,true,false]` on the
 * ledger. The 2-of-3 threshold is intact — two distinct keyholders are still required — but the
 * per-request approval vector is not the audit trail it looks like, and a keyholder consenting to
 * one case reference cannot withhold the same share from another. Read this before approving, and
 * when asking "has this record been opened?".
 */
export function recordDisclosureState(
  view: Pick<PublicLedgerView, 'requests'>,
  recordId: Uint8Array | string,
): RecordDisclosureState {
  const id = toHex(recordId);
  const requests = view.requests.filter((r) => r.recordId === id);
  const approvedSlots: [boolean, boolean, boolean] = [false, false, false];
  for (const request of requests) {
    request.approvals.forEach((approved, i) => {
      if (approved) approvedSlots[i] = true;
    });
  }
  const approvals = approvedSlots.filter(Boolean).length;
  return { recordId: id, requests, approvedSlots, approvals, openable: approvals >= 2 };
}

/** Every record that two or more keyholders have contributed a share for, across all requests. */
export const openableRecords = (view: Pick<PublicLedgerView, 'requests'>): RecordDisclosureState[] =>
  [...new Set(view.requests.map((r) => r.recordId))]
    .map((recordId) => recordDisclosureState(view, recordId))
    .filter((state) => state.openable);
