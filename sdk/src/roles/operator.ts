// SPDX-License-Identifier: Apache-2.0
//
// The registry consortium. It admits debtors and financiers after off-chain KYB and can do
// nothing else: it cannot pledge, settle or open a record.
import { pureCircuits } from '@stockandfoil/contract';
import { hex } from '../bytes.js';
import { randomBytes32 } from '../crypto/scalar.js';
import type { TxReceipt } from '../types.js';
import { RoleClient } from './base.js';

/** A contract address as the runtime exchanges them: 32 bytes in a wrapper. */
export interface ContractAddressValue {
  bytes: Uint8Array;
}

/** What the operator keeps after declaring a peer, so it can open the label commitment later. */
export interface PeerDeclaration {
  address: string;
  label: Uint8Array;
  labelSalt: Uint8Array;
  labelCommit: Uint8Array;
  receipt: TxReceipt;
}

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

  /** `H("peerlabel", label, salt)` — what the ledger stores in place of the operator's own name for a peer. */
  peerLabelCommitOf(label: Uint8Array, labelSalt: Uint8Array): Uint8Array {
    return pureCircuits.peerLabelCommitOf(label, labelSalt);
  }

  /**
   * Declares another Stock & Foil registry as a peer of this one.
   *
   * This is the on-chain half of the federation answer: a marker is a function of the invoice
   * alone, so the same receivable has the same marker in every registry, and a lender can put
   * the encumbrance question to all of them (`FinancierClient.checkEncumbranceAcross`). What is
   * published here is only *which addresses this operator recognises* — the contract does not
   * and cannot check that the address holds a registry, that it is honest, or that it still
   * exists. Treat a peer list as a directory, never as an endorsement.
   *
   * The label is committed, not published: pass 32 bytes of your own naming plus a random salt
   * (drawn here when omitted), keep both, and open the commitment to a counterparty off chain.
   */
  async registerPeer(
    peer: ContractAddressValue | Uint8Array,
    label: Uint8Array,
    labelSalt: Uint8Array = randomBytes32(),
  ): Promise<PeerDeclaration> {
    const address = peer instanceof Uint8Array ? { bytes: peer } : peer;
    if (address.bytes.length !== 32) throw new Error(`a peer address is 32 bytes, got ${address.bytes.length}`);
    if (label.length !== 32) throw new Error(`a peer label is 32 bytes, got ${label.length}`);
    if (labelSalt.length !== 32) throw new Error(`a peer label salt is 32 bytes, got ${labelSalt.length}`);
    const receipt = await this.call('registerPeer', [address, label, labelSalt]);
    return {
      address: hex(address.bytes),
      label,
      labelSalt,
      labelCommit: this.peerLabelCommitOf(label, labelSalt),
      receipt,
    };
  }
}
