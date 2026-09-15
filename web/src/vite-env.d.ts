// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the compiled `keys/` and `zkir/` are served from in Network mode. */
  readonly VITE_ZK_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
