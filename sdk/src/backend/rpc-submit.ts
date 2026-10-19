// SPDX-License-Identifier: Apache-2.0
/**
 * Submitting a transaction straight to a Midnight node's JSON-RPC, bypassing the wallet SDK.
 *
 * The wallet's own `submitTransaction` watches the extrinsic through a subscription. Blockfrost,
 * which is the public RPC for mainnet, refuses the subscribing and introspecting calls on a
 * shared endpoint the same way it refuses `system_dryRun` (`-32601 RPC call is unsafe to be
 * called externally`), so on that network the wallet can put bytes on the wire but cannot learn
 * what became of them — and reports the attempt as a bare submission error.
 *
 * `midnight.sendMnTransaction` is a plain extrinsic, so this submits it and watches the ordinary
 * status stream, which is allowed. The same code read the node's verdict on the three sponsored
 * attempts recorded in docs/MAINNET.md.
 */

/** What the node said, kept so the caller can report it rather than guess. */
export interface RpcSubmitResult {
  extrinsicHash: string;
  bytes: number;
  statuses: Array<{ atMs: number; status: string; detail?: string }>;
  block?: string;
}

const IN_BLOCK_TIMEOUT_MS = 180_000;

export class RpcSubmitError extends Error {
  constructor(
    message: string,
    readonly statuses: RpcSubmitResult['statuses'] = [],
  ) {
    super(message);
    this.name = 'RpcSubmitError';
  }
}

/**
 * Puts one serialized, balanced, bound transaction on chain and resolves when a block holds it.
 *
 * Rejection, non-inclusion and transport failure are kept apart: a rejection carries the node's
 * own reason and is safe to retry, a transaction that was accepted but never included is not.
 */
export async function submitViaRpc(
  txHex: string,
  rpcUrl: string,
  log: (line: string) => void = () => {},
): Promise<RpcSubmitResult> {
  const hex = txHex.startsWith('0x') ? txHex : `0x${txHex}`;
  const { ApiPromise, WsProvider } = await import('@polkadot/api');
  const api = await ApiPromise.create({
    provider: new WsProvider(rpcUrl, false),
    throwOnConnect: true,
    noInitWarn: true,
  });
  try {
    const call = (api.tx as any)['midnight']?.['sendMnTransaction'];
    if (typeof call !== 'function') {
      throw new RpcSubmitError('this RPC does not expose midnight.sendMnTransaction, so it is not a Midnight node');
    }
    const submittable = call(hex);
    const out: RpcSubmitResult = {
      extrinsicHash: submittable.hash.toHex(),
      bytes: hex.length / 2 - 1,
      statuses: [],
    };
    const started = Date.now();
    log(`      submitting ${out.bytes} bytes as extrinsic ${out.extrinsicHash}`);

    return await new Promise<RpcSubmitResult>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let settled = false;
      const note = (status: string, detail?: string): void => {
        out.statuses.push({ atMs: Date.now() - started, status, detail });
        log(`      ${Date.now() - started}ms ${status}${detail ? ` ${detail}` : ''}`);
      };
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
        () => finish(() => reject(new RpcSubmitError(`not in a block after ${IN_BLOCK_TIMEOUT_MS / 1000}s`, out.statuses))),
        IN_BLOCK_TIMEOUT_MS,
      );

      submittable
        .send((result: any) => {
          const status = result?.status;
          if (!status) return;
          const name = status.type ?? String(status);
          if (status.isInBlock || status.isFinalized) {
            const block = (status.asInBlock ?? status.asFinalized).toHex();
            out.block = block;
            note(name, block);
            finish(() => resolve(out));
            return;
          }
          if (status.isInvalid || status.isDropped || status.isUsurped) {
            note(name);
            finish(() => reject(new RpcSubmitError(`the node marked the transaction ${name}`, out.statuses)));
            return;
          }
          note(name);
        })
        .then((unsub: () => void) => {
          unsubscribe = unsub;
        })
        .catch((cause: unknown) => {
          const e = cause as { code?: number; message?: string; data?: unknown };
          finish(() =>
            reject(
              new RpcSubmitError(
                `the node refused the submission: ${e.code !== undefined ? `${e.code}: ` : ''}${e.message ?? String(cause)}` +
                  `${e.data === undefined ? '' : ` | data: ${JSON.stringify(e.data).slice(0, 300)}`}`,
                out.statuses,
              ),
            ),
          );
        });
    });
  } finally {
    await api.disconnect().catch(() => {});
  }
}
