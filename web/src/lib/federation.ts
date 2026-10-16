// SPDX-License-Identifier: Apache-2.0
//
// Federation: the answer to "this only works once everybody joins the same registry".
//
// A pledge marker is a deterministic function of the invoice — `nullifier = H(domain ‖ invoice)`
// — so the same receivable produces the same marker in every registry that exists. Nothing about
// a marker is scoped to one deployment. A lender therefore does not need everyone in one place:
// it computes the marker once and reads it against every registry address it knows. No shared
// operator, no data-sharing agreement, no consortium — two independent reads, here.
//
// This module used to be an inert seam with `federationSource = null`, because a cross-registry
// check that has not run must not be drawn as though it had. It has run now. Two registries are
// deployed on Midnight preview, each from its own ceremony, and each has declared the other a
// peer on chain. The preview indexer answers a browser directly — it sends
// `access-control-allow-origin: *` on both the preflight and the POST — so everything below is a
// real read of two contracts' public state from the visitor's own tab: no proxy, no API key, no
// wallet, no server of ours in the path.
//
// Preview only, and deliberately. Preprod and mainnet are served by Blockfrost, which requires a
// project id, and a project id shipped in browser code is a published secret. A mainnet version
// of this panel has to read through a server. The UI says so where a visitor can see it.
import { ledger } from '@stockandfoil/contract';
import {
  contractStateFromHex,
  encumbranceOf,
  findPeer,
  findPledge,
  toPublicLedgerView,
  type PublicLedgerView,
} from './sdk.js';

/** Where a registry lives relative to the lender doing the checking. */
export type PeerKind = 'own' | 'peer';

export interface RegistryPeer {
  id: string;
  /** What the lender calls this registry in its own console. */
  label: string;
  /** Who runs it. Not who is in it — membership is never public. */
  operator: string;
  /** The Midnight network the registry contract is deployed on. */
  network: string;
  kind: PeerKind;
  /** The deployed contract address. */
  contractAddress: string;
  /** Where to go and look at it. */
  explorerUrl: string;
}

/** What one registry can answer about one marker. There is no fifth possibility. */
export type MarkerVerdict = 'free' | 'encumbered' | 'settled' | 'unreachable';

/** Why a registry could not be read. Every one of these is printed, verbatim, in the panel. */
export type ReadFailure = 'timeout' | 'offline' | 'rejected' | 'absent' | 'undecodable';

export const FAILURE_TEXT: Record<ReadFailure, string> = {
  timeout: 'the indexer did not answer in time',
  offline: 'this browser could not reach the indexer',
  rejected: 'the indexer refused the query',
  absent: 'the indexer holds no state for that contract address',
  undecodable: 'this build could not decode the state it was served',
};

export type PledgeStatusName = 'OFFERED' | 'PLEDGED' | 'RELEASED' | 'SETTLED';

export interface PeerAnswer {
  peerId: string;
  verdict: MarkerVerdict;
  /** The status the ledger literally holds for this marker, when it holds an entry at all. */
  status?: PledgeStatusName;
  /** Whether this registry's `peers` map names the other registry in this check. */
  declaresPeer?: boolean;
  /** The operator id this contract was constructed with, read from its own state. */
  operatorId?: string;
  /** ISO timestamp of the read that produced this verdict. */
  readAt: string;
  /** How long the read took, in milliseconds. */
  tookMs: number;
  failure?: ReadFailure;
}

/** The single bit a lender acts on, across every registry it asked. */
export type CrossRegistryBit = 'encumbered' | 'settled' | 'free' | 'no-answer';

export interface CrossRegistryAnswer {
  /** The marker that was checked, hex, as every registry would compute it. */
  marker: string;
  answers: readonly PeerAnswer[];
  bit: CrossRegistryBit;
  /** True only when every registry answered. A missing answer is never read as "free". */
  complete: boolean;
  /** Block the chain time came from, when the indexer gave one. */
  blockHeight?: number;
  /** Whose clock decided whether an offer had expired. */
  clock: 'chain' | 'browser';
  tookMs: number;
}

