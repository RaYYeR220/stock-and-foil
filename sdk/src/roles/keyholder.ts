// SPDX-License-Identifier: Apache-2.0
//
// One of three keyholders (say operator, court and regulator). A keyholder never reveals its
// Shamir share: it proves `s_i·G == keyholderPks[i]` in circuit and publishes `D_i = s_i·E`
// sealed to the auditor key, so approving is recorded on the ledger and cannot be done quietly.
import { pureCircuits } from '@stockandfoil/contract';
import { randomScalar } from '../crypto/scalar.js';
import type { CallInputs, Point, RegistryBackend, StockAndFoilPrivateState, TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

/** Slot on the ledger (0-based, as the circuit indexes `keyholderPks`). */
export type KeyholderIndex = 0 | 1 | 2;

export class KeyholderClient extends RoleClient {
  constructor(
    backend: RegistryBackend,
    persona: StockAndFoilPrivateState,
    readonly index: KeyholderIndex,
  ) {
    super(backend, persona);
  }

  private get scalar(): bigint {
    const s = this.persona.scalar;
    if (s === undefined) throw new Error('keyholder persona has no Shamir share');
    return s;
  }

  /** Shamir index (1-based) this keyholder's share was evaluated at. */
  get shamirIndex(): 1 | 2 | 3 {
    return (this.index + 1) as 1 | 2 | 3;
  }

  get publicKey(): Point {
    return pureCircuits.pubKeyOf(this.scalar);
  }

  /** The ledger key its sealed share will be stored under. */
  shareKeyOf(requestId: Uint8Array): Uint8Array {
    return pureCircuits.shareKeyOf(requestId, BigInt(this.index));
  }

  approve(requestId: Uint8Array, inputs: CallInputs = {}): Promise<TxReceipt> {
    return this.call('approveDisclosure', [requestId, BigInt(this.index)], {
      ephemeral: randomScalar(),
      ...inputs,
    });
  }
}
