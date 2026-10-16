// SPDX-License-Identifier: Apache-2.0
//
// The evidence file, assembled exactly as `cli/src/scenario.ts` assembles it — same function
// for the ledger projection, same anchor resolution, same summary arithmetic, same file name
// pattern — so `npm run -w cli verify -- --network mainnet` and `npm run -w cli proof` read what
// this console wrote without knowing a browser was involved.
import { formatDust, resolveTransactions, type NetworkBackend } from '@stockandfoil/sdk';
import {
  anchorToJson,
  COMPACT_VERSION,
  explorerFor,
  serializeLedgerView,
  type DeploymentFile,
  type EvidenceFile,
  type StepRecord,
} from '../../../../cli/src/records.js';
import { writeEvidence } from './api.js';
import type { ConsoleSession } from './session.js';
import type { LifecycleState } from './state.js';

export interface EvidenceInput {
  session: ConsoleSession;
  backend: NetworkBackend;
  deployment: DeploymentFile;
  lifecycle: LifecycleState;
  startedAt: string;
}

export async function buildEvidence(input: EvidenceInput): Promise<EvidenceFile> {
  const { session, backend, deployment, lifecycle } = input;
  const finalState = serializeLedgerView(await backend.publicState());

  // Explorers index by transaction hash and midnight-js reports identifiers; the indexer maps
  // one to the other, so every transaction here carries both.
  const deployIds = [deployment.deployTx, ...deployment.maintenanceTxs.map((t) => t.txId)].filter(Boolean);
  const stepIds = lifecycle.steps.map((s) => s.txId).filter((id): id is string => id !== undefined);
  const anchors = await resolveTransactions(session.endpoints.indexerHttpUrl, [...deployIds, ...stepIds]);

  const steps: StepRecord[] = lifecycle.steps.map((step) => {
    const anchor = step.txId === undefined ? undefined : anchors.get(step.txId);
    return anchor === undefined
      ? step
      : {
          ...step,
          txHash: anchor.txHash,
          blockHeight: anchor.blockHeight ?? step.blockHeight,
          blockHash: anchor.blockHash,
          blockTimestamp: anchor.blockTimestamp,
          feeSpeck: anchor.feeSpeck?.toString(),
        };
  });

  // What the run cost, read back from the chain. Every SPECK of it was paid by 1AM's pool, not
  // by the signing wallet, which is the claim the zero DUST reading on the connect panel makes.
  const totalFeeSpeck = steps.reduce((sum, s) => sum + BigInt(s.feeSpeck ?? '0'), 0n);
  const heights = steps.map((s) => s.blockHeight).filter((h): h is number => h !== undefined);

  return {
    project: 'Stock & Foil',
    network: 'mainnet',
    contractAddress: deployment.contractAddress,
    compactVersion: COMPACT_VERSION,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    explorer: deployment.explorer ?? explorerFor('mainnet'),
    deployment: {
      deployTx: anchorToJson(anchors.get(deployment.deployTx) ?? { identifier: deployment.deployTx }),
      maintenanceTxs: deployment.maintenanceTxs.map((t) => ({
        circuit: t.circuit,
        ...anchorToJson(anchors.get(t.txId) ?? { identifier: t.txId }),
      })),
    },
    steps,
    summary: {
      steps: steps.length,
      transactions: steps.filter((s) => s.txId).length,
      refusals: steps
        .filter((s) => s.refused)
        .map((s) => ({ id: s.id, label: s.label, circuit: s.circuit, code: s.refused! })),
      firstBlockHeight: heights.length > 0 ? Math.min(...heights) : undefined,
      lastBlockHeight: heights.length > 0 ? Math.max(...heights) : undefined,
      totalDurationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
      totalFeeSpeck: totalFeeSpeck.toString(),
      totalFeeDust: formatDust(totalFeeSpeck),
    },
    disclosure: lifecycle.disclosure,
    finalState,
  };
}

/** Builds the evidence and writes it to `cli/evidence/mainnet-<timestamp>.json`. */
export async function writeRunEvidence(
  input: EvidenceInput,
): Promise<{ file: EvidenceFile; writtenTo: string; supersedes?: string }> {
  const file = await buildEvidence(input);
  // The server checks the shape and will not overwrite an existing file; a refusal here means
  // nothing was written, and the run state still holds everything needed to try again.
  const result = await writeEvidence(file);
  return { file, writtenTo: result.written, supersedes: result.supersedes };
}
