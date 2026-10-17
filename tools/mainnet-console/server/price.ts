// SPDX-License-Identifier: Apache-2.0
//
// What the deployment costs, before anything is signed — asked of the node, not of a model.
//
// The first version of this file priced locally with `Transaction.fees(LedgerParameters)` and
// `LedgerParameters.initialParameters()`, because no RPC appeared to serve the live set. It
// produced 4.61 DUST for the deploy and 15.70 for all eleven, and on that basis the console
// started refusing to run against a wallet holding 1 DUST.
//
// That was wrong by about four orders of magnitude, and the mistake is worth naming precisely:
// `initialParameters()` is the ledger's *baseline*, mainnet does not run it, and the guess that
// live parameters could only be more expensive than the baseline was an assumption dressed up
// as a caveat. The runtime does serve the live set, through
// `midnightRuntimeApi.getLedgerParameters`, and it serves something better still —
// `getTransactionCost`, the node's own price for exact bytes. Against those, the same deploy
// costs **0.000717 DUST** and all eleven **0.002008 DUST**.
//
// So the number now comes from the node. The committed preview deployment still supplies the
// bytes, because it is the same eleven transactions with real verifier keys and real
// transcripts; only the pricing moved. If the node cannot be asked, this reports that it does
// not know, which is the honest answer and the one that does not block a deployment.

import { transactionCost } from './submit.js';

const PREVIEW_INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';

/** 1 DUST = 10^15 SPECK, as `sdk/src/backend/indexer.ts` defines it. */
const SPECK_PER_DUST = 1_000_000_000_000_000n;

const fromHex = (text: string): Uint8Array => {
  const body = text.startsWith('0x') ? text.slice(2) : text;
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * The raw ledger bytes of each transaction, five at a time.
 *
 * The same aliased query `fetchRawTransactions` uses, and the same batch size: raw bytes are
 * the heaviest thing the indexer serves and it enforces a complexity limit.
 */
async function fetchRaw(indexerUrl: string, identifiers: readonly string[]): Promise<Map<string, string>> {
  const raws = new Map<string, string>();
  const unique = [...new Set(identifiers)].filter((id) => id !== '');
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5);
    const query = `{ ${batch
      .map((id, n) => `a${n}: transactions(offset: {identifier: ${JSON.stringify(id)}}) { raw }`)
      .join(' ')} }`;
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`the preview indexer answered ${response.status}`);
    const body = (await response.json()) as {
      data?: Record<string, Array<{ raw?: string }>>;
      errors?: Array<{ message: string }>;
    };
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
    batch.forEach((id, n) => {
      const raw = body.data?.[`a${n}`]?.[0]?.raw;
      if (raw) raws.set(id, raw);
    });
  }
  return raws;
}

export interface PricedDeployment {
  /** SPECK the deploy transaction alone would cost. */
  deploySpeck: bigint;
  /** SPECK for all eleven, deploy plus the ten verifier-key inserts. */
  totalSpeck: bigint;
  transactions: number;
  /** Bytes of the deploy transaction, for the record. */
  deployBytes: number;
}

export const toDust = (speck: bigint): string => {
  const whole = speck / SPECK_PER_DUST;
  return `${whole}.${(speck % SPECK_PER_DUST).toString().padStart(15, '0').slice(0, 6)}`;
};

let cached: Promise<PricedDeployment> | undefined;

/**
 * Prices the staged deployment. Cached: the bytes are ~100 kB and the answer does not move
 * within a run of the server.
 */
export function priceDeployment(repoRoot: string, rpcUrl: string): Promise<PricedDeployment> {
  cached ??= computePrice(repoRoot, rpcUrl).catch((error: unknown) => {
    cached = undefined; // a transient indexer failure should not poison the rest of the session
    throw error;
  });
  return cached;
}

async function computePrice(repoRoot: string, rpcUrl: string): Promise<PricedDeployment> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const deployment = JSON.parse(
    readFileSync(join(repoRoot, 'cli', 'deployments', 'preview.json'), 'utf8'),
  ) as { deployTx: string; maintenanceTxs: Array<{ txId: string }> };

  const ids = [deployment.deployTx, ...deployment.maintenanceTxs.map((t) => t.txId)].filter(Boolean);
  const raws = await fetchRaw(PREVIEW_INDEXER, ids);

  let totalSpeck = 0n;
  let deploySpeck = 0n;
  let deployBytes = 0;
  let priced = 0;
  for (const [index, id] of ids.entries()) {
    const raw = raws.get(id);
    if (raw === undefined) continue;
    const bytes = fromHex(raw.startsWith('0x') ? raw.slice(2) : raw);
    const quoted = await transactionCost(raw, rpcUrl);
    if (quoted.speck === undefined) {
      throw new Error(`the node would not price transaction ${index + 1}: ${quoted.error ?? 'no reason given'}`);
    }
    const fee = quoted.speck;
    totalSpeck += fee;
    priced += 1;
    if (index === 0) {
      deploySpeck = fee;
      deployBytes = bytes.length;
    }
  }
  if (priced === 0) throw new Error('the preview indexer served no raw bytes, so nothing could be priced');
  return { deploySpeck, totalSpeck, transactions: priced, deployBytes };
}
