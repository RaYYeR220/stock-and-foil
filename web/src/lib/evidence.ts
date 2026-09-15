// SPDX-License-Identifier: Apache-2.0
//
// Deployment and evidence artifacts, read at build time from what the CLI wrote. If the CLI has
// not run, there is nothing here and `/proof` says so — the page never claims a deployment that
// does not exist, never turns a local devnet into a public one, and never claims an audit.
import { moment } from './format.js';

export interface Deployment {
  network: string;
  contractAddress: string;
  deployTx?: string;
  deployedAt?: string;
  settlementColor?: string;
  compactVersion?: string;
  maintenanceTxs?: Array<{ circuit?: string; txId?: string }>;
  /** Explorer bases, when the CLI recorded them; otherwise the defaults below are used. */
  explorer?: { tx?: string; address?: string };
  [key: string]: unknown;
}

export interface EvidenceStep {
  id?: string;
  label: string;
  circuit?: string;
  persona?: string;
  txId?: string;
  blockHeight?: number;
  refused?: string;
  note?: string;
  durationMs?: number;
}

export interface EvidenceDisclosure {
  requestId?: string;
  recordId?: string;
  approvals?: boolean[];
  shamirIndices?: number[];
  recomputedNullifier?: string;
  ledgerNullifier?: string;
  verified: boolean;
}

export interface Evidence {
  file: string;
  network?: string;
  contractAddress?: string;
  compactVersion?: string;
  startedAt?: string;
  finishedAt?: string;
  steps: EvidenceStep[];
  transactions: number;
  refusals: Array<{ label: string; circuit?: string; code: string }>;
  counts: Array<{ label: string; value: number }>;
  disclosure?: EvidenceDisclosure;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/**
 * The CLI writes UTF-8; a run under a Windows console can round-trip an em dash or a curly quote
 * through CP1251 on the way into the file. Repair the handful of sequences that produces rather
 * than printing mojibake on an evidence page.
 */
const MOJIBAKE: Array<[RegExp, string]> = [
  [/вЂ”/g, '—'],
  [/вЂ“/g, '–'],
  [/вЂ™/g, '’'],
  [/вЂњ/g, '“'],
  [/вЂќ/g, '”'],
  [/вЂ¦/g, '…'],
  [/В /g, ' '],
];

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return MOJIBAKE.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), value);
};
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

const deploymentModules = import.meta.glob('../../../cli/deployments/*.json', { eager: true });
const evidenceModules = import.meta.glob('../../../cli/evidence/*.json', { eager: true });

const unwrap = (module: unknown): Record<string, unknown> =>
  asRecord((asRecord(module).default as unknown) ?? module);

export const DEPLOYMENTS: Deployment[] = Object.entries(deploymentModules).flatMap(([path, module]) => {
  const raw = unwrap(module);
  const address = text(raw.contractAddress);
  if (!address) return [];
  const maintenance = Array.isArray(raw.maintenanceTxs) ? raw.maintenanceTxs : [];
  const deployment: Deployment = {
    ...raw,
    network: text(raw.network) ?? path.split('/').pop()?.replace('.json', '') ?? 'unknown',
    contractAddress: address,
    deployTx: text(raw.deployTx),
    deployedAt: text(raw.deployedAt),
    settlementColor: text(raw.settlementColor),
    compactVersion: text(raw.compactVersion),
    maintenanceTxs: maintenance.map((entry) => {
      const m = asRecord(entry);
      return { circuit: text(m.circuit), txId: text(m.txId) };
    }),
    explorer: asRecord(raw.explorer) as Deployment['explorer'],
  };
  return [deployment];
});

export const EVIDENCE: Evidence[] = Object.entries(evidenceModules)
  .flatMap(([path, module]) => {
    const raw = unwrap(module);
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    const summary = asRecord(raw.summary);
    const refusals = Array.isArray(summary.refusals) ? summary.refusals : [];
    const finalState = asRecord(raw.finalState);
    const counts = asRecord(finalState.counts);
    const disclosure = asRecord(raw.disclosure);
    const recomputed = text(disclosure.recomputedNullifier);
    const ledger = text(disclosure.ledgerNullifier);

    const evidence: Evidence = {
      file: path.split('/').pop() ?? path,
      network: text(raw.network),
      contractAddress: text(raw.contractAddress),
      compactVersion: text(raw.compactVersion),
      startedAt: text(raw.startedAt),
      finishedAt: text(raw.finishedAt),
      steps: steps.map((step) => {
        const s = asRecord(step);
        return {
          id: text(s.id),
          label: text(s.label) ?? text(s.circuit) ?? 'step',
          circuit: text(s.circuit),
          persona: text(s.persona),
          txId: text(s.txId),
          blockHeight: num(s.blockHeight),
          refused: text(s.refused),
          note: text(s.note),
          durationMs: num(s.durationMs),
        };
      }),
      transactions: num(summary.transactions) ?? steps.filter((s) => text(asRecord(s).txId)).length,
      refusals: refusals.flatMap((entry) => {
        const r = asRecord(entry);
        const code = text(r.code);
        return code ? [{ label: text(r.label) ?? code, circuit: text(r.circuit), code }] : [];
      }),
      counts: Object.entries(counts).flatMap(([label, value]) =>
        typeof value === 'number' ? [{ label, value }] : [],
      ),
      disclosure:
        recomputed || ledger
          ? {
              requestId: text(disclosure.requestId),
              recordId: text(disclosure.recordId),
              approvals: Array.isArray(disclosure.approvals) ? (disclosure.approvals as boolean[]) : undefined,
              shamirIndices: Array.isArray(disclosure.shamirIndices)
                ? (disclosure.shamirIndices as number[])
                : undefined,
              recomputedNullifier: recomputed,
              ledgerNullifier: ledger,
              verified: Boolean(recomputed) && recomputed === ledger,
            }
          : undefined,
    };
    return [evidence];
  })
  .sort((a, b) => (a.file < b.file ? 1 : -1));

export const hasProof = DEPLOYMENTS.length > 0 || EVIDENCE.length > 0;

/** A local devnet proves the code runs; it does not prove anything anyone else can check. */
export const isLocal = (network: string): boolean => network === 'undeployed' || network === 'local';

/** Deployments a visitor could independently verify. */
export const PUBLIC_DEPLOYMENTS = DEPLOYMENTS.filter((d) => !isLocal(d.network));

const explorerBase = (network: string): string => `https://${network}.midnightexplorer.com`;

export const txUrl = (network: string, txId: string, deployment?: Deployment): string | undefined =>
  isLocal(network) ? undefined : `${deployment?.explorer?.tx ?? `${explorerBase(network)}/transactions`}/${txId}`;

export const addressUrl = (network: string, address: string, deployment?: Deployment): string | undefined =>
  isLocal(network) ? undefined : `${deployment?.explorer?.address ?? `${explorerBase(network)}/contracts`}/${address}`;

export const subscanUrl = (network: string, txId: string): string | undefined =>
  isLocal(network) ? undefined : `https://midnight-${network}.subscan.io/extrinsic/${txId}`;

export const when = (iso: string | undefined): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : moment(BigInt(Math.floor(parsed / 1000)));
};
