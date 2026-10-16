// SPDX-License-Identifier: Apache-2.0
//
// What a deployment record and an evidence file must contain before they are allowed onto disk.
//
// These two files are the proof. `verify` reads them back against the chain and `proof` turns
// them into PROOF.md, so a truncated or half-built one is worse than none at all: it is a
// claim about mainnet that nobody can check and that we would publish anyway. The page builds
// them, and the page is a browser tab that can be closed mid-`fetch` — so the server checks the
// shape rather than trusting the sender, and refuses the write instead of saving something it
// cannot vouch for.
//
// The checks are structural, not semantic: they establish that every field `cli/src/records.ts`
// declares is present and of the right type and that the obvious invariants hold. Whether the
// transactions really happened is `verify`'s job, against the chain.
import type { DeploymentFile, EvidenceFile } from '../../../cli/src/records.js';

export class InvalidRecord extends Error {
  constructor(what: string, problems: readonly string[]) {
    super(`this ${what} was not written because it is not a complete record: ${problems.join('; ')}`);
    this.name = 'InvalidRecord';
  }
}

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

class Problems {
  readonly list: string[] = [];

  str(bag: Bag, key: string, path = key): string | undefined {
    const value = bag[key];
    if (typeof value !== 'string' || value === '') {
      this.list.push(`${path} must be a non-empty string`);
      return undefined;
    }
    return value;
  }

  num(bag: Bag, key: string, path = key): void {
    if (typeof bag[key] !== 'number' || !Number.isFinite(bag[key])) this.list.push(`${path} must be a number`);
  }

  bag(bag: Bag, key: string, path = key): Bag | undefined {
    const value = bag[key];
    if (!isBag(value)) {
      this.list.push(`${path} must be an object`);
      return undefined;
    }
    return value;
  }

  array(bag: Bag, key: string, path = key): unknown[] | undefined {
    const value = bag[key];
    if (!Array.isArray(value)) {
      this.list.push(`${path} must be an array`);
      return undefined;
    }
    return value;
  }

  point(value: unknown, path: string): void {
    if (!isBag(value) || typeof value['x'] !== 'string' || typeof value['y'] !== 'string') {
      this.list.push(`${path} must be a point with decimal-string x and y`);
    }
  }
}

const HEX32 = /^[0-9a-f]{64}$/;

/**
 * A deployment record.
 *
 * `maintenanceTxs` has to carry an id for every circuit it names: a record with an empty id is
 * exactly the shape an interrupted run produces, and writing it would say a verifier key is on
 * chain when nobody knows whether it is.
 */
export function assertDeployment(value: unknown): asserts value is DeploymentFile {
  const p = new Problems();
  if (!isBag(value)) throw new InvalidRecord('deployment record', ['it is not an object']);

  if (value['network'] !== 'mainnet') p.list.push('network must be "mainnet"');
  const address = p.str(value, 'contractAddress');
  if (address !== undefined && !HEX32.test(address)) {
    p.list.push('contractAddress must be 32 bytes of lower-case hex');
  }
  p.str(value, 'deployTx');
  p.str(value, 'deployedAt');
  p.str(value, 'compactVersion');
  p.str(value, 'settlementColor');
  p.point(value['disclosurePk'], 'disclosurePk');
  p.point(value['auditorPk'], 'auditorPk');

  const keyholders = p.array(value, 'keyholderPks');
  if (keyholders && keyholders.length !== 3) p.list.push('keyholderPks must hold exactly 3 points');
  keyholders?.forEach((pk, i) => p.point(pk, `keyholderPks[${i}]`));

  const maintenance = p.array(value, 'maintenanceTxs');
  maintenance?.forEach((entry, i) => {
    if (!isBag(entry)) {
      p.list.push(`maintenanceTxs[${i}] must be an object`);
      return;
    }
    p.str(entry, 'circuit', `maintenanceTxs[${i}].circuit`);
    const txId = p.str(entry, 'txId', `maintenanceTxs[${i}].txId`);
    if (txId === undefined) {
      p.list.push(
        `maintenanceTxs[${i}] (${String(entry['circuit'])}) has no transaction id, so this run did ` +
          'not finish inserting its verifier keys',
      );
    }
  });

  if (p.list.length > 0) throw new InvalidRecord('deployment record', p.list);
}

