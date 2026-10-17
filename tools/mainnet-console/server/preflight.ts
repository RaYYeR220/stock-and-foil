// SPDX-License-Identifier: Apache-2.0
//
// Everything that can be checked from this machine before a wallet is ever asked for anything.
//
// The browser half of the preflight (wallet present, wallet on mainnet, its circuit list, its
// DUST balance) lives in `src/lib/preflight.ts`. This half is the part that needs the
// filesystem and the credential: the token, the indexer answering, the ceremony keys, and the
// compiled artefacts matching the frozen sixteen-circuit build.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FROZEN_CIRCUITS, FROZEN_VERSIONS } from '../src/lib/frozen.js';
import { blockfrostMainnetToken, redact, TOKEN_ENV_VAR, TOKEN_PREFIX } from './env.js';
import { priceDeployment, toDust } from './price.js';
import { nodeAcceptsMidnightTransactions } from './submit.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface ServerPreflight {
  checks: Check[];
  /** Facts the page needs beyond pass/fail. */
  facts: {
    repoRoot: string;
    tokenSource: string;
    zkBaseUrl: string;
    circuits: string[];
    compactVersion?: string;
    chainHeight?: number;
    chainTimeIso?: string;
    /** What the eleven deployment transactions price at, in SPECK, under the ledger baseline. */
    deploymentSpeck?: string;
    deployTxSpeck?: string;
    keysFile?: { operatorId: string; threshold: number; createdAt: string };
    deploymentExists: boolean;
    deployedContractAddress?: string;
    runStateExists: boolean;
  };
}

const ok = (id: string, title: string, detail: string): Check => ({ id, title, status: 'ok', detail });
const warn = (id: string, title: string, detail: string): Check => ({ id, title, status: 'warn', detail });
const fail = (id: string, title: string, detail: string): Check => ({ id, title, status: 'fail', detail });

/** Repository paths this console reads and writes. All of them are already gitignored or tracked. */
export const paths = (repoRoot: string) => ({
  contractInfo: join(repoRoot, 'contract', 'src', 'managed', 'stock-and-foil', 'compiler', 'contract-info.json'),
  compiled: join(repoRoot, 'contract', 'src', 'managed', 'stock-and-foil'),
  staged: join(repoRoot, 'web', 'public', 'zk'),
  secrets: join(repoRoot, 'cli', '.secrets'),
  keysFile: join(repoRoot, 'cli', '.secrets', 'mainnet-keys.json'),
  runState: join(repoRoot, 'cli', '.secrets', 'mainnet-console.json'),
  privateState: join(repoRoot, 'cli', '.secrets', 'mainnet-console-private-state.json'),
  deployments: join(repoRoot, 'cli', 'deployments'),
  deployment: join(repoRoot, 'cli', 'deployments', 'mainnet.json'),
  evidence: join(repoRoot, 'cli', 'evidence'),
});

const sha256 = (path: string): Promise<string> =>
  new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', rejectHash)
      .on('end', () => resolveHash(hash.digest('hex')));
  });

interface ContractInfo {
  'compiler-version'?: string;
  'language-version'?: string;
  'runtime-version'?: string;
  circuits?: Array<{ name: string; proof?: boolean }>;
}

