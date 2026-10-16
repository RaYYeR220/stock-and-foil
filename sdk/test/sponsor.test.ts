// SPDX-License-Identifier: Apache-2.0
//
// The client half of DUST sponsorship.
//
// `describeTransaction` is the load-bearing part: the sponsor's allowlist is applied to what it
// says, so a transaction it mis-reads is a transaction the allowlist does not really cover. It
// reads the ledger's own objects structurally, which is what these cases pin down.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  describeTransaction,
  deserializeSponsoredTx,
  requestSponsorship,
  SPONSOR_PATH,
  SPONSOR_PROTOCOL_VERSION,
  SponsorError,
  sponsoredWalletAdapter,
  type WalletAdapter,
} from '../src/index.js';

/** A stand-in for a ledger transaction: the real ones expose exactly these shapes. */
const txWith = (...actions: unknown[]): FinalizedTransaction =>
  ({ intents: new Map([[1, { actions }]]) }) as unknown as FinalizedTransaction;

const call = (address: string, entryPoint: string | Uint8Array): unknown => ({ address, entryPoint });
const deploy = (address: string): unknown => ({ address, initialState: {} });
const maintenance = (address: string): unknown => ({ address, updates: [], counter: 1n });

const ADDRESS = '9be70aa1cafe00000000000000000000000000000000000000000000000033e8f7';

afterEach(() => vi.unstubAllGlobals());

describe('describeTransaction', () => {
  it('reads the entry point and the address of a call', () => {
    const described = describeTransaction(txWith(call(ADDRESS, 'acknowledge')));
    expect(described.circuits).toEqual(['acknowledge']);
    expect(described.contracts).toEqual([ADDRESS]);
    expect(described.hasAdministrativeAction).toBe(false);
  });

  it('decodes an entry point the ledger hands back as bytes', () => {
    const bytes = new TextEncoder().encode('payInvoice');
    const described = describeTransaction(txWith(call(ADDRESS, bytes)));
    expect(described.circuits).toEqual(['payInvoice']);
    expect(described.actions[0]?.entryPointHex).toBe('7061794' + '96e766f696365');
  });

  it('stops at a NUL rather than carrying padding into an allowlist comparison', () => {
    const padded = new Uint8Array(16);
    padded.set(new TextEncoder().encode('offer'));
    expect(describeTransaction(txWith(call(ADDRESS, padded))).circuits).toEqual(['offer']);
  });

  it('falls back to hex for an entry point that is not printable', () => {
    const described = describeTransaction(txWith(call(ADDRESS, new Uint8Array([0xff, 0xfe]))));
    expect(described.actions[0]?.entryPoint).toBeUndefined();
    expect(described.circuits[0]).toBe('0xfffe');
  });

  it('flags a deploy and a maintenance update as administrative', () => {
    expect(describeTransaction(txWith(deploy(ADDRESS))).hasAdministrativeAction).toBe(true);
    expect(describeTransaction(txWith(maintenance(ADDRESS))).hasAdministrativeAction).toBe(true);
    // An administrative action is not a call, so it contributes no circuit to allowlist against.
    expect(describeTransaction(txWith(deploy(ADDRESS))).circuits).toEqual([]);
  });

  it('sees every intent, not just the first', () => {
    const tx = {
      intents: new Map([
        [1, { actions: [call(ADDRESS, 'offer')] }],
        [2, { actions: [call('other', 'accept')] }],
      ]),
    } as unknown as FinalizedTransaction;
    const described = describeTransaction(tx);
    expect(described.circuits).toEqual(['offer', 'accept']);
    expect(described.contracts).toEqual([ADDRESS, 'other']);
  });

  it('describes a transaction with no intents as having nothing to authorise', () => {
    const described = describeTransaction({} as FinalizedTransaction);
    expect(described.actions).toEqual([]);
    expect(described.circuits).toEqual([]);
  });
});

describe('deserializeSponsoredTx', () => {
  it('refuses something that is not hex, with a code a client can branch on', () => {
    const error = (() => {
      try {
        deserializeSponsoredTx('not hex at all');
        return undefined;
      } catch (e) {
        return e as SponsorError;
      }
    })();
    expect(error).toBeInstanceOf(SponsorError);
    expect(error?.code).toBe('UNREADABLE_TRANSACTION');
  });

  it('explains what shape a sponsored transaction has to be in', () => {
    try {
      deserializeSponsoredTx('00ff00ff');
    } catch (error) {
      expect((error as Error).message).toContain("tokenKindsToBalance ['shielded','unshielded']");
    }
  });
});

