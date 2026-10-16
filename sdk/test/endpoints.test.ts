// SPDX-License-Identifier: Apache-2.0
//
// The network table. Every case here is a failure we would otherwise have discovered on a
// hackathon clock: a missing token that hangs instead of failing, a preprod token used against
// mainnet, a decommissioned endpoint still in the table, or a token in a log line.
import { describe, expect, it } from 'vitest';
import {
  blockfrostTokenFor,
  BlockfrostTokenMismatchError,
  CHAIN_NETWORKS,
  isChainNetwork,
  MissingBlockfrostTokenError,
  NETWORK_DESCRIPTORS,
  NETWORKS,
  redactEndpoint,
  redactEndpoints,
  requiresBlockfrostToken,
  resolveEndpoints,
} from '../src/index.js';

const MAINNET = 'nightmainnetABCDEF0123456789';
const PREPROD = 'nightpreprodABCDEF0123456789';

describe('the network table', () => {
  it('knows all four networks', () => {
    expect([...CHAIN_NETWORKS]).toEqual(['undeployed', 'preview', 'preprod', 'mainnet']);
    expect(isChainNetwork('mainnet')).toBe(true);
    expect(isChainNetwork('stagenet')).toBe(false);
  });

  it('routes preprod and mainnet through Blockfrost and leaves preview alone', () => {
    expect(requiresBlockfrostToken('preview')).toBe(false);
    expect(requiresBlockfrostToken('undeployed')).toBe(false);
    expect(requiresBlockfrostToken('preprod')).toBe(true);
    expect(requiresBlockfrostToken('mainnet')).toBe(true);
  });

  it('carries no decommissioned Midnight-hosted endpoint', () => {
    // indexer.{preprod,mainnet}.midnight.network answer 410 ENDPOINT_DECOMMISSIONED since
    // 2026-09-30 and 2026-10-09. Anything still pointing there is a dead config.
    for (const network of ['preprod', 'mainnet'] as const) {
      const endpoints = NETWORKS[network];
      expect(endpoints.indexerHttpUrl).toContain('blockfrost.io');
      expect(endpoints.nodeUrl).toContain('blockfrost.io');
      expect(endpoints.indexerHttpUrl).not.toContain('midnight.network');
      expect(endpoints.nodeUrl).not.toContain('midnight.network');
    }
    expect(NETWORKS.preview.indexerHttpUrl).toBe('https://indexer.preview.midnight.network/api/v4/graphql');
  });

  it('keeps credentials out of the base table', () => {
    for (const network of CHAIN_NETWORKS) {
      for (const url of Object.values(NETWORKS[network])) {
        expect(url).not.toContain('project_id');
      }
    }
  });

  it('proves witness data never leaves the machine: every proof server is local', () => {
    for (const network of CHAIN_NETWORKS) {
      expect(NETWORKS[network].proofServerUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
    }
  });
});

describe('resolving endpoints', () => {
  it('needs no token for preview', () => {
    const endpoints = resolveEndpoints('preview');
    expect(endpoints).toEqual(NETWORKS.preview);
  });

  it('appends the project token to the indexer and the node on mainnet', () => {
    const endpoints = resolveEndpoints('mainnet', { blockfrostToken: MAINNET });
    expect(endpoints.indexerHttpUrl).toBe(`https://midnight-mainnet.blockfrost.io/api/v0?project_id=${MAINNET}`);
    expect(endpoints.indexerWsUrl).toBe(`wss://midnight-mainnet.blockfrost.io/api/v0/ws?project_id=${MAINNET}`);
    expect(endpoints.nodeUrl).toBe(`wss://rpc.midnight-mainnet.blockfrost.io/?project_id=${MAINNET}`);
    // The proof server is ours and never carries a credential.
    expect(endpoints.proofServerUrl).toBe('http://127.0.0.1:6300');
  });

  it('reads the token from the environment when it was not passed', () => {
    const endpoints = resolveEndpoints('preprod', { env: { BLOCKFROST_PROJECT_ID_PREPROD: PREPROD } });
    expect(endpoints.indexerHttpUrl).toContain(`project_id=${PREPROD}`);
  });

  it('prefers an explicit token over the environment', () => {
    const other = 'nightpreprodOTHER';
    const endpoints = resolveEndpoints('preprod', {
      blockfrostToken: other,
      env: { BLOCKFROST_PROJECT_ID_PREPROD: PREPROD },
    });
    expect(endpoints.indexerHttpUrl).toContain(`project_id=${other}`);
  });

  it('fails fast, and actionably, when the token is missing', () => {
    expect(() => resolveEndpoints('mainnet', { env: {} })).toThrow(MissingBlockfrostTokenError);
    try {
      resolveEndpoints('mainnet', { env: {} });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('BLOCKFROST_PROJECT_ID_MAINNET');
      expect(message).toContain('--blockfrost-token');
      expect(message).toContain('nightmainnet');
      expect(message).toContain('blockfrost.io');
    }
  });

  it('treats an empty or whitespace token as missing', () => {
    expect(() => resolveEndpoints('mainnet', { blockfrostToken: '   ', env: {} })).toThrow(
      MissingBlockfrostTokenError,
    );
    expect(() => resolveEndpoints('mainnet', { env: { BLOCKFROST_PROJECT_ID_MAINNET: '' } })).toThrow(
      MissingBlockfrostTokenError,
    );
  });

  it('refuses a preprod token on mainnet before the first request', () => {
    expect(() => resolveEndpoints('mainnet', { blockfrostToken: PREPROD })).toThrow(BlockfrostTokenMismatchError);
    expect(() => resolveEndpoints('preprod', { blockfrostToken: MAINNET })).toThrow(BlockfrostTokenMismatchError);
  });

  it('does not put the whole token in the mismatch message', () => {
    try {
      resolveEndpoints('mainnet', { blockfrostToken: PREPROD });
    } catch (error) {
      expect((error as Error).message).not.toContain(PREPROD);
      expect((error as Error).message).toContain('nightpreprod');
    }
  });

  it('lets a caller override the prefix check', () => {
    const endpoints = resolveEndpoints('mainnet', { blockfrostToken: 'something-else', allowPrefixMismatch: true });
    expect(endpoints.indexerHttpUrl).toContain('project_id=something-else');
  });

  it('accepts a fully-formed authenticated URL without asking for a token', () => {
    const endpoints = resolveEndpoints('mainnet', {
      env: {},
      overrides: {
        indexerHttpUrl: 'https://my-indexer.example/api/v0?project_id=x',
        indexerWsUrl: 'wss://my-indexer.example/api/v0/ws?project_id=x',
        nodeUrl: 'wss://my-node.example?project_id=x',
      },
    });
    expect(endpoints.nodeUrl).toBe('wss://my-node.example?project_id=x');
  });

  it('ignores undefined overrides rather than blanking a field', () => {
    const endpoints = resolveEndpoints('preview', { overrides: { proofServerUrl: undefined } });
    expect(endpoints.proofServerUrl).toBe('http://127.0.0.1:6300');
  });

  it('names the right environment variable per network', () => {
    expect(NETWORK_DESCRIPTORS.preprod.tokenEnvVar).toBe('BLOCKFROST_PROJECT_ID_PREPROD');
    expect(NETWORK_DESCRIPTORS.mainnet.tokenEnvVar).toBe('BLOCKFROST_PROJECT_ID_MAINNET');
    expect(blockfrostTokenFor('preview')).toBeUndefined();
  });

  it('marks only mainnet as real value', () => {
    expect(NETWORK_DESCRIPTORS.mainnet.isRealValue).toBe(true);
    expect(NETWORK_DESCRIPTORS.preprod.isRealValue).toBe(false);
    expect(NETWORK_DESCRIPTORS.preview.isRealValue).toBe(false);
  });
});

describe('redaction', () => {
  it('removes the project token from a URL', () => {
    const url = `https://midnight-mainnet.blockfrost.io/api/v0?project_id=${MAINNET}`;
    expect(redactEndpoint(url)).not.toContain(MAINNET);
    expect(redactEndpoint(url)).toContain('project_id=REDACTED');
  });

  it('leaves a tokenless URL alone', () => {
    expect(redactEndpoint('https://indexer.preview.midnight.network/api/v4/graphql')).toBe(
      'https://indexer.preview.midnight.network/api/v4/graphql',
    );
  });

  it('still redacts something that is not a parseable URL', () => {
    expect(redactEndpoint(`not a url project_id=${MAINNET} trailing`)).toBe(
      'not a url project_id=REDACTED trailing',
    );
  });

  it('redacts a whole bundle, which is what a log line prints', () => {
    const endpoints = resolveEndpoints('mainnet', { blockfrostToken: MAINNET });
    const safe = redactEndpoints(endpoints);
    for (const url of Object.values(safe)) expect(url).not.toContain(MAINNET);
  });
});
