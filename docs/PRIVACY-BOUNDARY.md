<!-- SPDX-License-Identifier: Apache-2.0 -->

# Privacy boundary

Per circuit: what reaches the public ledger, what stays private, and what can be derived from the
two together.

## How to read this

A Midnight contract call publishes its **transcript**: the ledger operations it performed, with
the cells it touched, the keys it addressed, the values it pushed and the results it read, all in
the clear. That is the leak channel. Two things are *not* in it:

- **Witnesses** — the invoice, the secret keys, the Merkle paths, the sealing scalars.
- **Circuit arguments** — `n`, `expiry`, `to`, `lenderNonce` and the rest. They are bound into the
  call's commitment, not published. They become public only where a circuit *writes* them to the
  ledger or feeds them to a kernel operation, which is why `disclose(...)` appears on them in the
  source: it marks the exact points where an argument crosses into the transcript.

Anything derived from a witness and used in a ledger operation **is** published, including the
key of every map lookup and the root of every Merkle check. `contract/test/transcript.test.ts`
asserts the tables below value by value: `transcriptValues(res)` is the set of bit patterns a call
published, so "this private field is not in it" is a checked claim, not a hope. Transcript cells
are little-endian with trailing zero bytes trimmed, so compare a 32-byte key with `keyHex`, never
with plain hex — one key in 256 ends in `0x00`, and an untrimmed comparison misses it.

Three conventions make the tables readable:

- **Marker** `N = H("pledge", F)` — the pledge nullifier, the public name of a receivable. `F` is
  the invoice fingerprint and includes the seller's salt, so `N` is unguessable without the whole
  invoice. That is what closes the *confirmation attack*: knowing a supplier ships to a buyer does
  not let you test whether a particular invoice is financed.
- **Root, not leaf.** Membership and acknowledgment are proved against a Merkle *root*. The root
  is published; the leaf is not. The anonymity set is every leaf under that root — so a client
  should always prove against the **latest** root; proving against an older cached one narrows the
  set to the members that existed then.
- **Tags.** `holderTag = H("holder", finSk, N)` needs a secret. `payeeTag` for an unfinanced
  receivable is `H("sellerpayee", sellerId, N)` and does **not** — see §3.

---

## 1. Per circuit

### `admitDebtor(leaf)` / `admitFinancier(leaf)`

| | |
|---|---|
| **Public** | the leaf, inserted into the member tree; a read of `operatorId` |
| **Private** | `opSk`; who the leaf belongs to |
| **Effects** | none |

The leaf is `H("debtor", debtorSk)` or `H("financier", finSk)`, so it is a pseudonym, not a name.
`debtorId`, the value an invoice carries, is that same leaf as a field element — so **`debtorId`
is effectively public**, which is exactly why record masks must be uniform over the whole field
(a `degradeToTransient` mask is < 2²⁴⁸ and would let an observer eliminate candidate debtors per
record). `sellerId` has no tree and is not published anywhere.

### `acknowledge()`

| | |
|---|---|
| **Public** | the `debtors` historic root the debtor proved against; the ack nullifier `H("acknul", debtorSk, sellerId, invoiceNo)`; a new leaf in `acks` (stored as its hash, so even `A = H("ack", F)` stays one preimage away) |
| **Private** | every invoice field, the salt, `debtorSk`, the debtor's own leaf, `F`, `A` |
| **Effects** | none |

The ack nullifier is published verbatim — that is what makes "one acknowledgment per (debtor,
seller, invoice number)" enforceable and non-repudiable. It is a hash under `debtorSk`, so nobody
but that debtor can construct or recognise it.

### `offer(holderTag, expiry)`

| | |
|---|---|
| **Public** | the `acks` root; `blockTime < expiry`; the marker `N` and whether it was already in the map (plus its full `PledgeState` if it was); a read of `disclosurePk`; the sealed record `{version, E, ct[5]}` under `recordId = H("record", N, E)`; the new `PledgeState {OFFERED, holderTag, expiry, recordId}` |
| **Private** | the invoice (number, amount, due date, debtor, seller, salt), `sellerSk`, the sealing scalar, the ack path |
| **Effects** | none |

`expiry` reaches the transcript twice: as the bound of `blockTimeLt` and as a stored field. It has
to — the alternative is putting the *due date* in a time bound, which would publish it, so the
contract bounds block time by the public `expiry` and requires `expiry ≤ dueDate` privately. The
consequence is documented in `contract/README.md`: an offer must expire on or before the due date.

### `accept(n)`

