// SPDX-License-Identifier: Apache-2.0
//
// The HTTP surface, and in particular the one decision it makes on its own: which bucket a
// request counts against. Both of the things a caller can set — the body's `caller` field and
// the left-hand side of `X-Forwarded-For` — are traps, and these cases pin shut both.
import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { rateLimitBucket, sanitizeLabel } from '../src/index.js';

const PROXY = '10.1.2.3';

const incoming = (options: { remoteAddress?: string; forwarded?: string | string[] } = {}): IncomingMessage =>
  ({
    headers: options.forwarded === undefined ? {} : { 'x-forwarded-for': options.forwarded },
    socket: { remoteAddress: options.remoteAddress ?? '203.0.113.7' },
  }) as unknown as IncomingMessage;

describe('rateLimitBucket', () => {
  it('uses the socket address when the sponsor is open', () => {
    expect(rateLimitBucket(incoming({ remoteAddress: '198.51.100.4' }), {})).toBe('ip:198.51.100.4');
  });

  it('uses the API key name when one was presented', () => {
    expect(rateLimitBucket(incoming(), { apiKeyName: 'web-demo' })).toBe('key:web-demo');
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

describe('X-Forwarded-For cannot be used to pick a bucket', () => {
  it('is ignored entirely when no proxy is configured', () => {
    const request = incoming({ remoteAddress: '198.51.100.4', forwarded: '10.0.0.1' });
    expect(rateLimitBucket(request, {})).toBe('ip:198.51.100.4');
  });

  it('is ignored when the request did not come from a trusted proxy', () => {
    const direct = incoming({ remoteAddress: '198.51.100.4', forwarded: '10.0.0.1' });
    expect(rateLimitBucket(direct, { trustedProxies: [PROXY] })).toBe('ip:198.51.100.4');
  });

  it('a spoofed header does not create a new bucket, even behind a trusted proxy', () => {
    // The client sends whatever it likes; the proxy appends the address it actually saw. The
    // attacker's entries are therefore always to the LEFT of the real one.
    const spoofs = [
      'totally-made-up',
      'other-made-up',
      '1.2.3.4, 5.6.7.8',
      '',
      'a, b, c, d, e, f',
    ];
    const buckets = new Set(
      spoofs.map((spoof) =>
        rateLimitBucket(
          incoming({ remoteAddress: PROXY, forwarded: spoof === '' ? '198.51.100.4' : `${spoof}, 198.51.100.4` }),
          { trustedProxies: [PROXY] },
        ),
      ),
    );
    // Every one of them lands in the same bucket: the client's real address.
    expect([...buckets]).toEqual(['ip:198.51.100.4']);
  });

  it('reads the hop the proxy appended, counting from the right', () => {
    const request = incoming({ remoteAddress: PROXY, forwarded: 'attacker, 198.51.100.4' });
    expect(rateLimitBucket(request, { trustedProxies: [PROXY] })).toBe('ip:198.51.100.4');
  });

  it('counts further right with trustProxyHops, for two layers of our own proxying', () => {
    const request = incoming({ remoteAddress: PROXY, forwarded: 'attacker, 198.51.100.4, 10.9.9.9' });
    expect(rateLimitBucket(request, { trustedProxies: [PROXY], trustProxyHops: 2 })).toBe('ip:198.51.100.4');
  });

  it('falls back to the socket address when the header is absent, blank or too short', () => {
    expect(rateLimitBucket(incoming({ remoteAddress: PROXY }), { trustedProxies: [PROXY] })).toBe(`ip:${PROXY}`);
    expect(rateLimitBucket(incoming({ remoteAddress: PROXY, forwarded: '  ,  ' }), { trustedProxies: [PROXY] })).toBe(
      `ip:${PROXY}`,
    );
    // Asking for a hop deeper than the chain goes must not silently take an attacker entry.
    expect(
      rateLimitBucket(incoming({ remoteAddress: PROXY, forwarded: 'attacker' }), {
        trustedProxies: [PROXY],
        trustProxyHops: 3,
      }),
    ).toBe(`ip:${PROXY}`);
  });

  it('joins a repeated header rather than trusting whichever copy came first', () => {
    const request = incoming({ remoteAddress: PROXY, forwarded: ['attacker', '198.51.100.4'] });
    expect(rateLimitBucket(request, { trustedProxies: [PROXY] })).toBe('ip:198.51.100.4');
  });
});

describe('sanitizeLabel', () => {
  it('keeps an ordinary tag', () => {
    expect(sanitizeLabel('web-demo')).toBe('web-demo');
  });

  it('strips control characters, so a caller cannot forge a log line', () => {
    expect(sanitizeLabel('web\ndemo: PAID 999999 SPECK')).toBe('web demo: PAID 999999 SPECK');
    expect(sanitizeLabel('a\r\n\tb')).toBe('a   b');
  });

  it('bounds the length', () => {
    expect(sanitizeLabel('x'.repeat(500))).toHaveLength(64);
  });

  it('drops anything that is not a non-empty string', () => {
    expect(sanitizeLabel(undefined)).toBeUndefined();
    expect(sanitizeLabel('')).toBeUndefined();
    expect(sanitizeLabel('   ')).toBeUndefined();
    expect(sanitizeLabel(42)).toBeUndefined();
    expect(sanitizeLabel({ toString: () => 'nope' })).toBeUndefined();
  });
});
