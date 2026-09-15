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
// Commands are imported lazily so that `verify` — the one a judge runs — never loads the wallet
// SDK, the proof client or the compiled proving keys.
import { fail, parseArgs, say, UsageError, type Args } from './common.js';

const USAGE = `stock-and-foil cli

  ceremony --network <undeployed|preview|preprod> [--force]
      Runs the 2-of-3 disclosure key ceremony, checks it, writes the shares to
      cli/.secrets/<network>-keys.json (gitignored) and prints the public material.

  deploy --network <id> [--mnemonic-file <path>] [--force] [--verifier-keys-per-tx <n>]
      Deploys the registry in seven transactions (one deploy carrying six verifier keys, six
      maintenance transactions carrying the rest) and writes cli/deployments/<network>.json.

  scenario --network <id> [--mnemonic-file <path>] [--from <step>] [--fresh]
      Replays the guided First Brands scenario with real proofs and writes
      cli/evidence/<network>-<timestamp>.json. Resumable: completed steps are skipped.

  verify --network <id> [--evidence <path>]
      Re-reads the contract through the indexer and asserts it matches the newest evidence file.
      Needs no wallet and no proving keys. Exits non-zero on any mismatch.

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
