// SPDX-License-Identifier: Apache-2.0
//
// Arithmetic over the Jubjub prime-order subgroup scalar field and 2-of-3 Shamir
// sharing of the registry disclosure key. Curve points are never handled here:
// point multiplication goes through the contract's pure circuits so on-chain and
// off-chain maths are identical.

/** Order of the Jubjub prime-order subgroup (scalars live modulo this). */
export const JUBJUB_ORDER = 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

/** BLS12-381 scalar field modulus (Compact `Field`). */
export const FIELD_MODULUS = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

export interface Share {
  index: 1 | 2 | 3;
  value: bigint;
}

export const modL = (x: bigint): bigint => ((x % JUBJUB_ORDER) + JUBJUB_ORDER) % JUBJUB_ORDER;

export function invL(a: bigint): bigint {
  let r0 = modL(a);
  let r1 = JUBJUB_ORDER;
  let s0 = 1n;
  let s1 = 0n;
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error('not invertible');
  return modL(s0);
}

const bytesToBigint = (bytes: Uint8Array): bigint => bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);

export const randomBytes32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

/** Uniform scalar in [1, JUBJUB_ORDER). */
export function randomScalar(): bigint {
  for (;;) {
    const x = bytesToBigint(randomBytes32()) & ((1n << 252n) - 1n);
    if (x > 0n && x < JUBJUB_ORDER) return x;
  }
}

/** Uniform field element in [0, FIELD_MODULUS). */
export function randomField(): bigint {
  for (;;) {
    const x = bytesToBigint(randomBytes32()) & ((1n << 255n) - 1n);
    if (x < FIELD_MODULUS) return x;
  }
}

/** Degree-1 polynomial f(x) = secret + a1·x; share i is f(i). Any two shares recover the secret. */
export function splitSecret(secret: bigint, threshold: 2, holders: 3): Share[] {
  if (threshold !== 2 || holders !== 3) throw new Error('only 2-of-3 sharing is supported');
  const a1 = randomScalar();
  return ([1, 2, 3] as const).map((index) => ({ index, value: modL(secret + a1 * BigInt(index)) }));
}

/** Lagrange coefficients for interpolating at x = 0, in the order of `indices`. */
export function lagrangeAtZero(indices: number[]): bigint[] {
  return indices.map((i) =>
    indices
      .filter((j) => j !== i)
      .reduce((acc, j) => modL(acc * BigInt(j) * invL(BigInt(j - i))), 1n),
  );
}

/** Scalar recombination. Production code combines decryption shares (points), never the key itself. */
export function combineShares(shares: Share[]): bigint {
  const lambdas = lagrangeAtZero(shares.map((s) => s.index));
  return shares.reduce((acc, s, k) => modL(acc + lambdas[k]! * s.value), 0n);
}
