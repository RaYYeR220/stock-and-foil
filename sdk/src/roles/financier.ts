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
import { randomBytes32 } from '../crypto/scalar.js';
import { encumbranceOf, findPledge, type Encumbrance, type Invoice, type TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

export class FinancierClient extends RoleClient {
  /** Member-tree leaf the operator admits: `H("financier", finSk)`. */
  get leaf(): Uint8Array {
    return pureCircuits.financierLeaf(this.secretKey);
  }

  /**
   * A nonce to hand a borrower for a borrowing-base certificate. **Always use this** rather than
   * a counter, a date or a customer reference: the certificate's ledger key is
   * `H("cert", lenderRef, lenderNonce)` and `lenderRef` is public, so a guessable nonce can be
   * recovered from the key by brute force. Whoever recovers it can then test
   * `borrowerCommitOf(sellerId, nonce)` — de-anonymising the borrower to anyone who knows that
   * seller's id, which every one of its debtors does — and can also pre-register the same
   * certificate id to deny it (`DUPLICATE_CERTIFICATE`) before the borrower ever uses it.
   */
  newLenderNonce(): Uint8Array {
    return randomBytes32();
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

  /**
   * Takes the proceeds of a settled invoice this financier held when it was paid.
   *
   * Settlement is unshielded, so `to` and the amount are public and are written against a public
   * pledge nullifier. Holder tags are unlinkable, but a claim address is not: **use a fresh
   * address per claim**, or every receivable this financier ever funded clusters under one
   * address and its book size becomes public.
   */
  claim(nullifier: Uint8Array, to: UserAddress): Promise<TxReceipt> {
    return this.call('claimAsHolder', [nullifier, to]);
  }
}
