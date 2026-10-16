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

  /** The ledger key its sealed share will take for one slot of a case. */
  caseShareKeyOf(caseRef: Uint8Array, slot: number): Uint8Array {
    return pureCircuits.caseShareKeyOf(caseRef, BigInt(this.index), BigInt(slot));
  }

  /**
   * Approves a whole **case** at once: one signature, one sealed share per record the case
   * covers. It is the answer to having had to approve an insolvency record by record.
   *
   * Read what the case covers before calling — `findCase(view, caseRef).recordIds` — because
   * this consent is **broader than a record approval and cannot be partly withheld**. Approving
   * a case approves every record in it, now and for as long as the case stands; the threshold
   * is unchanged, so a second keyholder is still required before anything opens.
   */
  approveCase(caseRef: Uint8Array, inputs: CallInputs = {}): Promise<TxReceipt> {
    return this.call('approveCase', [caseRef, BigInt(this.index)], {
      ephemeral: randomScalar(),
      ...inputs,
    });
  }
}
