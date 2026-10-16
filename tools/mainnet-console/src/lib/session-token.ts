// SPDX-License-Identifier: Apache-2.0
//
// The per-run secret, from the page's side.
//
// The dev server mints it at startup and injects it into this document's `<head>` at serve
// time (see `transformIndexHtml` in ../../server/plugin.ts). It is therefore not in the
// bundle, not in a source map, and different on every restart — and a page on another origin
// cannot read it, because reading it means reading this document.
//
// Everything the console sends to `/__console` or `/bf` carries it. Without it those
// endpoints answer 403, which is what stops an unrelated tab in the same browser from
// spending our Blockfrost quota or writing files through the local endpoints.
//
// The two names live here, in a module with no Node imports, because the server needs them too
// and two copies of a protocol constant is how a protocol constant drifts.

/** Header the console's own `fetch` calls carry it in. */
export const SESSION_HEADER = 'x-console-session';

/**
 * Query parameter it travels in when a header is impossible.
 *
 * Two callers need that. A browser `WebSocket` cannot set a request header at all, and the
 * SDK's `indexerQuery` builds its own `fetch` and gives a caller nowhere to add one. Both are
 * same-origin, so the value never leaves this origin in a `Referer`, and the dev server strips
 * it before forwarding anything to Blockfrost and redacts it from everything it logs.
 */
export const SESSION_QUERY = '__s';

let cached: string | undefined;

/** The secret this page was served with. */
export function consoleSessionToken(): string {
  if (cached !== undefined) return cached;
  const meta = document.querySelector(`meta[name="${SESSION_HEADER}"]`);
  const value = meta?.getAttribute('content');
  if (!value) {
    throw new Error(
      'this page was not served with a console session secret, so the dev server will refuse ' +
        'everything it sends. Reload http://127.0.0.1:5174/ — and if the page came from ' +
        'anywhere else, it is not the console.',
    );
  }
  cached = value;
  return value;
}

/** Adds the secret to a URL, for the callers that cannot send a header. */
export function withSessionQuery(url: string): string {
  const parsed = new URL(url, globalThis.location?.origin ?? 'http://127.0.0.1:5174');
  parsed.searchParams.set(SESSION_QUERY, consoleSessionToken());
  return parsed.toString();
}

/** The same URL with the secret taken back out, for anything shown on screen or logged. */
export function withoutSessionQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete(SESSION_QUERY);
    return parsed.toString();
  } catch {
    return url.replace(new RegExp(`[?&]${SESSION_QUERY}=[^&]*`), '');
  }
}
