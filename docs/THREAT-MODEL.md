<!-- SPDX-License-Identifier: Apache-2.0 -->

# Threat model

What Stock & Foil is trusted for, what it is not, and which test proves which.

The registry is a single Compact contract on Midnight. There is no EVM and no caller identity: a
Midnight contract cannot authenticate a sender, because `ownPublicKey()` is a *witness* and a
witness is supplied by whoever builds the transaction. Every authorisation here is therefore a
proof of knowledge of a secret whose image is on the ledger or inside committed data. The trust
boundary is **witnesses versus asserts**: witnesses are attacker-controlled inputs, asserts are the
only thing that holds, and anything the asserts do not pin down is not enforced.

The second boundary is the **public transcript**. A call publishes the ledger operations it
performed — the cells it touched, the keys it addressed, the values it pushed and the results it
read — in the clear. Circuit arguments and witnesses are not published, but anything a circuit
derives from them and uses in a ledger operation is. `docs/PRIVACY-BOUNDARY.md` is the per-circuit
account of that, and `contract/test/transcript.test.ts` asserts it.

---

## 1. Parties, and what each is trusted for

| Party | Holds | Trusted for | **Not** trusted for |
|---|---|---|---|
| **Operator** (registry consortium) | `opSk` | admitting real, KYB'd debtors and financiers; deploying a sound ceremony; retaining the contract's maintenance authority | reading records, pledging, settling, or opening a disclosure — it has no cryptographic power over any of those |
| **Debtor** (buyer) | `debtorSk`, the invoices it acknowledged, including salts | the truth of what it acknowledges; paying through the contract | nothing else — it cannot pledge, claim or read a record |
| **Seller** (supplier) | `sellerSk`, invoices incl. salts, holder tags received off-chain | drawing a fresh sealing scalar per record | the invoice's truth (the debtor's acknowledgment carries that); which lender a certificate's slots are actually addressed to (§3.1) |
| **Financier** (factor) | `finSk`, its holder tags | issuing a tag only for a receivable it intends to fund | anything about other financiers' books |
| **Auditor / trustee** | `audSk` | asking for one record, for a stated case | opening anything without two keyholders |
| **Keyholder** ×3 | one Shamir share `s_i` | not colluding with a second keyholder | the contents of anything — a keyholder never sees a plaintext |
| **Public** | nothing | — | — |

Sellers are **not** admitted to a member tree. Anyone can be a seller; what makes an offer
meaningful is the debtor's acknowledgment, not the seller's admission.

### Trust the deployment carries, beyond the contract

Two things sit outside the Compact source and have to be stated, because the code cannot enforce
them:

1. **The operator holds the contract's maintenance authority.** On Midnight the deploying key is
   the contract's maintenance authority and can insert or remove verifier keys for its entry
   points. An operator that keeps that key can therefore disable a circuit — for example
   `claimAsHolder`, stranding settled proceeds — or replace one with a differently-compiled
   circuit at the same entry point. This is a strictly larger power than "admits participants",
   which is how the README describes the operator. A production deployment should replace the
   maintenance authority with a multi-party key, or burn it, once the twelve verifier keys are in.
2. **Deployment is staged.** All twelve verifier keys do not fit in one transaction
   (`VERIFIER_KEYS_PER_TX = 6`, see `sdk/src/backend/network.ts`), so a deploy is followed by six
   maintenance transactions. Between them the registry is live with `admitDebtor`,
   `admitFinancier`, `acknowledge`, `offer`, `accept` and `release` only — it can take pledges it
   cannot yet settle or pay out. Do not publish a contract address until every circuit has a key.

---

## 2. Properties the system claims

