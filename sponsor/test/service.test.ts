// SPDX-License-Identifier: Apache-2.0
//
// The sponsor end to end, against a fake wallet that counts what it was asked to pay.
//
// These cases are the ones that decide whether running this service is safe: a refusal must
// happen before any DUST moves, the budget must hold under concurrency and not only between
// requests, every decision must be logged, and the allowlist must be applied to what the
// transaction *is*, not to what the request *said*.
import { describe, expect, it, vi } from 'vitest';
import { SPONSOR_PROTOCOL_VERSION, SponsorError, type SponsorRequest, type TransactionDescription } from '@stockandfoil/sdk';
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { SponsorService, type SponsorLogEntry, type SponsorPolicy, type SponsorSigner } from '../src/index.js';

const REGISTRY = '9be70aa1cafe0000000000000000000000000000000000000000000000033e8f7';

const policy: SponsorPolicy = {
  contracts: [REGISTRY],
  circuits: ['acknowledge', 'offer'],
  maxFeeSpeck: 1_000n,
  budgetSpeck: 2_500n,
  rateLimit: { maxRequests: 3, windowMs: 60_000 },
  maxActionsPerTransaction: 1,
};

/** Awaits a call that is expected to fail, and hands back the error rather than a union. */
async function rejection(promise: Promise<unknown>): Promise<SponsorError> {
  const caught = await promise.then(
    () => undefined,
    (error: unknown) => error as SponsorError,
  );
  expect(caught, 'expected the sponsor to refuse, but it accepted').toBeInstanceOf(SponsorError);
  return caught!;
}

interface FakeOptions extends Partial<SponsorSigner> {
  fee?: bigint;
  dust?: bigint;
  /** Milliseconds each await costs, so a concurrency test can interleave requests. */
  latencyMs?: number;
}

/** A wallet that pays whatever it is told to, and remembers. */
function fakeSigner(overrides: FakeOptions = {}) {
  const fee = overrides.fee ?? 100n;
  const latency = overrides.latencyMs ?? 0;
  const paid: FinalizedTransaction[] = [];
  const submitted: FinalizedTransaction[] = [];
  let dust = overrides.dust ?? 1_000_000n;
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, latency));

  const { fee: _f, dust: _d, latencyMs: _l, ...rest } = overrides;
  const signer: SponsorSigner = {
    address: 'mn_addr_test1sponsor',
    dustSpeck: async () => {
      await pause();
      return dust;
    },
    estimateFee: async () => {
      await pause();
      return fee;
    },
    addDustFees: async (tx) => {
      await pause();
      paid.push(tx);
      return tx;
    },
    submit: async (tx) => {
      await pause();
      submitted.push(tx);
      dust -= fee;
      return `tx-${submitted.length}`;
    },
    ...rest,
  };
  return { signer, paid, submitted, dustLeft: () => dust };
}

const describedAs = (circuits: string[], extra: Partial<TransactionDescription> = {}): TransactionDescription => ({
  actions: circuits.map((entryPoint) => ({ kind: 'call' as const, contractAddress: REGISTRY, entryPoint })),
  circuits,
  contracts: [REGISTRY],
  hasAdministrativeAction: false,
  ...extra,
});

function build(
  options: {
    signer?: SponsorSigner;
    describe?: (tx: FinalizedTransaction) => TransactionDescription;
    deserialize?: (hex: string) => FinalizedTransaction;
    policy?: SponsorPolicy;
    now?: () => number;
  } = {},
) {
  const logs: SponsorLogEntry[] = [];
  const service = new SponsorService({
    policy: options.policy ?? policy,
    signer: options.signer ?? fakeSigner().signer,
    describe: options.describe ?? (() => describedAs(['acknowledge'])),
    deserialize: options.deserialize ?? ((): FinalizedTransaction => ({}) as FinalizedTransaction),
    onLog: (entry) => logs.push(entry),
    now: options.now,
  });
  return { service, logs };
}

const request = (overrides: Partial<SponsorRequest> = {}): SponsorRequest => ({
  protocol: SPONSOR_PROTOCOL_VERSION,
  tx: 'aabbcc',
  ...overrides,
});

const caller = { id: 'test' };

