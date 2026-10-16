// SPDX-License-Identifier: Apache-2.0
//
// Plain GraphQL against the Midnight indexer, for the three things midnight-js's own provider
// does not expose: the chain's current time, what a transaction is called on an explorer, and
// what it cost in DUST.
//
// Two schema facts shape this file.
//
// 1. `Transaction` is an *interface* as of indexer 4.3.x. `RegularTransaction`,
//    `SystemTransaction` and `BridgeClaimTransaction` implement it. `hash` and `block` are on the
//    interface and can be selected directly; `transactionResult` and the fee are not, and need an
//    inline fragment. A bare `{ transactions { fee } }` now fails with
//    `Unknown field "fee" on type "Transaction"`.
//
// 2. The fee field is not the same everywhere. Preview (4.3.5) exposes `fee: String!` in SPECK
//    [verified by introspection, 2026-10-16]; Blockfrost's documentation for preprod/mainnet
//    (4.3.302) describes `fees { paidFees estimatedFees }`. Rather than guess per network, this
//    module introspects `RegularTransaction` once per endpoint and builds the selection from what
//    is actually there. An endpoint that has neither simply reports no fee, and nothing breaks.
//
// Everything here goes through `fetch`, so it works in Node 22 and in a browser, and every URL
// that reaches a log or an error is redacted first — on preprod and mainnet the URL carries a
// Blockfrost project token.
import { redactEndpoint } from './endpoints.js';

/** SPECK is the atomic unit of DUST: 1 DUST = 10^15 SPECK. */
export const SPECK_PER_DUST = 1_000_000_000_000_000n;

/** `1234500000000000` SPECK rendered as `1.2345 DUST`, for console and report lines. */
export function formatDust(speck: bigint, fractionDigits = 6): string {
  const whole = speck / SPECK_PER_DUST;
  const fraction = (speck % SPECK_PER_DUST).toString().padStart(15, '0').slice(0, fractionDigits);
  return fractionDigits === 0 ? `${whole}` : `${whole}.${fraction}`;
}

export class IndexerError extends Error {
  constructor(message: string, readonly endpoint: string) {
    super(`${message} (indexer ${redactEndpoint(endpoint)})`);
    this.name = 'IndexerError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** One POST, with the endpoint redacted out of every error it can raise. */
export async function indexerQuery<T>(
  indexerHttpUrl: string,
  query: string,
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(indexerHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: init.signal,
    });
  } catch (cause) {
    throw new IndexerError(`could not reach the indexer: ${(cause as Error).message}`, indexerHttpUrl);
  }
  if (response.status === 403) {
    throw new IndexerError(
      'the indexer refused the request with 403. On preprod and mainnet that means the Blockfrost ' +
        'project token is missing, wrong for this network, or out of quota',
      indexerHttpUrl,
    );
  }
  if (response.status === 410) {
    throw new IndexerError(
      'the indexer answered 410 ENDPOINT_DECOMMISSIONED. Midnight retired its own preprod and ' +
        'mainnet endpoints; use the Blockfrost ones',
      indexerHttpUrl,
    );
  }
  if (!response.ok) throw new IndexerError(`the indexer answered ${response.status}`, indexerHttpUrl);

  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new IndexerError(`the indexer rejected the query: ${body.errors.map((e) => e.message).join('; ')}`, indexerHttpUrl);
  }
  if (body.data === undefined) throw new IndexerError('the indexer returned no data', indexerHttpUrl);
  return body.data;
}

// -------------------------------------------------------------------------- schema capability

/** How a given indexer spells the fee of a transaction. */
export type FeeShape = 'fee' | 'fees' | 'none';

interface IntrospectedFields {
  __type: { fields: Array<{ name: string }> } | null;
}

const feeShapeCache = new Map<string, Promise<FeeShape>>();

/**
 * Which fee field `RegularTransaction` carries on this endpoint, cached per URL.
 *
 * Preview answers `fee`, Blockfrost's 4.3.302 is documented as `fees`. Probing costs one query
 * per process and removes a whole class of "works on preview, 400s on mainnet" failure.
 */