/** The committed compiler manifest: toolchain versions and which circuits carry a proof. */
function checkContractInfo(repoRoot: string, facts: ServerPreflight['facts']): Check {
  const path = paths(repoRoot).contractInfo;
  if (!existsSync(path)) {
    return fail('build', 'Compiled build', `${path} is missing. Run \`npm run compile\`.`);
  }
  const info = JSON.parse(readFileSync(path, 'utf8')) as ContractInfo;
  facts.compactVersion = info['compiler-version'];
  const proving = (info.circuits ?? []).filter((c) => c.proof).map((c) => c.name);
  facts.circuits = proving;

  const versionProblems = [
    ['compiler', info['compiler-version'], FROZEN_VERSIONS.compiler],
    ['language', info['language-version'], FROZEN_VERSIONS.language],
    ['runtime', info['runtime-version'], FROZEN_VERSIONS.runtime],
  ].filter(([, actual, expected]) => actual !== expected);

  const missing = FROZEN_CIRCUITS.filter((c) => !proving.includes(c));
  const extra = proving.filter((c) => !FROZEN_CIRCUITS.includes(c));
  const sameOrder = proving.length === FROZEN_CIRCUITS.length && proving.every((c, i) => c === FROZEN_CIRCUITS[i]);

  if (versionProblems.length > 0) {
    return fail(
      'build',
      'Compiled build',
      `the toolchain does not match the frozen build: ${versionProblems
        .map(([what, actual, expected]) => `${what} ${actual ?? 'absent'} != ${expected}`)
        .join(', ')}. docs/MAINNET.md section 5 says why each pin is what it is.`,
    );
  }
  if (missing.length > 0 || extra.length > 0 || !sameOrder) {
    return fail(
      'build',
      'Compiled build',
      `the compiled contract is not the frozen sixteen-circuit build: ${proving.length} proving circuits` +
        (missing.length ? `, missing ${missing.join(', ')}` : '') +
        (extra.length ? `, unexpected ${extra.join(', ')}` : '') +
        (!sameOrder && missing.length === 0 && extra.length === 0
          ? ' — same names, different declaration order, which changes which six keys the deploy carries'
          : ''),
    );
  }
  return ok(
    'build',
    'Compiled build',
    `Compact ${info['compiler-version']} / language ${info['language-version']} / runtime ` +
      `${info['runtime-version']}, ${proving.length} proving circuits in the frozen order.`,
  );
}

/**
 * The staged proving material: present for all sixteen circuits, and identical to what the
 * compiler last wrote.
 *
 * The identity check is the one that matters. `npm run -w web zk:stage` copies ~124 MB out of
 * the compiler's output directory, and a copy made before the last compile proves against one
 * circuit while the verifier key going on chain belongs to another — a contract that deploys
 * and can never be called. Verifier keys and ZKIR are compared by digest because they are
 * small and because the verifier key is the artefact that actually lands on the ledger;
 * proving keys are compared by size unless `deep` is asked for, which digests all 124 MB.
 */
async function checkStagedZk(repoRoot: string, deep: boolean): Promise<Check> {
  const { staged, compiled } = paths(repoRoot);
  if (!existsSync(join(staged, 'keys'))) {
    return fail(
      'zk',
      'Proving keys served locally',
      `nothing staged at ${staged}. Run \`npm run -w web zk:stage\` (~124 MB, gitignored) and reload.`,
    );
  }

  const missing: string[] = [];
  const stale: string[] = [];
  for (const circuit of FROZEN_CIRCUITS) {
    for (const [dir, ext, byDigest] of [
      ['keys', '.verifier', true],
      ['zkir', '.bzkir', true],
      ['keys', '.prover', deep],
    ] as const) {
      const stagedFile = join(staged, dir, `${circuit}${ext}`);
      const sourceFile = join(compiled, dir, `${circuit}${ext}`);
      if (!existsSync(stagedFile) || !existsSync(sourceFile)) {
        missing.push(`${dir}/${circuit}${ext}`);
        continue;
      }
      if (byDigest) {
        if ((await sha256(stagedFile)) !== (await sha256(sourceFile))) stale.push(`${dir}/${circuit}${ext}`);
      } else if (statSync(stagedFile).size !== statSync(sourceFile).size) {
        stale.push(`${dir}/${circuit}${ext}`);
      }
    }
  }

  if (missing.length > 0) {
    return fail(
      'zk',
      'Proving keys served locally',
      `${missing.length} artefact(s) absent from the staged copy or from the compiler output ` +
        `(${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}). ` +
        'Run `npm run compile` and then `npm run -w web zk:stage`.',
    );
  }
  if (stale.length > 0) {
    return fail(
      'zk',
      'Proving keys served locally',
      `the staged copy is not the current build: ${stale.length} artefact(s) differ ` +
        `(${stale.slice(0, 4).join(', ')}${stale.length > 4 ? ', …' : ''}). Re-run ` +
        '`npm run -w web zk:stage`.',
    );
  }
  const names = await readdir(join(staged, 'keys'));
  return ok(
    'zk',
    'Proving keys served locally',
    `${names.length} files under ${staged}, served at /zk with Access-Control-Allow-Origin: *; ` +
      `verifier keys and ZKIR digest-identical to the compiler output${deep ? ', proving keys too' : ''}.`,
  );
}

interface KeysFileShape {
  network?: string;
  createdAt?: string;
  threshold?: number;
  publicMaterial?: { operatorId?: string };
  secrets?: { keyholders?: unknown[] };
}

