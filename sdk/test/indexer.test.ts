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
    const error = await indexerQuery(BLOCKFROST, '{ block { height } }').catch((e: Error) => e);
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

describe('raw transactions', () => {
  it('selects `raw` straight off the interface, with no fragment', async () => {
    const calls = stubFetch([[/raw/, { data: { t0: [{ raw: 'deadbeef' }], t1: [] } }]]);
    const raws = await fetchRawTransactions(PREVIEW, ['a', 'b']);
    expect(raws.get('a')).toBe('deadbeef');
    expect(raws.has('b')).toBe(false);
    expect(calls.at(-1)!.query).not.toContain('RegularTransaction');
  });
});