describe('sponsoring a transaction', () => {
  it('pays, submits and reports the fee', async () => {
    const wallet = fakeSigner({ fee: 250n });
    const { service, logs } = build({ signer: wallet.signer });

    const result = await service.sponsor(request({ circuit: 'acknowledge' }), caller);

    expect(result).toMatchObject({ txId: 'tx-1', feeSpeck: '250', circuits: ['acknowledge'] });
    expect(result.contractAddress).toBe(REGISTRY);
    expect(wallet.paid).toHaveLength(1);
    expect(wallet.submitted).toHaveLength(1);
    expect(service.stats).toMatchObject({ paid: 1, refused: 0, spentSpeck: 250n });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'paid', feeSpeck: '250', txId: 'tx-1', caller: 'test' });
  });

  it('logs the running total and what is left', async () => {
    const wallet = fakeSigner({ fee: 100n, dust: 1_000n });
    const { service, logs } = build({ signer: wallet.signer });
    await service.sponsor(request(), caller);
    await service.sponsor(request(), caller);
    expect(logs.map((l) => l.cumulativeFeeSpeck)).toEqual(['100', '200']);
    expect(logs.map((l) => l.budgetLeftSpeck)).toEqual(['2400', '2300']);
    expect(logs.at(-1)!.remainingDustSpeck).toBe('800');
  });

  it('keeps the client tag for the log but never decides anything with it', async () => {
    const { service, logs } = build();
    await service.sponsor(request(), { id: '203.0.113.9', label: 'web-demo' });
    expect(logs[0]).toMatchObject({ caller: '203.0.113.9', label: 'web-demo' });
  });

  it('submits the same transaction object it was handed, so the binding survives', async () => {
    const tx = { marker: 'the user transaction' } as unknown as FinalizedTransaction;
    const wallet = fakeSigner();
    const { service } = build({ signer: wallet.signer, deserialize: () => tx });
    await service.sponsor(request(), caller);
    expect(wallet.paid[0]).toBe(tx);
  });

  it('releases its reservation after a successful payment', async () => {
    const { service } = build({ signer: fakeSigner({ fee: 10n }).signer });
    await service.sponsor(request(), caller);
    expect(service.stats.reservedSpeck).toBe(0n);
    expect(service.stats.budgetLeftSpeck).toBe(2_490n);
  });
});

