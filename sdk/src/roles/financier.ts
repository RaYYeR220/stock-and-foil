// SPDX-License-Identifier: Apache-2.0
//
// The factor. It issues a per-pledge holder tag off-chain during diligence, checks that the
// receivable is free, accepts the offer, and later releases it or claims the proceeds.
//
// `checkEncumbrance` is the cross-financier check the industry cannot do today: it answers
// "is this receivable already financed?" from public state alone, and reveals nothing about who
// holds it or what it is worth.
import { pureCircuits } from '@stockandfoil/contract';
import { toBytes32, toHex, ZERO_BYTES32, type UserAddress } from '../bytes.js';
import { randomBytes32 } from '../crypto/scalar.js';
import {
  encumbranceOf,
  findCertificate,
  findPledge,
  type Encumbrance,
  type Invoice,
  type NetworkName,
  type PledgeStatusName,
  type RegistryBackend,
  type TxReceipt,
} from '../types.js';
import { RoleClient } from './base.js';

/** One registry's answer to the encumbrance question about a single receivable. */
export interface RegistryEncumbrance {
  contractAddress: string;
  network: NetworkName;
  encumbrance: Encumbrance;
  /** The registry could not be read. `encumbrance` is then meaningless, not "free". */
  unreachable: boolean;
  error?: string;
}

/** The encumbrance question answered by this registry and by every peer that was asked. */
export interface FederatedEncumbrance {
  nullifier: string;
  here: RegistryEncumbrance;
  peers: RegistryEncumbrance[];
  /** At least one registry holds a live or settled marker for this receivable. */
  encumberedAnywhere: boolean;
  /** Every registry answered. A `false` here means "unknown", not "free". */
  complete: boolean;
}

/** One slot of a certificate, as the lender it claims to be addressed to sees it. */
export interface CertificateSlot {
  nullifier: string;
  status: PledgeStatusName;
  /** `pledges[N].holderTag` equals this financier's tag for `N`. */
  addressedToMe: boolean;
  /** An unexpired offer, so accepting it would succeed. */
  live: boolean;
}