export function indexerFeeShape(indexerHttpUrl: string): Promise<FeeShape> {
  const cached = feeShapeCache.get(indexerHttpUrl);
  if (cached) return cached;
  const probe = indexerQuery<IntrospectedFields>(
    indexerHttpUrl,
    '{ __type(name: "RegularTransaction") { fields { name } } }',
  )
    .then((data) => {
      const names = new Set((data.__type?.fields ?? []).map((f) => f.name));
      if (names.has('fees')) return 'fees' as const;
      if (names.has('fee')) return 'fee' as const;
      return 'none' as const;
    })
    // An endpoint with introspection disabled is not a reason to fail: drop the fee, keep the rest.
    .catch(() => 'none' as const);
  feeShapeCache.set(indexerHttpUrl, probe);
  return probe;
}

/**
 * How many aliased sub-queries go in one request.
 *
 * The indexer enforces a complexity limit and answers `Query is too complex.` past it. Measured
 * against preview 4.3.5 on 2026-10-16: twenty aliases of
 * `transactions { hash block { height hash timestamp } ... on RegularTransaction { ... } }`
 * are accepted and twenty-five are not. Ten leaves room for a stricter limit on another
 * deployment, and a scenario's twenty-seven transactions still cost three round trips.
 *
 * This is not a theoretical limit. A Wave-2 evidence run has twenty-seven transactions, and
 * asking for them in one query returned nothing at all — every fee and every explorer link
 * silently absent from the evidence file.
 */
export const INDEXER_BATCH_SIZE = 10;

const chunk = <T>(values: readonly T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < values.length; i += size) batches.push(values.slice(i, i + size));
  return batches;
};

/** Forgets the cached probes. Tests use it; nothing else needs to. */
export const clearIndexerSchemaCache = (): void => {
  feeShapeCache.clear();
};

const feeSelection = (shape: FeeShape): string =>
  shape === 'fee' ? 'fee' : shape === 'fees' ? 'fees { paidFees estimatedFees }' : '';

interface RawFees {
  paidFees?: string | null;
  estimatedFees?: string | null;
}

const readFee = (raw: { fee?: string | null; fees?: RawFees | null }): bigint | undefined => {
  const value = raw.fees?.paidFees ?? raw.fees?.estimatedFees ?? raw.fee;
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
};

// ------------------------------------------------------------------------------------- queries

/** The chain's latest block, as the indexer sees it. */
export async function latestBlock(indexerHttpUrl: string): Promise<{ height: number; timestampMs: number }> {
  const data = await indexerQuery<{ block?: { height?: number; timestamp?: number } | null }>(
    indexerHttpUrl,
    '{ block { height timestamp } }',
  );
  const { height, timestamp } = data.block ?? {};
  if (height === undefined || timestamp === undefined) {
    throw new IndexerError('the indexer returned no latest block', indexerHttpUrl);
  }
  return { height, timestampMs: timestamp };
}

/** Block time in unix seconds, which is the unit the contract's time-locks use. */
export const chainTimeSeconds = async (indexerHttpUrl: string): Promise<bigint> =>
  BigInt(Math.floor((await latestBlock(indexerHttpUrl)).timestampMs / 1000));

/**
 * What a transaction is called on chain, and what it cost.
 *
 * midnight-js hands back a transaction *identifier* — the value a contract call is keyed by —
 * while block explorers index by the transaction *hash*. The indexer knows both.
 */
export interface TxAnchor {
  identifier: string;
  txHash?: string;
  blockHeight?: number;
  blockHash?: string;
  blockTimestamp?: string;
  /** Fee actually paid, in SPECK. Absent on an endpoint that does not expose one. */
  feeSpeck?: bigint;
  /** `SUCCESS`, `PARTIAL_SUCCESS` or `FAILURE`, when the endpoint reports it. */
  status?: string;
}

interface IndexerTx {
  hash?: string;
  fee?: string | null;
  fees?: RawFees | null;
  transactionResult?: { status?: string } | null;
  block?: { height?: number; hash?: string; timestamp?: number };
}

export interface BatchOptions {
  /** Aliases per request. Lower it if an endpoint has a stricter complexity limit. */
  batchSize?: number;
  /**
   * Called when a batch could not be read.
   *
   * A lookup failure is survivable — the transactions are on chain either way — but it must not
   * be invisible, because the result is an evidence file quietly missing its explorer links.
   */
  onWarn?: (message: string) => void;
}

/**
 * Runs an aliased query in batches, retrying a failed batch one identifier at a time.
 *
 * The retry is what turns "the indexer refused a query of ten" into "nine resolved and one
 * did not", instead of losing all ten to whichever one it choked on.
 */
