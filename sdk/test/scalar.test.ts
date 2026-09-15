// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  FIELD_MODULUS,
  JUBJUB_ORDER,
  combineShares,
  invL,
  lagrangeAtZero,
  modL,
  randomField,
  randomScalar,
  splitSecret,
} from '../src/crypto/scalar.js';

describe('Jubjub scalar field', () => {
  it('inverts every non-zero element', () => {
    for (let i = 0; i < 100; i++) {
      const a = randomScalar();
      expect(modL(invL(a) * a)).toBe(1n);
    }
  });

  it('refuses to invert zero', () => {
    expect(() => invL(0n)).toThrow('not invertible');
  });

  it('reduces negatives into range', () => {
    expect(modL(-1n)).toBe(JUBJUB_ORDER - 1n);
  });

  it('samples scalars in [1, l) and fields in [0, p)', () => {
    for (let i = 0; i < 200; i++) {
      const s = randomScalar();
      expect(s > 0n && s < JUBJUB_ORDER).toBe(true);
      const f = randomField();
      expect(f >= 0n && f < FIELD_MODULUS).toBe(true);
    }
  });
});

describe('2-of-3 secret sharing', () => {
  it('computes Lagrange coefficients at zero', () => {
    expect(lagrangeAtZero([1, 2])).toEqual([2n, JUBJUB_ORDER - 1n]);
  });

  it('recovers the secret from every pair of shares', () => {
    const secret = randomScalar();
    const shares = splitSecret(secret, 2, 3);
    expect(shares.map((s) => s.index)).toEqual([1, 2, 3]);
    const pairs: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    for (const [a, b] of pairs) {
      expect(combineShares([shares[a]!, shares[b]!])).toBe(secret);
    }
  });

  it('does not recover the secret from a single share', () => {
    const secret = randomScalar();
    const [first] = splitSecret(secret, 2, 3);
    expect(combineShares([first!])).not.toBe(secret);
  });
});
