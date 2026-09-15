// SPDX-License-Identifier: Apache-2.0
//
// The setup ceremony. It produces the one key the registry cannot recreate later: the disclosure
// key, split 2-of-3 across keyholders (say the operator, a court and a regulator).
//
// The ceremony is dealer based, so the only defence against a dishonest dealer is that its output
// is checkable: every share must match its published public key, and every *pair* of public
// shares must Lagrange-interpolate back to the registry's disclosure key — the same arithmetic
// the auditor will later run on `D_i = s_i·E`. Both checks run here, in the open, and the master
// secret is discarded the moment they pass. Nothing that follows can reconstruct it.
import { existsSync } from 'node:fs';
import {
  checkCeremony,
  generateAuditorKey,
  generatePersona,
  runDisclosureCeremony,
  hex,
} from '@stockandfoil/sdk';
import { pureCircuits } from '@stockandfoil/contract';
import {
  COMPACT_VERSION,
  ensureDir,
  flagSet,
  heading,
  keysPath,
  pointToJson,
  requireNetwork,
  say,
  SECRETS_DIR,
  settlementColorHex,
  THRESHOLD,
  UsageError,
  writeJson,
  type Args,
  type KeysFile,
} from './common.js';

export async function ceremony(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const path = keysPath(network);
  if (existsSync(path) && !flagSet(args, 'force')) {
    throw new UsageError(
      `${path} already exists. Re-running the ceremony orphans the contract deployed with the old keys; ` +
        'pass --force if that is what you want.',
    );
  }

  heading(`disclosure key ceremony — ${network}`);

  const ceremonyResult = runDisclosureCeremony();
  const check = checkCeremony(ceremonyResult);
  for (const share of check.shares) {
    say(`  share ${share.index}: s_i·G == pk_i  ${share.ok ? 'ok' : 'FAILED'}`);
  }
  for (const pair of check.pairs) {
    say(`  pair (${pair.indices.join(',')}): Σ λ_i·pk_i == disclosurePk  ${pair.ok ? 'ok' : 'FAILED'}`);
  }
  if (!check.ok) throw new Error('the disclosure key ceremony failed its consistency check; nothing was written');

  const operator = generatePersona('operator');
  const auditor = generateAuditorKey();
  const auditorPersona = generatePersona('auditor', auditor.scalar);
  const keyholderPersonas = ceremonyResult.shares.map((s) => generatePersona('keyholder', s.value));

  const file: KeysFile = {
    network,
    createdAt: new Date().toISOString(),
    compactVersion: COMPACT_VERSION,
    threshold: THRESHOLD,
    publicMaterial: {
      operatorId: hex(pureCircuits.operatorIdOf(operator.secretKey)),
      disclosurePk: pointToJson(ceremonyResult.disclosurePk),
      keyholderPks: ceremonyResult.keyholderPks.map(pointToJson) as KeysFile['publicMaterial']['keyholderPks'],
      auditorPk: pointToJson(auditor.publicKey),
      settlementColor: settlementColorHex(),
    },
    secrets: {
      operatorSk: hex(operator.secretKey),
      auditorSk: hex(auditorPersona.secretKey),
      auditorScalar: auditor.scalar.toString(),
      keyholders: ceremonyResult.shares.map((share, i) => ({
        index: share.index,
        share: share.value.toString(),
        secretKey: hex(keyholderPersonas[i]!.secretKey),
      })),
    },
  };

  ensureDir(SECRETS_DIR);
  writeJson(path, file);

  // The dealer's copy goes out of scope here and was never written down.
  heading('public material (sealed into the ledger at deploy)');
  say(`  operatorId      ${file.publicMaterial.operatorId}`);
  say(`  disclosurePk    x=${file.publicMaterial.disclosurePk.x}`);
  say(`                  y=${file.publicMaterial.disclosurePk.y}`);
  file.publicMaterial.keyholderPks.forEach((pk, i) => {
    say(`  keyholderPk[${i}]  x=${pk.x}`);
    say(`                  y=${pk.y}`);
  });
  say(`  auditorPk       x=${file.publicMaterial.auditorPk.x}`);
  say(`                  y=${file.publicMaterial.auditorPk.y}`);
  say(`  settlementColor ${file.publicMaterial.settlementColor} (native token)`);
  say(`  threshold       ${THRESHOLD} of 3`);

  say(`\nsecret shares written to ${path} (gitignored). The master secret was discarded.`);
  say(`next: npm run -w cli deploy -- --network ${network}`);
  return 0;
}
