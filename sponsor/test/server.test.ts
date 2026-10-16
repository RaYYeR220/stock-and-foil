// SPDX-License-Identifier: Apache-2.0
//
// The HTTP surface, and in particular the one decision it makes on its own: which bucket a
// request counts against. Getting that from the request body would make the rate limit
// decorative, because a caller can put anything there.
import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { rateLimitBucket } from '../src/index.js';

const incoming = (options: { remoteAddress?: string; headers?: Record<string, string> } = {}): IncomingMessage =>
  ({
    headers: options.headers ?? {},
    socket: { remoteAddress: options.remoteAddress ?? '203.0.113.7' },
  }) as unknown as IncomingMessage;

describe('rateLimitBucket', () => {
  it('uses the socket address when the sponsor is open', () => {
    expect(rateLimitBucket(incoming({ remoteAddress: '198.51.100.4' }), {})).toBe('ip:198.51.100.4');
  });

  it('uses the API key name when one was presented', () => {
    expect(rateLimitBucket(incoming(), { apiKeyName: 'web-demo' })).toBe('key:web-demo');
  });

  it('ignores X-Forwarded-For unless a proxy is explicitly trusted', () => {
    const request = incoming({ remoteAddress: '198.51.100.4', headers: { 'x-forwarded-for': '10.0.0.1' } });
    // A client can set this header; trusting it by default would let anyone pick their bucket.
    expect(rateLimitBucket(request, {})).toBe('ip:198.51.100.4');
    expect(rateLimitBucket(request, { trustProxy: true })).toBe('ip:10.0.0.1');
  });

  it('takes the first hop of a forwarded chain', () => {
    const request = incoming({ headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } });
    expect(rateLimitBucket(request, { trustProxy: true })).toBe('ip:10.0.0.1');
  });

  it('falls back to the socket address when a trusted header is absent or blank', () => {
    expect(rateLimitBucket(incoming({ remoteAddress: '198.51.100.4' }), { trustProxy: true })).toBe(
      'ip:198.51.100.4',
    );
    expect(
      rateLimitBucket(incoming({ remoteAddress: '198.51.100.4', headers: { 'x-forwarded-for': '  ' } }), {
        trustProxy: true,
      }),
    ).toBe('ip:198.51.100.4');
  });

  it('prefers the API key over any address, so one key is one bucket', () => {
    const fromHome = incoming({ remoteAddress: '198.51.100.4' });
    const fromWork = incoming({ remoteAddress: '203.0.113.99' });
    expect(rateLimitBucket(fromHome, { apiKeyName: 'web-demo' })).toBe(
      rateLimitBucket(fromWork, { apiKeyName: 'web-demo' }),
    );
  });

  it('never returns an empty bucket, even for a socket with no address', () => {
    const addressless = { headers: {}, socket: {} } as unknown as IncomingMessage;
    expect(rateLimitBucket(addressless, {})).toBe('ip:unknown');
  });
});