export interface FederationSource {
  peers(): readonly RegistryPeer[];
  check(marker: string): Promise<CrossRegistryAnswer>;
}

// ------------------------------------------------------------------------------- the registries

const explorerContract = (address: string): string =>
  `https://preview.midnightexplorer.com/contracts/${address}`;

/**
 * The two deployments this panel reads. Both are on Midnight preview, both were produced by
 * `npm run -w cli deploy`, and each ran its own key ceremony: a different operator, a different
 * disclosure key and a different three keyholders. Neither can read the other's private state.
 */
export const PREVIEW_REGISTRIES: readonly RegistryPeer[] = [
  {
    id: 'a',
    label: 'Stock & Foil',
    operator: 'this project',
    network: 'preview',
    kind: 'own',
    contractAddress: '74fe0bf972edc0c6c1edcec7fd41dfa09c52b1920511a29c416b3245918a0fad',
    explorerUrl: explorerContract('74fe0bf972edc0c6c1edcec7fd41dfa09c52b1920511a29c416b3245918a0fad'),
  },
  {
    id: 'b',
    label: 'Harbour',
    operator: 'a second operator, its own ceremony',
    network: 'preview',
    kind: 'peer',
    contractAddress: '2d8f8f23b311b9596354b92c4ac01805a8921cc9bd54daa950e49877890cccbd',
    explorerUrl: explorerContract('2d8f8f23b311b9596354b92c4ac01805a8921cc9bd54daa950e49877890cccbd'),
  },
];

export interface MarkerPreset {
  key: string;
  /** What the button says. */
  label: string;
  marker: string;
  /** One line about where this marker came from. Never about what the answer will be. */
  note: string;
}

/**
 * Two markers worth asking about, both produced by the command-line runs recorded on `/proof`.
 * The notes say what the receivable is, not what the registries will answer: the answer is read,
 * every time, and this file does not get to predict it.
 */
export const MARKER_PRESETS: readonly MarkerPreset[] = [
  {
    key: 'pledged',
    label: 'Invoice #2002',
    marker: 'f563d3877ef55c73c2c2f23e36260d4b552218890b9b86a66c0f1dd5f1b069ca',
    note: 'A receivable from the scenario run: acknowledged by the buyer, then pledged to a lender in Stock & Foil.',
  },
  {
    key: 'control',
    label: 'Invoice #772002',
    marker: 'bfc2fda848f76b7069dff5d73f378c75a4b727c879b1ffdaa8f0f162bf1ab044',
    note: 'The control. A receivable that was never offered, never acknowledged and never pledged anywhere.',
  },
];

/**
 * The transaction in which Harbour's contract accepted a receivable already pledged in Stock &
 * Foil. It is linked from the panel because it is the finding, not an embarrassment to bury: no
 * single ledger can see another, which is the whole reason the check above exists.
 */
export const HARBOUR_ACCEPTANCE = {
  blockHeight: 1322275,
  txHash: 'de94a8f076d158c35c93cb9626b2859e4d4a844699b5d9536f3facb3bc89bf0d',
  url: 'https://preview.midnightexplorer.com/transactions/de94a8f076d158c35c93cb9626b2859e4d4a844699b5d9536f3facb3bc89bf0d',
  refusalCode: 'ALREADY_ENCUMBERED',
} as const;

// ------------------------------------------------------------------------------ reading a chain

export const INDEXER_URL = 'https://indexer.preview.midnight.network/api/v4/graphql';

/** Past this, a read is reported as a timeout rather than left spinning. */
const TIMEOUT_MS = 9_000;

/** How long a decoded registry state is reused. Two markers in a row cost one read. */
const TTL_MS = 60_000;

const HEX64 = /^[0-9a-f]{64}$/;

