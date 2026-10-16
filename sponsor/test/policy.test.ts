// SPDX-License-Identifier: Apache-2.0
//
// The rules that stand between a funded wallet and a stranger's request.
import { describe, expect, it } from 'vitest';
import type { TransactionDescription } from '@stockandfoil/sdk';
import {
  checkFee,
  checkTransaction,
  DEFAULT_SPONSORED_CIRCUITS,
  RateLimiter,
  type SponsorPolicy,
} from '../src/index.js';

const REGISTRY = '9be70aa1cafe0000000000000000000000000000000000000000000000033e8f7';

const policy: SponsorPolicy = {
  contracts: [REGISTRY],
  circuits: ['acknowledge', 'offer', 'accept'],
  maxFeeSpeck: 1_000n,
  budgetSpeck: 10_000n,
  rateLimit: { maxRequests: 3, windowMs: 60_000 },
  maxActionsPerTransaction: 1,
};

const described = (overrides: Partial<TransactionDescription> = {}): TransactionDescription => ({
  actions: [{ kind: 'call', contractAddress: REGISTRY, entryPoint: 'acknowledge' }],
  circuits: ['acknowledge'],
  contracts: [REGISTRY],
  hasAdministrativeAction: false,
  ...overrides,
});

describe('the default allowlist', () => {
  it('covers the calls a party with no NIGHT has to make', () => {
    expect(DEFAULT_SPONSORED_CIRCUITS).toContain('acknowledge');
    expect(DEFAULT_SPONSORED_CIRCUITS).toContain('offer');
    expect(DEFAULT_SPONSORED_CIRCUITS).toContain('accept');
    expect(DEFAULT_SPONSORED_CIRCUITS).toContain('payInvoice');
  });

  it("leaves the operator's own calls off it", () => {
    expect(DEFAULT_SPONSORED_CIRCUITS).not.toContain('admitDebtor');
    expect(DEFAULT_SPONSORED_CIRCUITS).not.toContain('admitFinancier');
  });
});

describe('checkTransaction', () => {
  it('allows an allowlisted call to the allowlisted contract', () => {
    expect(checkTransaction(policy, described()).allowed).toBe(true);
  });

  it('refuses a deploy', () => {
    const decision = checkTransaction(
      policy,
      described({ actions: [{ kind: 'deploy', contractAddress: REGISTRY }], circuits: [], hasAdministrativeAction: true }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('NOT_A_CONTRACT_CALL');
  });

  it('refuses a maintenance update, which would re-key the registry', () => {
    const decision = checkTransaction(
      policy,
      described({
        actions: [{ kind: 'maintenance', contractAddress: REGISTRY }],
        circuits: [],
        hasAdministrativeAction: true,
      }),
    );
    expect(decision.code).toBe('NOT_A_CONTRACT_CALL');
  });

  it('refuses a transaction with no call at all', () => {
    expect(checkTransaction(policy, described({ actions: [], circuits: [], contracts: [] })).code).toBe(
      'NOT_A_CONTRACT_CALL',
    );
  });

  it('refuses a stranger contract even when the circuit name matches', () => {
    const decision = checkTransaction(
      policy,
      described({ contracts: ['deadbeef'], actions: [{ kind: 'call', contractAddress: 'deadbeef', entryPoint: 'offer' }], circuits: ['offer'] }),
    );
    expect(decision.code).toBe('CONTRACT_NOT_ALLOWED');
    expect(decision.reason).toContain(REGISTRY);
  });

  it('refuses a batch that smuggles a stranger contract alongside ours', () => {
    const decision = checkTransaction(
      { ...policy, maxActionsPerTransaction: 4 },
      described({
        actions: [
          { kind: 'call', contractAddress: REGISTRY, entryPoint: 'offer' },
          { kind: 'call', contractAddress: 'deadbeef', entryPoint: 'offer' },
        ],
        circuits: ['offer', 'offer'],
        contracts: [REGISTRY, 'deadbeef'],
      }),
    );
    expect(decision.code).toBe('CONTRACT_NOT_ALLOWED');
  });

  it('refuses a circuit that is not on the list', () => {
    const decision = checkTransaction(
      policy,
      described({
        actions: [{ kind: 'call', contractAddress: REGISTRY, entryPoint: 'certifyBorrowingBase' }],
        circuits: ['certifyBorrowingBase'],
      }),
    );
    expect(decision.code).toBe('CIRCUIT_NOT_ALLOWED');
  });

  it('refuses more actions than the cap allows', () => {
    const decision = checkTransaction(
      policy,
      described({
        actions: [
          { kind: 'call', contractAddress: REGISTRY, entryPoint: 'offer' },
          { kind: 'call', contractAddress: REGISTRY, entryPoint: 'accept' },
        ],
        circuits: ['offer', 'accept'],
      }),
    );
    expect(decision.code).toBe('NOT_A_CONTRACT_CALL');
    expect(decision.reason).toContain('2 contract actions');
  });

  it('refuses when the caller mislabels what it is doing', () => {
    expect(checkTransaction(policy, described(), 'offer').code).toBe('CIRCUIT_MISMATCH');
  });

  it('ignores a label that is absent or empty rather than inventing a mismatch', () => {
    expect(checkTransaction(policy, described(), undefined).allowed).toBe(true);
    expect(checkTransaction(policy, described(), '').allowed).toBe(true);
  });

  it('refuses everything when the contract list is empty', () => {
    expect(checkTransaction({ ...policy, contracts: [] }, described()).code).toBe('CONTRACT_NOT_ALLOWED');
  });

  it('refuses everything when the circuit list is empty', () => {
    expect(checkTransaction({ ...policy, circuits: [] }, described()).code).toBe('CIRCUIT_NOT_ALLOWED');
  });
});

describe('checkFee', () => {
  it('allows a fee under the cap and inside the budget', () => {
    expect(checkFee(policy, 900n, 0n).allowed).toBe(true);
  });

  it('refuses a single transaction over the per-transaction cap', () => {
    const decision = checkFee(policy, 1_001n, 0n);
    expect(decision.code).toBe('FEE_TOO_LARGE');
  });

  it('refuses once the budget would be exceeded, even for a small fee', () => {
    const decision = checkFee(policy, 1n, 10_000n);
    expect(decision.code).toBe('SPONSOR_OUT_OF_DUST');
    expect(decision.reason).toContain('10000');
  });

  it('allows the fee that lands exactly on the budget', () => {
    expect(checkFee(policy, 1_000n, 9_000n).allowed).toBe(true);
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit, then refuses with a wait', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 }, () => now);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a')).toMatchObject({ allowed: true, remaining: 0 });
    const refused = limiter.take('a');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it('counts callers separately', () => {
    let now = 0;
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1_000 }, () => now);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('opens a new window once the old one has passed', () => {
    let now = 0;
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1_000 }, () => now);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
    now = 1_000;
    expect(limiter.take('a').allowed).toBe(true);
  });

  it('gives a request back when nothing was spent', () => {
    let now = 0;
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1_000 }, () => now);
    limiter.take('a');
    limiter.refund('a');
    expect(limiter.take('a').allowed).toBe(true);
  });

  it('does not grow without bound', () => {
    let now = 0;
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1_000 }, () => now);
    for (let i = 0; i < 100; i += 1) limiter.take(`caller-${i}`);
    expect(limiter.size).toBe(100);
    now = 2_000;
    limiter.prune();
    expect(limiter.size).toBe(0);
  });
});
