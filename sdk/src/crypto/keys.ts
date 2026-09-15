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
import type { Point, RegistryConfig, Role, StockAndFoilPrivateState } from '../types.js';
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

// ---------------------------------------------------------------------------------------------
// Checking a registry somebody else deployed

/** What is wrong with a registry's sealed keys, if anything. */
export interface RegistryConfigCheck {
  ok: boolean;
  /** One line per broken property, in the order they were checked. */
  problems: string[];
}

const IDENTITY: Point = { x: 0n, y: 1n };

/**
 * Checks the sealed keys of a *deployed* registry, from the public ledger view alone.
 *
 * Every confidentiality claim the product makes rests on the setup ceremony, and a wrong ceremony
 * is silent: with a degenerate or duplicated key one party can open every record on its own, and
 * with an inconsistent sharing no two keyholders can ever open one — which is only discovered
 * when an investigation needs it. The contract refuses such a deployment (`BAD_DISCLOSURE_KEY`,
 * `BAD_AUDITOR_KEY`, `BAD_KEYHOLDER_KEY`, `BAD_KEY_SHARING`), and this is the same check any
 * participant can run before trusting a registry they did not deploy.
 */
export function verifyRegistryConfig(
  config: Pick<RegistryConfig, 'disclosurePk' | 'keyholderPks' | 'auditorPk'>,
): RegistryConfigCheck {
  const { disclosurePk, keyholderPks, auditorPk } = config;
  const problems: string[] = [];
  const at = (i: number): string => `keyholderPks[${i}]`;

  if (samePoint(disclosurePk, IDENTITY)) problems.push('disclosurePk is the curve identity: every record is readable by anyone');
  if (samePoint(auditorPk, IDENTITY)) problems.push('auditorPk is the curve identity');
  if (samePoint(auditorPk, disclosurePk)) problems.push('auditorPk equals disclosurePk: the auditor alone can open every record');
  keyholderPks.forEach((pk, i) => {
    if (samePoint(pk, IDENTITY)) problems.push(`${at(i)} is the curve identity`);
    if (samePoint(pk, disclosurePk)) problems.push(`${at(i)} equals disclosurePk: that keyholder holds the whole disclosure key`);
    if (samePoint(pk, auditorPk)) problems.push(`${at(i)} equals auditorPk: the auditor counts twice towards the threshold`);
  });

  // Feldman consistency: any two shares must reconstruct the disclosure key in point form.
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as Array<[number, number]>) {
    const combined = safeCombine([a + 1, b + 1], [keyholderPks[a]!, keyholderPks[b]!]);
    if (!combined || !samePoint(combined, disclosurePk)) {
      problems.push(`${at(a)} and ${at(b)} do not reconstruct disclosurePk: the sharing is not a 2-of-3 of this key`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** A malformed point makes `ecMul` throw; that is a failed check, not a crash. */
function safeCombine(indices: number[], points: Point[]): Point | undefined {
  try {
    return combinePublicShares(indices, points);
  } catch {
    return undefined;
  }
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
