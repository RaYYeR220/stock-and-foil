# Stock & Foil DUST fee sponsor

A small service that pays the DUST fee for a transaction somebody else built, so a debtor, a
supplier or a financier can use the registry while holding no NIGHT at all.

## Why this exists

Every Midnight transaction pays its fee in DUST. DUST is shielded, non-transferable, generated
only by registered NIGHT, and a contract cannot hold it. So a participant with no NIGHT cannot
transact, however legitimate the call.

For a collateral registry that is not an inconvenience, it is the adoption problem. A mid-market
debtor confirming "yes, we owe this invoice" is a finance clerk, not a crypto user, and no
amount of product polish survives "first, acquire NIGHT on an exchange and register it for DUST
generation". Sponsorship removes that step without weakening anything: the sponsor's money buys
a block slot and nothing else.

## The mechanism

This is the official pattern from [the DUST sponsorship
guide](https://docs.midnight.network/guides/dust-sponsorship) and
[`midnightntwrk/example-private-party`](https://github.com/midnightntwrk/example-private-party).
The whole of it is one option, `tokenKindsToBalance`:

```
user    (0 DUST)   prove -> balance ['shielded','unshielded'] -> sign -> finalize (BIND)
                   -> hand the bound transaction over as hex
sponsor (DUST)     deserialize -> balance ['dust'] -> sign -> finalize -> submit
```

Four properties make it safe:

1. **The contract authenticates by secret knowledge, not by who paid.** Stock & Foil's circuits
   check Merkle membership and knowledge of a persona secret. The fee payer is not an input to
   any of them, so paying someone's fee grants no authority.
2. **The user binds first.** Only a bound `FinalizedTransaction` crosses the wire. The sponsor
   cannot add a call, remove one, or re-target one.
3. **The network rejects a modified transaction.** The binding is cryptographic, not a promise.
4. **DUST cannot be extracted.** It is non-transferable. The worst a hostile caller can do is
   make the sponsor pay fees — which is what the allowlist, the caps and the rate limit are for.

## Why a separate workspace, not `cli/src/sponsor.ts`

Three reasons, in order of how much they matter.

- **It is a different trust domain.** This process holds a funded wallet and listens on a
  socket. The CLI's `verify` command is the one a judge runs, and its design point — stated in
  `cli/src/index.ts` — is that it loads no wallet, no proof client and no proving keys. Putting
  a hot wallet and an HTTP server in the same package would quietly undo that.
- **It has a different lifecycle.** The CLI runs a command and exits. This runs for days.
- **Its dependency surface is part of its threat model.** It adds nothing beyond the SDK and
  `node:http`: no framework, no router, no rate-limit library.

The client half — the HTTP call and the `WalletAdapter` that routes submission through a sponsor
— lives in the SDK (`sdk/src/backend/sponsor.ts`), because the browser app needs it and must not
depend on this package.

## Running it

```sh
SPONSOR_NETWORK=preview \
SPONSOR_MNEMONIC_FILE=../infra/.secrets/preview-wallet.json \
SPONSOR_CONTRACTS=<the registry's contract address> \
SPONSOR_BUDGET_SPECK=2000000000000000 \
npm run -w sponsor start
```

It refuses to start without `SPONSOR_CONTRACTS` and without `SPONSOR_BUDGET_SPECK`. A sponsor
with no contract allowlist pays for anything anyone sends it, and a sponsor with no total cap is
an open faucet; neither default is ours to pick.

| Variable | Default | Meaning |
|---|---|---|
| `SPONSOR_NETWORK` | `preview` | `undeployed`, `preview`, `preprod`, `mainnet` |
| `SPONSOR_MNEMONIC_FILE` | **required** | 24-word mnemonic, or JSON with a `mnemonic` field. Keep it outside the repository. |
| `SPONSOR_CONTRACTS` | **required** | Comma-separated contract addresses this sponsor pays for |
| `SPONSOR_BUDGET_SPECK` | **required** | Total DUST, in SPECK, this process may ever spend |
| `SPONSOR_CIRCUITS` | the default allowlist | Comma-separated entry points it pays for |
| `SPONSOR_MAX_FEE_SPECK` | `50000000000000` (0.05 DUST) | Cap for one transaction |
| `SPONSOR_RATE_MAX` / `SPONSOR_RATE_WINDOW_MS` | `5` / `60000` | Per-caller rate limit |
| `SPONSOR_MAX_ACTIONS` | `1` | Contract actions one transaction may carry |
| `SPONSOR_API_KEYS` | none (open) | `name:key,name:key`. When set, a request must present one. |
| `SPONSOR_ALLOWED_ORIGINS` | none | CORS origins, or `*` for a public demo |
| `SPONSOR_TRUST_PROXY` | off | Trust `X-Forwarded-For` for the client address. Only behind a proxy that overwrites it. |
| `SPONSOR_PORT` / `SPONSOR_HOST` | `7391` / `127.0.0.1` | Where to listen |
| `SPONSOR_LOG` | `.secrets/sponsor-ledger.jsonl` | Append-only ledger of every decision |
| `BLOCKFROST_PROJECT_ID_{PREPROD,MAINNET}` | — | Required on those two networks |

The default circuit allowlist is the calls made by parties who have no business holding NIGHT:
`acknowledge`, `offer`, `accept`, `release`, `payInvoice`, `claimAsHolder`, `claimAsSeller`.
Deliberately absent are `admitDebtor` and `admitFinancier` (the operator's own calls, and the
operator funds itself), `requestDisclosure` and `approveDisclosure` (an auditor and a trustee are
institutions with wallets), and `certifyBorrowingBase` (25–30 s of proving and a large
transcript — opt in explicitly if you want it).

## The HTTP surface

```
POST /v1/sponsor   { protocol: 1, tx: "<hex>", circuit?: "acknowledge", caller?: "web-demo" }
                -> { protocol: 1, txId, feeSpeck, circuits, contractAddress }
GET  /healthz      liveness, sponsor address, paid/refused counts, spend against the budget
GET  /v1/policy    the allowlist and the limits, so a UI can say what is sponsorable
```

A refusal is `{ protocol, error, code, retryAfterSeconds? }` with a code the client can branch
on: `CIRCUIT_NOT_ALLOWED`, `CONTRACT_NOT_ALLOWED`, `CIRCUIT_MISMATCH`, `NOT_A_CONTRACT_CALL`,
`FEE_TOO_LARGE`, `RATE_LIMITED`, `SPONSOR_OUT_OF_DUST`, `UNREADABLE_TRANSACTION`, `UNAUTHORIZED`,
`SUBMIT_FAILED`.

## What stops it being drained

- **The allowlist is applied to the transaction, not to the request.** The service deserializes
  the transaction and reads the contract addresses and entry points out of it. `circuit` in the
  request body is only cross-checked against that; a mismatch is a refusal. An allowlist keyed
  on a label the caller sent would not be an allowlist.
- **Deploys and maintenance updates are refused.** A sponsor pays for user calls to a registry it
  already knows, never for creating or re-keying one.
- **A per-transaction fee cap**, and **a total budget** the process will not spend past.
- **The budget holds under concurrency.** The check and the spend are separated by three awaits
  — pricing, balancing, submission — so a request reserves `SPONSOR_MAX_FEE_SPECK` synchronously
  before its first await and converts that reservation into spend in the same tick it commits.
  The invariant `spent + reserved <= budget` holds at every await point, not only between
  requests. `sponsor/test/service.test.ts` asserts it with twenty parallel requests and a
  sampler watching the counters while they run.
- **A submission failure counts as spent.** Once `submitTransaction` has been called the node may
  have taken the transaction even if the call threw, so the budget is charged. Over-counting
  costs a little headroom; under-counting would let a flood of failing submissions drain the
  wallet while our books said nothing had moved. A failure during fee *balancing*, which moves
  nothing, is not charged.
- **The rate-limit bucket is not client-controlled.** It is the name behind the presented API
  key, or the socket's remote address — never the `caller` field, which anyone can rotate.
  `X-Forwarded-For` is ignored unless `SPONSOR_TRUST_PROXY=1`.
- **Everything is logged, paid or refused**, with the running total and the budget left, to
  stdout and to an append-only JSONL ledger.

## Using it from a client

```ts
import { createHeadlessWallet } from '@stockandfoil/sdk/node';
import { createProviders, sponsoredWalletAdapter } from '@stockandfoil/sdk';

// A wallet that balances only shielded + unshielded, and holds no DUST.
const wallet = await createHeadlessWallet({ seedHex, network, payDustFees: false });
const providers = createProviders({
  network,
  wallet: sponsoredWalletAdapter(wallet.adapter, { endpoint: 'http://127.0.0.1:7391' }),
  zkConfigProvider,
});
```

In the browser it is the same shape with `dappConnectorWalletAdapter(connected, keys, { payFees: false })`.

`sponsoredWalletAdapter` refuses to wrap an adapter that pays its own fees: it requires
`paysDustFees === false`, and an adapter that does not say is treated as self-funded. Failing
closed is the point — a "zero-DUST" demo that quietly paid for itself would prove nothing.

## Proving it worked

`npm run -w cli sponsored -- --network preview` runs a real circuit from a wallet whose DUST
balance it reads as `0` first, and writes the evidence — the acting wallet's address and balance,
the transaction hash, the explorer link and what the sponsor paid — next to the scenario's own
evidence under `cli/evidence/`.
