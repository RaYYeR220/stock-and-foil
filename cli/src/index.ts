// SPDX-License-Identifier: Apache-2.0
//
// Stock & Foil command line: run the setup ceremony, deploy a registry, replay the guided
// scenario against a live network, and verify the chain against the evidence it produced.
//
//   npm run -w cli ceremony -- --network preview
//   npm run -w cli deploy   -- --network preview
//   npm run -w cli scenario -- --network preview
//   npm run -w cli verify   -- --network preview
//
// On preprod and mainnet every command needs a Blockfrost project token, because Midnight
// retired its own endpoints for those two networks: export BLOCKFROST_PROJECT_ID_PREPROD or
// BLOCKFROST_PROJECT_ID_MAINNET, or pass --blockfrost-token. A missing token fails immediately
// with a message naming both, rather than hanging or arriving as a 403 mid-deploy.
//
// Commands are imported lazily so that `verify` — the one a judge runs — never loads the wallet
// SDK, the proof client or the compiled proving keys.
import { fail, parseArgs, say, UsageError, type Args } from './common.js';

const USAGE = `stock-and-foil cli

  ceremony --network <undeployed|preview|preprod> [--force]
      Runs the 2-of-3 disclosure key ceremony, checks it, writes the shares to
      cli/.secrets/<network>-keys.json (gitignored) and prints the public material.

  deploy --network <id> [--mnemonic-file <path>] [--force] [--verifier-keys-per-tx <n>]
      Deploys the registry in stages: one transaction carrying the constructor and six verifier
      keys, then one maintenance transaction per remaining circuit, because all of the keys do
      not fit in one transaction. Writes cli/deployments/<network>.json.

  scenario --network <id> [--mnemonic-file <path>] [--from <step>] [--fresh] [--peer <address>]
      Replays the guided First Brands scenario with real proofs and writes
      cli/evidence/<network>-<timestamp>.json. Resumable: completed steps are skipped.
      --peer declares another registry as a peer; without it that step is skipped.

  verify --network <id> [--evidence <path>]
      Re-reads the contract through the indexer and asserts it matches the newest evidence file.
      Needs no wallet and no proving keys. Exits non-zero on any mismatch.

  balance --network <id> [--mnemonic-file <path>] [--watch <seconds>] [--no-sync]
      Prints the wallet's NIGHT and DUST, the addresses to fund, and what to do if there is no
      DUST yet. Never waits for DUST: a wallet with none is the normal case here.

  estimate --network <id> [--reference <id>] [--evidence <path>] [--margin-percent <n>] [--offline]
      What a full deploy + scenario will cost in DUST, before anything is spent. Reads a
      previous run's transactions back as raw ledger bytes and re-prices them against the
      target network. Submits nothing; --offline does not even open a wallet.

  sponsored --network <id> --sponsor <url> [--acting-mnemonic-file <path>]
      Proof that a party holding zero DUST can use the registry: a wallet whose balance is read
      as 0 first proves, balances and binds a real call, and a sponsor pays the fee and submits.

  proof --network <id> [--evidence <path>] [--out <path>]
      Rewrites the generated region of PROOF.md from the deployment record, the newest evidence
      file and the newest sponsorship proof. Reads files, writes one file, touches no network.

Networks: undeployed, preview, preprod, mainnet.
Common flags: --blockfrost-token <id>, --indexer-url, --node-url, --proof-server-url,
--sync-timeout-minutes <n>, --zk-assets <dir>. Mainnet also needs --yes-mainnet on any command
that submits.

The fee-paying wallet's 24-word mnemonic comes from MIDNIGHT_MNEMONIC or --mnemonic-file.
`;

async function run(args: Args): Promise<number> {
  switch (args.command) {
    case 'ceremony': {
      const { ceremony } = await import('./ceremony.js');
      return ceremony(args);
    }
    case 'deploy': {
      const { deploy } = await import('./deploy.js');
      return deploy(args);
    }
    case 'scenario': {
      const { scenario } = await import('./scenario.js');
      return scenario(args);
    }
    case 'verify': {
      const { verify } = await import('./verify.js');
      return verify(args);
    }
    case 'balance': {
      const { balance } = await import('./balance.js');
      return balance(args);
    }
    case 'estimate': {
      const { estimate } = await import('./estimate.js');
      return estimate(args);
    }
    case 'sponsored': {
      const { sponsored } = await import('./sponsored.js');
      return sponsored(args);
    }
    case 'proof': {
      const { proof } = await import('./proof.js');
      return proof(args);
    }
    case '':
    case 'help':
    case '--help':
      say(USAGE);
      return 0;
    default:
      throw new UsageError(`unknown command "${args.command}"\n\n${USAGE}`);
  }
}

const args = parseArgs(process.argv.slice(2));
let code = 0;
try {
  code = await run(args);
} catch (error) {
  code = 1;
  if (error instanceof UsageError) fail(`\n${error.message}`);
  else fail(`\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
}
// The indexer subscription and the wallet keep handles open; nothing is buffered by this point.
process.exit(code);