async function batched<T>(
  indexerHttpUrl: string,
  identifiers: readonly string[],
  selection: (id: string, alias: string) => string,
  take: (identifier: string, row: T | undefined) => void,
  options: BatchOptions,
): Promise<void> {
  const warn = options.onWarn ?? (() => {});
  const run = async (ids: readonly string[]): Promise<boolean> => {
    const query = `{ ${ids.map((id, i) => selection(id, `t${i}`)).join(' ')} }`;
    try {
      const data = await indexerQuery<Record<string, T[]>>(indexerHttpUrl, query);
      ids.forEach((id, i) => take(id, data[`t${i}`]?.[0]));
      return true;
    } catch (error) {
      warn(`${(error as Error).message}`);
      return false;
    }
  };

  for (const batch of chunk(identifiers, Math.max(1, options.batchSize ?? INDEXER_BATCH_SIZE))) {
    if (await run(batch)) continue;
    if (batch.length === 1) continue;
    for (const id of batch) await run([id]);
  }
}

/**
 * Resolves identifiers to on-chain anchors.
 *
 * Identifiers the indexer does not know come back carrying only the identifier, which is what a
 * caller wants: a transaction that has not been indexed yet is not an error.
 */
export async function resolveTransactions(
  indexerHttpUrl: string,
  identifiers: readonly string[],
  options: BatchOptions = {},
): Promise<Map<string, TxAnchor>> {
  const unique = [...new Set(identifiers)].filter((id) => id !== '');
  const anchors = new Map<string, TxAnchor>(unique.map((identifier) => [identifier, { identifier }]));
  if (unique.length === 0) return anchors;

  // `fee`/`fees` and `transactionResult` live on RegularTransaction, not on the Transaction
  // interface, so they go inside an inline fragment or the whole query is rejected.
  const shape = await indexerFeeShape(indexerHttpUrl);
  const fragment = `... on RegularTransaction { transactionResult { status } ${feeSelection(shape)} }`;

  await batched<IndexerTx>(
    indexerHttpUrl,
    unique,
    (id, alias) =>
      `${alias}: transactions(offset: {identifier: ${JSON.stringify(id)}}) ` +
      `{ hash block { height hash timestamp } ${fragment} }`,
    (identifier, tx) => {
      if (!tx) return;
      anchors.set(identifier, {
        identifier,
        txHash: tx.hash,
        blockHeight: tx.block?.height,
        blockHash: tx.block?.hash,
        blockTimestamp: tx.block?.timestamp === undefined ? undefined : new Date(tx.block.timestamp).toISOString(),
        feeSpeck: readFee(tx),
        status: tx.transactionResult?.status,
      });
    },
    options,
  );
  return anchors;
}

/** Total DUST, in SPECK, that a set of transactions paid. Unresolved ones count as zero. */
export const totalFeeSpeck = (anchors: Iterable<TxAnchor>): bigint => {
  let total = 0n;
  for (const anchor of anchors) total += anchor.feeSpeck ?? 0n;
  return total;
};

/**
 * The raw, ledger-serialized bytes of transactions, by identifier.
 *
 * `raw` is on the `Transaction` interface, so this needs no fragment and works on every
 * implementing type. It is what makes an honest cost estimate possible: the exact transactions
 * a previous run put on chain can be re-priced against another network's ledger parameters
 * without rebuilding, re-proving or submitting anything.
 */
export async function fetchRawTransactions(
  indexerHttpUrl: string,
  identifiers: readonly string[],
  options: BatchOptions = {},
): Promise<Map<string, string>> {
  const unique = [...new Set(identifiers)].filter((id) => id !== '');
  const raws = new Map<string, string>();
  if (unique.length === 0) return raws;

  // Raw bytes are the heaviest thing the indexer serves — a deploy carrying six verifier keys
  // runs to tens of kilobytes — so these go in smaller batches than the anchors.
  await batched<{ raw?: string }>(
    indexerHttpUrl,
    unique,
    (id, alias) => `${alias}: transactions(offset: {identifier: ${JSON.stringify(id)}}) { raw }`,
    (identifier, row) => {
      if (row?.raw) raws.set(identifier, row.raw);
    },
    { batchSize: 5, ...options },
  );
  return raws;
}
