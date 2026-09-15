// SPDX-License-Identifier: Apache-2.0
//
// The record codec: packing the five sealed fields, removing the ECDH masks, recombining
// keyholder shares and proving an opened record against the nullifier the ledger is keyed by.
import { pureCircuits } from '@stockandfoil/contract';
import { describe, expect, it } from 'vitest';
import { hex } from '../src/bytes.js';
import {
  CIPHER_VERSION,
  CipherVersionError,
  decryptRecord,
  decryptShare,
  packFields,
  packRecordFields,
  recoverSharedSecret,
  sealFields,
  unpackFields,
  unpackRecordFields,
  verifyDisclosure,
} from '../src/crypto/records.js';
import { FIELD_MODULUS, randomField, randomScalar, splitSecret } from '../src/crypto/scalar.js';
import type { Invoice, Point } from '../src/types.js';

const MAX64 = (1n << 64n) - 1n;

const invoice = (o: Partial<Invoice> = {}): Invoice => ({
  debtorId: randomField(),
  sellerId: randomField(),
  invoiceNo: 1001n,
  amount: 230_000n,
  dueDate: 1_797_811_200n,
  salt: randomField(),
  ...o,
});

/** Seals a record exactly as the `sealRecord` circuit does, so the codec is tested end to end. */
function sealed(inv: Invoice, holderTag: bigint, disclosurePk: Point, e = randomScalar()) {
  const S = pureCircuits.mulPoint(disclosurePk, e);
  return {
    record: {
      recordId: hex(pureCircuits.recordIdOf(pureCircuits.nullifierOf(inv), pureCircuits.pubKeyOf(e))),
      version: CIPHER_VERSION,
      E: pureCircuits.pubKeyOf(e),
      ct: sealFields(packRecordFields(inv, holderTag), S),
    },
    S,
  };
}

describe('field packing', () => {
  it('packs invoiceNo, amount and dueDate exactly as the circuit does, at the Uint<64> maximum', () => {
    for (const [no, amount, due] of [
      [0n, 0n, 0n],
      [1001n, 230_000n, 1_797_811_200n],
      [MAX64, MAX64, MAX64],
      [MAX64, 0n, MAX64 - 1n],
    ] as Array<[bigint, bigint, bigint]>) {
      const packed = packFields(no, amount, due);
      expect(packed).toBe(pureCircuits.packFields(no, amount, due));
      expect(unpackFields(packed)).toEqual({ invoiceNo: no, amount, dueDate: due });
    }
  });

  it('round-trips the five record fields at maximum values', () => {
    const inv = invoice({ invoiceNo: MAX64, amount: MAX64, dueDate: MAX64, salt: FIELD_MODULUS - 1n });
    const holderTag = FIELD_MODULUS - 2n;
    const fields = packRecordFields(inv, holderTag);
    expect(fields).toHaveLength(5);
    expect(unpackRecordFields(fields)).toEqual({ invoice: inv, holderTag });
  });

  it('refuses to pack values that do not fit Uint<64>', () => {
    expect(() => packFields(1n << 64n, 0n, 0n)).toThrow(/Uint<64>/);
    expect(() => packFields(0n, -1n, 0n)).toThrow(/Uint<64>/);
  });
});

