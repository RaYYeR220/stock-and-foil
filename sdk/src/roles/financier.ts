// SPDX-License-Identifier: Apache-2.0
//
// The factor. It issues a per-pledge holder tag off-chain during diligence, checks that the
// receivable is free, accepts the offer, and later releases it or claims the proceeds.
//
// `checkEncumbrance` is the cross-financier check the industry cannot do today: it answers
// "is this receivable already financed?" from public state alone, and reveals nothing about who
// holds it or what it is worth.
import { pureCircuits } from '@stockandfoil/contract';
import type { UserAddress } from '../bytes.js';
import { encumbranceOf, findPledge, type Encumbrance, type Invoice, type TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

export class FinancierClient extends RoleClient {
  /** Member-tree leaf the operator admits: `H("financier", finSk)`. */
  get leaf(): Uint8Array {
    return pureCircuits.financierLeaf(this.secretKey);
  }

  /**
   * `H("holder", finSk, N)` — handed to the seller off-chain. Distinct per pledge, so two tags
   * of the same financier cannot be linked to each other on the ledger.
   */
  holderTag(nullifier: Uint8Array): bigint {
    return pureCircuits.holderTagOf(this.secretKey, nullifier);
  }

  /** Whether a receivable can be financed right now, from public state only. */
  async checkEncumbrance(invoice: Invoice): Promise<Encumbrance> {
    const nullifier = pureCircuits.nullifierOf(invoice);
    const [view, now] = await Promise.all([this.backend.publicState(), this.backend.now()]);
    return encumbranceOf(findPledge(view, nullifier), now);
  }

  accept(nullifier: Uint8Array): Promise<TxReceipt> {
    return this.call('accept', [nullifier]);
  }

  release(nullifier: Uint8Array): Promise<TxReceipt> {
    return this.call('release', [nullifier]);
  }

  /** Takes the proceeds of a settled invoice this financier held when it was paid. */
  claim(nullifier: Uint8Array, to: UserAddress): Promise<TxReceipt> {
    return this.call('claimAsHolder', [nullifier, to]);
  }
}
