// SPDX-License-Identifier: Apache-2.0
//
// Deploy-time validation of the disclosure ceremony.
//
// Every confidentiality claim rests on `disclosurePk`, `keyholderPks` and `auditorPk`, and a
// wrong ceremony fails *silently*: a degenerate or duplicated key lets one party open every
// record alone, and an inconsistent sharing means no two keyholders can ever open one — which is
// only discovered when an investigation needs it. All of it is public, so the constructor checks
// all of it, and these tests are the proof that it does.
import { describe, expect, it } from 'vitest';
import { expectRefusal, Harness, NATIVE_COLOR, offered, openRecord, pure, setupRegistry } from './harness.js';
import { randomBytes32, randomScalar, splitSecret } from '../../sdk/src/crypto/scalar.js';

type Point = { x: bigint; y: bigint };

/** A well-formed ceremony: a random master key split 2-of-3, plus an independent auditor key. */
function ceremony() {
  const disclosureSk = randomScalar();
  const shares = splitSecret(disclosureSk, 2, 3);
  const auditorSk = randomScalar();
  return {
    disclosureSk,
    auditorSk,
    disclosurePk: pure.pubKeyOf(disclosureSk),
    keyholderPks: shares.map((s) => pure.pubKeyOf(s.value)) as [Point, Point, Point],
    auditorPk: pure.pubKeyOf(auditorSk),
  };
}

const deployWith = (o: { disclosurePk: Point; keyholderPks: [Point, Point, Point]; auditorPk: Point }) =>
  Harness.deploy({ operatorSk: randomBytes32(), settlementColor: NATIVE_COLOR, ...o });

describe('the constructor refuses a broken disclosure ceremony', () => {
  it('a correct ceremony deploys', () => {
    const c = ceremony();
    expect(() => deployWith(c)).not.toThrow();
  });

  it('BAD_DISCLOSURE_KEY: the identity as the disclosure key would make every record world-readable', () => {
    // S = e·identity is the identity for every e, so `maskOf(S, j)` is a public constant and
    // anyone can subtract it. Nothing later in the lifecycle would notice.
    const c = ceremony();
    expectRefusal(() => deployWith({ ...c, disclosurePk: pure.identityPoint() }), 'BAD_DISCLOSURE_KEY');
  });

  it('BAD_AUDITOR_KEY: the auditor key may not be the disclosure key, which would open every record alone', () => {
    const c = ceremony();
    expectRefusal(() => deployWith({ ...c, auditorPk: c.disclosurePk }), 'BAD_AUDITOR_KEY');
    expectRefusal(() => deployWith({ ...c, auditorPk: pure.identityPoint() }), 'BAD_AUDITOR_KEY');
  });

  it('BAD_KEYHOLDER_KEY: no keyholder may be degenerate, hold the master key, or be the auditor', () => {
    const c = ceremony();
    const swap = (i: number, pk: Point) =>
      c.keyholderPks.map((k, j) => (i === j ? pk : k)) as [Point, Point, Point];
    expectRefusal(() => deployWith({ ...c, keyholderPks: swap(1, pure.identityPoint()) }), 'BAD_KEYHOLDER_KEY');
    expectRefusal(() => deployWith({ ...c, keyholderPks: swap(0, c.disclosurePk) }), 'BAD_KEYHOLDER_KEY');
    expectRefusal(() => deployWith({ ...c, keyholderPks: swap(2, c.auditorPk) }), 'BAD_KEYHOLDER_KEY');
  });

  it('BAD_KEY_SHARING: keys that are not a 2-of-3 sharing of this disclosure key are refused', () => {
    const c = ceremony();
    // Three independent keys: disclosure would be impossible for ever, and nothing would say so.
    const unrelated = [randomScalar(), randomScalar(), randomScalar()].map((s) => pure.pubKeyOf(s)) as [Point, Point, Point];
    expectRefusal(() => deployWith({ ...c, keyholderPks: unrelated }), 'BAD_KEY_SHARING');
    // One share replaced: the remaining pairs no longer agree.
    const tampered = [c.keyholderPks[0], c.keyholderPks[1], pure.pubKeyOf(randomScalar())] as [Point, Point, Point];
    expectRefusal(() => deployWith({ ...c, keyholderPks: tampered }), 'BAD_KEY_SHARING');
  });

  it('BAD_KEY_SHARING: the shares may not be presented out of Shamir-index order', () => {
    // Slot i is combined at Shamir index i+1, so a permuted vector Lagrange-combines to garbage
    // and the auditor would open nothing — a failure mode no later circuit can detect.
    const c = ceremony();
    const permuted = [c.keyholderPks[1], c.keyholderPks[0], c.keyholderPks[2]] as [Point, Point, Point];
    expectRefusal(() => deployWith({ ...c, keyholderPks: permuted }), 'BAD_KEY_SHARING');
  });

  it('a registry that deploys really does seal records only the ceremony can open', () => {
    const r = setupRegistry();
    const { inv, n } = offered(r);
    const rec = r.ledger().records.lookup(r.ledger().pledges.lookup(n).recordId);
    expect(openRecord(rec, pure.mulPoint(rec.E, r.disclosureSk)).invoice).toEqual(inv);
    // The masks of a degenerate ceremony would be these public constants; they are not the ones used.
    const openedWithIdentity = openRecord(rec, pure.identityPoint());
    expect(openedWithIdentity.invoice).not.toEqual(inv);
  });
});
