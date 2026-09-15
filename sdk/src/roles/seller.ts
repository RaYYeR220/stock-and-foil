// SPDX-License-Identifier: Apache-2.0
//
// The supplier. It issues invoices (including the salt that keeps a known invoice untestable),
// offers acknowledged receivables to one financier at a time, locks a pool of them behind a
// borrowing-base certificate, and claims proceeds nobody financed.
import { pureCircuits } from '@stockandfoil/contract';
import { randomField, randomScalar } from '../crypto/scalar.js';
import type { CallInputs, Invoice, TxReceipt } from '../types.js';
import type { UserAddress } from '../bytes.js';
import { RoleClient } from './base.js';

/** One slot of a borrowing base: an acknowledged invoice and the lender's tag for it. */
export interface PoolSlot {
  invoice: Invoice;
  holderTag: bigint;
}

export interface CertifyOptions {
  /** Public label of the lender the pool is offered to. */
  lenderRef: Uint8Array;
  /**
   * Lender-chosen nonce, which **must be 32 uniformly random bytes** — use
   * `FinancierClient.newLenderNonce()`. It is the only secret in the certificate: the ledger key
   * is `H("cert", lenderRef, lenderNonce)` with a public `lenderRef`, so a guessable nonce (a
   * counter, a date, a customer reference) is recoverable from that key, and with it anyone who
   * knows a candidate `sellerId` can confirm the borrower behind `borrowerCommit` — or burn the
   * certificate id in advance.
   */
  lenderNonce: Uint8Array;
  /** Amount the pool is claimed to be worth, in minor units. */
  floor: bigint;
  /** Expiry of every locked slot. Must not outlive any invoice in the pool. */
  validUntil: bigint;
}

/** Unused certificate slots must carry the zero invoice: the circuit hashes what it is given. */
const ZERO_INVOICE: Invoice = { debtorId: 0n, sellerId: 0n, invoiceNo: 0n, amount: 0n, dueDate: 0n, salt: 0n };

const pad4 = <T>(values: readonly T[], fill: T): [T, T, T, T] => [
  values[0] ?? fill,
  values[1] ?? fill,
  values[2] ?? fill,
  values[3] ?? fill,
];

export class SellerClient extends RoleClient {
  /** The `sellerId` carried inside every invoice this seller issues. */
  get id(): bigint {
    return pureCircuits.sellerIdOf(this.secretKey);
  }

  /**
   * Builds an invoice. The salt is fresh unless supplied: without it nobody can test whether a
   * known invoice is encumbered, which closes the confirmation attack.
   */
  issueInvoice(o: {
    debtorId: bigint;
    invoiceNo: bigint;
    amount: bigint;
    dueDate: bigint;
    salt?: bigint;
  }): Invoice {
    return {
      debtorId: o.debtorId,
      sellerId: this.id,
      invoiceNo: o.invoiceNo,
      amount: o.amount,
      dueDate: o.dueDate,
      salt: o.salt ?? randomField(),
    };
  }

  /**
   * Offers one acknowledged invoice to the financier that issued `holderTag`.
   *
   * The sealing scalar is drawn fresh here. Overriding it through `inputs.ephemeral` is for tests
   * only: reusing one scalar publishes the same ephemeral point twice, which cancels the masks
   * and lets anyone read off which fields the two records share — and, when the nullifier is also
   * the same, silently overwrites the earlier record under the same ledger key.
   */
  offer(invoice: Invoice, holderTag: bigint, expiry: bigint, inputs: CallInputs = {}): Promise<TxReceipt> {
    return this.call('offer', [holderTag, expiry], { invoice, ephemeral: randomScalar(), ...inputs });
  }

  /**
   * Locks up to four acknowledged invoices to one lender and proves the pool is worth at least
   * `floor`. Each used slot becomes an ordinary offer the lender takes up with `accept`.
   */
  certify(slots: readonly PoolSlot[], o: CertifyOptions, inputs: CallInputs = {}): Promise<TxReceipt> {
    if (slots.length > 4) throw new Error(`a borrowing base holds at most 4 invoices, got ${slots.length}`);
    if (o.lenderRef.length !== 32) throw new Error(`lenderRef must be 32 bytes, got ${o.lenderRef.length}`);
    if (o.lenderNonce.length !== 32) throw new Error(`lenderNonce must be 32 bytes, got ${o.lenderNonce.length}`);
    return this.call('certifyBorrowingBase', [o.lenderRef, o.lenderNonce, o.floor, o.validUntil], {
      invoices: pad4(slots.map((s) => s.invoice), ZERO_INVOICE),
      used: pad4(slots.map(() => true), false),
      holderTags: pad4(slots.map((s) => s.holderTag), 0n),
      ephemerals: [randomScalar(), randomScalar(), randomScalar(), randomScalar()],
      ...inputs,
    });
  }

  /**
   * Takes the proceeds of a settled invoice no financier holds.
   *
   * Settlement is unshielded: `to` and the amount are public against a public nullifier, so use a
   * fresh address per claim unless the whole settled book should cluster under one.
   */
  claim(nullifier: Uint8Array, to: UserAddress): Promise<TxReceipt> {
    return this.call('claimAsSeller', [nullifier, to]);
  }

  /** The payee tag this seller can prove for an invoice that was never pledged. */
  payeeTagOf(nullifier: Uint8Array): bigint {
    return pureCircuits.sellerPayeeTagOf(this.id, nullifier);
  }

  /** The public pledge nullifier of an invoice; the certificate id of a lender reference. */
  nullifierOf(invoice: Invoice): Uint8Array {
    return pureCircuits.nullifierOf(invoice);
  }

  certIdOf(lenderRef: Uint8Array, lenderNonce: Uint8Array): Uint8Array {
    return pureCircuits.certIdOf(lenderRef, lenderNonce);
  }
}
