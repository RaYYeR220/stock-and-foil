// SPDX-License-Identifier: Apache-2.0
//
// Starts a real sponsor: a funded wallet behind the HTTP service.
//
//   SPONSOR_NETWORK=preview \
//   SPONSOR_MNEMONIC_FILE=../infra/.secrets/preview-wallet.json \
//   SPONSOR_CONTRACTS=<registry address> \
//   npm run -w sponsor start
//
// Everything is configured through the environment, and nothing is written into the repository:
// the mnemonic is read from a path outside it, the Blockfrost token comes from
// BLOCKFROST_PROJECT_ID_<NETWORK>, and the ledger of what was paid goes to a gitignored file.
//
// The process refuses to start without an explicit contract allowlist. A sponsor that pays for
// any contract is a faucet with extra steps.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mnemonicToSeedSync } from '@scure/bip39';
import {
  formatDust,
  hex,
  isChainNetwork,
  redactEndpoint,
  resolveEndpoints,
  SPONSOR_PATH,
  type ChainNetwork,
} from '@stockandfoil/sdk';
import { createHeadlessWallet } from '@stockandfoil/sdk/node';
import { DEFAULT_RATE_LIMIT, DEFAULT_SPONSORED_CIRCUITS, type SponsorPolicy } from './policy.js';
import { SponsorService, type SponsorLogEntry, type SponsorSigner } from './service.js';
import { createSponsorServer } from './server.js';

const env = process.env;

