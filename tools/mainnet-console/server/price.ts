// SPDX-License-Identifier: Apache-2.0
//
// What the deployment costs, before anything is signed.
//
// The first two mainnet attempts both ended with the transaction never landing, and the reason
// turned out to be the one number nobody had: the price. Preview charges 1 SPECK per
// transaction, which `docs/MAINNET.md` already warned "is a guide to nothing except that the
// code works", and that figure quietly stood in for an estimate it was never capable of being.
//
// This prices the real thing. The committed preview deployment is the same eleven
// transactions, with real verifier keys and real transcripts, and the indexer serves their raw
// bytes; `Transaction.fees()` is the ledger's own cost function. It is the method
// `cli/src/estimate.ts` uses, minus the wallet — `estimate` opens one on the target network to
// read its live parameters, and there is no mainnet wallet here.
//
// The honest limit, stated wherever the number is shown: this is the ledger's **baseline**
// parameter set, not mainnet's live one. There is no RPC that serves the live parameters —
// they live inside the ledger state and the node exposes only its root hash. Live fees float
// with block fullness, and they float *upward* from this floor, so a shortfall measured here
// is a shortfall, while a surplus is not a guarantee.
//
// Nothing is imported from `@stockandfoil/sdk` here, and that is deliberate rather than
// stylistic: this module is reached from the Vite config, whose bundler leaves bare specifiers
// external, and the SDK is TypeScript source that Node cannot then load. The two helpers it
// would have supplied are four lines each, and the query is the one `fetchRawTransactions`
// sends. (`cli/src/records.ts` solves the same problem by being type-only.)

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
export function priceDeployment(repoRoot: string): Promise<PricedDeployment> {
  cached ??= computePrice(repoRoot).catch((error: unknown) => {
    cached = undefined; // a transient indexer failure should not poison the rest of the session
    throw error;
  });
  return cached;
}

async function computePrice(repoRoot: string): Promise<PricedDeployment> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const deployment = JSON.parse(
    readFileSync(join(repoRoot, 'cli', 'deployments', 'preview.json'), 'utf8'),
  ) as { deployTx: string; maintenanceTxs: Array<{ txId: string }> };

  const ids = [deployment.deployTx, ...deployment.maintenanceTxs.map((t) => t.txId)].filter(Boolean);
  const raws = await fetchRaw(PREVIEW_INDEXER, ids);

  const { Transaction } = await import('@midnight-ntwrk/midnight-js-protocol/ledger');
  const { LedgerParameters } = await import('@midnight-ntwrk/ledger-v8');
  const params = LedgerParameters.initialParameters();

  let totalSpeck = 0n;
  let deploySpeck = 0n;
  let deployBytes = 0;
  let priced = 0;
  for (const [index, id] of ids.entries()) {
    const raw = raws.get(id);
    if (raw === undefined) continue;
    const bytes = fromHex(raw.startsWith('0x') ? raw.slice(2) : raw);
    const tx = Transaction.deserialize('signature', 'proof', 'binding', bytes) as unknown as {
      fees(p: unknown): bigint;
    };
    const fee = tx.fees(params);
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
