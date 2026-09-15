// SPDX-License-Identifier: Apache-2.0
//
// Key material: persona secrets and the 2-of-3 disclosure-key ceremony. The ceremony is only
// trustworthy if it can be checked, so every pair of shares must reproduce the registry
// disclosure key before the master secret is discarded.
import { pureCircuits } from '@stockandfoil/contract';
import { describe, expect, it } from 'vitest';
import { hex } from '../src/bytes.js';
import {
  checkCeremony,
  combinePublicShares,
  generateAuditorKey,
  generatePersona,
  generateRegistryKeys,
  runDisclosureCeremony,
} from '../src/crypto/keys.js';
import { JUBJUB_ORDER, modL, randomScalar } from '../src/crypto/scalar.js';

describe('persona secrets', () => {
  it('generates a distinct 32-byte secret per persona', () => {
    const personas = (['operator', 'debtor', 'seller', 'financier'] as const).map((role) => generatePersona(role));
    for (const p of personas) expect(p.secretKey).toHaveLength(32);
    expect(new Set(personas.map((p) => hex(p.secretKey))).size).toBe(personas.length);
    expect(personas[0]!.role).toBe('operator');
    expect(personas[0]!.scalar).toBeUndefined();
  });

  it('gives curve-scalar roles a scalar inside [1, order)', () => {
    for (const role of ['auditor', 'keyholder'] as const) {
      const p = generatePersona(role);
      expect(p.scalar).toBeDefined();
      expect(p.scalar!).toBeGreaterThan(0n);
      expect(p.scalar!).toBeLessThan(JUBJUB_ORDER);
    }
  });

  it('derives the auditor public key the contract will seal', () => {
    const auditor = generateAuditorKey();
    expect(auditor.publicKey).toEqual(pureCircuits.pubKeyOf(auditor.scalar));
  });
});

describe('disclosure key ceremony', () => {
  it('every pair of shares reproduces the registry disclosure key', () => {
    const ceremony = runDisclosureCeremony();
    expect(ceremony.shares).toHaveLength(3);
    expect(ceremony.disclosurePk).toEqual(pureCircuits.pubKeyOf(ceremony.masterSecret));

    ceremony.shares.forEach((share, i) => {
      expect(ceremony.keyholderPks[i]).toEqual(pureCircuits.pubKeyOf(share.value));
    });

    const check = checkCeremony(ceremony);
    expect(check.ok).toBe(true);
    expect(check.pairs).toHaveLength(3);
    expect(check.pairs.map((p) => p.indices)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    for (const pair of check.pairs) expect(pair.ok).toBe(true);
  });

  it('combines public shares the same way the auditor combines decryption shares', () => {
    const ceremony = runDisclosureCeremony();
    expect(combinePublicShares([1, 2], [ceremony.keyholderPks[0], ceremony.keyholderPks[1]])).toEqual(
      ceremony.disclosurePk,
    );
    expect(combinePublicShares([1], [ceremony.keyholderPks[0]])).not.toEqual(ceremony.disclosurePk);
  });

  it('rejects a ceremony whose share was tampered with', () => {
    const ceremony = runDisclosureCeremony();
    const tampered = {
      ...ceremony,
      shares: [ceremony.shares[0], { ...ceremony.shares[1], value: modL(ceremony.shares[1].value + 1n) }, ceremony.shares[2]],
    } as typeof ceremony;
    const check = checkCeremony(tampered);
    expect(check.ok).toBe(false);
    expect(check.shares[1]!.ok).toBe(false);
    expect(check.shares[0]!.ok).toBe(true);
    expect(check.pairs.filter((p) => p.ok).length).toBe(1);
  });

  it('rejects a ceremony whose published key does not match the master secret', () => {
    const ceremony = runDisclosureCeremony();
    const check = checkCeremony({ ...ceremony, disclosurePk: pureCircuits.pubKeyOf(randomScalar()) });
    expect(check.ok).toBe(false);
    expect(check.pairs.every((p) => !p.ok)).toBe(true);
  });
});

describe('registry key material', () => {
  it('produces everything the constructor needs, and nothing it does not', () => {
    const keys = generateRegistryKeys();
    expect(keys.operator.secretKey).toHaveLength(32);
    expect(hex(keys.constructorArgs.operatorId)).toBe(hex(pureCircuits.operatorIdOf(keys.operator.secretKey)));
    expect(keys.constructorArgs.disclosurePk).toEqual(keys.ceremony.disclosurePk);
    expect(keys.constructorArgs.keyholderPks).toEqual(keys.ceremony.keyholderPks);
    expect(keys.constructorArgs.auditorPk).toEqual(keys.auditor.publicKey);
    expect(keys.constructorArgs.settlementColor).toHaveLength(32);
    expect(checkCeremony(keys.ceremony).ok).toBe(true);
    keys.keyholders.forEach((k, i) => {
      expect(k.role).toBe('keyholder');
      expect(k.scalar).toBe(keys.ceremony.shares[i]!.value);
    });
  });
});
