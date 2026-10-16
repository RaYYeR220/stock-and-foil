// SPDX-License-Identifier: Apache-2.0
//
// The staged deployment, driven one wallet prompt at a time.
//
// The staging itself is not reimplemented here: it is `NetworkBackend.deploy` in
// `sdk/src/backend/network.ts`, the same function the CLI calls, including its reason for
// existing (a Midnight block caps the bytes one transaction may write, and sixteen verifier
// keys do not fit in a deploy). What this file adds is the two things a hand-driven run needs
// and a scripted one does not: a running account of which transaction is next and why, and a
// resume that carries on with the maintenance transactions that did not land instead of
// putting a second registry on chain.
import {
  CIRCUIT_IDS,
  NetworkBackend,
  resolveTransactions,
  VERIFIER_KEYS_PER_TX,
  type RegistryProviders,
} from '@stockandfoil/sdk';
import {
  COMPACT_VERSION,
  explorerFor,
  type DeploymentFile,
  type PointJson,
} from '../../../../cli/src/records.js';
import { writeDeployment } from './api.js';
import type { ConsoleSession, RegistryKeyMaterial } from './session.js';
import { attribute, ConsoleStop, type ConsoleState, type DeployProgress } from './state.js';

/** Circuits whose verifier key rides in the deploy transaction, and the ones that follow it. */
export const DEPLOY_CIRCUITS = CIRCUIT_IDS.slice(0, VERIFIER_KEYS_PER_TX);
export const MAINTENANCE_CIRCUITS = CIRCUIT_IDS.slice(VERIFIER_KEYS_PER_TX);
export const DEPLOY_TOTAL = 1 + MAINTENANCE_CIRCUITS.length;

export interface DeployTxView {
  index: number;
  total: number;
  title: string;
  why: string;
}

/** What transaction `index` of the staged deployment is, and why it has to be its own transaction. */
export function describeDeployTx(index: number): DeployTxView {
  if (index <= 1) {
    return {
      index: 1,
      total: DEPLOY_TOTAL,
      title: `Deploy: the constructor and ${VERIFIER_KEYS_PER_TX} verifier keys`,
      why:
        `Seals the registry configuration — operator id, disclosure key, the three keyholder keys, ` +
        `the auditor key, the settlement colour — and publishes the verifier keys for ` +
        `${DEPLOY_CIRCUITS.join(', ')}. All sixteen keys in one transaction are refused by the node ` +
        `as exhausting the block limits, so the rest follow as maintenance transactions.`,
    };
  }
  const circuit = MAINTENANCE_CIRCUITS[index - 2];
  return {
    index,
    total: DEPLOY_TOTAL,
    title: `Maintenance: insert the verifier key for ${circuit}`,
    why:
      `Creates the contract's entry point for ${circuit}. Until this lands, a call to that circuit ` +
      `has no verifier key to check it against and cannot be made. Only the deploying wallet can do ` +
      `this: it holds the contract's maintenance authority, whose signing key this console keeps in ` +
      `cli/.secrets/mainnet-console-private-state.json.`,
  };
}

export interface RunDeployOptions {
  session: ConsoleSession;
  keys: RegistryKeyMaterial;
  state: ConsoleState;
  /** Persists the run state; awaited at every point where losing it would cost a transaction. */
  save: (state: ConsoleState) => Promise<void>;
  /** Called before each transaction, with what the operator is about to be asked to approve. */
  onTx: (view: DeployTxView) => void;
}

export interface DeployResult {
  backend: NetworkBackend;
  deployment: DeploymentFile;
  writtenTo: string;
  /** Set when a deployment record already existed, so this one went to a suffixed name. */
  supersedes?: string;
  note?: string;
}

/**
 * Runs or resumes the staged deployment, then writes `cli/deployments/mainnet.json`.
 *
 * Everything that lands is recorded before the next prompt goes up, so an operator who closes
 * the tab after transaction seven resumes at transaction eight.
 */
