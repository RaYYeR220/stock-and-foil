// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the compiled `keys/` and `zkir/` are served from in Network mode. */
  readonly VITE_ZK_BASE_URL?: string;
  /**
   * A fee-sponsorship service this build may submit through. Unset in the public build: the
   * sponsor runs beside the wallet that pays, and the landing page says so rather than implying
   * a live endpoint. Set it and the sponsorship section probes `/healthz` and reports what it
   * found.
   */
  readonly VITE_SPONSOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
