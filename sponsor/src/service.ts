// SPDX-License-Identifier: Apache-2.0
//
// The sponsor, as a function of a request and a signer.
//
// It does four things, in this order, and refuses between any two of them:
//
//   1. deserialize the user's bound transaction and read the contract calls out of it
//   2. check them against the policy, and the caller against the rate limit
//   3. price the transaction, check the price against the cap and the remaining budget
//   4. balance `['dust']` against the sponsor's wallet, sign, finalize, submit
//
// The signer is an interface rather than a wallet so the whole thing is testable without a
// chain: `sponsor/test/service.test.ts` drives it with a fake that counts what it was asked to
// pay. The only thing the real signer adds is a wallet-sdk facade.
//
// Everything that is paid for is logged, including the running total, because a service that
// spends money and does not say what it spent is not a service anyone should run.
import {
  describeTransaction,
  deserializeSponsoredTx,
  serializeSponsoredTx,
  SPONSOR_PROTOCOL_VERSION,
  SponsorError,
  type SponsorRefusalCode,
  type SponsorRequest,
  type SponsorResponse,
  type TransactionDescription,
} from '@stockandfoil/sdk';
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { checkFee, checkTransaction, RateLimiter, type SponsorPolicy } from './policy.js';

/** The wallet half, narrowed to what the service needs. */
export interface SponsorSigner {
  /** Bech32m unshielded address, for the log and the health endpoint. */
  readonly address: string;
  /** Spendable DUST right now, in SPECK. */
  dustSpeck(): Promise<bigint>;
  /** What this transaction will cost once the sponsor's fee balancing is added, in SPECK. */
  estimateFee(tx: FinalizedTransaction): Promise<bigint>;
  /** Balance `['dust']`, sign and finalize. The user's binding survives. */
  addDustFees(tx: FinalizedTransaction): Promise<FinalizedTransaction>;
  submit(tx: FinalizedTransaction): Promise<string>;
}

/** One line of the sponsor's ledger: what it was asked, what it decided, what it paid. */
export interface SponsorLogEntry {
  at: string;
  caller: string;
  circuits: string[];
  contractAddress?: string;
  /**
   * `paid` landed, `refused` spent nothing, `submit-failed` may have spent and is therefore
   * counted against the budget as if it had.
   */
  outcome: 'paid' | 'refused' | 'submit-failed';
  code?: SponsorRefusalCode;
  reason?: string;
  feeSpeck?: string;
  txId?: string;
  /** Client-supplied tag, for reading the log. Never used to decide anything. */
  label?: string;
  /** Everything this process has committed, including this entry. */
  cumulativeFeeSpeck: string;
  /** Budget still uncommitted after this entry: budget - spent - reserved. */
  budgetLeftSpeck: string;
  /** Sponsor DUST left after this entry, when it was read. */
  remainingDustSpeck?: string;
  durationMs: number;
}

export interface SponsorServiceOptions {
  policy: SponsorPolicy;
  signer: SponsorSigner;
  /** Receives every decision, paid or refused. The server writes JSONL and a console line. */
  onLog?: (entry: SponsorLogEntry) => void;
  now?: () => number;
  /**
   * How a hex string becomes a transaction, and how a transaction becomes a list of calls.
   *
   * Both default to the SDK's real implementations and exist only so the suite can drive every
   * refusal path without a chain, a proof server and a funded wallet. Nothing in production
   * overrides them.
   */
  deserialize?: (txHex: string) => FinalizedTransaction;
  describe?: (tx: FinalizedTransaction) => TransactionDescription;
}

export interface CallerIdentity {
  /**
   * The rate-limit bucket, and the only caller identity that decides anything.
   *
   * It must be something the caller cannot choose: the name behind a presented API key, or the
   * socket's remote address. A value taken from the request body would let one client rotate
   * through unlimited buckets and ignore the limit entirely.
   */
  id: string;
  /** A tag the client sent, kept for the log and ignored everywhere else. */
  label?: string;
}

export class SponsorService {
  readonly policy: SponsorPolicy;
  private readonly signer: SponsorSigner;
  private readonly limiter: RateLimiter;
  private readonly onLog: (entry: SponsorLogEntry) => void;
  private readonly now: () => number;
  private readonly deserialize: (txHex: string) => FinalizedTransaction;
  private readonly describe: (tx: FinalizedTransaction) => TransactionDescription;
  private spentSpeck = 0n;
  /**
   * DUST committed by requests that are still in flight.
   *
   * The budget check and the spend are separated by three awaits — pricing, balancing and
   * submission — so checking against `spentSpeck` alone lets N concurrent requests each see the
   * same stale total and collectively walk past the cap. A request therefore reserves
   * synchronously, before its first await, and releases in a `finally`. The reservation is
   * `policy.maxFeeSpeck`, the most the request could possibly cost, because the real fee is not
   * known until after an await; a request that costs less simply over-reserves for a moment.
   *
   * The invariant is `spentSpeck + reservedSpeck <= budgetSpeck`, and it holds at every await
   * point rather than only between requests.
   */
  private reservedSpeck = 0n;
  private paidCount = 0;
  private refusedCount = 0;

