// SPDX-License-Identifier: Apache-2.0
//
// The devnet suite needs a node, an indexer and a proof server, and pulling in the network
// stack costs about twenty seconds of module loading. Keep it out of the default run; opt in
// with DEVNET=1 (see `npm run -w sdk test:devnet`).
import { defineConfig } from 'vitest/config';

const devnet = process.env.DEVNET === '1';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', ...(devnet ? [] : ['**/*.devnet.test.ts'])],
    testTimeout: devnet ? 1_200_000 : 30_000,
    hookTimeout: devnet ? 900_000 : 30_000,
  },
});