/** `0xABC…` or `abc…`, 64 hex characters, or nothing. Never a guess. */
export function parseMarker(raw: string): string | undefined {
  const body = raw.trim().replace(/\s+/g, '').toLowerCase().replace(/^0x/, '');
  return HEX64.test(body) ? body : undefined;
}

class ReadError extends Error {
  constructor(readonly failure: ReadFailure, message: string) {
    super(message);
    this.name = 'ReadError';
  }
}

interface GraphQLBody<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** One POST to the public indexer, with every failure mode named rather than thrown as a stack. */
async function post<T>(query: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    throw new ReadError(timedOut ? 'timeout' : 'offline', `${FAILURE_TEXT[timedOut ? 'timeout' : 'offline']}`);
  }
  if (!response.ok) throw new ReadError('rejected', `the indexer answered ${response.status}`);

  let body: GraphQLBody<T>;
  try {
    body = (await response.json()) as GraphQLBody<T>;
  } catch {
    throw new ReadError('rejected', 'the indexer answered with something that is not JSON');
  }
  if (body.errors?.length) throw new ReadError('rejected', body.errors.map((e) => e.message).join('; '));
  if (body.data === undefined) throw new ReadError('rejected', FAILURE_TEXT.rejected);
  return body.data;
}

interface CacheEntry<T> {
  at: number;
  value: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Memoises a read for `TTL_MS`. A rejected read is evicted immediately, so a failure is never
 * cached as though it were an answer and a retry actually retries.
 */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  const entry: CacheEntry<unknown> = { at: Date.now(), value };
  cache.set(key, entry);
  value.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return value;
}

/** Forgets every cached read. The panel's "check again" uses it; nothing else needs to. */
export const forgetReads = (): void => cache.clear();

/** The chain's latest block, which is the clock an expiry is compared against. */
async function chainHead(): Promise<{ height: number; seconds: bigint }> {
  const data = await post<{ block?: { height?: number; timestamp?: number } | null }>(
    '{ block { height timestamp } }',
  );
  const { height, timestamp } = data.block ?? {};
  if (height === undefined || timestamp === undefined) throw new ReadError('rejected', 'no latest block');
  return { height, seconds: BigInt(Math.floor(timestamp / 1000)) };
}

/**
 * One registry's public state, projected into the same view the SDK and the command-line tool
 * use. This is everything the chain reveals: counts, unlinkable tags, ciphertexts and statuses.
 */
async function registryView(address: string): Promise<PublicLedgerView> {
  if (!HEX64.test(address)) throw new ReadError('absent', 'that is not a contract address');
  const data = await post<{ contractAction?: { state?: string } | null }>(
    `{ contractAction(address: ${JSON.stringify(address)}) { state } }`,
  );
  const state = data.contractAction?.state;
  if (!state) throw new ReadError('absent', FAILURE_TEXT.absent);
  try {
    return toPublicLedgerView(ledger(contractStateFromHex(state).data));
  } catch {
    throw new ReadError('undecodable', FAILURE_TEXT.undecodable);
  }
}

const verdictOf = (view: PublicLedgerView, marker: string, now: bigint): MarkerVerdict => {
  const encumbrance = encumbranceOf(findPledge(view, marker), now);
  return encumbrance === 'ENCUMBERED' ? 'encumbered' : encumbrance === 'SETTLED' ? 'settled' : 'free';
};

/** What the lender does with two answers. "Nobody answered" is never read as "nobody has it". */
const bitOf = (answers: readonly PeerAnswer[]): CrossRegistryBit => {
  if (answers.some((a) => a.verdict === 'encumbered')) return 'encumbered';
  if (answers.some((a) => a.verdict === 'settled')) return 'settled';
  return answers.every((a) => a.verdict !== 'unreachable') ? 'free' : 'no-answer';
};