  constructor(options: SponsorServiceOptions) {
    this.policy = options.policy;
    this.signer = options.signer;
    this.now = options.now ?? Date.now;
    this.limiter = new RateLimiter(options.policy.rateLimit, this.now);
    this.onLog = options.onLog ?? (() => {});
    this.deserialize = options.deserialize ?? deserializeSponsoredTx;
    this.describe = options.describe ?? describeTransaction;
  }

  get stats(): {
    paid: number;
    refused: number;
    spentSpeck: bigint;
    reservedSpeck: bigint;
    budgetSpeck: bigint;
    budgetLeftSpeck: bigint;
  } {
    return {
      paid: this.paidCount,
      refused: this.refusedCount,
      spentSpeck: this.spentSpeck,
      reservedSpeck: this.reservedSpeck,
      budgetSpeck: this.policy.budgetSpeck,
      budgetLeftSpeck: this.budgetLeftSpeck,
    };
  }

  /** Budget not yet spent and not yet reserved by a request in flight. */
  private get budgetLeftSpeck(): bigint {
    const left = this.policy.budgetSpeck - this.spentSpeck - this.reservedSpeck;
    return left > 0n ? left : 0n;
  }

  get sponsorAddress(): string {
    return this.signer.address;
  }

  /**
   * Pays the DUST for someone else's transaction and submits it.
   *
   * Refusals are thrown as `SponsorError` with a code the client can branch on, and every one of
   * them happens before any DUST moves.
   */
  async sponsor(request: SponsorRequest, caller: CallerIdentity): Promise<SponsorResponse> {
    const startedAt = this.now();
    const log = (
      outcome: 'paid' | 'refused' | 'submit-failed',
      extra: Partial<SponsorLogEntry> & { circuits: string[] },
    ): void => {
      this.onLog({
        at: new Date(this.now()).toISOString(),
        caller: caller.id,
        label: caller.label,
        outcome,
        cumulativeFeeSpeck: this.spentSpeck.toString(),
        budgetLeftSpeck: this.budgetLeftSpeck.toString(),
        durationMs: this.now() - startedAt,
        ...extra,
      });
    };
    const refuse = (code: SponsorRefusalCode, reason: string, circuits: string[] = [], contractAddress?: string): never => {
      this.refusedCount += 1;
      log('refused', { code, reason, circuits, contractAddress });
      throw new SponsorError(reason, code);
    };

    if (request.protocol !== SPONSOR_PROTOCOL_VERSION) {
      this.refusedCount += 1;
      const reason =
        `this sponsor speaks protocol ${SPONSOR_PROTOCOL_VERSION}; the request announced ` +
        `${request.protocol ?? 'nothing'}.`;
      log('refused', { code: 'UNSUPPORTED_PROTOCOL', reason, circuits: [] });
      throw new SponsorError(reason, 'UNSUPPORTED_PROTOCOL');
    }
    if (typeof request.tx !== 'string' || request.tx === '') {
      refuse('BAD_REQUEST', 'the request carries no transaction.');
    }

    // The rate limit is taken before any work, so a flood costs the sponsor nothing but a map
    // lookup. It is refunded below if the request is refused on its own merits.
    const rate = this.limiter.take(caller.id);
    if (!rate.allowed) {
      this.refusedCount += 1;
      const reason =
        `this sponsor accepts ${this.policy.rateLimit.maxRequests} transactions per ` +
        `${Math.round(this.policy.rateLimit.windowMs / 1000)}s per caller; retry in ` +
        `${rate.retryAfterSeconds}s.`;
      log('refused', { code: 'RATE_LIMITED', reason, circuits: [] });
      throw new SponsorError(reason, 'RATE_LIMITED', { retryAfterSeconds: rate.retryAfterSeconds });
    }

    const tx: FinalizedTransaction = (() => {
      try {
        return this.deserialize(request.tx);
      } catch (error) {
        this.limiter.refund(caller.id);
        return refuse('UNREADABLE_TRANSACTION', error instanceof Error ? error.message : String(error));
      }
    })();

    // Read the calls out of the transaction. Anything the request *said* is only cross-checked.
    const description = this.describe(tx);
    const decision = checkTransaction(this.policy, description, request.circuit);
    if (!decision.allowed) {
      this.limiter.refund(caller.id);
      refuse(decision.code!, decision.reason!, decision.circuits, decision.contractAddress);
    }

    // Reserve, synchronously, the most this request could cost. Everything from here to the
    // `finally` below runs with that amount held against the budget, so two requests arriving
    // together cannot both be told there is room for one.
    const reservation = this.policy.maxFeeSpeck;
    if (this.spentSpeck + this.reservedSpeck + reservation > this.policy.budgetSpeck) {
      this.limiter.refund(caller.id);
      refuse(
        'SPONSOR_OUT_OF_DUST',
        `this sponsor's budget is ${this.policy.budgetSpeck} SPECK, of which ${this.spentSpeck} is ` +
          `spent and ${this.reservedSpeck} is reserved by requests in flight; there is no room to ` +
          `commit a further ${reservation}.`,
        decision.circuits,
        decision.contractAddress,
      );
    }
    this.reservedSpeck += reservation;

    // A reservation must turn into spend in the same tick it is counted as spent, or the two
    // overlap and `spent + reserved` momentarily exceeds the budget. `commit` does both at once;
    // the `finally` is only the safety net for the paths that never reach it.
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.reservedSpeck -= reservation;
    };
    const commit = (feeSpeck: bigint): void => {
      this.spentSpeck += feeSpeck;
      release();
    };

