// SPDX-License-Identifier: Apache-2.0
//
// Witness implementations. Witnesses only *supply* private data; every property that
// matters (membership, ownership, freshness) is re-checked by circuit asserts, so a
// lying witness produces a refusal, never an invalid state transition.
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Invoice, Ledger, Witnesses } from './managed/stock-and-foil/contract/index.js';
import type { MerklePath, StockAndFoilPrivateState } from './private-state.js';

type Ctx = WitnessContext<Ledger, StockAndFoilPrivateState>;

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Path that cannot verify: leaf is the requested one, siblings are zero. The circuit then refuses. */
export const dummyPath = (leaf: Uint8Array, depth: number): MerklePath => ({
  leaf,
  path: Array.from({ length: depth }, () => ({ sibling: { field: 0n }, goes_left: false })),
});

function resolvePath(ctx: Ctx, tree: 'acks' | 'debtors' | 'financiers', depth: number, leaf: Uint8Array): MerklePath {
  const supplied = ctx.privateState.call?.paths?.[hex(leaf)];
  if (supplied) return supplied as MerklePath;
  return (ctx.ledger[tree].findPathForLeaf(leaf) as MerklePath | undefined) ?? dummyPath(leaf, depth);
}

function requireInvoice(ctx: Ctx): Invoice {
  const inv = ctx.privateState.call?.invoice;
  if (!inv) throw new Error('witness callInvoice: privateState.call.invoice is not set');
  return inv;
}

export const witnesses: Witnesses<StockAndFoilPrivateState> = {
  localSecretKey: (ctx) => [ctx.privateState, ctx.privateState.secretKey],
  callInvoice: (ctx) => [ctx.privateState, requireInvoice(ctx)],
  debtorPathFor: (ctx, leaf) => [ctx.privateState, resolvePath(ctx, 'debtors', 10, leaf)],
};
