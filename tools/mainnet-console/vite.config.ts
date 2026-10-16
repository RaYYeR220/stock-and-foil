// SPDX-License-Identifier: Apache-2.0
//
// The mainnet console is a dev server and nothing else.
//
// Why it is here and not in `web/`: Vercel builds the `web` workspace, so anything that lives
// there — a second Vite entry, a route behind an `import.meta.env.DEV` guard — is one
// misconfigured input away from being published. This app has no `build` script, refuses
// `vite build` below, is not in the root `build` pipeline, and reads the operator's ceremony
// secrets. It belongs beside `tools/compactc`: local operator tooling.
//
// Three settings are inherited from `web/vite.config.ts` and are not optional: the wasm plugin,
// an `esnext` target, and keeping the onchain runtime out of dependency pre-bundling. The
// compiled Compact contract runs here too.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import {
  blockfrostMainnetToken,
  findRepoRoot,
  newSessionToken,
  redact,
  SESSION_QUERY,
} from './server/env.js';
import { mainnetConsoleBackend } from './server/plugin.js';

const BLOCKFROST_MAINNET = 'https://midnight-mainnet.blockfrost.io';
const PORT = 5174;

export default defineConfig(({ command }) => {
  if (command === 'build') {
    throw new Error(
      'the mainnet console is never built. It runs only on the operator’s machine, reads ' +
        'cli/.secrets/ and holds a Blockfrost token in the dev server; a bundle of it has no ' +
        'honest place to be deployed. Run `npm run console`.',
    );
  }

  const repoRoot = findRepoRoot();
  const { token } = blockfrostMainnetToken(repoRoot);

  /**
   * A fresh secret for this run of the server.
   *
   * It is minted here so that the proxy below and the plugin's guard share one value, and it
   * reaches the page only through the plugin's `transformIndexHtml`. Nothing in `src/` holds
   * it, and it is gone when this process is.
   */
  const sessionToken = newSessionToken();

  /**
   * `/bf` and `/bf/ws` carry the page's indexer traffic to Blockfrost with the project token
   * attached **here**, in Node. The browser only ever sees a same-origin path, so the token is
   * not in the bundle, not in `define`, not in devtools and not in a HAR the operator might
   * paste into an issue. Midnight's own mainnet indexer answers 410, so this is the read path.
   *
   * Two things come off the inbound URL on the way out: the console's session secret, which is
   * ours and no business of Blockfrost's, and anything else a caller appended. Requests only
   * get this far after `refuse()` in server/guard.ts has accepted them.
   */
  const withToken = (path: string): string => {
    const [base = '/bf', query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    params.delete(SESSION_QUERY);
    if (token) params.set('project_id', token);
    const search = params.toString();
    return `/api/v0${base.slice('/bf'.length)}${search ? `?${search}` : ''}`;
  };

  return {
    plugins: [react(), wasm(), mainnetConsoleBackend({ repoRoot, sessionToken, port: PORT })],
    publicDir: false,
    resolve: {
      // The wallet-sdk address format decodes Bech32m into Node Buffers.
      alias: { buffer: 'buffer/' },
    },
    define: { global: 'globalThis' },
    optimizeDeps: {
      exclude: ['@midnight-ntwrk/onchain-runtime-v3', '@stockandfoil/contract', '@stockandfoil/sdk'],
      esbuildOptions: { target: 'esnext' },
    },
    worker: { format: 'es' as const },
    server: {
      // Loopback only, and only under its own names. `allowedHosts` makes a request arriving
      // with any other `Host` a 403 before a plugin sees it — the DNS-rebinding case, where a
      // name the attacker controls resolves to 127.0.0.1.
      host: '127.0.0.1',
      port: PORT,
      strictPort: true,
      allowedHosts: ['127.0.0.1', 'localhost'],
      // No CORS headers on anything except the static proving material, which opts in by
      // hand. Without this a page on another loopback port — another dev server, say — could
      // read the answers to requests it forged.
      cors: false,
      origin: `http://127.0.0.1:${PORT}`,
      // The SDK and the compiled contract are read from sibling workspaces, so the whole
      // repository is on the allow list — and the two things in it that must never be served
      // as files are taken back off. The console reads the ceremony keys through
      // `/__console/keys`, which checks the caller is on loopback; `/@fs/` does not.
      fs: {
        allow: ['../..'],
        deny: ['**/.env', '**/.env.*', '**/.secrets/**', '**/*.{crt,pem,key}', '**/.git/**'],
      },
      proxy: {
        // Guarded by server/guard.ts, which runs as plugin middleware ahead of this proxy for
        // HTTP and as an `upgrade` listener ahead of it for WebSockets. Without that guard
        // this entry is a confused deputy: it attaches our credential to whatever arrives.
        '/bf': {
          target: BLOCKFROST_MAINNET,
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: withToken,
          headers: token ? { project_id: token } : undefined,
          configure: (proxy) => {
            // http-proxy puts the outbound URL in its errors, and that URL carries both secrets.
            proxy.on('error', (error) => {
              console.error(
                `[mainnet-console] blockfrost proxy: ${redact(error.message, token, sessionToken)}`,
              );
            });
          },
        },
      },
    },
  };
});
