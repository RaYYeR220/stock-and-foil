// SPDX-License-Identifier: Apache-2.0
//
// The registry consortium. It admits debtors and financiers after off-chain KYB and can do
// nothing else: it cannot pledge, settle or open a record.
import { pureCircuits } from '@stockandfoil/contract';
import type { TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

export class OperatorClient extends RoleClient {
  /** `H("operator", opSk)`, the value sealed into the ledger at deploy. */
  get operatorId(): Uint8Array {
    return pureCircuits.operatorIdOf(this.secretKey);
  }

  admitDebtor(leaf: Uint8Array): Promise<TxReceipt> {
    return this.call('admitDebtor', [leaf]);
  }

  admitFinancier(leaf: Uint8Array): Promise<TxReceipt> {
    return this.call('admitFinancier', [leaf]);
  }
}