/** Whether a borrowing-base certificate really locks its pool to this financier. */
export interface CertificateCheck {
  certId: string;
  found: boolean;
  floor: bigint;
  validUntil: bigint;
  expired: boolean;
  slots: CertificateSlot[];
  /** Every slot is an unexpired offer addressed to this financier. */
  ok: boolean;
}

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

  /** `H("cert", lenderRef, lenderNonce)` — the ledger key of the certificate this lender asked for. */
  certIdOf(lenderRef: Uint8Array, lenderNonce: Uint8Array): Uint8Array {
    return pureCircuits.certIdOf(lenderRef, lenderNonce);
  }

  /** Whether a receivable can be financed right now, from public state only. */
  async checkEncumbrance(invoice: Invoice): Promise<Encumbrance> {
    const nullifier = pureCircuits.nullifierOf(invoice);
    const [view, now] = await Promise.all([this.backend.publicState(), this.backend.now()]);
    return encumbranceOf(findPledge(view, nullifier), now);
  }

  /**
   * The same question, put to this registry **and to every other registry handed in**.
   *
   * This is the answer to "a registry only works once all your competitors join it". A marker
   * `N = H("pledge", F)` is a function of the invoice and of nothing else — no registry
   * identity, no operator key, no deployment salt — so the same receivable produces the same
   * marker everywhere, and a single lender can check every registry it knows of without any of
   * them federating, sharing state or agreeing to anything. A second registry answers
   * "encumbered: yes" about a receivable in its own book while revealing no holder, no amount
   * and no party, exactly as the first one does.
   *
   * `registries` are backends for the peers — `OperatorClient.registerPeer` publishes their
   * addresses, and `view.peers` lists them. Each is queried independently; a peer that cannot be
   * reached is reported as `unreachable` rather than silently treated as "free", because
   * "nobody answered" and "nobody has it" are the two things a lender must not confuse.
   */
  async checkEncumbranceAcross(
    invoice: Invoice,
    registries: readonly RegistryBackend[] = [],
  ): Promise<FederatedEncumbrance> {
    const nullifier = pureCircuits.nullifierOf(invoice);
    const ask = async (backend: RegistryBackend): Promise<RegistryEncumbrance> => {
      try {
        const [view, now] = await Promise.all([backend.publicState(), backend.now()]);
        return {
          contractAddress: backend.contractAddress,
          network: backend.network,
          encumbrance: encumbranceOf(findPledge(view, nullifier), now),
          unreachable: false,
        };
      } catch (error) {
        return {
          contractAddress: backend.contractAddress,
          network: backend.network,
          encumbrance: 'FREE',
          unreachable: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
    const [here, ...peers] = await Promise.all([this.backend, ...registries].map(ask));
    return {
      nullifier: toHex(nullifier),
      here: here!,
      peers,
      encumberedAnywhere: [here!, ...peers].some((r) => r.encumbrance !== 'FREE'),
      complete: peers.every((r) => !r.unreachable) && !here!.unreachable,
    };
  }

  /**
   * Checks that a borrowing-base certificate actually locks its pool **to this financier**.
   *
   * The certificate proves the pool cleared a floor and names the markers it locked, but the
   * holder tag of each locked slot comes from a witness the *seller* supplies: nothing in the
   * circuit ties it to the lender named by `lenderRef`. A pool can therefore be locked with tags
   * the lender cannot recompute — the markers read `OFFERED` to every observer, the lender can
   * never accept them, and they fall free again at `validUntil`. Run this before advancing
   * against a certificate, or simply `accept` every slot, which fails the same way.
   */
  async checkCertificate(certId: Uint8Array | string): Promise<CertificateCheck> {
    const [view, now] = await Promise.all([this.backend.publicState(), this.backend.now()]);
    const certificate = findCertificate(view, certId);
    const empty: CertificateCheck = {
      certId: toHex(certId),
      found: false,
      floor: 0n,
      validUntil: 0n,
      expired: true,
      slots: [],
      ok: false,
    };
    if (!certificate) return empty;

    const slots = certificate.nullifiers.map((nullifier): CertificateSlot => {
      const pledge = findPledge(view, nullifier);
      const mine = String(this.holderTag(toBytes32(nullifier)));
      return {
        nullifier,
        status: pledge?.status ?? 'RELEASED',
        addressedToMe: pledge?.holderTag === mine,
        live: pledge !== undefined && pledge.status === 'OFFERED' && now < pledge.expiry,
      };
    });
    const expired = now >= certificate.validUntil;
    return {
      certId: certificate.certId,
      found: true,
      floor: certificate.floor,
      validUntil: certificate.validUntil,
      expired,
      slots,
      ok: !expired && slots.length > 0 && slots.every((slot) => slot.addressedToMe && slot.live),
    };
  }

  accept(nullifier: Uint8Array): Promise<TxReceipt> {
    return this.call('accept', [nullifier]);
  }

  /**
   * Takes up to four offers addressed to this financier in one transaction — the partner of the
   * borrowing-base pool offer, which locks up to four slots in one.
   *
   * Every slot is authorised exactly as `accept` authorises one, and the batch is **atomic**: a
   * single slot this financier does not hold, or that expired, or that nobody offered, refuses
   * the whole call and leaves every marker where it was. That is what a lender wants when it
   * priced a pool: all of the collateral it underwrote, or none of it. Run
   * `checkCertificate(certId)` first if the batch comes from a certificate — it names the slots
   * that would fail, instead of only the first one.
   *
   * An empty batch is refused on chain as `EMPTY_BATCH` rather than thrown here, so a caller
   * that builds the list from public state gets the same typed refusal as any other.
   */
  acceptBatch(nullifiers: readonly Uint8Array[]): Promise<TxReceipt> {
    if (nullifiers.length > 4) throw new Error(`a batch takes at most 4 offers, got ${nullifiers.length}`);
    const pad4 = <T>(values: readonly T[], fill: T): [T, T, T, T] =>
      [0, 1, 2, 3].map((i) => values[i] ?? fill) as [T, T, T, T];
    return this.call('acceptBatch', [
      pad4(nullifiers, ZERO_BYTES32),
      pad4(nullifiers.map(() => true), false),
    ]);
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