describe('refusals, all of which happen before any DUST moves', () => {
  const expectRefused = async (
    code: string,
    harness: ReturnType<typeof build>,
    req: SponsorRequest = request(),
  ): Promise<SponsorError> => {
    const error = await rejection(harness.service.sponsor(req, caller));
    expect(error.code).toBe(code);
    expect(harness.logs.at(-1)).toMatchObject({ code });
    expect(harness.service.stats.reservedSpeck).toBe(0n);
    return error;
  };

  it('refuses an unknown protocol version', async () => {
    await expectRefused('UNSUPPORTED_PROTOCOL', build(), request({ protocol: 99 }));
  });

  it('refuses an empty transaction', async () => {
    await expectRefused('BAD_REQUEST', build(), request({ tx: '' }));
  });

  it('refuses a transaction it cannot read', async () => {
    const harness = build({
      deserialize: () => {
        throw new SponsorError('not a transaction', 'UNREADABLE_TRANSACTION');
      },
    });
    await expectRefused('UNREADABLE_TRANSACTION', harness);
  });

  it('refuses a circuit that is not allowlisted, and does not pay', async () => {
    const wallet = fakeSigner();
    const harness = build({ signer: wallet.signer, describe: () => describedAs(['certifyBorrowingBase']) });
    await expectRefused('CIRCUIT_NOT_ALLOWED', harness);
    expect(wallet.paid).toHaveLength(0);
    expect(harness.service.stats.spentSpeck).toBe(0n);
  });

  it('applies the allowlist to the transaction, not to the label', async () => {
    // The request claims an allowlisted circuit; the transaction calls something else.
    const harness = build({ describe: () => describedAs(['admitFinancier']) });
    await expectRefused('CIRCUIT_NOT_ALLOWED', harness, request({ circuit: 'acknowledge' }));
  });

  it('refuses a mislabelled but otherwise allowlisted call', async () => {
    const harness = build({ describe: () => describedAs(['offer']) });
    await expectRefused('CIRCUIT_MISMATCH', harness, request({ circuit: 'acknowledge' }));
  });

  it('refuses a deploy', async () => {
    const harness = build({
      describe: () =>
        describedAs([], { actions: [{ kind: 'deploy', contractAddress: REGISTRY }], hasAdministrativeAction: true }),
    });
    await expectRefused('NOT_A_CONTRACT_CALL', harness);
  });

  it('refuses a fee over the cap without touching the wallet', async () => {
    const wallet = fakeSigner({ fee: 1_001n });
    const harness = build({ signer: wallet.signer });
    await expectRefused('FEE_TOO_LARGE', harness);
    expect(wallet.paid).toHaveLength(0);
  });

  it('refuses once the budget is gone', async () => {
    const wallet = fakeSigner({ fee: 1_000n, dust: 1_000_000n });
    const { service, logs } = build({ signer: wallet.signer });
    await service.sponsor(request(), caller);
    await service.sponsor(request(), caller);
    const error = await rejection(service.sponsor(request(), caller));
    expect(error.code).toBe('SPONSOR_OUT_OF_DUST');
    expect(service.stats.spentSpeck).toBe(2_000n);
    expect(logs.filter((l) => l.outcome === 'paid')).toHaveLength(2);
  });

  it('refuses when the wallet does not hold enough DUST', async () => {
    const wallet = fakeSigner({ fee: 500n, dust: 100n });
    const harness = build({ signer: wallet.signer });
    const error = await expectRefused('SPONSOR_OUT_OF_DUST', harness);
    expect(error.message).toContain('100 SPECK');
    expect(wallet.paid).toHaveLength(0);
  });

  it('does not count a balancing failure as spend, because nothing moved', async () => {
    const wallet = fakeSigner({ fee: 100n });
    const harness = build({
      signer: {
        ...wallet.signer,
        addDustFees: async () => {
          throw new Error('dust balancing failed');
        },
      },
    });
    const error = await expectRefused('SUBMIT_FAILED', harness);
    expect(error.message).toContain('could not be balanced');
    expect(harness.service.stats.spentSpeck).toBe(0n);
  });

  it('counts a submission failure as spend, because the node may have taken it', async () => {
    const wallet = fakeSigner({ fee: 300n });
    const harness = build({
      signer: {
        ...wallet.signer,
        submit: async () => {
          throw new Error('1010 Transaction would exhaust the block limits');
        },
      },
    });
    const error = await rejection(harness.service.sponsor(request(), caller));
    expect(error.code).toBe('SUBMIT_FAILED');
    expect(error.message).toContain('exhaust the block limits');
    expect(harness.service.stats.spentSpeck).toBe(300n);
    expect(harness.service.stats.reservedSpeck).toBe(0n);
    expect(harness.logs.at(-1)).toMatchObject({ outcome: 'submit-failed', feeSpeck: '300' });
  });
});