| # | Property | Enforced by | Proof |
|---|---|---|---|
| P1 | A receivable cannot be pledged unless the named debtor acknowledged **exactly** that invoice — every field, including the amount. | the ack-tree Merkle proof in `acknowledgedNullifier` | `refusals.test.ts` "NOT_ACKNOWLEDGED (forged)", "(inflated)" |
| P2 | One invoice, one live encumbrance. | `assertFree` + the pledge map keyed by `N` | `refusals.test.ts` "ALREADY_ENCUMBERED"; `model.property.test.ts` invariant 1 |
| P3 | `SETTLED` is terminal: a settled receivable can never be pledged or paid again. | `assert(p.status != SETTLED)` in `assertFree` and `payInvoice` | `refusals.test.ts` "ALREADY_SETTLED"; `model.property.test.ts` invariant 2 |
| P4 | Proceeds leave the registry exactly once, to whoever proves the payee tag. | `claimed` flag + the payee-tag assert in `claim` | `refusals.test.ts` "NOT_PAYEE", "ALREADY_CLAIMED"; `model.property.test.ts` invariant 3 |
| P5 | A pledged receivable pays its financier, not the seller. | `payeeTag = p.status == PLEDGED ? p.holderTag : sellerPayee` | `lifecycle.test.ts` "debtor pays a pledged invoice and the holder claims the proceeds, not the seller" |
| P6 | Only two of three keyholders together can open a sealed record. | Shamir 2-of-3 over the Jubjub scalar field; `approveDisclosure` binds `D_i = s_i·E` in circuit | `disclosure.test.ts` "2-of-3 threshold decryption" incl. the single-share and wrong-key controls |
| P7 | An opened record proves itself against the ledger. | `recordId = H("record", N, E)` recomputed from the plaintext | `sdk/test/audit.test.ts` "verifies against the record's own ledger key" |
| P8 | A registry whose disclosure ceremony is degenerate or inconsistent cannot exist. | four constructor asserts | `ceremony.test.ts` (whole file) |
| P9 | No invoice field, salt or secret key reaches the public transcript. | disclosure typing in Compact; sealed records | `transcript.test.ts` (whole file) |

P2 and P5 are about the *marker*, not about who the marker names. A certificate proves its pool is
acknowledged, unencumbered, current and worth at least `floor`; it does **not** prove the pool is
addressed to the lender reading it (§3.1). Check the tags, or accept the slots.

---

## 3. Attackers

### 3.1 Malicious supplier (seller)

The central adversary: the First Brands fraud pattern.

**Cannot**
- Pledge an invoice the debtor never acknowledged (P1) — `NOT_ACKNOWLEDGED`.
- Re-price an acknowledged invoice upwards and pledge the inflated one: the amount is inside the
  fingerprint, so it has no ack leaf (P1) — `refusals.test.ts` "(inflated)".
- Pledge one receivable to two financiers (P2) — `ALREADY_ENCUMBERED`.
- Pledge a receivable that is already settled (P3), or one that is already due
  (`INVOICE_OVERDUE`).
- Put the same invoice in two slots of one borrowing base — `DUPLICATE_INVOICE`, and the pool's
  floor is proved before any slot is locked, so a doubled pool is never even partly written
  (`refusals.test.ts`, `model.property.test.ts` `Certify`).
- Take the proceeds of a receivable a financier holds (P4/P5) — `NOT_PAYEE`.
- Offer a receivable it does not own, even knowing every field — `NOT_INVOICE_OWNER`. (This is
  also what stops a financier who learned the invoice during diligence from pledging it itself.)
- Address an offer to a tag it can claim itself: a financier only accepts a tag it can recompute
  from `finSk`, so a self-addressed offer is never funded.

**Can**
- **Overwrite its own earlier sealed record**, by re-offering the same receivable with the same
  sealing scalar: the ledger key is `recordIdOf(N, E)` and `records.insert` replaces. This erases
  the evidence of the earlier offer, including a record an auditor has an open request against.
  `limits.test.ts` "overwrites the earlier record of the same receivable". **Accepted, not fixed**
  — see `docs/audit-report.md` F-03; the SDK always draws a fresh scalar and `reusedSealingKeys`
  detects a repeat from public state.
- **Leak its own counterparties**, by reusing one sealing scalar across records: the masks cancel
  and an observer with no key reads off which records share a debtor or a seller.
  `limits.test.ts` "lets a passive observer read off which fields two records share".
- **Issue a certificate the named lender cannot take up.** The holder tag of each locked slot
  comes from a witness the seller supplies, and nothing in the circuit ties it to `lenderRef`. The
  markers read `OFFERED` to every observer and the floor proof is genuine, but the lender can
  never `accept` them and they fall free at `validUntil`. A lender that advances money against a
  certificate *without* accepting its slots is exposed, and the receivables stay blocked for the
  whole window. No circuit can close this: a tag is `H("holder", finSk, N)`, so the contract has
  no key material to check the seller's claim against. `FinancierClient.checkCertificate`
  recomputes every tag from public state before money moves — `limits.test.ts` "locks the pool to
  whatever tags the seller supplies", `sdk/test/audit.test.ts` "locks the pool with tags the named
  lender cannot recompute". **Accepted, not fixed** — see `docs/audit-report.md` F-05.
- Lock collateral it never intends to finance, up to four receivables at a time, until
  `validUntil`. Self-inflicted.
- Refuse to release. A financier releases; a seller cannot.

### 3.2 Malicious financier

**Cannot**
- Accept an offer addressed to a competitor — `NOT_ADDRESSEE` — or accept without being admitted —
  `NOT_LICENSED` — or accept after expiry — `OFFER_EXPIRED`.
