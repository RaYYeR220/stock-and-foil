<!-- SPDX-License-Identifier: Apache-2.0 -->

# Mainnet console

A local operator console that deploys the Stock & Foil registry to Midnight mainnet through the
[1AM](https://1am.xyz/developers) browser wallet, whose ProofStation proves and balances from
its own funded pool — so the signer needs no DUST. Background and the full runbook are in
[`docs/MAINNET.md` §3b](../../docs/MAINNET.md).

```sh
npm run -w web zk:stage    # once per compile: ~124 MB into web/public/zk, gitignored
npm run console            # from the repository root
```

Then open **http://127.0.0.1:5174/**.

## Run it only while you are deploying, then stop it

This is not a service and it must not be left running. While it is up, the dev server:

- holds the Blockfrost mainnet project token and will spend quota on behalf of requests it
  accepts;
- serves `cli/.secrets/mainnet-keys.json` — the operator, auditor and keyholder secrets — to the
  page, because the circuits cannot be proved without them;
- writes files under `cli/deployments/`, `cli/evidence/` and `cli/.secrets/`.

Start it when you are about to deploy. Press Ctrl-C when the evidence file is written. Then run
`npm run -w cli verify -- --network mainnet`, which needs none of this.

## What protects it while it is up

| | |
|---|---|
| Bound to loopback | `host: 127.0.0.1`, `allowedHosts` limited to `127.0.0.1` and `localhost`, and every request re-checked: loopback socket, own `Host`, own `Origin`, `Sec-Fetch-Site` not cross-site. |
| Per-run secret | Minted at startup, injected into the page's `<head>` by the Vite plugin, required on `/bf` and `/__console/*`. Not in the bundle, not on disk, new on every restart. |
| No CORS | `server.cors: false`. Only `/zk` sets `Access-Control-Allow-Origin: *`, and it is read-only public compiled artefacts. |
| JSON only on writes | `application/json` is required, which a cross-site form post cannot send. |
| No overwriting evidence | A deployment record or evidence file that already exists is never clobbered; the write goes to a suffixed name and says so. |
| Shape checked before writing | `server/validate.ts` refuses an incomplete record rather than saving a claim about mainnet nobody can check. |
| Secrets off the filesystem routes | `server.fs.deny` covers `.env*`, `.secrets/**`, keys and certificates, so `/@fs/` cannot read them. |

**What it does not protect against.** Another *process* on this machine can fetch `/` and read
the session secret out of the HTML, exactly as it could read `.env.local` directly. No localhost
dev server can prevent that. That is the reason for the rule at the top of this section: the
window in which any of this is reachable should be the window in which you are deploying.

## Who submits

1AM proves and balances with DUST from its pool. The console submits the balanced bytes itself,
through Blockfrost's node, because the indexer 1AM reports was decommissioned and the wallet
cannot observe what became of a transaction it sent. Submission is an unsigned
`midnight.sendMnTransaction` extrinsic, so it needs no Substrate account and no second source
of fees; the project token stays in the dev server, as it does for reads.

## Why it lives here and not in `web/`

Vercel builds the `web` workspace. A second Vite entry or a `import.meta.env.DEV` route there is
one misconfigured input away from being published, and this app reads ceremony secrets and holds
a credential. So: its own workspace under `tools/`, no `build` script, `vite build` throws, and
it is absent from the root `build` pipeline.

## Files it touches

| Path | |
|---|---|
| `cli/.secrets/mainnet-keys.json` | read, and written by the in-browser key ceremony |
| `cli/.secrets/mainnet-console.json` | the resumable run state, rewritten after every step |
| `cli/.secrets/mainnet-console-private-state.json` | the private-state mirror, **including the deployer's signing key — back this up** |
| `cli/deployments/mainnet.json` | the deployment record, in the CLI's shape |
| `cli/evidence/mainnet-*.json` | the evidence file, in the CLI's shape |
| `web/public/zk/` | read, served at `/zk` |

Everything under `cli/.secrets/` and `web/public/zk/` is gitignored. The deployment record and
the evidence file are meant to be committed, and are written by the same serializer the CLI uses
(`cli/src/records.ts`), so `verify` and `proof` read them unchanged.
