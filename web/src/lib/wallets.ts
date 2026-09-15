// SPDX-License-Identifier: Apache-2.0
//
// Wallet discovery. Wallets inject themselves under `window.midnight` keyed by their own id, so
// this enumerates whatever is there rather than looking for one known name. Nothing here imports
// the SDK, which is what lets the Sandbox load without the network stack behind it.

/** One wallet the page can see, as the connector advertises itself. */
export interface WalletOption {
  /** Key under `window.midnight`; never assume it is any particular wallet. */
  key: string;
  name: string;
  rdns?: string;
  icon?: string;
  apiVersion?: string;
}

export interface InitialAPI {
  rdns?: string;
  name?: string;
  icon?: string;
  apiVersion?: string;
  connect(networkId: string): Promise<unknown>;
}

export const injectedWallets = (): Record<string, InitialAPI> =>
  (globalThis as { midnight?: Record<string, InitialAPI> }).midnight ?? {};

/** Every wallet that has injected itself, in the order it appears. */
export function listWallets(): WalletOption[] {
  return Object.entries(injectedWallets()).flatMap(([key, api]) =>
    api && typeof api.connect === 'function'
      ? [{ key, name: api.name ?? key, rdns: api.rdns, icon: api.icon, apiVersion: api.apiVersion }]
      : [],
  );
}
