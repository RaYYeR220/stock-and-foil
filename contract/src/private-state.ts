// SPDX-License-Identifier: Apache-2.0
//
// Private state held by each persona. Nothing here ever leaves the local machine:
// circuits read it through witnesses and only disclose values the contract asserts on.
import type { Invoice } from './managed/stock-and-foil/contract/index.js';

export type Bytes32 = Uint8Array;

export type Role = 'operator' | 'debtor' | 'seller' | 'financier' | 'auditor' | 'keyholder';

/** Merkle path as returned by `ledger.<tree>.findPathForLeaf(leaf)`. */
export interface MerklePath {
  leaf: Uint8Array;
  path: { sibling: { field: bigint }; goes_left: boolean }[];
}

/** Per-call witness inputs, set by the SDK right before a circuit is invoked. */
export interface CallInputs {
  /** Invoice for `acknowledge`, `offer` and `payInvoice`. */
  invoice?: Invoice;
  /** Borrowing-base pool slots for `certifyBorrowingBase`. */
  invoices?: [Invoice, Invoice, Invoice, Invoice];
  /** Which pool slots are in use. */
  used?: [boolean, boolean, boolean, boolean];
  /** Lender-issued holder tags, one per pool slot. */
  holderTags?: [bigint, bigint, bigint, bigint];
  /** Merkle paths keyed by leaf hex; when absent the witness resolves paths from the ledger. */
  paths?: Record<string, unknown>;
  /** Fresh Jubjub scalar for `offer` / `approveDisclosure`; generated when absent. */
  ephemeral?: bigint;
  /** Fresh Jubjub scalars, one per pool slot record; generated when absent. */
  ephemerals?: [bigint, bigint, bigint, bigint];
}

export interface StockAndFoilPrivateState {
  role: Role;
  /** opSk | debtorSk | sellerSk | finSk. */
  secretKey: Bytes32;
  /** Jubjub scalar: auditor key or keyholder share s_i. */
  scalar?: bigint;
  /** Per-call witness inputs. */
  call?: CallInputs;
}

export function createPrivateState(role: Role, secretKey: Bytes32, scalar?: bigint): StockAndFoilPrivateState {
  if (secretKey.length !== 32) throw new Error('secretKey must be 32 bytes');
  return scalar === undefined ? { role, secretKey } : { role, secretKey, scalar };
}

export function withCall(state: StockAndFoilPrivateState, call: CallInputs | undefined): StockAndFoilPrivateState {
  return { ...state, call };
}