/** One registry's read: either a view of its public state, or a named reason there is none. */
type RegistryRead =
  | { ok: true; peer: RegistryPeer; view: PublicLedgerView; tookMs: number }
  | { ok: false; peer: RegistryPeer; failure: ReadFailure; tookMs: number };

/**
 * The live cross-registry check: one read per registry, run in parallel and reported
 * independently. A registry that cannot be reached comes back `unreachable`, never `free` —
 * "nobody answered" and "nobody has it" are the two things a lender must not confuse.
 */
export const previewFederation: FederationSource = {
  peers: () => PREVIEW_REGISTRIES,

  async check(rawMarker: string): Promise<CrossRegistryAnswer> {
    const marker = parseMarker(rawMarker);
    if (!marker) throw new Error('A pledge marker is 64 hexadecimal characters.');
    const startedAt = Date.now();

    // The clock is its own read: if it fails, a PLEDGED entry is still decidable and only an
    // unexpired offer needs a time to compare against.
    const head = cached('head', chainHead).catch(() => undefined);

    const reads = PREVIEW_REGISTRIES.map(async (peer): Promise<RegistryRead> => {
      const began = Date.now();
      try {
        const view = await cached(`state:${peer.contractAddress}`, () => registryView(peer.contractAddress));
        return { ok: true, peer, view, tookMs: Date.now() - began };
      } catch (error) {
        const failure = error instanceof ReadError ? error.failure : 'offline';
        return { ok: false, peer, failure, tookMs: Date.now() - began };
      }
    });

    const [block, results] = await Promise.all([head, Promise.all(reads)]);
    const now = block?.seconds ?? BigInt(Math.floor(Date.now() / 1000));
    const readAt = new Date().toISOString();

    const answers: PeerAnswer[] = results.map((result) => {
      if (!result.ok) {
        return { peerId: result.peer.id, verdict: 'unreachable', failure: result.failure, readAt, tookMs: result.tookMs };
      }
      const other = PREVIEW_REGISTRIES.find((p) => p.id !== result.peer.id);
      return {
        peerId: result.peer.id,
        verdict: verdictOf(result.view, marker, now),
        status: findPledge(result.view, marker)?.status,
        declaresPeer: other ? findPeer(result.view, other.contractAddress) !== undefined : undefined,
        operatorId: result.view.config.operatorId,
        readAt,
        tookMs: result.tookMs,
      };
    });

    return {
      marker,
      answers,
      bit: bitOf(answers),
      complete: answers.every((a) => a.verdict !== 'unreachable'),
      blockHeight: block?.height,
      clock: block ? 'chain' : 'browser',
      tookMs: Date.now() - startedAt,
    };
  },
};

/**
 * The source the panel uses. It is still typed as nullable: set it to `null` and the panel goes
 * back to describing the mechanism instead of reporting verdicts, which is the only honest thing
 * to render when nothing has been read.
 */
export const federationSource: FederationSource | null = previewFederation;

/**
 * The shapes a deployment takes, drawn in the diagram. Two of the three are now deployments on
 * preview rather than architecture; the third is not, and says so. Nothing here claims a
 * registry that does not exist — what was deployed is reported on `/proof`, from the files the
 * command-line tool wrote.
 */
export interface RegistryShape {
  key: string;
  label: string;
  note: string;
}

export const REGISTRY_SHAPES: readonly RegistryShape[] = [
  {
    key: 'own',
    label: 'Its own registry',
    note: 'One factoring house, its own branches and borrowers. Catches the same invoice pledged twice inside one book — on day one, with nobody else’s agreement. Stock & Foil runs one of these on preview.',
  },
  {
    key: 'bank',
    label: 'Another operator’s registry',
    note: 'A different operator, a different member list, the same contract. Harbour is exactly that, deployed on preview from its own ceremony — and the panel below reads it live.',
  },
  {
    key: 'body',
    label: 'A trade body’s registry',
    note: 'The consortium, if and when it happens. Not deployed, and not waited on: it is one more address to read, not the precondition for reading any of them.',
  },
];
