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
import { blockfrostMainnetToken, findRepoRoot, redact } from './server/env.js';
import { mainnetConsoleBackend } from './server/plugin.js';

const BLOCKFROST_MAINNET = 'https://midnight-mainnet.blockfrost.io';

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
   * `/bf` and `/bf/ws` carry the page's indexer traffic to Blockfrost with the project token
   * attached **here**, in Node. The browser only ever sees a same-origin path, so the token is
   * not in the bundle, not in `define`, not in devtools and not in a HAR the operator might
   * paste into an issue. Midnight's own mainnet indexer answers 410, so this is the read path.
   */
  const withToken = (path: string): string => {
    const [base = '/bf', query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    if (token) params.set('project_id', token);
    const search = params.toString();
    return `/api/v0${base.slice('/bf'.length)}${search ? `?${search}` : ''}`;
  };

  return {
    plugins: [react(), wasm(), mainnetConsoleBackend({ repoRoot })],
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
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      // The SDK and the compiled contract are read from sibling workspaces, so the whole
      // repository is on the allow list — and the two things in it that must never be served
      // as files are taken back off. The console reads the ceremony keys through
      // `/__console/keys`, which checks the caller is on loopback; `/@fs/` does not.
      fs: {
        allow: ['../..'],
        deny: ['**/.env', '**/.env.*', '**/.secrets/**', '**/*.{crt,pem,key}', '**/.git/**'],
      },
      proxy: {
        '/bf': {
          target: BLOCKFROST_MAINNET,
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: withToken,
          headers: token ? { project_id: token } : undefined,
          configure: (proxy) => {
            // http-proxy puts the outbound URL in its errors, and that URL carries the token.
            proxy.on('error', (error) => {
              console.error(`[mainnet-console] blockfrost proxy: ${redact(error.message, token)}`);
            });
          },
        },
      },
    },
  };
});
