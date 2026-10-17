// SPDX-License-Identifier: Apache-2.0
//
// Submitting the balanced transaction ourselves, through Blockfrost's node.
//
// Why this exists. The first mainnet deploy attempt got all the way through: 1AM proved the
// transaction, balanced it with DUST from its pool and handed back a properly bound
// `FinalizedTransaction`, which our adapter deserialized without complaint. Then
// `submitTransaction` resolved, and nothing ever appeared on chain — not by hash, not by
// identifier — while 1AM's own history marked it "timed out".
//
// The obvious explanation, that the wallet submits to a decommissioned endpoint, is only half
// right. `rpc.mainnet.midnight.network` answers and is healthy (12 peers, synced, checked
// 2026-10-17). But `indexer.mainnet.midnight.network`, which `getConfiguration()` also
// reports, was decommissioned and answers 410 — so 1AM can submit and then has no way to watch
// for the result. "Timed out" is what that looks like from inside the wallet, whether or not
// the submission itself worked.
//
// Rather than guess which half failed, we take the hop. Three facts make that straightforward,
// each established by probing the chain rather than reading about it:
//
//   * the chain accepts a Midnight transaction as `midnight.sendMnTransaction(Bytes)`;
//   * that extrinsic is **unsigned** — `wallet-sdk-node-client` calls `.send()` with no signer,
//     because the ledger transaction authenticates and pays for itself, so no Substrate
//     account and no second source of fees is needed;
//   * Blockfrost's RPC exposes the full `author_*` surface, and submitting a deliberately
//     invalid payload there answers `1010: Invalid Transaction: Custom error: 1` — the node
//     judging the payload, which is precisely the verdict we were not getting.
//
// So the split is: 1AM does what only it can do, proving and paying the DUST; we do the part
// it cannot currently do, which is put the bytes on the chain and watch them land. The project
// token stays here, in Node, exactly as it does for the indexer.
import type { Logger } from 'vite';

/** How long to wait for the node to put the transaction in a block before giving up on watching. */
const IN_BLOCK_TIMEOUT_MS = 180_000;

export interface SubmitResult {
  /** Hash of the Substrate extrinsic that carried the transaction. */
  extrinsicHash: string;
  /** Block it landed in. */
  blockHash: string;
  status: 'in-block';
}

/**
 * A submission that went out but whose fate we do not know.
 *
 * Kept distinct from a rejection on purpose. A rejected transaction definitely did not happen
 * and can be retried; one that was accepted into the pool and then not seen might still land,
 * and retrying it blindly is how a registry gets deployed twice.
 */
export class SubmissionUnseen extends Error {
  readonly unseen = true;
  constructor(
    readonly extrinsicHash: string | undefined,
    readonly waitedMs: number,
  ) {
    super(
      `the node accepted the transaction${extrinsicHash ? ` as extrinsic ${extrinsicHash}` : ''} but it ` +
        `was not in a block after ${Math.round(waitedMs / 1000)}s. It may still land. Check the chain ` +
        'before retrying — retrying a transaction that did land deploys a second registry.',
    );
    this.name = 'SubmissionUnseen';
  }
}

/** The node refused the transaction outright. Nothing happened, and a retry is safe. */
export class SubmissionRejected extends Error {
  readonly rejected = true;
  constructor(reason: string) {
    super(`the node refused the transaction: ${reason}`);
    this.name = 'SubmissionRejected';
  }
}

type PolkadotApi = {
  isConnected: boolean;
  disconnect(): Promise<void>;
  tx: Record<string, Record<string, (arg: string) => { send(cb: (result: unknown) => void): Promise<() => void>; hash: { toHex(): string } }>>;
};

let cached: { url: string; api: Promise<PolkadotApi> } | undefined;

/**
 * One connection, reused across the eleven transactions of a staged deployment.
 *
 * Creating an `ApiPromise` means fetching and decoding the chain metadata, which is seconds.
 * Doing that per transaction would add a minute to a deploy for no reason.
 */
async function connect(rpcUrl: string): Promise<PolkadotApi> {
  if (cached?.url === rpcUrl) {
    const existing = await cached.api.catch(() => undefined);
    if (existing?.isConnected) return existing;
  }
  // Imported here rather than at module scope: Vite bundles this plugin into its config, and
  // @polkadot/api is large. A bare specifier stays external, so Node resolves it at call time.
  const { ApiPromise, WsProvider } = await import('@polkadot/api');
  const api = ApiPromise.create({
    provider: new WsProvider(rpcUrl),
    noInitWarn: true,
  }) as unknown as Promise<PolkadotApi>;
  cached = { url: rpcUrl, api };
  return api;
}