    try {
      const feeSpeck: bigint = await this.signer.estimateFee(tx).catch((error: unknown) => {
        this.limiter.refund(caller.id);
        return refuse(
          'UNREADABLE_TRANSACTION',
          `the transaction could not be priced: ${(error as Error).message}`,
          decision.circuits,
          decision.contractAddress,
        );
      });

      // The reservation already covers the budget; this catches a single transaction that costs
      // more than the per-transaction cap, which the reservation assumed it would not.
      const budget = checkFee(this.policy, feeSpeck, this.spentSpeck + this.reservedSpeck - reservation);
      if (!budget.allowed) {
        this.limiter.refund(caller.id);
        refuse(budget.code!, budget.reason!, decision.circuits, decision.contractAddress);
      }

      const held = await this.signer.dustSpeck();
      if (held < feeSpeck) {
        this.limiter.refund(caller.id);
        refuse(
          'SPONSOR_OUT_OF_DUST',
          `this sponsor holds ${held} SPECK and the transaction costs ${feeSpeck}. Top it up, or ` +
            'wait for its registered NIGHT to generate more DUST.',
          decision.circuits,
          decision.contractAddress,
        );
      }

      // Balancing builds a transaction and moves nothing, so a failure there is still free.
      // Submission is the point of no return: the node may have accepted the transaction even
      // when the call throws, so from here a failure is counted as spent. Over-counting costs
      // us a little budget; under-counting would let a flood of failing submissions drain the
      // wallet while the ledger said nothing had been spent.
      const sponsored = await this.signer.addDustFees(tx).catch((error: unknown) =>
        refuse(
          'SUBMIT_FAILED',
          `the sponsored transaction could not be balanced for fees: ${(error as Error).message}`,
          decision.circuits,
          decision.contractAddress,
        ),
      );

      let txId: string;
      try {
        txId = await this.signer.submit(sponsored);
      } catch (error) {
        commit(feeSpeck);
        this.refusedCount += 1;
        const reason =
          `the sponsored transaction was rejected on submission: ${(error as Error).message}. ` +
          `Counting ${feeSpeck} SPECK against the budget, because the node may have taken it.`;
        log('submit-failed', {
          code: 'SUBMIT_FAILED',
          reason,
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          feeSpeck: feeSpeck.toString(),
        });
        throw new SponsorError(reason, 'SUBMIT_FAILED');
      }

      commit(feeSpeck);
      this.paidCount += 1;
      const remaining = await this.signer.dustSpeck().catch(() => undefined);
      log('paid', {
        circuits: decision.circuits,
        contractAddress: decision.contractAddress,
        feeSpeck: feeSpeck.toString(),
        txId,
        remainingDustSpeck: remaining?.toString(),
      });

      return {
        protocol: SPONSOR_PROTOCOL_VERSION,
        txId,
        feeSpeck: feeSpeck.toString(),
        circuits: decision.circuits,
        contractAddress: decision.contractAddress,
      };
    } finally {
      // Covers every path that refused before committing anything.
      release();
    }

  }

  /** Drops expired rate-limit windows. The server calls it on a timer. */
  pruneRateLimiter(): void {
    this.limiter.prune();
  }
}

export { serializeSponsoredTx };