function checkCeremonyKeys(repoRoot: string, facts: ServerPreflight['facts']): Check {
  const path = paths(repoRoot).keysFile;
  if (!existsSync(path)) {
    return warn(
      'keys',
      'Disclosure key ceremony',
      'no cli/.secrets/mainnet-keys.json yet. Run the ceremony from this console, or ' +
        '`npm run -w cli ceremony -- --network mainnet`. The deploy seals its output into the contract.',
    );
  }
  const file = JSON.parse(readFileSync(path, 'utf8')) as KeysFileShape;
  if (file.network !== 'mainnet') {
    return fail('keys', 'Disclosure key ceremony', `cli/.secrets/mainnet-keys.json says network "${file.network}".`);
  }
  if ((file.secrets?.keyholders ?? []).length !== 3) {
    return fail(
      'keys',
      'Disclosure key ceremony',
      `expected 3 keyholder shares, found ${(file.secrets?.keyholders ?? []).length}.`,
    );
  }
  facts.keysFile = {
    operatorId: file.publicMaterial?.operatorId ?? '',
    threshold: file.threshold ?? 0,
    createdAt: file.createdAt ?? '',
  };
  return ok(
    'keys',
    'Disclosure key ceremony',
    `${file.threshold} of 3, dealt ${file.createdAt}; operatorId ${(file.publicMaterial?.operatorId ?? '').slice(0, 16)}….`,
  );
}

/**
 * The indexer answering, through the same proxy the page will use.
 *
 * `{ block { height timestamp } }` is the query `latestBlock` in `sdk/src/backend/indexer.ts`
 * uses, so a pass here means the thing the backend will do works, not something adjacent.
 */
async function checkIndexer(token: string | undefined, facts: ServerPreflight['facts']): Promise<Check> {
  if (!token) {
    return fail(
      'indexer',
      'Blockfrost indexer (mainnet)',
      'not attempted: there is no project token to attempt it with.',
    );
  }
  const url = new URL('https://midnight-mainnet.blockfrost.io/api/v0');
  url.searchParams.set('project_id', token);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', project_id: token },
      body: JSON.stringify({ query: '{ block { height timestamp } }' }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return fail(
        'indexer',
        'Blockfrost indexer (mainnet)',
        `answered ${response.status}: ${redact(text.slice(0, 200), token)}` +
          (response.status === 403 ? ' — the project token is wrong for mainnet, or out of quota.' : ''),
      );
    }
    const body = JSON.parse(text) as { data?: { block?: { height?: number; timestamp?: number } } };
    const block = body.data?.block;
    if (!block?.height) {
      return fail('indexer', 'Blockfrost indexer (mainnet)', `returned no latest block: ${redact(text.slice(0, 200), token)}`);
    }
    facts.chainHeight = block.height;
    facts.chainTimeIso = block.timestamp ? new Date(block.timestamp).toISOString() : undefined;
    return ok(
      'indexer',
      'Blockfrost indexer (mainnet)',
      `block ${block.height} at ${facts.chainTimeIso ?? 'an unreported time'}, ${Date.now() - started} ms. ` +
        "Midnight's own mainnet endpoints answer 410, so this is the only read path.",
    );
  } catch (cause) {
    return fail(
      'indexer',
      'Blockfrost indexer (mainnet)',
      `could not be reached: ${redact(cause instanceof Error ? cause.message : String(cause), token)}`,
    );
  }
}

/**
 * The submit path, checked before anything needs it.
 *
 * The first mainnet attempt proved and balanced a transaction and then lost it, because
 * submission went through the wallet and the wallet could not say what happened. Submission is
 * ours now, so it is something this machine can check: that the node answers, that it is a
 * Midnight node, and that it exposes the unsigned extrinsic that carries a ledger transaction.
 * Connecting here also warms the connection the eleven deployment transactions will reuse.
 */
