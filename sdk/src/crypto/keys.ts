// SPDX-License-Identifier: Apache-2.0
//
// Key generation for the registry: one 32-byte secret per persona, a Jubjub scalar for the
// auditor, and the 2-of-3 disclosure-key ceremony.
//
// The ceremony is dealer based (a DKG is on the W2 roadmap), so the only defence against a
// dishonest dealer is that the result is checkable: every pair of shares must interpolate back
// to the published disclosure key, exactly the way the auditor will later combine `D_i = s_i·E`
// into `S = sk·E`. Once `checkCeremony` passes, the master secret is discarded.
import { pureCircuits } from '@stockandfoil/contract';
import { NATIVE_TOKEN_COLOR } from '../bytes.js';
import type { Point, Role, StockAndFoilPrivateState } from '../types.js';
import { lagrangeAtZero, randomBytes32, randomScalar, splitSecret, type Share } from './scalar.js';

const SCALAR_ROLES: ReadonlySet<Role> = new Set<Role>(['auditor', 'keyholder']);

/**
 * A fresh persona. Every role holds a 32-byte secret; the auditor and the keyholders also hold a
 * curve scalar, which `createPersona` overwrites with the real key material when there is some.
 */
export function generatePersona(role: Role, scalar?: bigint): StockAndFoilPrivateState {
  const secretKey = randomBytes32();
  const value = scalar ?? (SCALAR_ROLES.has(role) ? randomScalar() : undefined);
  return value === undefined ? { role, secretKey } : { role, secretKey, scalar: value };
}

export interface AuditorKey {
  scalar: bigint;
  publicKey: Point;
}

export function generateAuditorKey(): AuditorKey {
  const scalar = randomScalar();
  return { scalar, publicKey: pureCircuits.pubKeyOf(scalar) };
}

/** The output of the setup ceremony. `masterSecret` exists only to be checked and destroyed. */
export interface DisclosureCeremony {
  masterSecret: bigint;
  disclosurePk: Point;
  shares: [Share, Share, Share];
  keyholderPks: [Point, Point, Point];
}

export function runDisclosureCeremony(): DisclosureCeremony {
  const masterSecret = randomScalar();
  const shares = splitSecret(masterSecret, 2, 3) as [Share, Share, Share];
  return {
    masterSecret,
    disclosurePk: pureCircuits.pubKeyOf(masterSecret),
    shares,
    keyholderPks: shares.map((s) => pureCircuits.pubKeyOf(s.value)) as [Point, Point, Point],
  };
}

/**
 * `Σ λ_i·pk_i` over the given Shamir indices. With a correct sharing any two indices give the
 * disclosure key back, which is the Feldman-style consistency check in point form.
 */
export function combinePublicShares(indices: readonly number[], points: readonly Point[]): Point {
  if (indices.length === 0 || indices.length !== points.length) {
    throw new Error('combinePublicShares needs one point per index');
  }
  const lambdas = lagrangeAtZero([...indices]);
  return points.map((P, k) => pureCircuits.mulPoint(P, lambdas[k]!)).reduce((acc, P) => pureCircuits.addPoints(acc, P));
}

export interface CeremonyCheck {
  ok: boolean;
  /** Each share against its published public key: `s_i·G == pk_i`. */
  shares: Array<{ index: number; ok: boolean }>;
  /** Each pair against the registry key: `λ_i·pk_i + λ_j·pk_j == disclosurePk`. */
  pairs: Array<{ indices: [number, number]; ok: boolean }>;
}

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** Verifies a ceremony the way a keyholder should before accepting its share. */
export function checkCeremony(ceremony: DisclosureCeremony): CeremonyCheck {
  const shares = ceremony.shares.map((share, i) => ({
    index: share.index,
    ok: samePoint(pureCircuits.pubKeyOf(share.value), ceremony.keyholderPks[i]!),
  }));
  const pairs = ([
    [0, 1],
    [0, 2],
    [1, 2],
  ] as Array<[number, number]>).map(([a, b]) => {
    const indices: [number, number] = [ceremony.shares[a]!.index, ceremony.shares[b]!.index];
    const fromShares = combinePublicShares(indices, [
      pureCircuits.pubKeyOf(ceremony.shares[a]!.value),
      pureCircuits.pubKeyOf(ceremony.shares[b]!.value),
    ]);
    return { indices, ok: samePoint(fromShares, ceremony.disclosurePk) };
  });
  return { ok: shares.every((s) => s.ok) && pairs.every((p) => p.ok), shares, pairs };
}

/** Constructor arguments, in the order `Contract.initialState` takes them. */
export interface RegistryConstructorArgs {
  operatorId: Uint8Array;
  disclosurePk: Point;
  keyholderPks: [Point, Point, Point];
  auditorPk: Point;
  settlementColor: Uint8Array;
}

/** Everything one registry deployment needs: personas, ceremony output and constructor arguments. */
export interface RegistryKeys {
  operator: StockAndFoilPrivateState;
  auditor: AuditorKey & { persona: StockAndFoilPrivateState };
  keyholders: [StockAndFoilPrivateState, StockAndFoilPrivateState, StockAndFoilPrivateState];
  ceremony: DisclosureCeremony;
  constructorArgs: RegistryConstructorArgs;
}

export function generateRegistryKeys(options: { settlementColor?: Uint8Array } = {}): RegistryKeys {
  const operator = generatePersona('operator');
  const auditor = generateAuditorKey();
  const ceremony = runDisclosureCeremony();
  const check = checkCeremony(ceremony);
  if (!check.ok) throw new Error('disclosure key ceremony failed its consistency check');
  return {
    operator,
    auditor: { ...auditor, persona: generatePersona('auditor', auditor.scalar) },
    keyholders: ceremony.shares.map((s) => generatePersona('keyholder', s.value)) as RegistryKeys['keyholders'],
    ceremony,
    constructorArgs: {
      operatorId: pureCircuits.operatorIdOf(operator.secretKey),
      disclosurePk: ceremony.disclosurePk,
      keyholderPks: ceremony.keyholderPks,
      auditorPk: auditor.publicKey,
      settlementColor: options.settlementColor ?? NATIVE_TOKEN_COLOR,
    },
  };
}
