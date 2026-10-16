// SPDX-License-Identifier: Apache-2.0
//
// The indexer client, against a stubbed `fetch`.
//
// The cases that matter are the two the Wave-1 code would get wrong today: `Transaction` is an
// interface now, so the fee and the result need an inline fragment, and the fee itself is
// spelled `fee` on preview (4.3.5) and `fees { paidFees }` on the Blockfrost-served networks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chainTimeSeconds,
  clearIndexerSchemaCache,
  fetchRawTransactions,
  formatDust,
  indexerFeeShape,
  IndexerError,
  INDEXER_BATCH_SIZE,
  indexerQuery,
  latestBlock,
  resolveTransactions,
  SPECK_PER_DUST,
  totalFeeSpeck,
} from '../src/index.js';

const PREVIEW = 'https://indexer.preview.midnight.network/api/v4/graphql';
const BLOCKFROST = 'https://midnight-mainnet.blockfrost.io/api/v0?project_id=nightmainnetSECRET';

interface Recorded {
  url: string;
  query: string;
}

/** A fetch that answers from a table of query-substring -> payload, and records every call. */
function stubFetch(routes: Array<[RegExp, unknown]>, options: { status?: number } = {}) {
  const calls: Recorded[] = [];
  const impl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? '{}')).query as string;
    calls.push({ url: String(url), query });
    if (options.status !== undefined && options.status !== 200) {
      return new Response(JSON.stringify({ error: 'nope' }), { status: options.status });
    }
    for (const [pattern, payload] of routes) {
      if (pattern.test(query)) return new Response(JSON.stringify(payload), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [{ message: `no stub for ${query}` }] }), { status: 200 });
  });
  vi.stubGlobal('fetch', impl);
  return calls;
}

const schemaWith = (fields: string[]) => [
  /__type\(name: "RegularTransaction"\)/,
  { data: { __type: { fields: fields.map((name) => ({ name })) } } },
];

beforeEach(() => clearIndexerSchemaCache());
afterEach(() => vi.unstubAllGlobals());

describe('formatDust', () => {
  it('renders SPECK as DUST', () => {
    expect(SPECK_PER_DUST).toBe(1_000_000_000_000_000n);
    expect(formatDust(0n)).toBe('0.000000');
    expect(formatDust(SPECK_PER_DUST)).toBe('1.000000');
    expect(formatDust(1_500_000_000_000_000n)).toBe('1.500000');
    expect(formatDust(1n)).toBe('0.000000');
    expect(formatDust(2_500_000_000_000_000n, 0)).toBe('2');
  });
});

describe('error reporting', () => {
  it('names a 403 as a Blockfrost token problem and hides the token', async () => {
    stubFetch([], { status: 403 });
    await expect(indexerQuery(BLOCKFROST, '{ block { height } }')).rejects.toThrow(IndexerError);
    await expect(indexerQuery(BLOCKFROST, '{ block { height } }')).rejects.toThrow(/Blockfrost project token/);
    const error = await indexerQuery(BLOCKFROST, '{ block { height } }').then(
      () => new Error('expected a failure'),
      (e: unknown) => e as Error,
    );
    expect(error.message).not.toContain('nightmainnetSECRET');
    expect(error.message).toContain('project_id=REDACTED');
  });

  it('explains a 410 as the decommissioned Midnight-hosted endpoint', async () => {
    stubFetch([], { status: 410 });
    await expect(indexerQuery(PREVIEW, '{ block { height } }')).rejects.toThrow(/DECOMMISSIONED/);
  });

  it('surfaces GraphQL errors rather than returning undefined', async () => {
    stubFetch([[/.*/, { errors: [{ message: 'Unknown field "fee" on type "Transaction"' }] }]]);
    await expect(indexerQuery(PREVIEW, '{ transactions { fee } }')).rejects.toThrow(/Unknown field/);
  });
});

describe('latest block', () => {
  it('reads height and timestamp', async () => {
    stubFetch([[/block \{ height timestamp \}/, { data: { block: { height: 1320164, timestamp: 1792141518001 } } }]]);
    expect(await latestBlock(PREVIEW)).toEqual({ height: 1320164, timestampMs: 1792141518001 });
    expect(await chainTimeSeconds(PREVIEW)).toBe(1792141518n);
  });

  it('fails rather than returning a nonsense time', async () => {
    stubFetch([[/block/, { data: { block: null } }]]);
    await expect(chainTimeSeconds(PREVIEW)).rejects.toThrow(/no latest block/);
  });
});

