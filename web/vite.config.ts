// SPDX-License-Identifier: Apache-2.0
//
// The compiled Compact contract runs in the browser through `@midnight-ntwrk/compact-runtime`,
// which loads a WebAssembly module. That dictates three settings below: the wasm plugin, an
// esnext target (the runtime uses top-level await), and keeping the onchain runtime out of
// dependency pre-bundling, which would otherwise rewrite its wasm imports.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), wasm()],
  resolve: {
    // `@midnight-ntwrk/wallet-sdk-address-format` decodes Bech32m into Node Buffers. Network mode
    // is the only code path that touches it, and it is loaded lazily, but the alias has to exist.
    alias: { buffer: 'buffer/' },
  },
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3', '@stockandfoil/contract', '@stockandfoil/sdk'],
    esbuildOptions: { target: 'esnext' },
  },
  worker: { format: 'es' },
  server: { fs: { allow: ['..'] } },
});