- Release a pledge it does not hold — `NOT_HOLDER`.
- Claim proceeds of a receivable it did not hold at settlement — `NOT_PAYEE`; or claim twice —
  `ALREADY_CLAIMED`.
- Pledge a receivable it learned about during diligence — `NOT_INVOICE_OWNER`.
- Learn anything from a refusal beyond the one bit it asked for: a refused `offer` tells the
  seller "encumbered", and `checkEncumbrance` tells a financier the same bit from public state,
  with no holder, amount or date attached (`sdk/test/simulator.test.ts` "fraud 3").

**Can**
- Sit on an offer until it expires, blocking the receivable for that window. The seller chooses
  the window (`expiry`), which bounds the grief.
- Learn the whole invoice during diligence — it needs the salt to compute `N` at all — and
  therefore learn that seller's `sellerId`, which is enough to recognise that seller's
  settled-but-unfinanced receivables for ever after (see 3.4).

### 3.3 Colluding buyer and supplier

**Can**, and this is the one fraud the registry does not prevent:
- Acknowledge an invoice that does not exist, and finance it. The registry makes the
  acknowledgment **non-repudiable** — the ack nullifier `H("acknul", debtorSk, sellerId,
  invoiceNo)` is published and the ack leaf commits to every field — but it cannot know whether
  goods moved. Mitigated by KYB admission and by the evidence trail, not by the circuit.
- Settle a receivable out from under a *pending* offer: `payInvoice` is refused only for a
  `SETTLED` marker, so an `OFFERED`-but-not-yet-accepted receivable can be paid to the seller.
  A financier that advances money against a certificate before calling `accept(n)` is exposed;
  a financier that accepts first is not (P5).

**Cannot**
- Redirect the proceeds of an *accepted* pledge. Once the status is `PLEDGED`, `payInvoice` sets
  `payeeTag = holderTag`, and only the financier's `finSk` reproduces it (P5).
- Double-acknowledge to re-price: the ack nullifier burns the (debtor, seller, invoice number)
  triple whatever the amount — `refusals.test.ts` "even re-salted or re-priced".

### 3.4 Curious observer (the public, an indexer, a competitor)

**Cannot**
- Read any invoice field, salt, identity or secret key: none of them reach the transcript
  (P9, `transcript.test.ts`).
- Tell which debtor acknowledged, or which financier accepted: both prove membership against a
  *root*, so the leaf never appears (`transcript.test.ts`).
- Link a holder tag to a financier, or two of one financier's tags to each other: a tag is
  `H("holder", finSk, N)` and needs the secret (`limits.test.ts` "holder tags stay unlinkable").
- Test whether a known invoice is encumbered without its salt — the salt is what makes the
  nullifier unguessable (the confirmation attack).

**Can**
- Count everything: participants, acknowledgments, live pledges, settlements, certificates,
  disclosure requests.
- See every settlement amount and every payout address, because settlement is unshielded.
- **Cluster a financier's whole book if it claims to one address.** Holder tags are unlinkable;
  claim addresses are not. `limits.test.ts` "claiming twice to one address clusters a financier's
  book under it". Use a fresh address per claim.
- Correlate an acknowledgment with a later offer by timing.
- See which four markers a borrowing base locked together, hence that those receivables share a
  borrower and a lender.

### 3.5 Malicious auditor

