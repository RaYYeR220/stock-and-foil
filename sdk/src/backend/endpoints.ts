// SPDX-License-Identifier: Apache-2.0
//
// Where each network actually lives, as of 2026-10-16.
//
// This table used to be four URLs per network and nothing else. It is not that any more, because
// Midnight retired its own public infrastructure for two of the four networks:
//
//   mainnet   Midnight-hosted RPC and indexer retired 2026-09-30 22:00 UTC
//   preprod   Midnight-hosted RPC and indexer retired 2026-10-09 22:00 UTC
//
// `indexer.{preprod,mainnet}.midnight.network` now answers HTTP 410 ENDPOINT_DECOMMISSIONED, and
// Blockfrost is the public RPC and indexer for both. Blockfrost refuses an unauthenticated
// request with
//
//   403 {"error":"Forbidden","message":"Missing project token. Please include project_id ..."}
//
// so a token is not optional, it is part of the address. Tokens are issued per network and are
// not interchangeable: a preprod project id starts with `nightpreprod`, a mainnet one with
// `nightmainnet`, and using one on the other network fails authentication. We check the prefix
// before the first request so that the failure names the cause instead of arriving as a 403 from
// somewhere deep inside a provider.
//
// Preview is unchanged and still tokenless, and `undeployed` is a devnet on this machine.
//
// Nothing here reads `process`: the environment is passed in, so the module is browser-safe and
// a test can hand it a fake environment.

/** Networks the SDK knows how to reach. `simulator` needs no endpoints at all. */
export type ChainNetwork = 'undeployed' | 'preview' | 'preprod' | 'mainnet';

export const CHAIN_NETWORKS: readonly ChainNetwork[] = ['undeployed', 'preview', 'preprod', 'mainnet'];

export const isChainNetwork = (value: string): value is ChainNetwork =>
  (CHAIN_NETWORKS as readonly string[]).includes(value);

export interface NetworkEndpoints {
  indexerHttpUrl: string;
  indexerWsUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
}

/**
 * How a network is reached, beyond the bare URLs.
 *
 * `base` holds the endpoints *without* credentials. For a `blockfrost` network those URLs are
 * not usable on their own — `resolveEndpoints` appends the project token — but keeping them
 * token-free means the table can be printed, committed and logged safely.
 */
export interface NetworkDescriptor {
  readonly network: ChainNetwork;
  /** `direct` endpoints need no credentials; `blockfrost` ones need a per-network project token. */
  readonly access: 'direct' | 'blockfrost';
  readonly base: NetworkEndpoints;
  /** Environment variable the project token is read from, for a `blockfrost` network. */
  readonly tokenEnvVar?: string;
  /** Prefix every project token for this network carries, used to catch a swapped token early. */
  readonly tokenPrefix?: string;
  /** Where test funds come from, if anywhere. Mainnet has no faucet. */
  readonly faucetUrl?: string;
  /** True when real value is at stake, which the CLI turns into a confirmation prompt. */
  readonly isRealValue: boolean;
}

/**
 * The proof server always runs on this machine, on every network, because it sees witness data
 * in the clear. There is no hosted alternative we would be willing to send private invoice data
 * to, so the default never changes.
 */
const LOCAL_PROOF_SERVER = 'http://127.0.0.1:6300';