/** An evidence file: the deployment anchors, the steps, the summary and the final ledger view. */
export function assertEvidence(value: unknown): asserts value is EvidenceFile {
  const p = new Problems();
  if (!isBag(value)) throw new InvalidRecord('evidence file', ['it is not an object']);

  p.str(value, 'project');
  if (value['network'] !== 'mainnet') p.list.push('network must be "mainnet"');
  p.str(value, 'contractAddress');
  p.str(value, 'compactVersion');
  p.str(value, 'startedAt');
  p.str(value, 'finishedAt');

  const deployment = p.bag(value, 'deployment');
  if (deployment) {
    const deployTx = p.bag(deployment, 'deployTx', 'deployment.deployTx');
    if (deployTx) p.str(deployTx, 'identifier', 'deployment.deployTx.identifier');
    const maintenance = p.array(deployment, 'maintenanceTxs', 'deployment.maintenanceTxs');
    maintenance?.forEach((entry, i) => {
      if (!isBag(entry)) {
        p.list.push(`deployment.maintenanceTxs[${i}] must be an object`);
        return;
      }
      p.str(entry, 'circuit', `deployment.maintenanceTxs[${i}].circuit`);
      p.str(entry, 'identifier', `deployment.maintenanceTxs[${i}].identifier`);
    });
  }

  const steps = p.array(value, 'steps');
  if (steps !== undefined && steps.length === 0) p.list.push('steps is empty, so there is nothing to attest');
  steps?.forEach((entry, i) => {
    if (!isBag(entry)) {
      p.list.push(`steps[${i}] must be an object`);
      return;
    }
    p.str(entry, 'id', `steps[${i}].id`);
    p.str(entry, 'label', `steps[${i}].label`);
    p.str(entry, 'circuit', `steps[${i}].circuit`);
    p.str(entry, 'persona', `steps[${i}].persona`);
    p.str(entry, 'at', `steps[${i}].at`);
    p.num(entry, 'durationMs', `steps[${i}].durationMs`);
    // A step is either a transaction or a refusal. Neither is a step that did not happen.
    if (typeof entry['txId'] !== 'string' && typeof entry['refused'] !== 'string' && entry['note'] === undefined) {
      p.list.push(`steps[${i}] (${String(entry['id'])}) has neither a transaction id, a refusal nor a note`);
    }
  });

  const summary = p.bag(value, 'summary');
  if (summary) {
    p.num(summary, 'steps', 'summary.steps');
    p.num(summary, 'transactions', 'summary.transactions');
    p.num(summary, 'totalDurationMs', 'summary.totalDurationMs');
    p.array(summary, 'refusals', 'summary.refusals');
    if (steps && typeof summary['steps'] === 'number' && summary['steps'] !== steps.length) {
      p.list.push(`summary.steps says ${String(summary['steps'])} but steps holds ${steps.length}`);
    }
  }

  const finalState = p.bag(value, 'finalState');
  if (finalState) {
    p.bag(finalState, 'counts', 'finalState.counts');
    const config = p.bag(finalState, 'config', 'finalState.config');
    if (config) {
      p.str(config, 'operatorId', 'finalState.config.operatorId');
      p.num(config, 'threshold', 'finalState.config.threshold');
    }
    for (const key of ['pledges', 'records', 'certificates', 'requests', 'shares', 'peers', 'cases']) {
      p.array(finalState, key, `finalState.${key}`);
    }
  }

  if (p.list.length > 0) throw new InvalidRecord('evidence file', p.list);
}
