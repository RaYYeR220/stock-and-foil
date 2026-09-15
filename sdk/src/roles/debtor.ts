// SPDX-License-Identifier: Apache-2.0
//
// The large buyer. Acknowledging a payable is the root of trust in the whole registry: it is the
// only moment anybody attests that a receivable is real and priced correctly, and it is
// non-repudiable because the ack nullifier is public.
import { pureCircuits } from '@stockandfoil/contract';
import type { CallInputs, Invoice, TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

export class DebtorClient extends RoleClient {
  /** Member-tree leaf the operator admits: `H("debtor", debtorSk)`. */
  get leaf(): Uint8Array {
    return pureCircuits.debtorLeaf(this.secretKey);
  }

  /** The `debtorId` a seller must name in the invoice. */
  get id(): bigint {
    return pureCircuits.debtorIdOf(this.secretKey);
  }

  /** Attests the payable. One acknowledgment per (debtor, seller, invoice number), ever. */
  acknowledge(invoice: Invoice, inputs: CallInputs = {}): Promise<TxReceipt> {
    return this.call('acknowledge', [], { invoice, ...inputs });
  }

  /**
   * Pays the invoice into the registry. The proceeds land in the contract and only the party
   * holding the payee tag can take them out, which is what stops diverted proceeds.
   */
  pay(invoice: Invoice, inputs: CallInputs = {}): Promise<TxReceipt> {
    return this.call('payInvoice', [], { invoice, ...inputs });
  }

  /** The ack nullifier this debtor would publish for an invoice, for pre-flight checks. */
  ackNullifierOf(invoice: Invoice): Uint8Array {
    return pureCircuits.ackNullifierOf(this.secretKey, invoice.sellerId, invoice.invoiceNo);
  }
}