export const NETWORK_DESCRIPTORS: Record<ChainNetwork, NetworkDescriptor> = {
  undeployed: {
    network: 'undeployed',
    access: 'direct',
    isRealValue: false,
    base: {
      indexerHttpUrl: 'http://127.0.0.1:8088/api/v4/graphql',
      indexerWsUrl: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
      nodeUrl: 'ws://127.0.0.1:9944',
      proofServerUrl: LOCAL_PROOF_SERVER,
    },
  },
  preview: {
    network: 'preview',
    access: 'direct',
    isRealValue: false,
    faucetUrl: 'https://midnight-tmnight-preview.nethermind.dev/',
    base: {
      indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
      indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
      nodeUrl: 'wss://rpc.preview.midnight.network',
      proofServerUrl: LOCAL_PROOF_SERVER,
    },
  },
  preprod: {
    network: 'preprod',
    access: 'blockfrost',
    isRealValue: false,
    tokenEnvVar: 'BLOCKFROST_PROJECT_ID_PREPROD',
    tokenPrefix: 'nightpreprod',
    faucetUrl: 'https://midnight-tmnight-preprod.nethermind.dev/',
    base: {
      indexerHttpUrl: 'https://midnight-preprod.blockfrost.io/api/v0',
      indexerWsUrl: 'wss://midnight-preprod.blockfrost.io/api/v0/ws',
      nodeUrl: 'wss://rpc.midnight-preprod.blockfrost.io',
      proofServerUrl: LOCAL_PROOF_SERVER,
    },
  },
  mainnet: {
    network: 'mainnet',
    access: 'blockfrost',
    isRealValue: true,
    tokenEnvVar: 'BLOCKFROST_PROJECT_ID_MAINNET',
    tokenPrefix: 'nightmainnet',
    base: {
      indexerHttpUrl: 'https://midnight-mainnet.blockfrost.io/api/v0',
      indexerWsUrl: 'wss://midnight-mainnet.blockfrost.io/api/v0/ws',
      nodeUrl: 'wss://rpc.midnight-mainnet.blockfrost.io',
      proofServerUrl: LOCAL_PROOF_SERVER,
    },
  },
};

/**
 * Token-free endpoints per network.
 *
 * Kept as a plain table because callers that only ever touch `preview` or `undeployed` — the
 * browser app among them — read it directly. For `preprod` and `mainnet` these URLs answer 403
 * on their own: go through {@link resolveEndpoints}, which adds the project token.
 */
export const NETWORKS: Record<ChainNetwork, NetworkEndpoints> = Object.freeze({
  undeployed: NETWORK_DESCRIPTORS.undeployed.base,
  preview: NETWORK_DESCRIPTORS.preview.base,
  preprod: NETWORK_DESCRIPTORS.preprod.base,
  mainnet: NETWORK_DESCRIPTORS.mainnet.base,
});

export const requiresBlockfrostToken = (network: ChainNetwork): boolean =>
  NETWORK_DESCRIPTORS[network].access === 'blockfrost';

// ------------------------------------------------------------------------------------- errors

/**
 * Raised instead of letting a provider hang or 403 somewhere unhelpful. The message names the
 * network, the environment variable, the CLI flag and where to get a token.
 */
export class MissingBlockfrostTokenError extends Error {
  readonly network: ChainNetwork;
  readonly envVar: string;

  constructor(network: ChainNetwork, envVar: string) {
    super(
      `${network} is served by Blockfrost and needs a project token, which is missing.\n` +
        `  1. Create a project at https://blockfrost.io, pick "Midnight ${
          network === 'mainnet' ? 'Mainnet' : 'Preprod'
        }", copy the project id\n` +
        `     (it starts with "${NETWORK_DESCRIPTORS[network].tokenPrefix}").\n` +
        `  2. Pass it as --blockfrost-token <id>, or export ${envVar}=<id>.\n` +
        `Midnight's own ${network} endpoints were decommissioned (HTTP 410) and are not a fallback.`,
    );
    this.name = 'MissingBlockfrostTokenError';
    this.network = network;
    this.envVar = envVar;
  }
}

/** Raised when a token is present but belongs to a different network. */
export class BlockfrostTokenMismatchError extends Error {
  readonly network: ChainNetwork;

  constructor(network: ChainNetwork, expectedPrefix: string, actualPrefix: string) {
    super(
      `the Blockfrost token given for ${network} starts with "${actualPrefix}", but a ${network} ` +
        `token starts with "${expectedPrefix}". Blockfrost issues a separate project per network ` +
        `and will reject this one. Set ${NETWORK_DESCRIPTORS[network].tokenEnvVar} to the ${network} ` +
        `project id, or pass --allow-token-prefix-mismatch if Blockfrost has changed its prefixes.`,
    );
    this.name = 'BlockfrostTokenMismatchError';
    this.network = network;
  }
}

// ------------------------------------------------------------------------------------ resolving

/** A map of environment variables; `process.env` has exactly this shape. */
export type Environment = Readonly<Record<string, string | undefined>>;

export interface ResolveEndpointsOptions {
  /** Token given explicitly, e.g. from `--blockfrost-token`. Wins over the environment. */
  blockfrostToken?: string;
  /** Where to look the token up when it was not given. Defaults to nothing, so pass `process.env`. */
  env?: Environment;
  /** Per-field overrides applied last, e.g. a proof server on another port. */
  overrides?: Partial<NetworkEndpoints>;
  /** Skips the `nightpreprod`/`nightmainnet` prefix check. */
  allowPrefixMismatch?: boolean;
}

