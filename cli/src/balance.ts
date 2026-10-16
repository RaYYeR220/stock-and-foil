// SPDX-License-Identifier: Apache-2.0
//
// What the fee-paying wallet holds, on any network.
//
//   npm run -w cli balance -- --network mainnet --mnemonic-file ../infra/.secrets/mainnet-wallet.json
//   npm run -w cli balance -- --network mainnet --watch 60
//
// Written for one situation in particular: mainnet DUST does not arrive when you ask for it. You
// register NIGHT with the cNgD dApp, the registration finalizes on Cardano and reaches a Midnight
// node about twelve hours later, and DUST then accrues linearly to roughly five DUST per NIGHT
// over about a week. So the question "can we deploy yet" is a question about a number that moves,
// and this is the command that watches it.
//
// It never waits for DUST: `requireDust: false` is the point. A wallet with zero DUST is the
// normal case here, not a failure.
import { formatDust, SPECK_PER_DUST, type ChainNetwork } from '@stockandfoil/sdk';
import { createHeadlessWallet, type HeadlessWallet, type WalletBalances } from '@stockandfoil/sdk/node';
import {
  cliEndpoints,
  flagSet,
  flagValue,
  heading,
  loadMnemonic,
  NETWORK_FACTS,
  redactEndpoint,
  requireNetwork,
  say,
  seedHexOf,
  type Args,
} from './common.js';

const pad = (label: string): string => `  ${label.padEnd(26)}`;

function report(network: ChainNetwork, wallet: HeadlessWallet, balances: WalletBalances): void {
  const facts = NETWORK_FACTS[network];
  say(pad('unshielded address') + wallet.address);
  say(pad('DUST address') + wallet.dustAddress);
  say(pad('synced') + (balances.synced ? 'yes' : 'no (numbers below are partial)'));
  say(pad('NIGHT') + `${balances.night}  (${balances.nightStar} STAR)`);
  say(pad('DUST') + `${balances.dust}  (${balances.dustSpeck} SPECK, ${balances.dustCoins} coin(s))`);
  say(
    pad('NIGHT UTXOs') +
      `${balances.nightUtxosRegistered} registered for DUST generation, ` +
      `${balances.nightUtxosUnregistered} not registered`,
  );

  if (balances.dustSpeck === 0n) {
    say('');
    if (balances.nightUtxosUnregistered > 0) {
      say('  This wallet holds NIGHT that is not registered for DUST generation, so it generates');
      say('  nothing. Register it before expecting a balance.');
    }
    say(`  No DUST yet. ${facts.dustHint}`);
  } else if (balances.dustSpeck < SPECK_PER_DUST) {
    say('');
    say('  Under one DUST. Enough for a handful of small calls at preview prices; run');
    say(`  \`npm run -w cli estimate -- --network ${network}\` before counting on it.`);
  }
}

export async function balance(args: Args): Promise<number> {
  const network = requireNetwork(args);
  const endpoints = cliEndpoints(args, network);
  const mnemonic = loadMnemonic(args);
  const watchSeconds = flagSet(args, 'watch') ? Number(flagValue(args, 'watch') ?? 60) : 0;
  const syncTimeoutMs = Number(flagValue(args, 'sync-timeout-minutes') ?? 45) * 60_000;

  heading(`balance on ${network}`);
  say(`  indexer                   ${redactEndpoint(endpoints.indexerHttpUrl)}`);
  say(`  node                      ${redactEndpoint(endpoints.nodeUrl)}`);

  const wallet = await createHeadlessWallet({
    seedHex: seedHexOf(mnemonic),
    network,
    endpoints,
    syncTimeoutMs,
    // Never block on DUST: a wallet that has none is exactly what this command is for.
    requireDust: false,
    requireSync: !flagSet(args, 'no-sync'),
  });

  try {
    report(network, wallet, await wallet.balances());
    if (watchSeconds <= 0) return 0;

    say(`\n  watching every ${watchSeconds}s; Ctrl-C to stop`);
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, watchSeconds * 1000));
      const next = await wallet.balances();
      say(
        `  ${new Date().toISOString()}  NIGHT ${next.night}  DUST ${next.dust} ` +
          `(${next.dustSpeck} SPECK, ${formatDust(next.dustSpeck, 3)} rounded)  ` +
          `utxos ${next.nightUtxosRegistered}/${next.nightUtxosRegistered + next.nightUtxosUnregistered} registered`,
      );
    }
  } finally {
    await wallet.close();
  }
}