/** Closes the shared connection, so the dev server can exit cleanly. */
export async function closeSubmitter(): Promise<void> {
  const api = await cached?.api.catch(() => undefined);
  cached = undefined;
  if (api?.isConnected) await api.disconnect().catch(() => undefined);
}

/**
 * Puts one balanced, bound transaction on chain and waits for it to be in a block.
 *
 * Resolves only once the node has included it. Every other outcome throws, and the three are
 * kept apart because the operator's next move differs: a rejection names the node's reason and
 * is safe to retry, an unseen submission is not, and a transport failure is neither.
 */
export async function submitMidnightTransaction(
  txHex: string,
  rpcUrl: string,
  logger?: Pick<Logger, 'info' | 'warn'>,
): Promise<SubmitResult> {
  const hex = txHex.startsWith('0x') ? txHex : `0x${txHex}`;
  if (!/^0x[0-9a-fA-F]+$/.test(hex) || hex.length < 10) {
    throw new SubmissionRejected(`"${txHex.slice(0, 24)}…" is not a serialized transaction`);
  }

  const api = await connect(rpcUrl);
  const call = api.tx['midnight']?.['sendMnTransaction'];
  if (typeof call !== 'function') {
    throw new Error(
      'this node does not expose midnight.sendMnTransaction, so it is not a Midnight node. ' +
        'Check the RPC URL.',
    );
  }

  const started = Date.now();
  const submittable = call(hex);
  const extrinsicHash = submittable.hash.toHex();
  logger?.info(`[mainnet-console] submitting ${hex.length / 2 - 1} bytes as extrinsic ${extrinsicHash}`);

  return await new Promise<SubmitResult>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        unsubscribe?.();
      } catch {
        // the subscription may already be gone; the outcome is what matters
      }
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new SubmissionUnseen(extrinsicHash, Date.now() - started))),
      IN_BLOCK_TIMEOUT_MS,
    );

    submittable
      .send((result: unknown) => {
        const r = result as {
          status?: {
            isInBlock?: boolean;
            isFinalized?: boolean;
            isInvalid?: boolean;
            isDropped?: boolean;
            isUsurped?: boolean;
            isFinalityTimeout?: boolean;
            type?: string;
            asInBlock?: { toHex(): string };
            asFinalized?: { toHex(): string };
          };
          dispatchError?: { toString(): string };
        };
        const status = r.status;
        if (!status) return;
        if (status.isInBlock || status.isFinalized) {
          const blockHash = (status.asInBlock ?? status.asFinalized)?.toHex() ?? '';
          if (r.dispatchError) {
            finish(() => reject(new SubmissionRejected(`${r.dispatchError!.toString()} (in block ${blockHash})`)));
            return;
          }
          finish(() => resolve({ extrinsicHash, blockHash, status: 'in-block' }));
          return;
        }
        if (status.isInvalid || status.isDropped || status.isUsurped || status.isFinalityTimeout) {
          finish(() => reject(new SubmissionRejected(`the node reported the transaction ${status.type ?? 'invalid'}`)));
        }
      })
      .then((unsub) => {
        unsubscribe = unsub;
        if (settled) unsub();
      })
      .catch((cause: unknown) => {
        // This is where `1010: Invalid Transaction: …` arrives — the node's own verdict,
        // carried through word for word rather than summarised.
        const message = cause instanceof Error ? cause.message : String(cause);
        finish(() => reject(new SubmissionRejected(message)));
      });
  });
}

export interface NodeFacts {
  chain: string;
  runtime: string;
  peers: number;
  syncing: boolean;
  /** Whether this node carries Midnight ledger transactions at all. */
  sendMnTransaction: boolean;
}

/** Reads the node, without submitting anything, and leaves the connection warm. */
export async function nodeAcceptsMidnightTransactions(rpcUrl: string): Promise<NodeFacts> {
  const api = (await connect(rpcUrl)) as unknown as PolkadotApi & {
    rpc: {
      system: { chain(): Promise<{ toString(): string }>; health(): Promise<{ peers: { toNumber(): number }; isSyncing: { isTrue: boolean } }> };
    };
    runtimeVersion: { specName: { toString(): string }; specVersion: { toNumber(): number } };
  };
  const [chain, health] = await Promise.all([api.rpc.system.chain(), api.rpc.system.health()]);
  return {
    chain: chain.toString(),
    runtime: `${api.runtimeVersion.specName.toString()} ${api.runtimeVersion.specVersion.toNumber()}`,
    peers: health.peers.toNumber(),
    syncing: health.isSyncing.isTrue,
    sendMnTransaction: typeof api.tx['midnight']?.['sendMnTransaction'] === 'function',
  };
}
