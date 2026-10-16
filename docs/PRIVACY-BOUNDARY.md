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

### `registerPeer(peer, label, labelSalt)`

| | |
|---|---|
| **Public** | a read of `operatorId`; the peer's contract address, as the key of `peers`; the stored `{address, labelCommit}` |
| **Private** | `opSk`; the label and its salt — only `H("peerlabel", label, salt)` is written |
| **Effects** | none |

The address has to be public: it is the thing a lender needs in order to put the encumbrance
question to that registry. The label does not, so it is committed rather than published — a
plaintext trade name would turn the ledger into a scrapable list of who an operator claims to
recognise, and reads from outside like an endorsement. The operator keeps `(label, salt)` and can
open the commitment to a counterparty or a regulator.

What a peer list leaks is the declaration itself: anyone can see how many registries this
operator recognises and which addresses they are, and can follow each one into its own public
state. That is the point — federation only works if the peers are findable — but it does mean a
competitor learns which registries an operator considers part of its world. Nothing about a
*receivable* crosses: the cross-registry check is the lender recomputing one marker and asking
each registry about that one marker, which reveals only a value the lender already holds.

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

### `acceptBatch(ns, used)`

| | |
|---|---|
| **Public** | the `financiers` root, **once** for the whole batch; per used slot: the marker, its `PledgeState`, `blockTime < expiry`, and the marker written back as `PLEDGED` |
| **Private** | `finSk`, the financier's leaf, the invoices, which financier this is, and **everything about an unused slot** — it performs no ledger operation, so a real marker parked in one leaves no trace |
| **Effects** | none |

A batch is indistinguishable from the same take-ups done one at a time, except that they share a
transaction: an observer sees up to four markers move to `PLEDGED` together and can infer they
have one holder — which is already visible when a borrowing base locks them together (§3.5). What
it saves is one membership proof instead of four, and it is what makes a pool all-or-nothing: a
refused batch writes nothing, so a partially-funded pool never appears on the ledger.

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

### `openCase(caseRef, recordIds, used)`

| | |
|---|---|
| **Public** | a read of `auditorPk`; per used slot, that the record exists; the stored `{caseRef, count, recordIds[4], [false,false,false]}` under the key `caseRef` |
| **Private** | `audSk`; what the case is about; **everything about an unused slot** |

A case is louder than a request, deliberately. Its size and the exact records it covers are on
the ledger *before* any keyholder approves, because that is what a keyholder is being asked to
consent to and the breadth of a case approval is the trade-off it has to see (§`approveCase`
below, `docs/THREAT-MODEL.md` §3.5). The reference is the map key, so one reference opens one
case, and a second investigation into the same records is a second reference.

### `approveCase(caseRef, index)`

| | |
|---|---|
| **Public** | a read of `keyholderPks`; the case and its approvals; a read of each covered record's `E`; a read of `auditorPk`; **one sealed share per covered record**, under `caseShareKeyOf(caseRef, index, slot)`; the approvals vector written back — so **which keyholder approved is public** |
| **Private** | the Shamir share `s_i`, every point `D = s_i·E`, the ephemeral scalar, the records' contents |

One approval, one call, up to four sealed shares. They are sealed under a single shared point,
so slot j is masked at indices 2j and 2j+1 — with one mask pair for all four, subtracting two
ciphertexts would cancel the masks and reveal which slots name the same record (§3.3, inside a
single call). `contract/test/disclosure.test.ts` "every slot gets its own mask" asserts it.

What a case approval does **not** change is the threshold: a share is still `D_i = s_i·E` for
that record's own `E`, so two distinct keyholders are still required before anything opens. What
it changes is the *breadth* of one consent, which is the honest cost of fixing the per-record
treadmill.

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
| `peers[address]` | the peer registry's contract address and a hiding commitment to the operator's label for it |
| `cases[caseRef]` | the case's size, the record ids it covers and three approval booleans |

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

### 3.7 Disclosure state is per record, not per request or per case

A keyholder's share `D_i = s_i·E` is bound to the record. Two requests naming one record with one
approval each therefore open it, while neither request's approvals vector reaches two — and with
cases there is a second way to reach the same place: one request approval and one case approval
from two different keyholders open a record that both name. Count per record with
`recordDisclosureState(view, recordId)`, which reads requests and cases together, and
`openableRecords(view)` for all of them. See `docs/THREAT-MODEL.md` §3.5.

### 3.8 A case publishes the shape of an investigation

`cases[caseRef]` names up to four record ids together, so an observer learns that those records
are being looked at as one matter, how many there are, and which keyholders agreed. Combined with
§3.1 — anyone holding a `sellerId` can recognise that seller's settled, unfinanced markers — a
case over records of one seller is attributable by a party that already knows the seller. The
contents stay sealed; the fact and the scope of the investigation do not. Asking is a public act,
by design: a disclosure that leaves no trail is not a disclosure regime.

---

## 4. What the transcript never carries

Asserted in `contract/test/transcript.test.ts`, for every circuit that touches an invoice:

- no invoice number, amount, due date, `debtorId`, `sellerId` or salt — with the single exception
  of the **amount at settlement**, which is unshielded and therefore public by construction;
- no secret key, no Shamir share, no decryption point `D`;
- no member-tree leaf — membership is proved against roots;
- no ack leaf — a Merkle insert stores the hash of the value;
- nothing at all about an unused certificate, batch or case slot;
- no decryption point `D` from a case approval, for any slot;
- no lender nonce — only its two hashes;
- no peer label and no peer-label salt — only `H("peerlabel", label, salt)`.
