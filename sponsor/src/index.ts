// SPDX-License-Identifier: Apache-2.0
//
// The sponsor as a library, so a test — or another process that already holds a wallet — can
// build one without the HTTP entry point. `src/main.ts` is the only file that opens a wallet.
export {
  checkFee,
  checkTransaction,
  DEFAULT_RATE_LIMIT,
  DEFAULT_SPONSORED_CIRCUITS,
  RateLimiter,
  type PolicyDecision,
  type RateLimitConfig,
  type RateLimitDecision,
  type SponsorPolicy,
} from './policy.js';
export {
  SponsorService,
  type CallerIdentity,
  type SponsorLogEntry,
  type SponsorServiceOptions,
  type SponsorSigner,
} from './service.js';
export { createSponsorServer, rateLimitBucket, type ServerOptions } from './server.js';