| | |
|---|---|
| **Public** | the `financiers` root; the marker `N` and its `PledgeState`; `blockTime < expiry`; the marker written back as `PLEDGED` |
| **Private** | `finSk`, the financier's leaf, the invoice, which financier this is |
| **Effects** | none |

### `release(n)`

| | |
|---|---|
| **Public** | the marker and its state, written back as `RELEASED` |
| **Private** | `finSk`, the invoice |

`holderTag` is *not* cleared on release. It stays in the map until the receivable is re-offered.
That is harmless — a tag reveals nothing without `finSk` — but it means a `RELEASED` marker still
carries the tag of whoever last held it.

### `certifyBorrowingBase(lenderRef, lenderNonce, floor, validUntil)`

| | |
|---|---|
| **Public** | `blockTime < validUntil`; `certId = H("cert", lenderRef, lenderNonce)`; **one ack-root check and one marker write per used slot**, so the number of used slots is public; a sealed record per used slot; the certificate `{borrowerCommit, lenderRef, floor, count, validUntil, nullifiers[4]}` |
| **Private** | every invoice in the pool, every amount, every debtor, the seller's identity, `lenderNonce`, and **everything about an unused slot** — an unused slot performs no ledger operation at all, so a real invoice parked in one leaves no trace |
| **Effects** | none |

The locked markers are public and have to be: publishing them is what makes the lock verifiable by
the lender and by every other financier. `floor` is a lower bound the pool proves; the line items
are not published and the total is not either. What the certificate does **not** publish is
whether the slots are addressed to the lender named by `lenderRef` — the holder tags come from a
seller-supplied witness, so only the lender can tell, by recomputing its own tag per marker
(`FinancierClient.checkCertificate`). See `docs/THREAT-MODEL.md` §3.1.

### `payInvoice()`

| | |
|---|---|
| **Public** | the `acks` root; the marker and its state; a read of `settlementColor`; the marker written back as `SETTLED` with `amount` and `payeeTag` |
| **Private** | the invoice number, due date, salt, seller, debtor, `debtorSk` |
| **Effects** | `receiveUnshielded(settlementColor, amount)` — the **amount** and the **paying wallet** are public |

### `claimAsHolder(n, to)` / `claimAsSeller(n, to)`

| | |
|---|---|
| **Public** | the marker and its state; `claimed` set; a read of `settlementColor`; the payout |
| **Private** | `finSk` / `sellerSk`; the invoice |
| **Effects** | `sendUnshielded(settlementColor, amount, to)` — the **amount** and the **payout address** are public |

### `requestDisclosure(recordId, caseRef)`

| | |
|---|---|
| **Public** | a read of `auditorPk`; that `recordId` exists; `requestId = H("request", recordId, caseRef)`; the stored `{recordId, caseRef, [false,false,false]}` |
| **Private** | `audSk`; what the case is about |

A disclosure cannot be quiet: asking is a public act, even though the answer is not.

### `approveDisclosure(requestId, index)`

| | |
|---|---|
| **Public** | a read of `keyholderPks`; the request and its approvals; a read of the record's `E`; a read of `auditorPk`; the sealed share `{version, E2, ct[2]}` under `shareKeyOf(requestId, index)`; the approvals vector written back — so **which keyholder approved is public** |
| **Private** | the Shamir share `s_i`, the point `D = s_i·E`, the second ephemeral scalar, the record's contents |

`contract/test/transcript.test.ts` asserts that neither `s_i` nor `D.x`/`D.y` appears.

---

## 2. Standing public state

| On the ledger | What it is |
|---|---|
| `operatorId`, `disclosurePk`, `keyholderPks`, `threshold`, `auditorPk`, `settlementColor` | the sealed configuration, readable by anyone — which is what makes `verifyRegistryConfig` possible |
| `debtors`, `financiers` (depth 10), `acks` (depth 16) | roots and leaf counts; `firstFree()` is the participant/acknowledgment count |
| `ackNullifiers` | one opaque 32-byte value per acknowledgment |
| `pledges[N]` | status, `holderTag`, `expiry`, `recordId`, `payeeTag`, `amount`, `claimed` |
| `records[recordId]` | `version`, the ephemeral point `E`, five masked field elements |
| `certificates[certId]` | `borrowerCommit`, `lenderRef`, `floor`, `count`, `validUntil`, up to four markers |
| `requests[requestId]` | `recordId`, `caseRef`, three approval booleans |
| `shares[shareKey]` | `version`, `E2`, two masked field elements |

