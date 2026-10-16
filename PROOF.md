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
| `mainnet` | Midnight mainnet | **not deployed** - see [Mainnet](#mainnet-ready-not-deployed) |

Compact toolchain `0.31.1`, compact-runtime `0.16.0`, midnight-js `4.1.1`, ledger-v8 `8.1.3`,
proof server `8.1.3`. Nothing here has been audited by anyone but us.

## Preview: the deployed registry

<!-- BEGIN GENERATED preview -->

| | |
|---|---|
| Contract address | [`74fe0bf972edc0c6c1edcec7fd41dfa09c52b1920511a29c416b3245918a0fad`](https://preview.midnightexplorer.com/contracts/74fe0bf972edc0c6c1edcec7fd41dfa09c52b1920511a29c416b3245918a0fad) |
| Deployed at | 2026-10-16 10:24:50 UTC |
| Deployment record | [`cli/deployments/preview.json`](./cli/deployments/preview.json) |
| Evidence | [`cli/evidence/preview-2026-10-16T11-21-09Z.json`](./cli/evidence/preview-2026-10-16T11-21-09Z.json) |
| Scenario window | 2026-10-16 10:40:51 UTC - 2026-10-16 11:21:09 UTC, blocks 1321121 - 1321369 |
| Compact toolchain | 0.31.1 |
| Disclosure threshold | 2 of 3 keyholders |

### Reading the links

midnight-js reports a transaction *identifier* (the value a contract call is keyed by);
Midnight Explorer indexes by the transaction *hash* and answers a lookup by identifier with a
404. The evidence file carries both for every transaction, and the links below use the hash.
The templates are recorded in the deployment file under `explorer`:

```
tx           https://preview.midnightexplorer.com/transactions/{txHash}
contract     https://preview.midnightexplorer.com/contracts/{address}
block        https://preview.midnightexplorer.com/blocks/{height}
subscanBlock https://midnight-preview.subscan.io/block/{height}
```

Subscan gets a block template only. `/block/<height>` resolves, but `/extrinsic/<ledger tx
hash>` renders the same empty page for a real hash as for thirty-two zero bytes: a Midnight
*ledger* transaction hash is not the Substrate extrinsic hash Subscan keys on, so there is no
honest per-transaction Subscan link for this chain.

### Deployment: 11 transactions

A Midnight block caps the bytes one transaction may write, and this contract's verifier keys
do not fit under it, so the deployment is staged: the deploy transaction carries the
constructor and the first six keys, and 10 `VerifierKeyInsert` maintenance transactions
carry the rest. They are signed by the deployer's maintenance authority, whose key lives in
the private-state store under `cli/.secrets/` and never leaves this machine.

| # | Stage | Transaction | Block | Time (UTC) |
|---|---|---|---|---|
| 1 | `deploy` - constructor + first verifier keys | [`c61e4a58e6f7...`](https://preview.midnightexplorer.com/transactions/c61e4a58e6f76cbe637816c0b471c0a6cb2e488749ad7351da6200230c3e286d) | 1320927 | 2026-10-16 10:21:36 UTC |
| 2 | `VerifierKeyInsert` - `acceptBatch` | [`c7cd79f03fab...`](https://preview.midnightexplorer.com/transactions/c7cd79f03fabf75a9e518c041fbd8cb61dcc81befeff76e9fda87afc047b6516) | 1320930 | 2026-10-16 10:21:54 UTC |
| 3 | `VerifierKeyInsert` - `release` | [`9d0acdbe126c...`](https://preview.midnightexplorer.com/transactions/9d0acdbe126c901a7baec460fcae21983771f5395e5b45fcc1b473ca429c82ed) | 1320933 | 2026-10-16 10:22:12 UTC |
| 4 | `VerifierKeyInsert` - `certifyBorrowingBase` | [`9657d5113adc...`](https://preview.midnightexplorer.com/transactions/9657d5113adc76adebeb40f76e6efb501979db1bc62a7a4e608bf5ceccefb5a8) | 1320936 | 2026-10-16 10:22:30 UTC |
| 5 | `VerifierKeyInsert` - `payInvoice` | [`bdc92188c1a6...`](https://preview.midnightexplorer.com/transactions/bdc92188c1a6f6570c7dcaa09fb0c9e960802658e2e57fd822828d36f23caf50) | 1320939 | 2026-10-16 10:22:48 UTC |
| 6 | `VerifierKeyInsert` - `claimAsHolder` | [`e1ef579e0681...`](https://preview.midnightexplorer.com/transactions/e1ef579e06816539c4362700ec3a877762cf80d4b10675af9321719ba81a752f) | 1320942 | 2026-10-16 10:23:06 UTC |
| 7 | `VerifierKeyInsert` - `claimAsSeller` | [`13b7b72b3f6d...`](https://preview.midnightexplorer.com/transactions/13b7b72b3f6d9de14fcfb8e39ce47897a285b3d08e8ee69ab1f0a11014abb6a5) | 1320945 | 2026-10-16 10:23:24 UTC |
| 8 | `VerifierKeyInsert` - `requestDisclosure` | [`3ece211d960c...`](https://preview.midnightexplorer.com/transactions/3ece211d960cb1a89614c02f742771cea05701f56440c6da1ea421f9cc8a79bc) | 1320948 | 2026-10-16 10:23:42 UTC |
| 9 | `VerifierKeyInsert` - `approveDisclosure` | [`859ecd9148ce...`](https://preview.midnightexplorer.com/transactions/859ecd9148ce552b8d05c029013f159e05bcff1a5319efed643c2d9b253e4966) | 1320951 | 2026-10-16 10:24:00 UTC |
| 10 | `VerifierKeyInsert` - `openCase` | [`55439bcaa441...`](https://preview.midnightexplorer.com/transactions/55439bcaa44119a476cc27a2f020954799165588a659769f7fba50ead6c5aa72) | 1320954 | 2026-10-16 10:24:18 UTC |
| 11 | `VerifierKeyInsert` - `approveCase` | [`5e0d1e383627...`](https://preview.midnightexplorer.com/transactions/5e0d1e383627a2f6745281b4fd4c1ae8c21db42d55e8b82c43c9020bde2e6d36) | 1320957 | 2026-10-16 10:24:36 UTC |

### The scenario: 24 transactions

The First Brands replay, end to end. 33 steps: 24 transactions,
5 refusals that submitted nothing, and 4 checks a party runs off chain
against public state. One funded wallet paid every fee; the personas are private-state
identities, not wallets, each proving knowledge of a secret whose hash is on the ledger.

"Proof + submit" is wall-clock from the CLI calling the circuit to the transaction being
accepted, including proving on a local proof server.

| # | Step | Circuit | Persona | Transaction | Block | Time (UTC) | Proof + submit |
|---|---|---|---|---|---|---|---|
| 1 | Operator admits the debtor after off-chain KYB | `admitDebtor` | operator | [`4aacefd21e8d...`](https://preview.midnightexplorer.com/transactions/4aacefd21e8d992124c71d949d06f8002c2ab9a01842709d1713b8aeec7ad4a5) | 1321121 | 10:41:00Z | 24.1s |
| 2 | Operator admits financier A | `admitFinancier` | operator | [`564b4d266330...`](https://preview.midnightexplorer.com/transactions/564b4d2663306044fb85c89588e6c93d01b3d3e6e86682dfc1f471328cd326d4) | 1321125 | 10:41:24Z | 23.5s |
| 3 | Operator admits financier B | `admitFinancier` | operator | [`ebc0f3c93656...`](https://preview.midnightexplorer.com/transactions/ebc0f3c9365604419715a0f5c11637f137ccd3c043a35dccf2b91bba845ae084) | 1321129 | 10:41:48Z | 22.8s |
| 4 | Debtor acknowledges invoice #1001 for $2,300.00 | `acknowledge` | debtor | [`d6a23eadd0dd...`](https://preview.midnightexplorer.com/transactions/d6a23eadd0ddb0a7db00cc608a9a6fa39aa7425f94fb186c6dafd78aad396f9b) | 1321133 | 10:42:12Z | 24.4s |
| 5 | Seller offers #1001 to financier A | `offer` | seller | [`2ab3b82de05e...`](https://preview.midnightexplorer.com/transactions/2ab3b82de05e5f7a30faccb8206fb19236dc824fba516d8a1819ead7bd52b953) | 1321137 | 10:42:36Z | 24.7s |
| 6 | Financier A accepts: the receivable is pledged | `accept` | financierA | [`48200f4bf1df...`](https://preview.midnightexplorer.com/transactions/48200f4bf1dffd4df7cf96904a99c52d0c1f71bc0c17e79b4edf70dfbe200eb1) | 1321141 | 10:43:00Z | 23.4s |
| 7 | Financier A releases the pledge | `release` | financierA | [`1b0e7a0645b1...`](https://preview.midnightexplorer.com/transactions/1b0e7a0645b168cce0f6a8533df216ce1f8a66dba9d0a8e4a226bea8ea77e32e) | 1321145 | 10:43:24Z | 22.6s |
| 8 | Seller re-offers #1001, now legitimately, to financier B | `offer` | seller | [`edd5070cf958...`](https://preview.midnightexplorer.com/transactions/edd5070cf9583a7f2f98e4351c4b9b8eaa473e958abfe4ac25ede8a6761d2bf9) | 1321149 | 10:43:48Z | 23.9s |
| 9 | Financier B accepts and funds the receivable | `accept` | financierB | [`d5a40c15fcc4...`](https://preview.midnightexplorer.com/transactions/d5a40c15fcc420633c5e9fef48615cbe6074cd98050c413176447a29a6ce12ab) | 1321153 | 10:44:12Z | 23.6s |
| 10 | Debtor pays $2,300.00 into the registry | `payInvoice` | debtor | [`aa380726c136...`](https://preview.midnightexplorer.com/transactions/aa380726c136dafb941d03d31cb9bea506f660935d54775d84213b004f02033c) | 1321157 | 10:44:36Z | 24.4s |
| 11 | Financier B claims the proceeds; the seller cannot divert them | `claimAsHolder` | financierB | [`7bf8fc4e818b...`](https://preview.midnightexplorer.com/transactions/7bf8fc4e818b0046a5f1965c967fa417467f1e8930586d4708dd24a838e99a5a) | 1321161 | 10:45:00Z | 24.0s |
| 12 | Debtor acknowledges invoice #2001 for $1,000.00 | `acknowledge` | debtor | [`d34844114b60...`](https://preview.midnightexplorer.com/transactions/d34844114b6087c57047945b658f692e3ea13c33def7c1d8025c90ba1dfc06ba) | 1321165 | 10:45:24Z | 24.1s |
| 13 | Debtor acknowledges invoice #2002 for $2,000.00 | `acknowledge` | debtor | [`ff5939e6a641...`](https://preview.midnightexplorer.com/transactions/ff5939e6a6415dc605aa2ff49d0c62041cdf88668c3cdad2e842e2d6149c073a) | 1321169 | 10:45:48Z | 23.3s |
| 14 | Debtor acknowledges invoice #2003 for $3,000.00 | `acknowledge` | debtor | [`e101e3ee3d82...`](https://preview.midnightexplorer.com/transactions/e101e3ee3d82e14f7ad4f4e9936bdf829d1ec67b13682be161f8d34f37d58d4c) | 1321173 | 10:46:12Z | 24.2s |
| 15 | Debtor acknowledges invoice #2004 for $4,000.00 | `acknowledge` | debtor | [`24dc2ff29818...`](https://preview.midnightexplorer.com/transactions/24dc2ff298187272de9afe4dc8eba195f02fdfa4ff612a384d0ad8c7bbd43342) | 1321177 | 10:46:36Z | 23.6s |
| 16 | Borrowing base: 4 invoices locked to one lender over a $8,000.00 floor | `certifyBorrowingBase` | seller | [`f01f494cafbb...`](https://preview.midnightexplorer.com/transactions/f01f494cafbb6fb48396a28f3046cd65c42e685dd674548c543b7ed7e56c5576) | 1321183 | 10:47:12Z | 36.3s |
| 17 | The lender checks the certificate really locks its pool to it, and only to it | `checkCertificate (off chain)` | financierA | none | - | 10:47:27Z | 0.2s |
| 18 | The pool lender takes up the first certified invoice | `accept` | financierA | [`ac539d954c83...`](https://preview.midnightexplorer.com/transactions/ac539d954c83ffd1df1df87ddc48b61e0119edbd24c9efde5af0a259f54ae046) | 1321187 | 10:47:36Z | 23.2s |
| 19 | The pool lender takes the remaining three certified invoices in one atomic batch | `acceptBatch` | financierA | [`d882efbac697...`](https://preview.midnightexplorer.com/transactions/d882efbac697551bb6c45295701068bd97da26485cb94c4f52ae102cd87cdf9d) | 1321191 | 10:48:00Z | 23.9s |
| 20 | Auditor requests disclosure of invoice #1001's sealed record | `requestDisclosure` | auditor | [`26f619477bd5...`](https://preview.midnightexplorer.com/transactions/26f619477bd5ee581a247804a5dc621777e19605bd8b2f13d0c2fdba36d0cf0e) | 1321195 | 10:48:24Z | 24.8s |
| 21 | Keyholder 1 approves the disclosure on the ledger | `approveDisclosure` | keyholder1 | [`ea7a56330d9f...`](https://preview.midnightexplorer.com/transactions/ea7a56330d9fa70d001db2159bd96c5515d2eb9d9c2158b6c0f296c17171db41) | 1321199 | 10:48:48Z | 22.9s |
| 22 | Keyholder 3 approves: the 2-of-3 threshold is met | `approveDisclosure` | keyholder3 | [`d87482f691cd...`](https://preview.midnightexplorer.com/transactions/d87482f691cd06365fdb10e262b6b8b45e5b84543eb3ce4dc51027bbd6531b7d) | 1321203 | 10:49:12Z | 24.4s |
| 23 | Auditor opens the record and it proves itself against the ledger | `verifyDisclosure (off chain)` | auditor | none | - | 10:49:27Z | 0.3s |
| 24 | Auditor opens an insolvency case over four receivables at once | `openCase` | auditor | [`459c80c6ddba...`](https://preview.midnightexplorer.com/transactions/459c80c6ddba7ffa0f59a0e98481cd42e00472e67a5384b3d0bca26453e6d926) | 1321361 | 11:05:00Z | 22.2s |
| 25 | Keyholder 1 approves the whole case in one signature | `approveCase` | keyholder1 | [`d6d0c28b45c0...`](https://preview.midnightexplorer.com/transactions/d6d0c28b45c098ebf20fa34aa4be0d1bc2f3d3d421942fe38e420186596213ba) | 1321365 | 11:05:24Z | 23.8s |
| 26 | Keyholder 3 approves: two of three, for all four records the case names | `approveCase` | keyholder3 | [`10af7b2b4b4f...`](https://preview.midnightexplorer.com/transactions/10af7b2b4b4fbfd18b3caa5e640d86dd4e80aad6ef309e90ba4a5949003243d6) | 1321369 | 11:05:48Z | 24.1s |
| 27 | Auditor opens every record of the case, and each one proves itself | `openWholeCase (off chain)` | auditor | none | - | 11:06:03Z | 0.5s |
| 28 | A lender asks every registry it knows of whether the receivable is already pledged | `checkEncumbranceAcross (off chain)` | financierA | none | - | 11:06:03Z | 0.1s |

Final public state after the run: 1 debtors, 2 financiers, 5 acks, 5 ackNullifiers, 5 pledges, 6 records, 1 certificates, 1 requests, 10 shares, 2 cases. 1 pledge(s) `SETTLED` with `claimed = true`, amount(s) 230000. The whole run cost **24 SPECK** (0.000000 DUST), read back from the indexer per transaction rather than asserted.

### Refusals: what was attempted, and what reached the chain

Each of these ran the real circuit against the real ledger state. The contract asserts while
the transaction is being *built*, so there is nothing to submit, nothing to mine and nothing
to revert. **None of these 5 has a transaction id, on any explorer, because none exists.**
`verify` re-checks that claim against the chain.

| Refusal code | What was attempted | Circuit | Transaction submitted |
|---|---|---|---|
| `NOT_ACKNOWLEDGED` | Fraud 1, forged: an invoice the debtor never owed | `offer` | none |
| `NOT_ACKNOWLEDGED` | Fraud 2, inflated: #1001 re-priced tenfold to $23,000.00 | `offer` | none |
| `ALREADY_ENCUMBERED` | Fraud 3, double pledge: #1001 offered to financier B while A holds it | `offer` | none |
| `NOT_PAYEE` | Fraud 4, diversion: the seller tries to take proceeds that are pledged to financier B | `claimAsSeller` | none |
| `BELOW_FLOOR` | Borrowing base overstated: $10,000.00 of collateral claimed as $15,000.00 | `certifyBorrowingBase` | none |

### The checks a party runs for itself, off chain

Neither of these submits anything. They read public state and reach a conclusion the reader
can reach the same way.

- **The lender checks the certificate really locks its pool to it, and only to it** (`checkCertificate (off chain)`, financierA): certificate 603ee2e2d913d76a74 floor $8,000.00, 4 slots, all live and addressed to the lender that asked for it; the same certificate checked by another financier reports ok=false (0 of 4 slots addressed to it)

- **Auditor opens the record and it proves itself against the ledger** (`verifyDisclosure (off chain)`, auditor): shares 1 + 3 recombined; invoice #1001 $2,300.00 recomputes nullifier 4fee305491cd2ceaf54a9187752f9233c15180c7e573b8db5698fdfaab0aae2a

- **Auditor opens every record of the case, and each one proves itself** (`openWholeCase (off chain)`, auditor): 4 records opened from one pair of approvals; invoices #1001, #2001, #2002, #2003, each recomputing its own on-ledger marker

- **A lender asks every registry it knows of whether the receivable is already pledged** (`checkEncumbranceAcross (off chain)`, financierA): marker 4fee305491cd2ceaf5... is SETTLED in this registry; no peer was declared, so nothing else was asked

### The disclosure, opened and self-proving

| | |
|---|---|
| Request id | `47ab75fc0c735d50a31a7519a549bbe09aff5128904197675e8a91fd7515ae67` |
| Record id | `24912c93cf26f7bc69fe36488cbecc83081ed3f1415eb11b56f58d0ea1f71def` |
| Case reference | `7b1168f151413495db3a8fd132d8770ea39db099d53d2e2fc745792d8d16964e` |
| Approvals on the ledger | `[true,false,true]` |
| Shamir indices recombined | 1 + 3 |
| Opened invoice | #1001, 230000 minor units, due 1799923236 |
| Fingerprint | `5d177c81d468857698647e3732f5d73c7c2fc860244f6824c46fb66739e96222` |
| Acknowledgment leaf | `839453975b1b136798c08d04206acfa9d8c8d76f3d743df92dafd9121f175cb7` |
| Nullifier recomputed from the plaintext | `4fee305491cd2ceaf54a9187752f9233c15180c7e573b8db5698fdfaab0aae2a` |
| Nullifier the pledge is keyed by on chain | `4fee305491cd2ceaf54a9187752f9233c15180c7e573b8db5698fdfaab0aae2a` |

The two nullifiers are equal, which is the point: the auditor did not receive an invoice and
take somebody's word for it - the plaintext it recovered rehashes to the exact public marker
the registry has been tracking since the offer.

### A party holding zero DUST transacted anyway

Every Midnight transaction pays its fee in DUST; DUST is generated only by registered NIGHT,
is non-transferable, and a contract cannot hold it. A debtor confirming an invoice their
employer owes is a finance clerk, not a crypto user, and will not be made to acquire NIGHT
first. The official sponsorship pattern removes that step without weakening anything: the
contract authenticates by secret knowledge, so the sponsor's money buys a block slot and
nothing else.

| | |
|---|---|
| Acting wallet | `mn_addr_preview1h757pw885u2sytzdjpmnwjpta2g7tad0qhqjz7sg5khlrhlsfacsy42wwl` |
| Its DUST before | **0 SPECK** |
| Its DUST after | **0 SPECK** |
| Its NIGHT | 0 STAR, 0 UTXO(s) registered for DUST generation |
| Run at | 2026-10-16 11:34:09 UTC |
| Evidence | [`cli/evidence/sponsored-preview-2026-10-16T11-34-09Z.json`](./cli/evidence/sponsored-preview-2026-10-16T11-34-09Z.json) |

| Circuit | Transaction | Block | Fee paid by the sponsor |
|---|---|---|---|
| `acknowledge` | [`a46d2c3a01b4...`](https://preview.midnightexplorer.com/transactions/a46d2c3a01b49d1ebca0ef7c9bb65d0f3c5927623cfedad116550daeffd06e07) | 1321650 | 1 SPECK |

Total paid by the sponsor: **1 SPECK** (0.000000 DUST).

The acting wallet was created from a seed of its own, never funded and never registered for
DUST generation. Its balance was read from the chain *before* the run and the command aborts
unless it is exactly zero — the claim is not that it ought to be empty but that it was, at the
moment it transacted. It proved, balanced only the shielded and unshielded sides, signed and
bound the transaction; the sponsor balanced the DUST and submitted. Its balance was read again
afterwards and is still zero, because it never paid.

<!-- END GENERATED preview -->

## Two registries, and the question a lender puts to both

<!-- BEGIN GENERATED preview-federation -->
<!-- END GENERATED preview-federation -->

## Registry B: the second, independent deployment

<!-- BEGIN GENERATED preview-b -->
<!-- END GENERATED preview-b -->

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
holds **0 tNIGHT and 0 DUST**. In Wave 1 the preprod faucet was behind a captcha loop and never
paid out; it works again now, but two other things changed underneath it, and both are worth
stating because a reader checking our Wave-1 config against the network today would find it
broken:

- **Midnight retired its own preprod endpoints on 2026-10-09 22:00 UTC.**
  `indexer.preprod.midnight.network` answers `410 ENDPOINT_DECOMMISSIONED`. Preprod is now served
  by Blockfrost at `midnight-preprod.blockfrost.io/api/v0` and
  `rpc.midnight-preprod.blockfrost.io`, with a per-network project token that is mandatory. The
  repository's network table was rewritten for this; `preview` is unaffected and still tokenless.
- **Saved wallet sync state did not survive the cutover.** A wallet resuming state captured
  against the old indexer must resync from genesis, which on preprod is about 78 minutes of
  streaming roughly 1.4M global DUST ledger events.

The commands are unchanged: `ceremony`, `deploy`, `scenario` and `verify` all take
`--network preprod`, and read the token from `BLOCKFROST_PROJECT_ID_PREPROD` or
`--blockfrost-token`.

## Mainnet: ready, not deployed

Mainnet contract deployment has been permissionless since 2026-09-28; the request process was
retired by [MIP PR #375](https://github.com/midnightntwrk/midnight-improvement-proposals/pull/375),
merged 2026-10-09. The docs site still says otherwise and has an unmerged fix open, so the MIP is
the authority, not the guide.

Everything needed to deploy is in this repository and nothing has been deployed. The remaining
gate is DUST: there is no mainnet faucet, fees are paid in DUST, and DUST comes from registering
NIGHT — a registration that takes about twelve hours to finalize on Cardano and reach a Midnight
node, after which it accrues over about a week. A registration of ~200 NIGHT against the DUST
address `mn_dust1wdp945q3qkfsnwlgdvucltpu5w8wqf75yk7whtxdex0ffd2exrlr7j4vkp3` is in flight.

What is ready:

- `--network mainnet` on `ceremony`, `deploy`, `scenario` and `verify`, with Blockfrost
  endpoints and explorer links for midnightexplorer.com and midnight.subscan.io.
- `npm run -w cli balance -- --network mainnet --watch 60`, which never waits for DUST, to watch
  the registration land.
- `npm run -w cli estimate -- --network mainnet`, which prices a full deploy plus scenario
  against mainnet's own ledger parameters **before anything is spent**, by reading a previous
  run's transactions back from the indexer as raw ledger bytes and re-pricing those exact bytes.
  Nothing is built, proven or submitted; `--offline` does not even open a wallet.
- A guard: every command that can submit refuses `--network mainnet` without `--yes-mainnet`.

The runbook, with the exact commands and the failure modes, is [`docs/MAINNET.md`](./docs/MAINNET.md).

## Tests

| Suite | Files | Tests | Notes |
|---|---|---|---|
| `contract/test/*` | 7 | **139** | lifecycle, one scenario per refusal code, fast-check model test, 2-of-3 disclosure with negative controls, deploy-time ceremony validation, public-transcript assertions, documented-limit reproductions |
| `sdk/test/*` (default) | 9 | **136** | scalar field and secret sharing, key material, record codec, the whole scenario through the role clients on the simulator, certificate audit checks, sandbox snapshot codec, the network table and its Blockfrost tokens, the indexer client, the sponsorship client |
| `sponsor/test/*` | 5 | **87** | the allowlist and the rate limit, the service end to end against a fake wallet, the budget under twenty parallel requests, the rate-limit bucket against a spoofed `X-Forwarded-For`, what the service is allowed to log, and the HTTP surface over a real socket |
| **Total, `npm test`** | **21** | **362** | no Docker, no node, no proof server |
| `sdk/test/network.devnet.test.ts` | 1 | 4 | opt-in (`DEVNET=1`): staged deploy and a real lifecycle with real proofs against a local node; 276.6 s |

## Reproduce

Everything below needs Node >= 22. The scenario additionally needs a proof server
(`docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3`) and a funded wallet. The proof
server runs locally on every network, including mainnet, because it sees witness data in the
clear.

```bash
npm install
npm test                               # 362 tests, no Docker needed
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
