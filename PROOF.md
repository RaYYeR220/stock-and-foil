<!-- SPDX-License-Identifier: Apache-2.0 -->

# Proof

Everything below was produced by the CLI in this repository, against a live network, with real
zero-knowledge proofs. Each artifact says which network it belongs to, because they are not worth
the same: **preview** is a public Midnight testnet anyone can query without asking us for
anything, while **undeployed** is a devnet running on one laptop, which shows the code runs but
proves nothing to a stranger.

| Network | What it is | Status |
|---|---|---|
| `preview` | public Midnight testnet | deployed, full scenario, verified |
| `undeployed` | local devnet (node, indexer, proof server in Docker) | deployed, full scenario, verified |
| `preprod` | public Midnight testnet | **not deployed** - see [Preprod](#preprod-not-deployed) |

Compact toolchain `0.31.1`, compact-runtime `0.16.0`, midnight-js `4.1.1`, proof server `8.1.0`.
Nothing here has been audited by anyone but us.

## Preview: the deployed registry

| | |
|---|---|
| Contract address | [`9be70aa1c3577ee5f941fa0019c67e64bc4445ec63097edecf21c4ec5833e8f7`](https://preview.midnightexplorer.com/contracts/9be70aa1c3577ee5f941fa0019c67e64bc4445ec63097edecf21c4ec5833e8f7) |
| Deployed at | 2026-09-15 17:40:31 UTC |
| Deployment record | [`cli/deployments/preview.json`](./cli/deployments/preview.json) |
| Evidence | [`cli/evidence/preview-2026-09-15T18-03-58Z.json`](./cli/evidence/preview-2026-09-15T18-03-58Z.json) |
| Scenario window | 2026-09-15 17:55:27 UTC - 18:03:58 UTC, blocks 879534 - 879615 |
| Disclosure threshold | 2 of 3 keyholders |

### Reading the links

midnight-js reports a transaction *identifier* (the 33-byte value a contract call is keyed by);
Midnight Explorer indexes by the transaction *hash* and answers a lookup by identifier with a 404.
The evidence file carries both for every transaction, and the links below use the hash. The
templates are recorded in the deployment file under `explorer`, checked against the live explorer
on 2026-09-15:

```
tx           https://preview.midnightexplorer.com/transactions/{txHash}
contract     https://preview.midnightexplorer.com/contracts/{address}
block        https://preview.midnightexplorer.com/blocks/{height}
subscanBlock https://midnight-preview.subscan.io/block/{height}
```

Subscan gets a block template only. `midnight-preview.subscan.io/block/<height>` resolves, but
`/extrinsic/<ledger tx hash>` renders the same empty page for a real hash as for thirty-two zero
bytes: a Midnight *ledger* transaction hash is not the Substrate extrinsic hash Subscan keys on,
so there is no honest per-transaction Subscan link for this chain.

### Deployment: seven transactions

Twelve verifier keys total about 26 kB, which is over the node's 50 000-byte `bytes_written` cap
for one block, so the deployment is staged: the deploy transaction carries the constructor and the
first six keys, and six `VerifierKeyInsert` maintenance transactions carry the rest. They are
signed by the deployer's maintenance authority, whose key lives in the private-state store under
`cli/.secrets/` and never leaves this machine.

| # | Stage | Transaction | Block | Time (UTC) |
|---|---|---|---|---|
| 1 | `deploy` - constructor + 6 verifier keys | [`d8732da6763e...`](https://preview.midnightexplorer.com/transactions/d8732da6763ed09c52a7013ebef9d76534264c1e900ba3a8c6c25a7906d13f68) | 879363 | 2026-09-15 17:38:30Z |
| 2 | `VerifierKeyInsert` - `certifyBorrowingBase` | [`cef559b00c25...`](https://preview.midnightexplorer.com/transactions/cef559b00c25d87a55ffb0dff632eaed3bf7cfc0198fc4a04caa4b6f5e72672d) | 879366 | 2026-09-15 17:38:48Z |
| 3 | `VerifierKeyInsert` - `payInvoice` | [`1fb3decc45ee...`](https://preview.midnightexplorer.com/transactions/1fb3decc45ee01509369091e1046f8aebd64f7980616c0f3e0209cf04bf00850) | 879369 | 2026-09-15 17:39:06Z |
| 4 | `VerifierKeyInsert` - `claimAsHolder` | [`627cdb34c8e1...`](https://preview.midnightexplorer.com/transactions/627cdb34c8e176826b67b4ff872f2d23237ae725f64eaf44f6ddfb31d2474046) | 879372 | 2026-09-15 17:39:24Z |
| 5 | `VerifierKeyInsert` - `claimAsSeller` | [`82c84ce6838c...`](https://preview.midnightexplorer.com/transactions/82c84ce6838c626c457384505d71be43d38a4ad0734df2640fab58a1605ca0f8) | 879375 | 2026-09-15 17:39:42Z |
| 6 | `VerifierKeyInsert` - `requestDisclosure` | [`b8f3dd941008...`](https://preview.midnightexplorer.com/transactions/b8f3dd94100863fe16ce5ae554b7bb3077a10d5f698cf7e10f16490ffbaf9590) | 879378 | 2026-09-15 17:40:00Z |
| 7 | `VerifierKeyInsert` - `approveDisclosure` | [`060fc88f792e...`](https://preview.midnightexplorer.com/transactions/060fc88f792e7e71270c75cb1f138c3e22e832c6e482690d639696623d48f96d) | 879381 | 2026-09-15 17:40:18Z |

### The scenario: twenty transactions

The First Brands replay, end to end, on preview. Twenty-seven steps: twenty transactions, five
refusals that submitted nothing, and two checks a party runs off chain against public state. One
funded wallet paid every fee; the personas are private-state identities, not wallets, each proving
knowledge of a secret whose hash is on the ledger.

"Proof + submit" is wall-clock from the CLI calling the circuit to the transaction being accepted,
including proving on a local proof server.

| # | Step | Circuit | Persona | Transaction | Block | Time (UTC) | Proof + submit |
|---|---|---|---|---|---|---|---|
| 1 | Operator admits the debtor after off-chain KYB | `admitDebtor` | operator | [`45779ecd8a41...`](https://preview.midnightexplorer.com/transactions/45779ecd8a418e3568fc56bc3fc8be96a370049527e28896ab60c42a7c24a67c) | 879534 | 17:55:36Z | 23.1s |
| 2 | Operator admits financier A | `admitFinancier` | operator | [`24eea9097a83...`](https://preview.midnightexplorer.com/transactions/24eea9097a83608b37d44f6d7cccda6fa925c19ae03899f1de9c437cbb3ce35b) | 879538 | 17:56:00Z | 23.2s |
| 3 | Operator admits financier B | `admitFinancier` | operator | [`cb9be4ab80c9...`](https://preview.midnightexplorer.com/transactions/cb9be4ab80c9a4a479a7a4cbac04cdd0ab044a7b063fa70f6f5a7053e7e3e7cd) | 879542 | 17:56:24Z | 25.1s |
| 4 | Debtor acknowledges invoice #1001 for $2,300.00 | `acknowledge` | debtor | [`18d538ce594c...`](https://preview.midnightexplorer.com/transactions/18d538ce594c1304c2615ec60035867c89f5e650b40a2580c84010ad40a1eded) | 879546 | 17:56:48Z | 23.0s |
| 5 | Seller offers #1001 to financier A | `offer` | seller | [`ec441d7521be...`](https://preview.midnightexplorer.com/transactions/ec441d7521be955e41cc853038e43a15b067f8a5241dc873265bb7e74f6170df) | 879550 | 17:57:12Z | 24.6s |
| 6 | Financier A accepts: the receivable is pledged | `accept` | financier A | [`b976bf1dff0d...`](https://preview.midnightexplorer.com/transactions/b976bf1dff0da462dbb686803721494fe44c7b481b9f463b7b0397a5aa1c7574) | 879554 | 17:57:36Z | 23.7s |
| - | *three frauds refused here at 17:57:50-17:57:51Z - see the refusal table* | | | none | - | | 1.2s |
| 7 | Financier A releases the pledge | `release` | financier A | [`5232bbabbfee...`](https://preview.midnightexplorer.com/transactions/5232bbabbfeed7b5fef8897cf3f4ed37c7540de8c2ed3cc674b21f3c13e77938) | 879558 | 17:58:00Z | 22.5s |
| 8 | Seller re-offers #1001, now legitimately, to financier B | `offer` | seller | [`9ee89eaeb5ab...`](https://preview.midnightexplorer.com/transactions/9ee89eaeb5abc88ab48108d6eaeafdb41cd143efd3a1d1f328af306a4c4b641e) | 879562 | 17:58:24Z | 24.1s |
| 9 | Financier B accepts and funds the receivable | `accept` | financier B | [`861109c0acdc...`](https://preview.midnightexplorer.com/transactions/861109c0acdc209b27fef7a719505a89cd700ac7fbcb2a71ebd8e8ccdac8fd75) | 879566 | 17:58:48Z | 24.2s |
| 10 | Debtor pays $2,300.00 into the registry | `payInvoice` | debtor | [`90e4757dec54...`](https://preview.midnightexplorer.com/transactions/90e4757dec54795e57e848893d0a52831a63a2f8e156d12309ad85ee1f74aabb) | 879571 | 17:59:18Z | 30.4s |
| - | *the seller's attempt to take those proceeds is refused here, 17:59:33Z* | | | none | - | | 0.5s |
| 11 | Financier B claims the proceeds; the seller cannot divert them | `claimAsHolder` | financier B | [`a301f96bae09...`](https://preview.midnightexplorer.com/transactions/a301f96bae090ab05d1b451076739f3eea009d1dd7205d9ad6fcc95a26396823) | 879575 | 17:59:42Z | 23.0s |
| 12 | Debtor acknowledges invoice #2001 for $1,000.00 | `acknowledge` | debtor | [`3b2433791b59...`](https://preview.midnightexplorer.com/transactions/3b2433791b59c278c7ab227df8521dafd4a7b99fa0de6b0cd46c410f08ced528) | 879579 | 18:00:06Z | 25.6s |
| 13 | Debtor acknowledges invoice #2002 for $2,000.00 | `acknowledge` | debtor | [`3d708ea1d3d8...`](https://preview.midnightexplorer.com/transactions/3d708ea1d3d84c50ff0efeab70fd4a17e9226c2c568e013a1801cbdeac815b40) | 879583 | 18:00:30Z | 23.1s |
| 14 | Debtor acknowledges invoice #2003 for $3,000.00 | `acknowledge` | debtor | [`324a2ecb7108...`](https://preview.midnightexplorer.com/transactions/324a2ecb71081546d67edc1ed800614115f5b92fb38705b06f725cdc461a25d0) | 879587 | 18:00:54Z | 31.2s |
| 15 | Debtor acknowledges invoice #2004 for $4,000.00 | `acknowledge` | debtor | [`d9360457133f...`](https://preview.midnightexplorer.com/transactions/d9360457133faacb1bdc57c1dd484609056d44c80c57b98289686a296b6f1a9b) | 879592 | 18:01:24Z | 22.9s |
| - | *a borrowing base overstated to $15,000.00 is refused here, 18:01:39Z* | | | none | - | | 0.5s |
| 16 | Borrowing base: 4 invoices locked to one lender over an $8,000.00 floor | `certifyBorrowingBase` | seller | [`aea54e4be099...`](https://preview.midnightexplorer.com/transactions/aea54e4be0998f815c2ed1b1cf9d89dfe22db9160d506db7d31aeac79232b6dc) | 879599 | 18:02:06Z | 40.5s |
| 17 | The lender checks the certificate really locks its pool to it, and only to it | `checkCertificate` (off chain) | financier A | none | - | 18:02:20Z | 0.2s |
| 18 | The pool lender takes up the first certified invoice | `accept` | financier A | [`32b5ee1fc29a...`](https://preview.midnightexplorer.com/transactions/32b5ee1fc29a87be264821828b50301e241f6198100426ee90d628977a19a8d7) | 879603 | 18:02:30Z | 23.8s |
| 19 | Auditor requests disclosure of invoice #1001's sealed record | `requestDisclosure` | auditor | [`3fa5fcf37e41...`](https://preview.midnightexplorer.com/transactions/3fa5fcf37e41b911c50c0d17f9b6706f86531268b59f5a022124a609b94820b8) | 879607 | 18:02:54Z | 24.9s |
| 20 | Keyholder 1 approves the disclosure on the ledger | `approveDisclosure` | keyholder 1 | [`a14927a909d6...`](https://preview.midnightexplorer.com/transactions/a14927a909d6d1b24619b70552750027ae36c0500775cc313707623415860db9) | 879611 | 18:03:18Z | 22.3s |
| 21 | Keyholder 3 approves: the 2-of-3 threshold is met | `approveDisclosure` | keyholder 3 | [`629a4e335dda...`](https://preview.midnightexplorer.com/transactions/629a4e335dda85217ccd53adf6a2c6b89927108dd7f4073af7c7ab4c20c5eb77) | 879615 | 18:03:42Z | 24.4s |
| 22 | Auditor opens the record and it proves itself against the ledger | `verifyDisclosure` (off chain) | auditor | none | - | 18:03:57Z | 0.4s |

Final public state after the run: 1 debtor, 2 financiers, 5 acknowledgment leaves, 5 acknowledgment
nullifiers, 5 pledge markers, 6 sealed records, 1 certificate, 1 disclosure request, 2 keyholder
shares. One pledge is `SETTLED` with `claimed = true` and `amount = 230000`; three of the four
certified markers are still `OFFERED` and one is `PLEDGED`.

### Refusals: what was attempted, and what reached the chain

Each of these ran the real circuit against the real ledger state. The contract asserts while the
transaction is being *built*, so there is nothing to submit, nothing to mine and nothing to
revert. **None of these five has a transaction id, on any explorer, because none exists.**
`verify` re-checks that claim against the chain.

| Refusal code | What was attempted | Circuit | Transaction submitted |
|---|---|---|---|
| `NOT_ACKNOWLEDGED` | Fraud 1, forged: the seller offers an invoice (#9999, $5,000.00) the debtor never owed | `offer` | none |
| `NOT_ACKNOWLEDGED` | Fraud 2, inflated: the seller re-prices acknowledged invoice #1001 tenfold, to $23,000.00, and offers that | `offer` | none |
| `ALREADY_ENCUMBERED` | Fraud 3, double pledge: the seller offers #1001 to financier B while financier A holds it | `offer` | none |
| `NOT_PAYEE` | Fraud 4, diversion: the seller tries to take the settled proceeds of #1001, which are pledged to financier B | `claimAsSeller` | none |
| `BELOW_FLOOR` | A borrowing base of $10,000.00 of collateral certified as clearing a $15,000.00 floor | `certifyBorrowingBase` | none |

In fraud 3 it is the *seller* the contract stops, and it stops the seller without telling anyone
anything. A financier asking the same question up front - `FinancierClient.checkEncumbrance`,
which reads public state and submits nothing - learns exactly one bit: this receivable is already
encumbered. Not by whom, not for how much, not since when.

### The lender-side certificate check

A borrowing-base certificate proves its pool cleared a floor and names the markers it locked, but
the holder tag on each locked slot comes from a witness the *seller* supplies - nothing in the
circuit ties it to the lender named by `lenderRef`. Step 17 is the check a lender runs before
advancing against one, added after the security review:

- certificate `9ea4d53af375d8d527d4f27a15ea0e1b388294f4a23662443a29377d13d7db0d`, floor $8,000.00,
  4 slots, `validUntil` 1792086912;
- for the addressee (financier A): all 4 slots are unexpired offers addressed to it, `ok = true`;
- negative control - the same certificate checked by financier B: 0 of 4 slots addressed to it,
  `ok = false`.

### The disclosure, opened and self-proving

| | |
|---|---|
| Request id | `2b34c738ee14778cdbeaf790f563963d1ff47e6f8f102f228f50d0cf8d11b657` |
| Record id | `8babc1a26bfb193f416861066f8f880777a03744ae697a20aa0aa536a4f22608` |
| Case reference | `582a082ee25aee4b47272b2ded3901b10d4f8ab4b2b3547f13aa4d97ff6b1d79` |
| Approvals on the ledger | `[true, false, true]` - keyholders 1 and 3 |
| Shamir indices recombined | 1 + 3 |
| Opened invoice | #1001, $2,300.00, due 1797270912 |
| Fingerprint | `c6c2f9d33b934a196df76f14f708f2a1fd2d7dec15eebd17175504a941b0b510` |
| Acknowledgment leaf | `e05668e7b244a5f3fd3640b0112617ad65e7035d2894ffc066d121fd1e9088bf` |
| Nullifier recomputed from the plaintext | `6a49cd4cdc091d4e0e7f303d5bca6b2e374ed8fbe6198e4369396634d644e39a` |
| Nullifier the pledge is keyed by on chain | `6a49cd4cdc091d4e0e7f303d5bca6b2e374ed8fbe6198e4369396634d644e39a` |

The two nullifiers are equal, which is the point: the auditor did not receive an invoice and take
somebody's word for it - the plaintext it recovered rehashes to the exact public marker the
registry has been tracking since the offer.

## Local devnet: the same run, with the deployment repeated

Kept because it is reproducible by anyone with Docker and no faucet, and because the deployment
artifacts here are machine-specific and therefore gitignored.

| | |
|---|---|
| Contract address | `63bf83ac4aeb1773bf922f3025baf51f982022605614f8d0369384b032f8f776` |
| Scenario | 27 steps, 20 transactions, 5 refusals, blocks 5354 - 5464 |
| Window | 2026-09-15 17:19:17 UTC - 17:30:51 UTC |
| Final counts | identical to preview: 1 / 2 / 5 / 5 / 5 / 6 / 1 / 1 / 2 |
| `verify` | 90 checks passed |
| Integration suite | `sdk/test/network.devnet.test.ts`, 4 tests, 276.6 s, real proofs against the local node |

A devnet has no public explorer, so the deployment file records no `explorer` templates and the
evidence carries identifiers and block heights only.

## Preprod: not deployed

The preprod wallet `mn_addr_preprod1le8jjcyr9ws7vtrtypvxsdhea8h5ec6c26qgjwgar42a2d8qsqqqk5tyg4`
is fully synced (1 523 610 shielded, 1 524 091 dust events) and holds **0 tNIGHT and 0 DUST**. The
preprod faucet is behind a captcha and was not available, so no NIGHT was ever received, no DUST
could be generated, and no transaction can be paid for. Nothing has been deployed there.

Everything in this file is therefore preview and local devnet. When the faucet comes back, the
same three commands produce the same artifacts under `preprod` with no code changes:
`ceremony`, `deploy`, `scenario`, `verify` all take `--network preprod`.

## Tests

| Suite | Files | Tests | Notes |
|---|---|---|---|
| `contract/test/*` | 7 | **110** | lifecycle, one scenario per refusal code, fast-check model test, 2-of-3 disclosure with negative controls, deploy-time ceremony validation, public-transcript assertions, documented-limit reproductions |
| `sdk/test/*` (default) | 6 | **67** | scalar field and secret sharing, key material, record codec, the whole scenario through the role clients on the simulator, certificate audit checks, sandbox snapshot codec |
| **Total, `npm test`** | **13** | **177** | no Docker, no node, no proof server |
| `sdk/test/network.devnet.test.ts` | 1 | 4 | opt-in (`DEVNET=1`): staged deploy and a real lifecycle with real proofs against a local node; 276.6 s |

## Reproduce

Everything below needs Node >= 22. The scenario additionally needs a proof server
(`docker run -p 6300:6300 midnightntwrk/proof-server:8.1.0`) and a funded wallet.

```bash
npm install
npm test                               # 177 tests, no Docker needed
npm run -w contract compile            # rebuild circuits and proving keys (needs Docker)
```

Against the public preview network, with a funded 24-word mnemonic in `MIDNIGHT_MNEMONIC` (or in
a file passed as `--mnemonic-file`; neither the phrase nor its path is in this repository):

```bash
npm run -w cli ceremony -- --network preview   # 2-of-3 disclosure key ceremony -> cli/.secrets/
npm run -w cli deploy   -- --network preview   # 7 transactions -> cli/deployments/preview.json
npm run -w cli scenario -- --network preview   # 27 steps       -> cli/evidence/preview-<stamp>.json
npm run -w cli verify   -- --network preview
```

The wallet syncs from genesis on each invocation, which took 14-24 minutes against preview at
~880 000 blocks; `deploy` and `scenario` print progress per transaction and `scenario` is
resumable (`--from <step>`), so a dropped connection costs one step rather than the whole run.

For the local devnet instead, start the node, indexer and proof server and use
`--network undeployed`.

## Re-verify what is written here

`verify` needs no wallet, no mnemonic, no proof server and no proving keys. It reads the deployed
contract's state through the public indexer, re-derives the same projection the SDK uses, and
compares it field by field with the evidence file - then re-checks the evidence's own claims
against the chain. It exits non-zero on any mismatch.

```bash
npm run verify:onchain                         # same as: npm run -w cli verify -- --network preview
```

Its output on 2026-09-15, with the absolute evidence path and two long hex values shortened to
fit the page:

```
=== verifying preview ===
  contract  9be70aa1c3577ee5f941fa0019c67e64bc4445ec63097edecf21c4ec5833e8f7
  evidence  cli/evidence/preview-2026-09-15T18-03-58Z.json
  recorded  27 steps, 20 transactions, 5 refusals

=== checks ===
  ok   contractAddress                            9be70aa1c3577ee5f941...
  ok   network                                    preview
  ok   config.disclosurePk                        {"x":"365724648556055276975297050201806719900438080425687697353106334257
  ok   config.auditorPk                           {"x":"128863235325853341205761880580203676656546555923829387434838977552
  ok   config.keyholderPks                        [{"x":"16399305735512160948718228855070862199308278067720241121342997533
  ok   config.settlementColor                     00000000000000000000...
  ok   config.operatorId                          79f27d5f98c126378f1a...
  ok   config.threshold                           2
  ok   counts.debtors                             1
  ok   counts.financiers                          2
  ok   counts.acks                                5
  ok   counts.ackNullifiers                       5
  ok   counts.pledges                             5
  ok   counts.records                             6
  ok   counts.certificates                        1
  ok   counts.requests                            1
  ok   counts.shares                              2
  ok   claim: refused steps submitted nothing     5 refusals, none carrying a transaction id
  ok   claim: settled proceeds were claimed exactly once 1 settled pledge(s), amounts 230000
  ok   claim: a borrowing-base certificate locks its pool floor 800000, 4 slot(s), valid until 1792086912
  ok   claim: disclosure carried at least the threshold of approvals approvals [true,false,true]
  ok   claim: the opened record recomputed the on-ledger nullifier 6a49cd4c...d644e39a == 6a49cd4c...d644e39a

  90 checks passed; the chain matches the evidence.
```

## What this does not prove

- The registry is **unaudited**. The threat model in [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md)
  and the leaks in [`docs/PRIVACY-BOUNDARY.md`](./docs/PRIVACY-BOUNDARY.md) are ours, not a third
  party's.
- Settlement is **unshielded**: the $2,300.00 in step 10 and the claim address in step 11 are
  public on the ledger, as any explorer shows. Only the invoice behind the marker is private.
- A debtor and a seller who collude can still acknowledge an invoice that does not exist. The
  registry makes that acknowledgment non-repudiable; it does not prevent it.
- The borrowing-base certificate run uses all four slots. A partly filled pool passes the
  simulator but the proof server rejects the zeroed curve point an unused slot leaves in the public
  transcript ("Point should be part of the subgroup"), so a real network cannot prove one today.
- A local devnet result proves the code runs on this machine and nothing more. Only the preview
  artifacts are independently checkable.
