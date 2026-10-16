// SPDX-License-Identifier: Apache-2.0
//
// The build this console is allowed to put on mainnet.
//
// Everything downstream of a deploy — the eleven transactions, the evidence file, `verify`,
// `proof` — assumes the artefacts being deployed are the ones this repository has been tested
// against. A recompile with a different toolchain, a half-finished `compile:fast` that writes
// no proving keys, or a `public/zk` copy staged before the last compile all produce a contract
// that deploys and then cannot be called. On a network with no faucet that is not a mistake we
// get to make twice, so the expected build is written down here and checked before the first
// wallet prompt.
//
// The names and their order are `Object.keys(new Contract(witnesses).provableCircuits)`, which
// is what `CIRCUIT_IDS` in `sdk/src/backend/network.ts` reads and what decides which six keys
// the deploy transaction carries. The versions are the `compiler-version`, `language-version`
// and `runtime-version` of `contract/src/managed/stock-and-foil/compiler/contract-info.json`,
// and they match the pins documented in `docs/MAINNET.md`.

/** The sixteen proving circuits, in the order the contract declares them. */
export const FROZEN_CIRCUITS: readonly string[] = [
  'admitDebtor',
  'admitFinancier',
  'registerPeer',
  'acknowledge',
  'offer',
  'accept',
  'acceptBatch',
  'release',
  'certifyBorrowingBase',
  'payInvoice',
  'claimAsHolder',
  'claimAsSeller',
  'requestDisclosure',
  'approveDisclosure',
  'openCase',
  'approveCase',
];

/** Toolchain the committed artefacts were produced with. */
export const FROZEN_VERSIONS = {
  compiler: '0.31.1',
  language: '0.23.0',
  runtime: '0.16.0',
} as const;

/**
 * How many verifier keys the deploy transaction carries, mirroring `VERIFIER_KEYS_PER_TX`.
 *
 * Kept here only so the console can say "1 deploy + 10 key inserts" before it has loaded the
 * SDK; the number the deployment actually uses is the SDK's, and the preflight compares them.
 */
export const VERIFIER_KEYS_IN_DEPLOY_TX = 6;

/** Transactions a full staged deployment takes: the deploy plus one per remaining key. */
export const DEPLOY_TX_COUNT = 1 + (FROZEN_CIRCUITS.length - VERIFIER_KEYS_IN_DEPLOY_TX);