describe('requestSponsorship', () => {
  const ok = {
    protocol: SPONSOR_PROTOCOL_VERSION,
    txId: '0xtx',
    feeSpeck: '1234',
    circuits: ['acknowledge'],
    contractAddress: ADDRESS,
  };

  it('posts the transaction to the sponsor path and returns what it says', async () => {
    const calls: Array<{ url: string; body: any; headers: any }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
        return new Response(JSON.stringify(ok), { status: 200 });
      }),
    );
    const result = await requestSponsorship('aabb', {
      endpoint: 'http://127.0.0.1:7391',
      apiKey: 'secret',
      caller: 'web',
      circuit: 'acknowledge',
    });
    expect(result.txId).toBe('0xtx');
    expect(calls[0]!.url).toBe(`http://127.0.0.1:7391${SPONSOR_PATH}`);
    expect(calls[0]!.body).toMatchObject({ protocol: SPONSOR_PROTOCOL_VERSION, tx: 'aabb', circuit: 'acknowledge' });
    expect(calls[0]!.headers.Authorization).toBe('Bearer secret');
  });

  it('does not double the path when the endpoint already has it', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify(ok), { status: 200 });
      }),
    );
    await requestSponsorship('aa', { endpoint: `http://host:1/${SPONSOR_PATH.slice(1)}/` });
    expect(calls[0]).toBe(`http://host:1${SPONSOR_PATH}`);
  });

  it('turns a refusal into a SponsorError carrying the code and the retry hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ protocol: 1, error: 'too fast', code: 'RATE_LIMITED', retryAfterSeconds: 17 }),
            { status: 429 },
          ),
      ),
    );
    const error = await requestSponsorship('aa', { endpoint: 'http://host:1' }).catch((e: SponsorError) => e);
    expect(error).toBeInstanceOf(SponsorError);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(17);
    expect(error.status).toBe(429);
  });

  it('reports an unreachable sponsor as a transport failure, naming the endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const error = await requestSponsorship('aa', { endpoint: 'http://host:1' }).catch((e: SponsorError) => e);
    expect(error.code).toBe('TRANSPORT');
    expect(error.message).toContain('http://host:1');
  });
});

describe('sponsoredWalletAdapter', () => {
  const base = (paysDustFees: boolean | undefined): WalletAdapter => ({
    paysDustFees,
    getCoinPublicKey: () => 'coin',
    getEncryptionPublicKey: () => 'enc',
    balanceTx: (async () => ({}) as never) as WalletAdapter['balanceTx'],
    submitTx: async () => 'self-submitted' as never,
  });

  it('refuses to wrap a wallet that pays its own fees', () => {
    expect(() => sponsoredWalletAdapter(base(true), { endpoint: 'http://host' })).toThrow(/payDustFees: false/);
    // An adapter that does not say is treated as self-funded: failing closed is the point.
    expect(() => sponsoredWalletAdapter(base(undefined), { endpoint: 'http://host' })).toThrow();
  });

  it('submits through the sponsor and reports what was paid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ protocol: 1, txId: 'sponsored-tx', feeSpeck: '99', circuits: ['offer'] }),
            { status: 200 },
          ),
      ),
    );
    const seen: string[] = [];
    const adapter = sponsoredWalletAdapter(base(false), {
      endpoint: 'http://host',
      onSponsored: (result) => seen.push(`${result.circuits.join(',')}:${result.feeSpeck}`),
    });
    const txId = await adapter.submitTx({ serialize: () => new Uint8Array([0xaa]) } as never);
    expect(txId).toBe('sponsored-tx');
    expect(seen).toEqual(['offer:99']);
    expect(adapter.paysDustFees).toBe(false);
  });

  it('keeps everything before submission, so the chain sees the same transaction', () => {
    const inner = base(false);
    const adapter = sponsoredWalletAdapter(inner, { endpoint: 'http://host' });
    expect(adapter.getCoinPublicKey()).toBe(inner.getCoinPublicKey());
    expect(adapter.balanceTx).toBe(inner.balanceTx);
  });
});
