// SPDX-License-Identifier: Apache-2.0
//
// The disclosure key ceremony, run in this tab.
//
// It is the same code `npm run -w cli ceremony` runs — `runDisclosureCeremony` and
// `checkCeremony` out of the SDK — and it produces the same `cli/.secrets/mainnet-keys.json`.
// It touches no wallet and raises no prompt: nothing here goes on chain. What it produces is
// the one key the registry cannot recreate later, and the deploy transaction seals its public
// half into the contract, so it has to exist before the first prompt.
//
// The dealer's master secret is discarded here exactly as it is in the CLI: it is never
// assigned to anything that leaves this function, and the only defence against a dishonest
// dealer is that the output is checkable — every share against its public key, and every pair
// of public shares Lagrange-interpolating back to the disclosure key. Both checks run, and a
// failure writes nothing.
import {
  checkCeremony,
  generateAuditorKey,
  generatePersona,
  hex,
  NATIVE_TOKEN_COLOR,
  runDisclosureCeremony,
  type CeremonyCheck,
} from '@stockandfoil/sdk';
import { pureCircuits } from '@stockandfoil/contract';
import { COMPACT_VERSION, pointToJson, THRESHOLD, type KeysFile } from '../../../../cli/src/records.js';
import { putKeysFile } from './api.js';

export interface CeremonyResult {
  file: KeysFile;
  check: CeremonyCheck;
  writtenTo: string;
}

export async function runCeremony(force = false): Promise<CeremonyResult> {
  const ceremony = runDisclosureCeremony();
  const check = checkCeremony(ceremony);
  if (!check.ok) {
    throw new Error('the disclosure key ceremony failed its consistency check; nothing was written');
  }

  const operator = generatePersona('operator');
  const auditor = generateAuditorKey();
  const auditorPersona = generatePersona('auditor', auditor.scalar);
  const keyholderPersonas = ceremony.shares.map((s) => generatePersona('keyholder', s.value));

  const file: KeysFile = {
    network: 'mainnet',
    createdAt: new Date().toISOString(),
    compactVersion: COMPACT_VERSION,
    threshold: THRESHOLD,
    publicMaterial: {
      operatorId: hex(pureCircuits.operatorIdOf(operator.secretKey)),
      disclosurePk: pointToJson(ceremony.disclosurePk),
      keyholderPks: ceremony.keyholderPks.map(pointToJson) as KeysFile['publicMaterial']['keyholderPks'],
      auditorPk: pointToJson(auditor.publicKey),
      settlementColor: hex(NATIVE_TOKEN_COLOR),
    },
    secrets: {
      operatorSk: hex(operator.secretKey),
      auditorSk: hex(auditorPersona.secretKey),
      auditorScalar: auditor.scalar.toString(),
      keyholders: ceremony.shares.map((share, i) => ({
        index: share.index,
        share: share.value.toString(),
        secretKey: hex(keyholderPersonas[i]!.secretKey),
      })),
    },
  };

  const { written } = await putKeysFile(file, force);
  return { file, check, writtenTo: written };
}
