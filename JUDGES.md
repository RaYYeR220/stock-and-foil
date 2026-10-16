<!-- SPDX-License-Identifier: Apache-2.0 -->

# Review this in five minutes

Everything below is verifiable without installing anything. Commands are for the optional deeper checks.
If you would rather watch than click: [three-minute walkthrough](https://youtu.be/rDnDGqp-ekE).

## 1. See it work (60 seconds, no wallet, no install)

**[stock-and-foil.vercel.app/app/replay](https://stock-and-foil.vercel.app/app/replay)** → press **Run the rest**.

Seventeen steps run against the **real compiled Compact circuits**, executed in your browser tab:
a buyer acknowledges a $2,300 invoice, the supplier pledges it, a financier takes it — and then the
three frauds that broke First Brands are refused in front of you:

| Step | What is attempted | What the contract answers |
|---|---|---|
| 05 | An invoice the buyer never acknowledged | `NOT_ACKNOWLEDGED` |
| 06 | The same invoice, inflated to $23,000 | `NOT_ACKNOWLEDGED` |
| 07 | The same receivable pledged to a second financier | `ALREADY_ENCUMBERED` — and that financier learns nothing else |

It ends with the buyer paying through the contract (the money is claimable by the pledge holder, not
the supplier), a borrowing-base certificate, and a disclosure that needs two of three keyholders and
then verifies itself against the ledger.

Refusal states are the contract's own assert messages, not UI copy.

## 2. See what the chain sees

**[/app/ledger](https://stock-and-foil.vercel.app/app/ledger)** — every public value the registry
writes: acknowledgment leaves, pledge markers and statuses, holder tags, sealed records,
certificates, disclosure requests. Nothing there can be turned back into an invoice, a party or a
position; the panel at the bottom lists exactly what cannot be derived.

**[/app/seller](https://stock-and-foil.vercel.app/app/seller)** and the other six workspaces show the
same registry from each party's side, with what that role can and cannot see.

## 3. The engineering

- `contract/src/stock-and-foil.compact` — 16 circuits; `contract/README.md` documents every refusal
  code, the sealing construction, the time-semantics limitation and prover key sizes.
- Authorization is always a proof of knowledge of a secret hashed into the ledger — never
  `ownPublicKey()`, which on Midnight is a witness and cannot authenticate anyone.
- Private state holds the invoices; the public ledger holds commitments, one-time markers and
  ciphertexts. `docs/PRIVACY-BOUNDARY.md` goes circuit by circuit through what enters the public
  transcript.
- `docs/THREAT-MODEL.md` states what each party is trusted for and what each attacker can and cannot
  do, with the tests that enforce it.

## 4. The tests

```bash
npm install
npm test          # contract + SDK suites; no Docker, no network
```

- `contract/test/refusals.test.ts` — one scenario per refusal code, plus lying-witness attacks.
- `contract/test/model.property.test.ts` — random lifecycles against a reference model (fast-check).
- `contract/test/disclosure.test.ts` — 2-of-3 decryption with single-share and wrong-key negative
  controls.
- `sdk/test/network.devnet.test.ts` — deploys and transacts with **real proofs** on a local node
  (`DEVNET=1`).

## 5. The on-chain proof

[PROOF.md](./PROOF.md) lists the two deployed registries, every transaction with explorer links,
a transaction paid for by a sponsor from a wallet holding zero DUST, and the cross-registry
encumbrance check. To re-check any of it against the chain yourself:

```bash
npm run -w cli verify -- --network preview                            # registry A, 119 checks
npm run -w cli verify -- --network preview --instance b --deployment-only   # registry B
```

Neither needs a wallet, a mnemonic, a proof server or proving keys — only a network connection.
`verify` is monotonic: everything the evidence recorded must still be on chain and unchanged,
and a ledger map that shrank fails, but the chain having *more* than the snapshot saw is listed
as informational rather than failed, because a public ledger keeps moving after a photograph of
it. Today that surplus is one acknowledgment from the sponsorship proof and one peer entry from
the cross-registry run, both named in the output. `--exact` demands strict equality instead.

## 6. What we do not claim

[README.md → Honest limits](./README.md#honest-limits). Short version: a buyer colluding with a
supplier can still acknowledge an invoice that does not exist; settlement is in an unshielded token,
so amounts and addresses are public at payment time; two colluding keyholders could open a record
off-chain; this is a public test network, not mainnet, and the code is not audited.
