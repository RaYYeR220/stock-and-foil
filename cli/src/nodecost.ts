// SPDX-License-Identifier: Apache-2.0
//
// What the target chain itself says a transaction costs.
//
// This exists because the obvious way to price a transaction is wrong, and wrong by enough to
// change a decision. `Transaction.fees(LedgerParameters.initialParameters())` runs the ledger's
// own cost function against the ledger's *baseline* parameters — and no public network runs
// those. Measured on 2026-10-17 against the identical bytes of our committed deployment:
//
//                                     the deploy tx      all eleven txs
//   baseline `Transaction.fees`        4.612 DUST          15.70 DUST
//   mainnet's own `getTransactionCost` 0.000717 DUST        0.002008 DUST
//
// A factor of about 7,800 across the deployment, in the expensive direction — which is the
// direction that talks you out of a deployment that would have worked. It did exactly that
// here for most of a day.
//
// `midnightRuntimeApi.getTransactionCost` is the runtime's answer for exact bytes under
// whatever parameters that chain is actually running. It needs no wallet, no sync and no
// account: one WebSocket connection and a round trip per transaction. It returns a `Result`,
// so bytes the runtime cannot decode come back as an error rather than as a number.
//
// `tools/mainnet-console/server/submit.ts` has a second copy of this call, and that is
// deliberate: the console reaches it from a Vite config, whose bundler leaves bare specifiers
// external and so cannot load this package's TypeScript source. Both call the same runtime API.
import { redactEndpoint } from './common.js';

/** How long the node gets to answer before it is called unreachable. */
export const DEFAULT_RPC_TIMEOUT_MS = 20_000;

/** One transaction's price, or the reason the chain would not give one. */
export interface NodeQuote {
  speck?: bigint;
  error?: string;
}

interface RuntimeApi {
  call: { midnightRuntimeApi?: { getTransactionCost?(bytes: string): Promise<unknown> } };
  rpc: { system: { chain(): Promise<{ toString(): string }> } };
  disconnect(): Promise<void>;
}

/** Raised when the chain cannot be reached at all, so a caller can say that rather than guess. */
export class NodeUnreachable extends Error {
  constructor(nodeUrl: string, cause: unknown) {
    super(`could not reach the node at ${redactEndpoint(nodeUrl)} to ask it what a transaction costs: ${reasonFor(cause)}`);
    this.name = 'NodeUnreachable';
  }
}

/**
 * A readable reason out of whatever the websocket threw.
 *
 * A refused or unresolvable endpoint surfaces as a DOM-style `Event` with no `message` at all,
 * so `String(cause)` gives `[object Object]` and an `Error`'s message is empty. Both become a
 * sentence here, because this text is the whole of what the operator is told.
 */
function reasonFor(cause: unknown): string {
  if (typeof cause === 'string' && cause !== '') return cause;
  const message = (cause as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message !== '') return message;
  const type = (cause as { type?: unknown } | null)?.type;
  if (typeof type === 'string' && type !== '') return `the websocket reported "${type}"`;
  return 'the connection was refused, or the host did not answer';
}

/** Rejects rather than waiting for ever, because a hung estimate looks like a working one. */
function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)}s`)), ms);
    timer.unref?.();
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

export interface NodePricer {
  /** The chain's own name, so the report can say which chain answered. */
  chain: string;
  quote(txHex: string): Promise<NodeQuote>;
  close(): Promise<void>;
}

/**
 * Opens one connection for a whole estimate.
 *
 * Two things here are load-bearing, and both were learned the hard way.
 *
 * `new WsProvider(url, false)` turns the auto-reconnect loop **off**. With it on — which is the
 * default, and what the first version of this file used — an unreachable endpoint is retried
 * every second for ever and `ApiPromise.create` simply never settles. The command does not fail
 * and does not print: it hangs, indefinitely, which is strictly worse than a wrong number
 * because nobody can tell it apart from slow work. With auto-reconnect off, a refused port
 * rejects in about 20ms and an unreachable host in about 200ms.
 *
 * The explicit `provider.connect()` is the other half: a provider created with auto-connect off
 * never dials on its own, so `ApiPromise.create` alone would sit on a socket that was never
 * opened and only the deadline would end it. Connect first, then build the API.
 *
 * `@polkadot/api` is imported here rather than at module scope so that `estimate --offline`,
 * and every other CLI command, pays nothing for it.
 */
export async function openNodePricer(nodeUrl: string, timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<NodePricer> {
  const { ApiPromise, WsProvider } = await import('@polkadot/api');
  const provider = new WsProvider(nodeUrl, false);

  // The socket reports its failure on this channel, and the rejection that follows usually
  // carries no message of its own, so whatever arrives first is kept for the error text.
  let socketError: unknown;
  provider.on('error', (error: unknown) => {
    socketError ??= error;
  });

  let api: RuntimeApi;
  try {
    await withDeadline(provider.connect(), timeoutMs, 'the node');
    api = (await withDeadline(
      ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true }),
      timeoutMs,
      'the node',
    )) as unknown as RuntimeApi;
  } catch (cause) {
    await provider.disconnect().catch(() => undefined);
    throw new NodeUnreachable(nodeUrl, socketError ?? cause);
  }

  const getCost = api.call.midnightRuntimeApi?.getTransactionCost;
  if (typeof getCost !== 'function') {
    await api.disconnect().catch(() => undefined);
    throw new NodeUnreachable(
      nodeUrl,
      new Error('it does not expose midnightRuntimeApi.getTransactionCost, so it is not a Midnight node'),
    );
  }

  const chain = await withDeadline(api.rpc.system.chain(), timeoutMs, 'the node')
    .then((c) => c.toString())
    .catch(() => 'unknown chain');

  return {
    chain,
    async quote(txHex: string): Promise<NodeQuote> {
      const hex = txHex.startsWith('0x') ? txHex : `0x${txHex}`;
      try {
        const result = (await withDeadline(getCost(hex), timeoutMs, 'the node')) as {
          isOk?: boolean;
          asOk?: { toString(): string };
          asErr?: { toString(): string };
          toString(): string;
        };
        if (result.isOk === false) return { error: result.asErr?.toString() ?? result.toString() };
        const value = result.asOk?.toString() ?? result.toString();
        return /^\d+$/.test(value) ? { speck: BigInt(value) } : { error: value };
      } catch (cause) {
        return { error: reasonFor(cause) };
      }
    },
    close: () => api.disconnect().catch(() => undefined) as Promise<void>,
  };
}