describe('the budget holds under concurrency', () => {
  // The whole point: the budget check and the spend are separated by three awaits, so a check
  // against `spentSpeck` alone lets N requests in flight each see the same stale total.
  const concurrent: SponsorPolicy = {
    ...policy,
    maxFeeSpeck: 100n,
    budgetSpeck: 500n,
    rateLimit: { maxRequests: 1_000, windowMs: 60_000 },
  };

  it('never exceeds the cap when twenty requests arrive at once', async () => {
    const wallet = fakeSigner({ fee: 100n, dust: 10_000_000n, latencyMs: 2 });
    const { service } = build({ signer: wallet.signer, policy: concurrent });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.sponsor(request(), caller)),
    );
    const paid = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');

    // 500 SPECK of budget at 100 SPECK each is exactly five, and not one more.
    expect(paid).toHaveLength(5);
    expect(refused).toHaveLength(15);
    expect(wallet.submitted).toHaveLength(5);
    expect(service.stats.spentSpeck).toBe(500n);
    expect(service.stats.spentSpeck).toBeLessThanOrEqual(concurrent.budgetSpeck);
    expect(service.stats.reservedSpeck).toBe(0n);
    for (const result of refused) {
      expect((result as PromiseRejectedResult).reason.code).toBe('SPONSOR_OUT_OF_DUST');
    }
  });

  it('reserves the per-transaction cap, so cheap transactions cannot overshoot either', async () => {
    // Each really costs 10 but could cost up to 100, so at most five run concurrently. They
    // still all land, because a released reservation frees room for the next.
    const wallet = fakeSigner({ fee: 10n, dust: 10_000_000n, latencyMs: 1 });
    const { service } = build({ signer: wallet.signer, policy: concurrent });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.sponsor(request(), caller)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(service.stats.spentSpeck).toBe(50n);

    // And the budget still accounts for what was really spent, not what was reserved.
    expect(service.stats.budgetLeftSpeck).toBe(450n);
  });

  it('holds spent + reserved under the budget at every await', async () => {
    const wallet = fakeSigner({ fee: 100n, dust: 10_000_000n, latencyMs: 2 });
    const { service } = build({ signer: wallet.signer, policy: concurrent });
    const breaches: string[] = [];
    const watcher = setInterval(() => {
      const { spentSpeck, reservedSpeck, budgetSpeck } = service.stats;
      if (spentSpeck + reservedSpeck > budgetSpeck) breaches.push(`${spentSpeck}+${reservedSpeck}`);
    }, 1);
    await Promise.allSettled(Array.from({ length: 30 }, () => service.sponsor(request(), caller)));
    clearInterval(watcher);
    expect(breaches).toEqual([]);
  });
});

describe('rate limiting', () => {
  it('refuses the fourth request in a window and says how long to wait', async () => {
    const now = 0;
    const wallet = fakeSigner({ fee: 1n, dust: 1_000_000n });
    const { service } = build({ signer: wallet.signer, now: () => now });
    for (let i = 0; i < 3; i += 1) await service.sponsor(request(), caller);
    const error = await rejection(service.sponsor(request(), caller));
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(60);
    expect(wallet.submitted).toHaveLength(3);
  });

  it("does not spend a caller's quota on a request it refuses anyway", async () => {
    const now = 0;
    const wallet = fakeSigner({ fee: 1n });
    const refusing = build({
      signer: wallet.signer,
      now: () => now,
      describe: () => describedAs(['admitDebtor']),
    });
    for (let i = 0; i < 10; i += 1) {
      // Always the policy refusal, never the rate limit: a refused request costs no quota.
      const error = await rejection(refusing.service.sponsor(request(), caller));
      expect(error.code).toBe('CIRCUIT_NOT_ALLOWED');
    }
  });

  it('counts callers separately', async () => {
    const now = 0;
    const { service } = build({ signer: fakeSigner({ fee: 1n }).signer, now: () => now });
    for (let i = 0; i < 3; i += 1) await service.sponsor(request(), { id: 'alice' });
    await expect(service.sponsor(request(), { id: 'bob' })).resolves.toMatchObject({ txId: expect.any(String) });
  });

  it('opens a new window when time passes', async () => {
    let now = 0;
    const { service } = build({ signer: fakeSigner({ fee: 1n }).signer, now: () => now });
    for (let i = 0; i < 3; i += 1) await service.sponsor(request(), caller);
    now = 60_001;
    await expect(service.sponsor(request(), caller)).resolves.toMatchObject({ txId: expect.any(String) });
  });
});

describe('reporting', () => {
  it('exposes what it has paid, for the health endpoint', async () => {
    const { service } = build({ signer: fakeSigner({ fee: 7n }).signer });
    await service.sponsor(request(), caller);
    expect(service.stats).toMatchObject({
      paid: 1,
      refused: 0,
      spentSpeck: 7n,
      reservedSpeck: 0n,
      budgetSpeck: 2_500n,
      budgetLeftSpeck: 2_493n,
    });
    expect(service.sponsorAddress).toBe('mn_addr_test1sponsor');
  });

  it('never throws out of the log callback path', async () => {
    const service = new SponsorService({
      policy,
      signer: fakeSigner().signer,
      describe: () => describedAs(['acknowledge']),
      deserialize: () => ({}) as FinalizedTransaction,
      onLog: vi.fn(),
    });
    await expect(service.sponsor(request(), caller)).resolves.toBeDefined();
  });
});
