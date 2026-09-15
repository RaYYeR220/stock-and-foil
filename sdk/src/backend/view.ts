// SPDX-License-Identifier: Apache-2.0
//
// Projection of the compiled contract's ledger into the plain `PublicLedgerView` both backends
// return. This is literally everything the chain reveals: counts, unlinkable tags, ciphertexts
// and statuses. No invoice field ever appears here.
import type { Ledger } from '@stockandfoil/contract';
import { hex } from '../bytes.js';
import {
  pledgeStatusName,
  type CertificateView,
  type PledgeView,
  type Point,
  type PublicLedgerView,
  type RecordView,
  type RequestView,
  type ShareView,
} from '../types.js';

const ZERO_HEX = '0'.repeat(64);
const point = (p: Point): Point => ({ x: p.x, y: p.y });
const triple = <T>(xs: readonly T[], fallback: T): [T, T, T] => [xs[0] ?? fallback, xs[1] ?? fallback, xs[2] ?? fallback];

export function toPublicLedgerView(ledger: Ledger): PublicLedgerView {
  const pledges: PledgeView[] = [];
  for (const [key, p] of ledger.pledges) {
    pledges.push({
      nullifier: hex(key),
      status: pledgeStatusName(p.status),
      holderTag: p.holderTag.toString(),
      expiry: p.expiry,
      recordId: hex(p.recordId),
      payeeTag: p.payeeTag.toString(),
      amount: p.amount,
      claimed: p.claimed,
    });
  }

  const records: RecordView[] = [];
  for (const [key, r] of ledger.records) {
    records.push({ recordId: hex(key), version: Number(r.version), E: point(r.E), ct: [...r.ct] });
  }

  const certificates: CertificateView[] = [];
  for (const [key, c] of ledger.certificates) {
    certificates.push({
      certId: hex(key),
      borrowerCommit: hex(c.borrowerCommit),
      lenderRef: hex(c.lenderRef),
      floor: c.floor,
      count: Number(c.count),
      validUntil: c.validUntil,
      nullifiers: c.nullifiers.map(hex).filter((n) => n !== ZERO_HEX),
    });
  }

  const requests: RequestView[] = [];
  for (const [key, q] of ledger.requests) {
    requests.push({
      requestId: hex(key),
      recordId: hex(q.recordId),
      caseRef: hex(q.caseRef),
      approvals: triple(q.approvals, false),
    });
  }

  const shares: ShareView[] = [];
  for (const [key, s] of ledger.shares) {
    shares.push({ shareKey: hex(key), version: Number(s.version), E2: point(s.E2), ct: [...s.ct] });
  }

  return {
    counts: {
      debtors: Number(ledger.debtors.firstFree()),
      financiers: Number(ledger.financiers.firstFree()),
      acks: Number(ledger.acks.firstFree()),
      ackNullifiers: Number(ledger.ackNullifiers.size()),
      pledges: pledges.length,
      records: records.length,
      certificates: certificates.length,
      requests: requests.length,
      shares: shares.length,
    },
    config: {
      operatorId: hex(ledger.operatorId),
      disclosurePk: point(ledger.disclosurePk),
      keyholderPks: triple(ledger.keyholderPks.map(point), { x: 0n, y: 1n }),
      auditorPk: point(ledger.auditorPk),
      settlementColor: hex(ledger.settlementColor),
      threshold: Number(ledger.threshold),
    },
    pledges,
    records,
    certificates,
    requests,
    shares,
  };
}
