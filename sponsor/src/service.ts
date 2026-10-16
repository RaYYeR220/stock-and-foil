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
//
// ---------------------------------------------------------------------------------------------
// What this service logs, and what it never logs
//
// The whole reason it exists is that a user with no DUST should be able to transact without
// having to expose themselves. A sponsor that leaked what it was asked to pay for would be an
// own-goal, so the boundary is written down rather than left to judgement.
//
// Logged, to stdout and to the JSONL ledger: the timestamp; the rate-limit bucket (an API key
// *name* or a client address, never the key itself); the client's own label, stripped to
// printable ASCII; the contract address called; the entry-point names; the fee in SPECK; the
// transaction id, which is public on chain the moment it lands; the running total, the budget
// left and the sponsor's remaining balance.
//
// Never logged and never echoed: the transaction bytes; anything decoded out of them beyond the
// contract address and the entry-point names — no recipient addresses, no coin or UTXO
// identifiers, no amounts, no transcripts; and no raw error string from the proof server, the
// wallet or the node, because those carry transaction detail in their messages. A caller gets a
// stable code and a short, fixed reason. The upstream text is attached to the log entry only
// when SPONSOR_DEBUG is on, which it is not by default.
//
// Credentials cannot reach a log line at all: this module never sees a mnemonic, a seed or a
// Blockfrost token (the wallet is injected as a `SponsorSigner`), and the only API key material
// in the process lives in the server's key map, which is read but never printed. Endpoints are
// printed through the SDK's `redactEndpoint`.
// ---------------------------------------------------------------------------------------------
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
  /** A short, fixed explanation. Safe to show a caller, and the caller is shown exactly this. */
  reason?: string;
  /**
   * Upstream error text, attached only when the service is built with `debug: true`.
   *
   * A proof server or node error can quote transaction detail, so it is kept out of the ledger
   * by default and out of the HTTP response always.
   */
  detail?: string;
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
  /**
   * Attach upstream error text to log entries. Off by default.
   *
   * Even on, it never reaches the HTTP response: it is for an operator reading their own
   * ledger while debugging, not for the caller.
   */
  debug?: boolean;
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
  private readonly debug: boolean;
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
    this.debug = options.debug ?? false;
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
    /**
     * Refuses, logs, and throws. `reason` is the whole of what the caller is told; `detail`
     * never leaves this process unless the operator turned debug on, and even then only into
     * their own ledger.
     */
    const refuse = (
      code: SponsorRefusalCode,
      reason: string,
      extra: { circuits?: string[]; contractAddress?: string; detail?: unknown } = {},
    ): never => {
      this.refusedCount += 1;
      log('refused', {
        code,
        reason,
        circuits: extra.circuits ?? [],
        contractAddress: extra.contractAddress,
        detail: this.debug ? upstreamText(extra.detail) : undefined,
      });
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
        // Fixed text. The deserializer's own message is ours and harmless, but anything it
        // wraps is not, and telling the two apart at this point is not worth the risk.
        return refuse(
          'UNREADABLE_TRANSACTION',
          'the transaction did not deserialize as a signed, proven, bound transaction. Balance ' +
            "it with tokenKindsToBalance ['shielded','unshielded'], sign it, then finalize it.",
          { detail: error },
        );
      }
    })();

    // Read the calls out of the transaction. Anything the request *said* is only cross-checked.
    const description = this.describe(tx);
    const decision = checkTransaction(this.policy, description, request.circuit);
    if (!decision.allowed) {
      this.limiter.refund(caller.id);
      refuse(decision.code!, decision.reason!, {
        circuits: decision.circuits,
        contractAddress: decision.contractAddress,
      });
    }

    // Reserve, synchronously, the most this request could cost. Everything from here to the
    // `finally` below runs with that amount held against the budget, so two requests arriving
    // together cannot both be told there is room for one.
    const reservation = this.policy.maxFeeSpeck;
    if (this.spentSpeck + this.reservedSpeck + reservation > this.policy.budgetSpeck) {
      this.limiter.refund(caller.id);
      // The caller is told it cannot be served, not how much is left: the sponsor's remaining
      // budget is operational detail, and publishing it tells a prospective drainer exactly how
      // close they are. The numbers go to the ledger instead.
      refuse('SPONSOR_OUT_OF_DUST', 'this sponsor has no budget left to commit right now.', {
        circuits: decision.circuits,
        contractAddress: decision.contractAddress,
        detail:
          `budget ${this.policy.budgetSpeck}, spent ${this.spentSpeck}, reserved ` +
          `${this.reservedSpeck}, wanted ${reservation}`,
      });
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
        // The proof server and the node quote transaction detail in their error messages, so
        // the upstream text stops here.
        return refuse('UNREADABLE_TRANSACTION', 'the transaction could not be priced.', {
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          detail: error,
        });
      });

      // The reservation already covers the budget; this catches a single transaction that costs
      // more than the per-transaction cap, which the reservation assumed it would not.
      const budget = checkFee(this.policy, feeSpeck, this.spentSpeck + this.reservedSpeck - reservation);
      if (!budget.allowed) {
        this.limiter.refund(caller.id);
        // FEE_TOO_LARGE names the fee and the cap, which are this sponsor's published policy
        // (GET /v1/policy) and not the caller's secret. A budget refusal says only that.
        const caller_safe =
          budget.code === 'FEE_TOO_LARGE'
            ? budget.reason!
            : 'this sponsor has no budget left to commit right now.';
        refuse(budget.code!, caller_safe, {
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          detail: budget.reason,
        });
      }

      const held = await this.signer.dustSpeck();
      if (held < feeSpeck) {
        this.limiter.refund(caller.id);
        // How much DUST the sponsor is holding is its own business; the operator sees it in the
        // ledger, the caller sees only that it cannot be served.
        refuse('SPONSOR_OUT_OF_DUST', 'this sponsor cannot cover the fee right now.', {
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          detail: `holds ${held} SPECK, transaction costs ${feeSpeck}`,
        });
      }

      // Balancing builds a transaction and moves nothing, so a failure there is still free.
      // Submission is the point of no return: the node may have accepted the transaction even
      // when the call throws, so from here a failure is counted as spent. Over-counting costs
      // us a little budget; under-counting would let a flood of failing submissions drain the
      // wallet while the ledger said nothing had been spent.
      const sponsored = await this.signer.addDustFees(tx).catch((error: unknown) =>
        refuse('SUBMIT_FAILED', 'the sponsored transaction could not be balanced for fees.', {
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          detail: error,
        }),
      );

      let txId: string;
      try {
        txId = await this.signer.submit(sponsored);
      } catch (error) {
        commit(feeSpeck);
        this.refusedCount += 1;
        // The node's rejection text can quote the transaction, so the caller gets the stable
        // sentence and the operator's ledger gets the rest.
        const reason =
          'the sponsored transaction was rejected on submission. It may still have reached the ' +
          'chain, so the fee is counted as spent; check the transaction before retrying.';
        log('submit-failed', {
          code: 'SUBMIT_FAILED',
          reason,
          circuits: decision.circuits,
          contractAddress: decision.contractAddress,
          feeSpeck: feeSpeck.toString(),
          detail: this.debug ? upstreamText(error) : undefined,
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

/**
 * Upstream error text, bounded and flattened onto one line.
 *
 * Only ever reaches a log entry, and only when debug is on. Bounded because a wallet error can
 * carry a serialized transaction in its message, and flattened so it cannot forge log lines.
 */
function upstreamText(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

export { serializeSponsoredTx };
