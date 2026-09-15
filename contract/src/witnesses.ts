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

/** Order of the Jubjub prime-order subgroup; `ecMul` rejects scalars outside [0, ORDER). */
const JUBJUB_ORDER = 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

/** Uniform scalar in [1, JUBJUB_ORDER), used when the caller supplies no sealing randomness. */
function randomScalar(): bigint {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const x = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n) & ((1n << 252n) - 1n);
    if (x > 0n && x < JUBJUB_ORDER) return x;
  }
}

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

function requireScalar(ctx: Ctx): bigint {
  const s = ctx.privateState.scalar;
  if (s === undefined) throw new Error('witness localScalar: privateState.scalar is not set');
  return s;
}

/** Fresh sealing scalar; a caller that supplies its own must keep it in [1, JUBJUB_ORDER). */
function ephemeral(ctx: Ctx): bigint {
  return ctx.privateState.call?.ephemeral ?? randomScalar();
}

export const witnesses: Witnesses<StockAndFoilPrivateState> = {
  localSecretKey: (ctx) => [ctx.privateState, ctx.privateState.secretKey],
  localScalar: (ctx) => [ctx.privateState, requireScalar(ctx)],
  ephemeralScalar: (ctx) => [ctx.privateState, ephemeral(ctx)],
  callInvoice: (ctx) => [ctx.privateState, requireInvoice(ctx)],
  debtorPathFor: (ctx, leaf) => [ctx.privateState, resolvePath(ctx, 'debtors', 10, leaf)],
  financierPathFor: (ctx, leaf) => [ctx.privateState, resolvePath(ctx, 'financiers', 10, leaf)],
  ackPathFor: (ctx, leaf) => [ctx.privateState, resolvePath(ctx, 'acks', 16, leaf)],
};