**Cannot**
- Open a record with fewer than two keyholder approvals (P6) — one share yields plaintext that
  fails `verifyRecordDisclosure` (`sdk/test/audit.test.ts` "still refuses a record that only one
  keyholder approved").
- Request a disclosure without the auditor key — `NOT_AUDITOR` — or open a record that does not
  exist — `NO_SUCH_RECORD`.
- Forge a disclosure: an opened record must recompute `recordIdOf(N, E)` equal to the ledger key
  (P7), so a doctored transcription is detectable by anyone.
- Claim a seller's or a financier's proceeds from what it learned. Opening a record yields
  `sellerId` and the holder tag, but `claimAsSeller` and `claimAsHolder` derive the tag from the
  caller's own secret key; there is no circuit that takes a tag as an argument.

**Can**
- **Escape the case binding.** A keyholder's share `D_i = s_i·E` is bound to the *record*, not to
  the request. Two requests naming one record, with one approval each from two different
  keyholders, open it — while neither request's `approvals` vector ever reaches two.
  `disclosure.test.ts` "approvals are per record, not per case". The 2-of-3 threshold still
  holds; what fails is the per-request audit trail and a keyholder's ability to scope its consent
  to one case. Count approvals per record (`recordDisclosureState` in the SDK) — `sdk/test/audit.test.ts`.
- **Link a seller's whole settled book from one opened record.** The record reveals `sellerId`,
  and `payeeTag = H("sellerpayee", sellerId, N)` with a public `N`, so every
  settled-but-unfinanced receivable of that seller becomes recognisable without any further
  approval. `limits.test.ts` "anyone holding a sellerId links every settled-unfinanced pledge".
  **Accepted, not fixed** — the debtor has to be able to compute the seller's payee tag inside
  `payInvoice`, so the tag cannot be keyed by a secret. See `docs/audit-report.md` F-04.
- Spam `requests` (only the auditor can write there). Bounded by its own fees.

### 3.6 One malicious keyholder

**Cannot**
- Open anything. One share is one point; `S = sk·E` needs two (P6).
- Publish a *wrong* share undetected: `D = ecMul(record.E, s)` is computed inside the circuit
  from an `s` the circuit has already pinned to `keyholderPks[i]`, and the seal to the auditor
  uses an ephemeral whose public half is derived in-circuit too. There is no value the keyholder
  can choose that produces a share the auditor accepts but that is not `s_i·E`.
- Approve in another keyholder's slot — `NOT_KEYHOLDER` — or approve twice — `ALREADY_APPROVED`.
- Learn a record's contents: it never sees a plaintext, only `E`.

**Can**
- Refuse. 2-of-3 tolerates exactly one refusal.
- Approve a record for a case it was never shown — see 3.5.

Two colluding keyholders reconstruct the disclosure key off-chain and can read **every** record
with no on-chain request at all. That is inherent to 2-of-3 and is a published limit.

### 3.7 Registry operator

**Cannot**
- Acknowledge, pledge, accept, settle, claim or open a record. The operator key appears in exactly
  one place — `assertOperator` — and admits leaves.
- Remove a member. There is no removal circuit, and `HistoricMerkleTree.checkRoot` accepts any
  historic root, so admission is permanent by construction.
- Learn a record's contents, unless it is also two keyholders.

**Can**
- Admit a debtor or financier that should not be admitted, which is the root of the collusion
  case in 3.3.
- Exhaust the member trees: 2¹⁰ = 1024 debtors and 1024 financiers.
- **Replace or remove verifier keys**, because it holds the maintenance authority (§1). This is
  the largest single trust assumption in the deployment and is not visible in the Compact source.
- **Not** deploy a broken ceremony: the constructor refuses it (P8), and any participant can
  re-check a registry it did not deploy with `verifyRegistryConfig` — `sdk/test/keys.test.ts`.

### 3.8 Availability and griefing

| Vector | Who | Bound | Test |
|---|---|---|---|
| Fill the ack tree (2¹⁶ leaves, never pruned) with acknowledgments of invoices no seller issued | any admitted debtor | the registry can never accept another acknowledgment | `limits.test.ts` "one admitted debtor can spend ack-tree leaves" |
| Burn a (debtor, seller, invoice number) triple pre-emptively so the real invoice can never be acknowledged | that debtor | the same debtor could simply refuse; no cross-debtor effect, because the nullifier binds `debtorSk` | `refusals.test.ts` `ALREADY_ACKNOWLEDGED` |
| Pre-register a guessable `certId` so the real certificate is refused | anyone, if the lender nonce is predictable | closed by a 32-byte random nonce | `limits.test.ts` "lets a stranger burn the certificate id" |
| Grow `records` / `pledges` / `requests` | seller / auditor | fees; one record per offer, and an offer needs a future expiry | — |
| Concurrent transactions on one receivable | anyone | the transcript records each `pledges[N]` read result, so a state change between building and inclusion invalidates the loser, which retries. Reads are per key, and tree inserts commute, so unrelated receivables never conflict | — |
| A block's `bytes_written` limit | — | `certifyBorrowingBase` is the largest call (4 records + 4 markers + 1 certificate ≈ 2 kB of state, 8.6 kB of transaction) and fits; the *deploy* does not, which is why verifier keys are staged | `sdk/src/backend/network.ts` |

---

## 4. What is deliberately not defended

- Debtor–seller collusion on a fictitious invoice (3.3).
- Two colluding keyholders (3.6).
- Settlement transparency: amounts and addresses are public, because contract custody of shielded
  coins is blocked upstream.
- Timing correlation between an acknowledgment and a later offer.
- The operator's admission decisions and its maintenance authority (§1).
- A seller that reuses its own sealing scalar (3.1).
- A certificate whose slots are not addressed to the lender it names (3.1). The lender checks it
  itself, with `FinancierClient.checkCertificate` or by accepting every slot.
- `sellerId`-based linkability of settled, unfinanced receivables (3.5).

Each of these has a test that reproduces it, so "not defended" is a measured statement rather than
an assumption. The full audit, with severities and the reasons the accepted items were accepted,
is in the internal report (`docs/audit-report.md`, not published with the repository).