export async function runStagedDeploy(options: RunDeployOptions): Promise<DeployResult> {
  const { session, keys, state, save, onTx } = options;
  const progress: DeployProgress = state.deploy ?? {
    insertedCircuits: [],
    maintenanceTxIds: {},
    submittedTxIds: [],
  };
  state.deploy = progress;
  progress.lastFailure = undefined;

  // The one state this cannot resolve on its own: a deploy transaction left the wallet and the
  // run died before the contract address came back. Starting again would put a *second*
  // registry on mainnet, so it stops and asks.
  if (progress.deployTxId !== undefined && progress.contractAddress === undefined) {
    throw new ConsoleStop(
      `the deploy transaction ${progress.deployTxId} was submitted, but this console never learned ` +
        'the contract address, so it cannot tell whether a registry exists. Starting again would ' +
        'deploy a second one. Look that transaction up on midnightexplorer.com: if it created a ' +
        'contract, put the address into cli/.secrets/mainnet-console.json as deploy.contractAddress ' +
        'and press Resume; if it did not, clear deploy.deployTxId there and start again.',
    );
  }

  // A unit of work is "landed" the moment the next one is announced, or the whole deploy
  // resolves. Nothing is recorded as done on the strength of having been started.
  let pendingDeploy = progress.contractAddress === undefined;
  let pendingCircuit: string | undefined;
  const commit = (): void => {
    if (pendingDeploy) {
      progress.deployTxId ??= session.submitted[0];
      pendingDeploy = false;
    } else if (pendingCircuit !== undefined) {
      const txId = session.submitted.at(-1);
      if (!progress.insertedCircuits.includes(pendingCircuit)) progress.insertedCircuits.push(pendingCircuit);
      if (txId) progress.maintenanceTxIds[pendingCircuit] = txId;
      pendingCircuit = undefined;
    }
    progress.submittedTxIds = [...session.submitted];
  };

  let backend: NetworkBackend;
  try {
    backend = await NetworkBackend.deploy({
      network: 'mainnet',
      providers: session.providers as RegistryProviders,
      compiledAssetsPath: session.zkBaseUrl,
      endpoints: session.endpoints,
      constructorArgs: keys.constructorArgs,
      operator: keys.operator,
      resume:
        progress.contractAddress === undefined
          ? undefined
          : {
              contractAddress: progress.contractAddress,
              deployTxId: progress.deployTxId,
              insertedCircuits: progress.insertedCircuits,
            },
      onProgress: ({ stage, circuit, index, contractAddress }) => {
        commit();
        if (stage === 'deploy') {
          pendingDeploy = true;
        } else {
          pendingCircuit = circuit;
          if (contractAddress) progress.contractAddress = contractAddress;
        }
        void save(state);
        onTx(describeDeployTx(index));
      },
    });
  } catch (error) {
    commit();
    progress.lastFailure = attribute(error, `deploy-tx-${progress.insertedCircuits.length + 2}`);
    await save(state);
    throw error;
  }

  commit();
  progress.contractAddress = backend.contractAddress;
  progress.deployTxId = backend.deployTxId ?? progress.deployTxId ?? session.submitted[0];
  progress.completedAt = new Date().toISOString();
  await save(state);

  const deployTx = progress.deployTxId;
  if (!deployTx) throw new Error('the deploy transaction produced no transaction id');
  const maintenanceIds = MAINTENANCE_CIRCUITS.map((circuit) => progress.maintenanceTxIds[circuit] ?? '');
  const anchors = await resolveTransactions(session.endpoints.indexerHttpUrl, [deployTx, ...maintenanceIds].filter(Boolean));

  const published = keys.file.publicMaterial;
  const deployment: DeploymentFile = {
    network: 'mainnet',
    contractAddress: backend.contractAddress,
    deployTx,
    deployTxHash: anchors.get(deployTx)?.txHash,
    maintenanceTxs: MAINTENANCE_CIRCUITS.map((circuit, i) => ({
      circuit,
      txId: maintenanceIds[i] ?? '',
      txHash: anchors.get(maintenanceIds[i] ?? '')?.txHash,
    })),
    deployedAt: progress.completedAt,
    keyholderPks: published.keyholderPks as [PointJson, PointJson, PointJson],
    auditorPk: published.auditorPk,
    disclosurePk: published.disclosurePk,
    settlementColor: published.settlementColor,
    compactVersion: COMPACT_VERSION,
    explorer: explorerFor('mainnet'),
  };
  // The server validates the record and refuses to write an incomplete one — which, after
  // eleven transactions that cannot be replayed, has to fail loudly and recoverably rather
  // than quietly. Everything needed to rebuild it is already in the run state.
  try {
    const result = await writeDeployment(deployment);
    return {
      backend,
      deployment,
      writtenTo: result.written,
      supersedes: result.supersedes,
      note: result.note,
    };
  } catch (cause) {
    throw new ConsoleStop(
      `the registry is deployed at ${backend.contractAddress}, but the deployment record was not ` +
        `written: ${cause instanceof Error ? cause.message : String(cause)}. Nothing on chain is ` +
        'lost — cli/.secrets/mainnet-console.json holds every transaction id. Fix the cause and ' +
        'press the button again; the deployment itself will be skipped.',
    );
  }
}