describe('the fee shape probe', () => {
  it('detects preview, which spells it `fee`', async () => {
    stubFetch([schemaWith(['hash', 'fee', 'transactionResult']) as [RegExp, unknown]]);
    expect(await indexerFeeShape(PREVIEW)).toBe('fee');
  });

  it('detects the `fees { paidFees }` shape', async () => {
    stubFetch([schemaWith(['hash', 'fees', 'transactionResult']) as [RegExp, unknown]]);
    expect(await indexerFeeShape(BLOCKFROST)).toBe('fees');
  });

  it('degrades to no fee rather than failing when introspection is off', async () => {
    stubFetch([[/__type/, { errors: [{ message: 'introspection is disabled' }] }]]);
    expect(await indexerFeeShape(PREVIEW)).toBe('none');
  });

  it('probes once per endpoint', async () => {
    const calls = stubFetch([schemaWith(['fee']) as [RegExp, unknown]]);
    await indexerFeeShape(PREVIEW);
    await indexerFeeShape(PREVIEW);
    expect(calls.filter((c) => c.query.includes('__type'))).toHaveLength(1);
  });
});

describe('resolving transactions', () => {
  const anchorPayload = {
    data: {
      t0: [
        {
          hash: 'aabb',
          fee: '1',
          transactionResult: { status: 'SUCCESS' },
          block: { height: 879615, hash: 'ccdd', timestamp: 1757000000000 },
        },
      ],
    },
  };

  it('asks for the fee inside an inline RegularTransaction fragment', async () => {
    const calls = stubFetch([schemaWith(['fee']) as [RegExp, unknown], [/transactions\(offset/, anchorPayload]]);
    await resolveTransactions(PREVIEW, ['id-1']);
    const query = calls.at(-1)!.query;
    expect(query).toContain('... on RegularTransaction {');
    expect(query).toContain('transactionResult { status }');
    // `hash` and `block` are on the interface and must stay outside the fragment.
    expect(query).toMatch(/\{ hash block \{ height hash timestamp \} \.\.\. on RegularTransaction/);
  });

  it('reads the fee from either spelling', async () => {
    stubFetch([schemaWith(['fee']) as [RegExp, unknown], [/transactions\(offset/, anchorPayload]]);
    const byFee = await resolveTransactions(PREVIEW, ['id-1']);
    expect(byFee.get('id-1')).toMatchObject({ txHash: 'aabb', feeSpeck: 1n, status: 'SUCCESS', blockHeight: 879615 });

    clearIndexerSchemaCache();
    stubFetch([
      schemaWith(['fees']) as [RegExp, unknown],
      [
        /transactions\(offset/,
        { data: { t0: [{ hash: 'ee', fees: { paidFees: '420', estimatedFees: '500' }, block: { height: 1 } }] } },
      ],
    ]);
    const byFees = await resolveTransactions(BLOCKFROST, ['id-1']);
    expect(byFees.get('id-1')?.feeSpeck).toBe(420n);
  });

  it('falls back to the estimate when nothing was paid yet', async () => {
    stubFetch([
      schemaWith(['fees']) as [RegExp, unknown],
      [/transactions\(offset/, { data: { t0: [{ hash: 'ee', fees: { paidFees: null, estimatedFees: '77' } }] } }],
    ]);
    expect((await resolveTransactions(BLOCKFROST, ['id-1'])).get('id-1')?.feeSpeck).toBe(77n);
  });

  it('leaves out the fee selection entirely when the endpoint has none', async () => {
    const calls = stubFetch([
      schemaWith(['hash']) as [RegExp, unknown],
      [/transactions\(offset/, { data: { t0: [{ hash: 'ee' }] } }],
    ]);
    const anchors = await resolveTransactions(PREVIEW, ['id-1']);
    expect(calls.at(-1)!.query).not.toContain('fee');
    expect(anchors.get('id-1')?.feeSpeck).toBeUndefined();
  });

  it('returns bare identifiers rather than throwing when the lookup fails', async () => {
    stubFetch([schemaWith(['fee']) as [RegExp, unknown]], {});
    const anchors = await resolveTransactions(PREVIEW, ['unknown-id']);
    expect(anchors.get('unknown-id')).toEqual({ identifier: 'unknown-id' });
  });

  it('deduplicates and ignores empty identifiers', async () => {
    const calls = stubFetch([schemaWith(['fee']) as [RegExp, unknown], [/transactions\(offset/, anchorPayload]]);
    await resolveTransactions(PREVIEW, ['id-1', 'id-1', '']);
    expect(calls.at(-1)!.query.match(/transactions\(offset/g)).toHaveLength(1);
  });

  it('does no work at all for an empty list', async () => {
    const calls = stubFetch([]);
    expect((await resolveTransactions(PREVIEW, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('sums fees across a run, counting an unpriced transaction as zero', () => {
    expect(
      totalFeeSpeck([
        { identifier: 'a', feeSpeck: 10n },
        { identifier: 'b' },
        { identifier: 'c', feeSpeck: 32n },
      ]),
    ).toBe(42n);
  });
});

describe('batching, because the indexer has a complexity limit', () => {
  // Measured against preview 4.3.5 on 2026-10-16: twenty aliases of the anchor query are
  // accepted, twenty-five are rejected with "Query is too complex." A Wave-2 evidence run has
  // twenty-seven transactions, so asking for them in one query returned nothing at all — every
  // fee and every explorer link silently missing from the evidence file.
  const tooComplex = (limit: number) => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const query = JSON.parse(String(init?.body ?? '{}')).query as string;
        calls.push(query);
        if (query.includes('__type')) {
          return new Response(JSON.stringify({ data: { __type: { fields: [{ name: 'fee' }] } } }), { status: 200 });
        }
        const aliases = query.match(/t\d+: transactions/g) ?? [];
        if (aliases.length > limit) {
          return new Response(JSON.stringify({ errors: [{ message: 'Query is too complex.' }] }), { status: 200 });
        }
        const data: Record<string, unknown> = {};
        aliases.forEach((_, i) => {
          data[`t${i}`] = [{ hash: `h${i}`, fee: '7', block: { height: 100 + i } }];
        });
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    );
    return calls;
  };

  const ids = Array.from({ length: 27 }, (_, i) => `id-${i}`);

  it('splits a run of twenty-seven into requests the indexer will accept', async () => {
    const calls = tooComplex(20);
    const anchors = await resolveTransactions(PREVIEW, ids);
    expect(anchors.size).toBe(27);
    expect([...anchors.values()].every((a) => a.feeSpeck === 7n)).toBe(true);
    const anchorQueries = calls.filter((q) => !q.includes('__type'));
    expect(anchorQueries).toHaveLength(3);
    for (const query of anchorQueries) {
      expect((query.match(/t\d+: transactions/g) ?? []).length).toBeLessThanOrEqual(INDEXER_BATCH_SIZE);
    }
  });

  it('retries a refused batch one identifier at a time rather than losing all of it', async () => {
    // An endpoint so strict that even a batch of ten is refused.
    const calls = tooComplex(1);
    const anchors = await resolveTransactions(PREVIEW, ids.slice(0, 10));
    expect([...anchors.values()].every((a) => a.feeSpeck === 7n)).toBe(true);
    const anchorQueries = calls.filter((q) => !q.includes('__type'));
    // One batch of ten that failed, then ten singles.
    expect(anchorQueries).toHaveLength(11);
  });

  it('reports a failure rather than silently returning nothing', async () => {
    tooComplex(0);
    const warnings: string[] = [];
    const anchors = await resolveTransactions(PREVIEW, ids.slice(0, 3), { onWarn: (m) => warnings.push(m) });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('too complex');
    // And the identifiers still come back, because the transactions are on chain either way.
    expect(anchors.size).toBe(3);
    expect([...anchors.values()].every((a) => a.feeSpeck === undefined)).toBe(true);
  });

  it('honours an explicit batch size', async () => {
    const calls = tooComplex(20);
    await resolveTransactions(PREVIEW, ids.slice(0, 9), { batchSize: 3 });
    expect(calls.filter((q) => !q.includes('__type'))).toHaveLength(3);
  });
});

describe('raw transactions', () => {
  it('selects `raw` straight off the interface, with no fragment', async () => {
    const calls = stubFetch([[/raw/, { data: { t0: [{ raw: 'deadbeef' }], t1: [] } }]]);
    const raws = await fetchRawTransactions(PREVIEW, ['a', 'b']);
    expect(raws.get('a')).toBe('deadbeef');
    expect(raws.has('b')).toBe(false);
    expect(calls.at(-1)!.query).not.toContain('RegularTransaction');
  });
});