Every count is therefore public: participants, acknowledgments, live pledges, settlements,
certificates and disclosure requests.

---

## 3. Derived leaks

These follow from combining public values. Each has a test in `contract/test/limits.test.ts`.

### 3.1 A seller's settled, unfinanced receivables are linkable from `sellerId`

`payeeTag = H("sellerpayee", sellerId, N)`, and `N` is the public map key. Anyone already holding
a `sellerId` can therefore recompute the tag for every marker on the ledger and pick out that
seller's settled-but-unfinanced receivables — their count, their amounts and their payout
addresses.

Who holds a `sellerId`: **every debtor of that seller** (it is a mandatory invoice field), every
financier that did diligence on one of its invoices, and the auditor after any single approved
disclosure. Not the general public: `sellerId` is a 248-bit hash of a secret and appears nowhere
on the ledger.

This is structural, not an oversight. The debtor calls `payInvoice` and has to be able to compute
the seller's payee tag from what an invoice carries, so the tag cannot be keyed by a secret the
debtor does not have. A holder tag is keyed by `finSk` and stays unlinkable, which is the
asymmetry: **financiers are unlinkable, sellers are linkable to their counterparties.** Binding
the tag to `F` instead of `N` would close it — `F` needs the salt — but that changes what
`claimAsSeller` must be given, so it is recorded as an accepted limit rather than patched
(`docs/audit-report.md` F-04).

### 3.2 The borrower behind a certificate is only as private as the lender's nonce

`certId = H("cert", lenderRef, lenderNonce)` is the public map key, `lenderRef` is public, and
`borrowerCommit = H("borrower", sellerId, lenderNonce)`. A guessable nonce — a counter, a date, an
account number — is therefore recoverable from the public certificate id by brute force, and with
it `borrowerCommit` becomes a *test* that anyone holding a candidate `sellerId` can run. The same
guess also lets a stranger pre-register the certificate id and deny it (`DUPLICATE_CERTIFICATE`).

A 32-byte uniformly random nonce closes both. `FinancierClient.newLenderNonce()` produces one and
`SellerClient.certify` enforces the length; the requirement is stated in `contract/README.md` and
in the `borrowerCommitOf` documentation.

### 3.3 Reusing a sealing scalar leaks plaintext equalities to anyone

A record is a one-time pad: `ct_j = field_j + maskOf(e·disclosurePk, j)`. Two records sealed with
one `e` share `E` — which is stored in the clear — and share their masks, so subtracting the
ciphertexts cancels them and reveals which fields are equal: same debtor, same seller, same
amount. No key is needed.

The contract cannot prevent it (`e` is a witness and freshness is not a provable property), but it
is *visible*: `reusedSealingKeys(view)` in the SDK finds a repeated `E`. The SDK draws a fresh
scalar on every call.

### 3.4 Claim addresses undo the unlinkability of holder tags

Holder tags are per pledge and unlinkable. A claim, however, pays a plain unshielded address
against a public marker. A financier that claims to one address publishes the link between every
receivable it ever funded — and between all of them and its real-world wallet. Use a fresh address
per claim. The same applies to the wallet a debtor pays from.

### 3.5 A certificate groups its pool

The markers a borrowing base locks are published together, so an observer learns that those up to
four receivables share one borrower and one lender, and that they cleared a floor. Combined with
§3.1, a party that knows the seller's `sellerId` and sees one of the pool's receivables settle
unfinanced can attribute the whole certificate.

### 3.6 Timing

An acknowledgment and the offer that follows it are separate transactions minutes or days apart,
both public. Correlating them narrows which ack leaf belongs to which marker. Nothing in the
contract mitigates this; batching or delay is a client-side matter.

### 3.7 Disclosure state is per record, not per request

A keyholder's share `D_i = s_i·E` is bound to the record. Two requests naming one record with one
approval each therefore open it, while neither request's approvals vector reaches two. Count per
record with `recordDisclosureState(view, recordId)`. See `docs/THREAT-MODEL.md` §3.5.

---

## 4. What the transcript never carries

Asserted in `contract/test/transcript.test.ts`, for every circuit that touches an invoice:

- no invoice number, amount, due date, `debtorId`, `sellerId` or salt — with the single exception
  of the **amount at settlement**, which is unshielded and therefore public by construction;
- no secret key, no Shamir share, no decryption point `D`;
- no member-tree leaf — membership is proved against roots;
- no ack leaf — a Merkle insert stores the hash of the value;
- nothing at all about an unused certificate slot;
- no lender nonce — only its two hashes.