const required = (name: string, why?: string): string => {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} is required${why ? `: ${why}` : '.'} See sponsor/README.md for the full configuration.`,
    );
  }
  return value.trim();
};

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

function readMnemonic(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`SPONSOR_MNEMONIC_FILE ${absolute} does not exist`);
  const text = readFileSync(absolute, 'utf8').trim();
  const mnemonic = text.startsWith('{') ? ((JSON.parse(text) as { mnemonic?: string }).mnemonic ?? '') : text;
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 24) throw new Error(`${absolute} does not hold a 24-word mnemonic`);
  return words.join(' ');
}

async function main(): Promise<void> {
  const networkName = env.SPONSOR_NETWORK ?? 'preview';
  if (!isChainNetwork(networkName)) throw new Error(`SPONSOR_NETWORK "${networkName}" is not a known network`);
  const network: ChainNetwork = networkName;

  const contracts = csv(env.SPONSOR_CONTRACTS);
  if (contracts.length === 0) {
    throw new Error(
      'SPONSOR_CONTRACTS is required: a comma-separated list of the contract addresses this ' +
        'sponsor will pay for. Refusing to start without one — a sponsor with no contract ' +
        'allowlist pays for anything anyone sends it.',
    );
  }

  // No default budget. A sponsor is a wallet that spends when a stranger asks it to, and the
  // total it may spend is the one number nobody should inherit from a constant in our source.
  const budgetSpeck = BigInt(
    required(
      'SPONSOR_BUDGET_SPECK',
      'the total DUST, in SPECK, this process may ever spend. 1 DUST = 10^15 SPECK. Refusing to ' +
        'start without one: an uncapped fee sponsor is an open faucet.',
    ),
  );
  if (budgetSpeck <= 0n) throw new Error('SPONSOR_BUDGET_SPECK must be greater than zero');

  const policy: SponsorPolicy = {
    contracts,
    circuits: csv(env.SPONSOR_CIRCUITS).length > 0 ? csv(env.SPONSOR_CIRCUITS) : [...DEFAULT_SPONSORED_CIRCUITS],
    maxFeeSpeck: BigInt(env.SPONSOR_MAX_FEE_SPECK ?? 50_000_000_000_000n.toString()),
    budgetSpeck,
    rateLimit: {
      maxRequests: Number(env.SPONSOR_RATE_MAX ?? DEFAULT_RATE_LIMIT.maxRequests),
      windowMs: Number(env.SPONSOR_RATE_WINDOW_MS ?? DEFAULT_RATE_LIMIT.windowMs),
    },
    maxActionsPerTransaction: Number(env.SPONSOR_MAX_ACTIONS ?? 1),
  };

  const apiKeys = new Map<string, string>();
  for (const pair of csv(env.SPONSOR_API_KEYS)) {
    const [name, key] = pair.split(':');
    if (name && key) apiKeys.set(key, name);
  }

  const endpoints = resolveEndpoints(network, { env });
  const port = Number(env.SPONSOR_PORT ?? 7391);
  const host = env.SPONSOR_HOST ?? '127.0.0.1';
  const logPath = resolve(env.SPONSOR_LOG ?? '.secrets/sponsor-ledger.jsonl');

  process.stdout.write(`sponsor: network ${network}, indexer ${redactEndpoint(endpoints.indexerHttpUrl)}\n`);
  process.stdout.write('sponsor: unlocking the sponsoring wallet and syncing...\n');

  const mnemonic = readMnemonic(required('SPONSOR_MNEMONIC_FILE'));
  const wallet = await createHeadlessWallet({
    seedHex: hex(mnemonicToSeedSync(mnemonic)),
    network,
    endpoints,
    syncTimeoutMs: Number(env.SPONSOR_SYNC_TIMEOUT_MS ?? 45 * 60_000),
    // The sponsor is the one wallet in the system that must hold DUST, so wait for it.
    requireDust: true,
  });

  const opening = await wallet.balances();
  process.stdout.write(
    `sponsor: wallet ${wallet.address} holds ${opening.dust} DUST (${opening.dustSpeck} SPECK)\n`,
  );

  const signer: SponsorSigner = {
    address: wallet.address,
    dustSpeck: async () => (await wallet.balances()).dustSpeck,
    estimateFee: (tx) => wallet.estimateFee(tx),
    addDustFees: (tx) => wallet.addDustFees(tx),
    submit: (tx) => wallet.submit(tx),
  };

  mkdirSync(dirname(logPath), { recursive: true });
  const onLog = (entry: SponsorLogEntry): void => {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
    const what = entry.circuits.join(', ') || '(no call)';
    const spent =
      `[spent ${entry.cumulativeFeeSpeck} SPECK of ${policy.budgetSpeck}, ` +
      `budget left ${entry.budgetLeftSpeck}, wallet ${entry.remainingDustSpeck ?? '?'}]`;
    process.stdout.write(
      entry.outcome === 'refused'
        ? `sponsor: REFUSED ${entry.code} for ${what} from ${entry.caller}: ${entry.reason}\n`
        : `sponsor: ${entry.outcome === 'paid' ? 'PAID' : 'SUBMIT-FAILED, CHARGED'} ` +
            `${entry.feeSpeck} SPECK (${formatDust(BigInt(entry.feeSpeck ?? '0'))} DUST) ` +
            `for ${what} from ${entry.caller} -> ${entry.txId ?? '(no tx id)'} ${spent}\n`,
    );
  };

  // SPONSOR_DEBUG attaches upstream error text to the ledger. It never reaches an HTTP
  // response, and it is off unless asked for, because a wallet or node error can quote the
  // user's transaction back.
  const service = new SponsorService({ policy, signer, onLog, debug: env.SPONSOR_DEBUG === '1' });
  const server = createSponsorServer({
    service,
    apiKeys,
    allowedOrigins: csv(env.SPONSOR_ALLOWED_ORIGINS),
    // X-Forwarded-For is believed only for requests that arrive from one of these addresses,
    // and only the hop our own proxy appended (counting from the right) is read. Unset means
    // the header is ignored and the bucket is the socket address.
    trustedProxies: csv(env.SPONSOR_TRUSTED_PROXIES),
    trustProxyHops: Number(env.SPONSOR_TRUST_PROXY_HOPS ?? 1),
  });

  const pruner = setInterval(() => service.pruneRateLimiter(), policy.rateLimit.windowMs);
  pruner.unref();

  server.listen(port, host, () => {
    process.stdout.write(`sponsor: listening on http://${host}:${port}${SPONSOR_PATH}\n`);
    process.stdout.write(`sponsor: contracts  ${policy.contracts.join(', ')}\n`);
    process.stdout.write(`sponsor: circuits   ${policy.circuits.join(', ')}\n`);
    process.stdout.write(
      `sponsor: limits     <= ${policy.maxFeeSpeck} SPECK per tx, ` +
        `${policy.rateLimit.maxRequests} tx / ${policy.rateLimit.windowMs / 1000}s per caller, ` +
        `budget ${policy.budgetSpeck} SPECK\n`,
    );
    process.stdout.write(
      `sponsor: auth       ${apiKeys.size > 0 ? `${apiKeys.size} API key(s)` : 'open, rate limited per client address'}\n`,
    );
    process.stdout.write(`sponsor: ledger     ${logPath}\n`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`sponsor: ${signal}, stopping\n`);
    server.close();
    await wallet.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  process.stderr.write(`sponsor: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
