// SPDX-License-Identifier: Apache-2.0
//
// The sandbox world, kept across a reload.
//
// Everything about this registry lives in the tab: the constructor runs here, every circuit call
// runs here, and the key material is generated here and never sent anywhere. That is also why a
// reload used to throw the world away — run the guided replay, press refresh or open /app/ledger
// by its URL, and the ledger explorer was back to zeros. So the whole world is written down after
// every call: the ledger snapshot, the keys the registry was deployed with, the four party secrets
// the ledger only holds hashes of, and the invoice book.
//
// `sessionStorage`, not `localStorage`: one world per tab, so two tabs do not overwrite each
// other's registry, and nothing outlives the tab. Nothing here may break the app either — storage
// can be absent, blocked (a private window, site data switched off) or full, and a stored world
// can be from an older build of the contract. Each of those falls back to a fresh registry.
import { decodeSnapshot, encodeSnapshot, type SimulatorSnapshot } from './sdk.js';
import { SandboxWorld, type BookEntry, type SandboxIdentities } from './world.js';

/** Bumped when the shape below changes, so an older world is dropped rather than half-read. */
const KEY = 'stock-and-foil.sandbox.v1';

interface StoredWorld {
  identities: SandboxIdentities;
  book: BookEntry[];
  ledger: SimulatorSnapshot;
}

/** Set once a write has failed for good (a full quota), so the app stops retrying every call. */
let writable = true;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Reading the property itself throws when site data is blocked.
    return null;
  }
}

/** Writes the world down. A failure here is never worth an error state: the tab still works. */
export function saveWorld(world: SandboxWorld): void {
  if (!writable) return;
  const store = storage();
  if (!store) return;
  try {
    const stored: StoredWorld = {
      identities: world.identities(),
      book: world.book,
      ledger: world.backend.snapshot(),
    };
    store.setItem(KEY, encodeSnapshot(stored));
  } catch {
    // Out of quota, or a state that would not serialize. Drop what is there rather than leave a
    // half-written world behind, and stop writing for the rest of the session.
    writable = false;
    forgetWorld();
  }
}

/**
 * The world this tab left behind, redeployed and restored — or `null` when there is nothing
 * stored, or what is stored cannot be read back. The caller treats `null` as a first visit.
 */
export function loadWorld(): SandboxWorld | null {
  try {
    const text = storage()?.getItem(KEY);
    if (!text) return null;
    const stored = decodeSnapshot<StoredWorld>(text);
    const world = SandboxWorld.create(stored.identities);
    world.restore({ ledger: stored.ledger, book: stored.book });
    // Project the restored ledger once: a state from an older build of the contract throws here,
    // where it is still a clean fall back to a fresh world.
    world.backend.ledgerState();
    return world;
  } catch {
    forgetWorld();
    return null;
  }
}

/** Forgets the stored world. "Reset registry" clears this as well as the world in memory. */
export function forgetWorld(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to do: there is no stored world to worry about if it cannot be reached.
  }
}