async function checkSubmitPath(token: string | undefined): Promise<Check> {
  if (!token) {
    return fail('submit', 'Submitting to the chain', 'not attempted: there is no project token.');
  }
  const started = Date.now();
  try {
    const node = await nodeAcceptsMidnightTransactions(
      `wss://rpc.midnight-mainnet.blockfrost.io?project_id=${encodeURIComponent(token)}`,
    );
    if (!node.sendMnTransaction) {
      return fail(
        'submit',
        'Submitting to the chain',
        `${node.chain} does not expose midnight.sendMnTransaction, so this is not a node that can ` +
          'carry a Midnight transaction.',
      );
    }
    return ok(
      'submit',
      'Submitting to the chain',
      `${node.chain}, runtime ${node.runtime}, ${node.peers} peers, ${node.syncing ? 'SYNCING' : 'synced'}; ` +
        `midnight.sendMnTransaction available (${Date.now() - started} ms). The console submits here ` +
        "itself rather than through the wallet, whose own indexer was decommissioned and cannot " +
        'report what became of a transaction.',
    );
  } catch (cause) {
    return fail(
      'submit',
      'Submitting to the chain',
      `the node could not be reached: ${redact(cause instanceof Error ? cause.message : String(cause), token)}`,
    );
  }
}

/**
 * The bill, before the first prompt.
 *
 * Two mainnet attempts were spent discovering this the slow way. The number is now read off
 * the ledger's own cost function and shown next to what the wallet holds, so the next attempt
 * starts from arithmetic rather than hope.
 */
async function checkPrice(repoRoot: string, facts: ServerPreflight['facts']): Promise<Check> {
  try {
    const priced = await priceDeployment(repoRoot);
    facts.deploymentSpeck = priced.totalSpeck.toString();
    facts.deployTxSpeck = priced.deploySpeck.toString();
    return ok(
      'price',
      'What the deployment costs',
      `${toDust(priced.totalSpeck)} DUST for all ${priced.transactions} transactions, of which ` +
        `${toDust(priced.deploySpeck)} DUST is the deploy itself (${priced.deployBytes} bytes). Priced ` +
        "from the committed preview deployment's real bytes through the ledger's own cost " +
        'function, at its baseline parameters — mainnet’s live parameters are not served by ' +
        'any RPC and float upward from this floor, so treat it as a minimum. Preview charged 1 ' +
        'SPECK a transaction and is no guide at all.',
    );
  } catch (cause) {
    return warn(
      'price',
      'What the deployment costs',
      `could not be priced: ${cause instanceof Error ? cause.message : String(cause)}. The run can ` +
        'proceed, but nothing here knows whether the wallet can pay for it.',
    );
  }
}

/** Everything this machine can establish before the wallet is involved. */
export async function serverPreflight(repoRoot: string, deep = false): Promise<ServerPreflight> {
  const p = paths(repoRoot);
  const lookup = blockfrostMainnetToken(repoRoot);
  const facts: ServerPreflight['facts'] = {
    repoRoot,
    tokenSource: lookup.source,
    zkBaseUrl: '/zk',
    circuits: [],
    deploymentExists: existsSync(p.deployment),
    runStateExists: existsSync(p.runState),
  };
  if (facts.deploymentExists) {
    try {
      facts.deployedContractAddress = (
        JSON.parse(readFileSync(p.deployment, 'utf8')) as { contractAddress?: string }
      ).contractAddress;
    } catch {
      // a deployment file we cannot parse is reported by the check below, not here
    }
  }

  const tokenCheck: Check =
    lookup.source === 'absent'
      ? fail(
          'token',
          'Blockfrost project token',
          `absent. Export ${TOKEN_ENV_VAR}=… or put it in an untracked .env.local at the repository ` +
            'root. It is read by the dev server only and never reaches the page.',
        )
      : lookup.prefixOk
        ? ok(
            'token',
            'Blockfrost project token',
            `present, from ${lookup.source}, mainnet prefix. Held by the dev server; the page talks to /bf.`,
          )
        : fail(
            'token',
            'Blockfrost project token',
            `present from ${lookup.source} but it does not start with "${TOKEN_PREFIX}", so it is not a ` +
              'mainnet project id. Blockfrost answers a cross-network token with a bare 403.',
          );

  const checks: Check[] = [
    tokenCheck,
    await checkIndexer(lookup.token, facts),
    await checkSubmitPath(lookup.token),
    await checkPrice(repoRoot, facts),
    checkContractInfo(repoRoot, facts),
    await checkStagedZk(repoRoot, deep),
    checkCeremonyKeys(repoRoot, facts),
    facts.deploymentExists
      ? warn(
          'deployment',
          'Existing deployment record',
          `cli/deployments/mainnet.json already names ${facts.deployedContractAddress ?? 'a contract'}. ` +
            'A fresh deploy would overwrite it; resume instead, or move it aside.',
        )
      : ok('deployment', 'Existing deployment record', 'none — this would be the first mainnet registry.'),
  ];
  return { checks, facts };
}