describe('record decryption', () => {
  it('opens a sealed record back to the invoice and holder tag', () => {
    const disclosureSk = randomScalar();
    const inv = invoice();
    const holderTag = randomField();
    const { record, S } = sealed(inv, holderTag, pureCircuits.pubKeyOf(disclosureSk));

    expect(record.ct).not.toContain(inv.debtorId);
    const opened = decryptRecord(record, S);
    expect(opened.invoice).toEqual(inv);
    expect(opened.holderTag).toBe(holderTag);
  });

  it('recovers the shared secret from the record ephemeral and the disclosure key', () => {
    const disclosureSk = randomScalar();
    const inv = invoice();
    const { record, S } = sealed(inv, 7n, pureCircuits.pubKeyOf(disclosureSk));
    expect(pureCircuits.mulPoint(record.E, disclosureSk)).toEqual(S);
    expect(decryptRecord(record, pureCircuits.mulPoint(record.E, disclosureSk)).invoice).toEqual(inv);
  });

  it('a wrong key yields plaintext that does not verify', () => {
    const inv = invoice();
    const { record } = sealed(inv, 7n, pureCircuits.pubKeyOf(randomScalar()));
    const wrong = pureCircuits.mulPoint(record.E, randomScalar());
    const opened = decryptRecord(record, wrong);
    expect(opened.invoice).not.toEqual(inv);
    expect(verifyDisclosure(opened, pureCircuits.nullifierOf(inv)).verified).toBe(false);
  });

  it('refuses a record sealed under an unknown cipher version', () => {
    const { record, S } = sealed(invoice(), 7n, pureCircuits.pubKeyOf(randomScalar()));
    expect(CIPHER_VERSION).toBe(Number(pureCircuits.cipherVersion()));
    expect(() => decryptRecord({ ...record, version: CIPHER_VERSION + 1 }, S)).toThrow(CipherVersionError);
    expect(() => decryptRecord({ ...record, version: CIPHER_VERSION }, S)).not.toThrow();
  });
});

describe('threshold recovery', () => {
  const disclosureSk = randomScalar();
  const disclosurePk = pureCircuits.pubKeyOf(disclosureSk);
  const shares = splitSecret(disclosureSk, 2, 3);

  it('any two keyholder shares recover the shared secret; one does not', () => {
    const inv = invoice();
    const { record, S } = sealed(inv, 11n, disclosurePk);
    const D = (i: 0 | 1 | 2) => ({ index: shares[i]!.index, D: pureCircuits.mulPoint(record.E, shares[i]!.value) });

    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as Array<[0 | 1 | 2, 0 | 1 | 2]>) {
      expect(recoverSharedSecret([D(a), D(b)])).toEqual(S);
    }
    expect(recoverSharedSecret([D(0)])).not.toEqual(S);
    expect(verifyDisclosure(decryptRecord(record, recoverSharedSecret([D(0)])), pureCircuits.nullifierOf(inv)).verified).toBe(
      false,
    );
  });

  it('opens a share sealed to the auditor key and refuses an unknown version', () => {
    const auditorSk = randomScalar();
    const e2 = randomScalar();
    const D = pureCircuits.mulPoint(pureCircuits.pubKeyOf(randomScalar()), shares[0]!.value);
    const S2 = pureCircuits.mulPoint(pureCircuits.pubKeyOf(auditorSk), e2);
    const share = {
      shareKey: 'unused',
      version: CIPHER_VERSION,
      E2: pureCircuits.pubKeyOf(e2),
      ct: sealFields([D.x, D.y], S2),
    };
    expect(decryptShare(share, auditorSk)).toEqual(D);
    expect(decryptShare(share, randomScalar())).not.toEqual(D);
    expect(() => decryptShare({ ...share, version: 99 }, auditorSk)).toThrow(CipherVersionError);
  });
});

describe('self-verifying disclosure', () => {
  it('recomputes the fingerprint and nullifier of an opened record', () => {
    const inv = invoice();
    const { record, S } = sealed(inv, 3n, pureCircuits.pubKeyOf(randomScalar()));
    const check = verifyDisclosure(decryptRecord(record, S), pureCircuits.nullifierOf(inv));
    expect(check.verified).toBe(true);
    expect(check.nullifier).toBe(hex(pureCircuits.nullifierOf(inv)));
    expect(check.fingerprint).toBe(hex(pureCircuits.fingerprint(inv)));
  });

  it('reports a mismatch against another invoice instead of throwing', () => {
    const inv = invoice();
    const { record, S } = sealed(inv, 3n, pureCircuits.pubKeyOf(randomScalar()));
    const other = pureCircuits.nullifierOf(invoice({ invoiceNo: 2002n }));
    expect(verifyDisclosure(decryptRecord(record, S), other)).toMatchObject({ verified: false, reason: 'MISMATCH' });
  });

  it('reports malformed plaintext instead of throwing when the fields overflow Uint<64>', () => {
    const check = verifyDisclosure(
      { invoice: invoice({ amount: FIELD_MODULUS - 1n }) },
      pureCircuits.nullifierOf(invoice()),
    );
    expect(check).toMatchObject({ verified: false, reason: 'MALFORMED' });
  });
});
