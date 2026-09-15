// SPDX-License-Identifier: Apache-2.0
//
// One registry world for the whole app. Building it runs the contract constructor, so it happens
// once, asynchronously, behind a loading state; every route then reads the same world and the same
// public ledger view, which is why an action taken in a persona workspace shows up in the
// explorer and in the replay.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isRefusal, REFUSAL_MESSAGES, type PublicLedgerView, type Refusal, type TxReceipt } from '../lib/sdk.js';
import { forgetWorld, loadWorld, saveWorld } from '../lib/persist.js';
import { SandboxWorld, T0 } from '../lib/world.js';
import type { NetworkSession } from '../lib/network.js';

export type Mode = 'sandbox' | 'network';

export interface RegistryValue {
  mode: Mode;
  setMode(mode: Mode): void;
  /** The in-browser world. Always present once `status` is `ready`. */
  world: SandboxWorld | null;
  status: 'booting' | 'ready' | 'failed';
  error?: string;
  view: PublicLedgerView | null;
  now: bigint;
  /** Increments on every change, so views that cache by identity can re-read. */
  revision: number;
  refresh(): Promise<void>;
  advance(seconds: bigint): Promise<void>;
  setClock(unixSeconds: bigint): Promise<void>;
  reset(): Promise<void>;
  network: NetworkSession | null;
  setNetwork(session: NetworkSession | null): void;
}

const RegistryContext = createContext<RegistryValue | null>(null);

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('sandbox');
  const [world, setWorld] = useState<SandboxWorld | null>(null);
  const [status, setStatus] = useState<RegistryValue['status']>('booting');
  const [error, setError] = useState<string>();
  const [view, setView] = useState<PublicLedgerView | null>(null);
  const [now, setNow] = useState<bigint>(T0);
  const [revision, setRevision] = useState(0);
  const [network, setNetwork] = useState<NetworkSession | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let cancelled = false;
    // Yield a frame first so the shell paints before the constructor runs.
    const start = async () => {
      try {
        // A world this tab built earlier comes back as it was left, admissions included. Only a
        // first visit runs the admissions, and only a first visit starts from an empty ledger.
        const restored = loadWorld();
        const created = restored ?? SandboxWorld.create();
        if (!restored) await created.admitParties();
        if (cancelled) return;
        saveWorld(created);
        setWorld(created);
        setView(await created.publicState());
        setNow(created.now());
        setStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('failed');
      }
    };
    const handle = setTimeout(start, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, []);

  // Every surface refreshes through here after a call, a rewind or a move of the clock, so this
  // is also where the world is written down for the next page load.
  const refresh = useCallback(async () => {
    if (!world) return;
    setView(await world.publicState());
    setNow(world.now());
    setRevision((r) => r + 1);
    saveWorld(world);
  }, [world]);

  const advance = useCallback(
    async (seconds: bigint) => {
      if (!world) return;
      world.backend.advanceBy(seconds);
      await refresh();
    },
    [world, refresh],
  );

  const setClock = useCallback(
    async (unixSeconds: bigint) => {
      if (!world) return;
      world.backend.advanceTo(unixSeconds);
      await refresh();
    },
    [world, refresh],
  );

  const reset = useCallback(async () => {
    if (!world) return;
    // The stored world goes with the one in memory, so a reload cannot bring back what was reset.
    forgetWorld();
    world.backend.reset();
    await world.admitParties();
    await refresh();
  }, [world, refresh]);

  const value = useMemo<RegistryValue>(
    () => ({
      mode,
      setMode,
      world,
      status,
      error,
      view,
      now,
      revision,
      refresh,
      advance,
      setClock,
      reset,
      network,
      setNetwork,
    }),
    [mode, world, status, error, view, now, revision, refresh, advance, setClock, reset, network],
  );

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): RegistryValue {
  const value = useContext(RegistryContext);
  if (!value) throw new Error('useRegistry must be used inside a RegistryProvider');
  return value;
}

/** The world, once it exists. Routes inside `<AppShell>` are only rendered when it does. */
export function useWorld(): SandboxWorld {
  const { world } = useRegistry();
  if (!world) throw new Error('the sandbox world is not ready yet');
  return world;
}

// ---------------------------------------------------------------------------------------------
// Running one circuit call

export type ActionState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ok'; message: string; receipt?: TxReceipt }
  | { status: 'refused'; refusal: Refusal }
  | { status: 'error'; message: string };

export interface ActionHandle<A extends unknown[]> {
  state: ActionState;
  run(...args: A): Promise<void>;
  reset(): void;
  busy: boolean;
}

/**
 * Wraps one registry action: shows a loading state while the circuit runs, turns a `Refusal` into
 * a designed refusal state rather than an exception, and refreshes the shared view afterwards.
 */
export function useAction<A extends unknown[]>(
  action: (...args: A) => Promise<{ message: string; receipt?: TxReceipt } | void>,
): ActionHandle<A> {
  const { refresh } = useRegistry();
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A) => {
      setState({ status: 'running' });
      // Let the browser paint the busy state before a circuit blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 16));
      try {
        const result = await action(...args);
        await refresh();
        if (!live.current) return;
        setState({ status: 'ok', message: result?.message ?? 'Done.', receipt: result?.receipt });
      } catch (cause) {
        await refresh();
        if (!live.current) return;
        if (isRefusal(cause)) setState({ status: 'refused', refusal: cause });
        else setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) });
      }
    },
    // `action` is recreated every render by design; the closure must stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, action],
  );

  return {
    state,
    run,
    reset: () => setState({ status: 'idle' }),
    busy: state.status === 'running',
  };
}

export const refusalText = (refusal: Refusal): string => REFUSAL_MESSAGES[refusal.code];