/** The project token for a network, or `undefined` when the network needs none. */
export function blockfrostTokenFor(
  network: ChainNetwork,
  options: ResolveEndpointsOptions = {},
): string | undefined {
  const descriptor = NETWORK_DESCRIPTORS[network];
  if (descriptor.access !== 'blockfrost') return undefined;

  const explicit = options.blockfrostToken?.trim();
  const fromEnv = descriptor.tokenEnvVar ? options.env?.[descriptor.tokenEnvVar]?.trim() : undefined;
  const token = explicit !== undefined && explicit !== '' ? explicit : fromEnv;
  if (token === undefined || token === '') {
    throw new MissingBlockfrostTokenError(network, descriptor.tokenEnvVar!);
  }

  const prefix = descriptor.tokenPrefix;
  if (prefix && !options.allowPrefixMismatch && !token.startsWith(prefix)) {
    // Report only the leading characters: enough to tell the two networks apart, not enough to
    // reconstruct the token from a log or a bug report.
    throw new BlockfrostTokenMismatchError(network, prefix, `${token.slice(0, 12)}…`);
  }
  return token;
}

/** Appends `project_id` to a URL without disturbing a query string it may already carry. */
function withProjectId(rawUrl: string, token: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set('project_id', token);
  return url.toString();
}

/**
 * The endpoints to actually connect to.
 *
 * For `preview` and `undeployed` this is the base table plus any overrides. For `preprod` and
 * `mainnet` the project token is resolved first — from the argument, else from the environment —
 * and appended to the indexer and node URLs as `project_id`. An override replaces the resolved
 * URL verbatim, so a caller that already holds a fully-formed authenticated URL can pass it and
 * the token is not required for that field.
 */
export function resolveEndpoints(
  network: ChainNetwork,
  options: ResolveEndpointsOptions = {},
): NetworkEndpoints {
  const descriptor = NETWORK_DESCRIPTORS[network];
  const overrides = options.overrides ?? {};

  if (descriptor.access !== 'blockfrost') {
    return { ...descriptor.base, ...definedOnly(overrides) };
  }

  // Every authenticated field may be supplied directly; only ask for a token if one is needed.
  const needsToken = (['indexerHttpUrl', 'indexerWsUrl', 'nodeUrl'] as const).some(
    (field) => overrides[field] === undefined,
  );
  const token = needsToken ? blockfrostTokenFor(network, options)! : undefined;
  const authenticated: NetworkEndpoints = {
    indexerHttpUrl: token ? withProjectId(descriptor.base.indexerHttpUrl, token) : descriptor.base.indexerHttpUrl,
    indexerWsUrl: token ? withProjectId(descriptor.base.indexerWsUrl, token) : descriptor.base.indexerWsUrl,
    nodeUrl: token ? withProjectId(descriptor.base.nodeUrl, token) : descriptor.base.nodeUrl,
    proofServerUrl: descriptor.base.proofServerUrl,
  };
  return { ...authenticated, ...definedOnly(overrides) };
}

const definedOnly = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

// ------------------------------------------------------------------------------------ redaction

/**
 * A URL safe to print.
 *
 * The project token is a bearer credential that lives in the query string, so every place that
 * logs an endpoint — progress lines, error messages, the evidence file — goes through this. A
 * token can also arrive in a `project_id` header; the same replacement covers both shapes.
 */
export function redactEndpoint(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('project_id')) return rawUrl;
    url.searchParams.set('project_id', 'REDACTED');
    return url.toString();
  } catch {
    return rawUrl.replace(/project_id=[^&\s]+/gi, 'project_id=REDACTED');
  }
}

/** Every endpoint of a bundle, redacted. */
export const redactEndpoints = (endpoints: NetworkEndpoints): NetworkEndpoints => ({
  indexerHttpUrl: redactEndpoint(endpoints.indexerHttpUrl),
  indexerWsUrl: redactEndpoint(endpoints.indexerWsUrl),
  nodeUrl: redactEndpoint(endpoints.nodeUrl),
  proofServerUrl: redactEndpoint(endpoints.proofServerUrl),
});
