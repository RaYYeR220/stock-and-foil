// SPDX-License-Identifier: Apache-2.0
//
// The guided replay. Every step here is a real call into the compiled Compact contract running in
// this tab: the three First Brands frauds are refused by the contract's own asserts, and the
// sealed record at the end decrypts and checks itself against the ledger.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { findPledge, isRefusal, REFUSAL_MESSAGES, toHex, type Refusal } from '../lib/sdk.js';
import { KeyValues, SectionOpener, TallyStrip, useTitle, type StripState } from '../components/ui.js';
import { day, money, ms, shortField, shortHex } from '../lib/format.js';
import { REPLAY_STEPS, type Fact } from '../lib/replay.js';
import { personaMeta, type WorldSnapshot } from '../lib/world.js';
import { useRegistry } from '../state/registry.js';

interface StepResult {
  status: 'ok' | 'refused' | 'error';
  facts: Fact[];
  refusal?: Refusal;
  message?: string;
  durationMs: number;
}

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The record everything turns on, drawn from whatever the ledger currently says about it. */
function RecordPanel() {
  const { world, view, now } = useRegistry();
  if (!world || !view) return null;
  const nullifier = world.nullifier('SF-2026-1001');
  const pledge = findPledge(view, nullifier);
  const acked = view.counts.acks > 0;
  const seed = pledge?.nullifier ?? toHex(nullifier);

  const state: StripState = !acked
    ? 'none'
    : !pledge
      ? 'acknowledged'
      : pledge.status === 'SETTLED'
        ? 'settled'
        : pledge.status === 'RELEASED'
          ? 'acknowledged'
          : 'encumbered';

  return (
    <div className="rec" data-testid="record-card">
      <div className="rec-head">
        <span className="id">SF-2026-1001</span>
        <span className={pledge && pledge.status !== 'RELEASED' ? 'tag' : 'tag tag--plain'}>
          {!acked ? 'Not acknowledged' : !pledge ? 'Acknowledged' : pledge.status === 'SETTLED' ? 'Settled' : pledge.status === 'RELEASED' ? 'Released' : 'Encumbered'}
        </span>
      </div>
      <TallyStrip
        seed={seed}
        state={state}
        label={
          state === 'encumbered'
            ? 'Both halves of the tally printed in register: a live pledge.'
            : state === 'settled'
              ? 'Both halves printed and struck through: the invoice has been paid.'
              : state === 'none'
                ? undefined
                : 'Only the buyer’s half is printed: acknowledged, and free to pledge.'
        }
      />
      <KeyValues
        rows={[
          { label: 'Acknowledged', value: acked ? 'yes' : 'not yet' },
          { label: 'Amount', value: 'withheld', mono: false },
          { label: 'Pledge marker', value: pledge ? shortHex(pledge.nullifier) : 'none recorded', mono: true },
          { label: 'Status', value: pledge?.status ?? '—' },
          {
            label: 'Holder tag',
            value: pledge ? shortField(BigInt(pledge.holderTag)) : '—',
            mono: true,
          },
          {
            label: 'Offer expires',
            value: pledge && pledge.expiry > 0n ? day(pledge.expiry) : '—',
          },
          {
            label: 'Settled amount',
            value: pledge && pledge.amount > 0n ? money(pledge.amount) : 'not settled',
          },
          { label: 'Claimed', value: pledge?.claimed ? 'yes' : 'no' },
        ]}
      />
      <p className="rec-note">
        This card is drawn from the public ledger only. Block time {day(now)}. The amount stays withheld until the
        invoice is paid through the contract, which is the one place settlement becomes public.
      </p>
    </div>
  );
}

export function Replay() {
  useTitle('Guided replay');
  const { world, refresh } = useRegistry();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [busy, setBusy] = useState(false);
  const [autorun, setAutorun] = useState(false);
  const snapshots = useRef<WorldSnapshot[]>([]);
  const stop = useRef(false);

  const genesis = useMemo<WorldSnapshot | null>(
    () => (world ? { ledger: world.backend.genesis, book: [...world.book] } : null),
    [world],
  );

  useEffect(() => {
    if (genesis) snapshots.current[0] = genesis;
  }, [genesis]);

  const step = REPLAY_STEPS[Math.min(index, REPLAY_STEPS.length - 1)]!;
  const result = results[step.id];
  const done = Object.keys(results).length;

  const rewindTo = useCallback(
    async (target: number) => {
      if (!world) return;
      const snapshot = snapshots.current[target];
      if (!snapshot) return;
      world.restore(snapshot);
      snapshots.current.length = target + 1;
      setResults((prev) => {
        const next: Record<string, StepResult> = {};
        REPLAY_STEPS.slice(0, target).forEach((s) => {
          const value = prev[s.id];
          if (value) next[s.id] = value;
        });
        return next;
      });
      setIndex(target);
      await refresh();
    },
    [world, refresh],
  );

  const runStep = useCallback(
    async (target: number): Promise<'ok' | 'refused' | 'error'> => {
      if (!world) return 'error';
      const current = REPLAY_STEPS[target];
      if (!current) return 'error';
      // Step one admits the parties, so it has to start from the contract as deployed — otherwise
      // it would admit them a second time on top of whatever a workspace has already done.
      const baseline = snapshots.current[target];
      if (target === 0 && baseline) world.restore(baseline);
      else if (!baseline) snapshots.current[target] = world.snapshot();
      const started = Date.now();
      let outcome: StepResult;
      try {
        const facts = await current.run(world);
        outcome = { status: 'ok', facts, durationMs: Date.now() - started };
      } catch (cause) {
        if (isRefusal(cause)) {
          const facts = (await current.onRefused?.(world)) ?? [];
          outcome = { status: 'refused', facts, refusal: cause, durationMs: Date.now() - started };
        } else {
          outcome = {
            status: 'error',
            facts: [],
            message: cause instanceof Error ? cause.message : String(cause),
            durationMs: Date.now() - started,
          };
        }
      }
      snapshots.current[target + 1] = world.snapshot();
      setResults((prev) => ({ ...prev, [current.id]: outcome }));
      await refresh();
      return outcome.status;
    },
    [world, refresh],
  );

  // Running a step leaves you on it: the outcome is the point, so the page does not move on
  // until you ask it to.
  const runOne = useCallback(async () => {
    setBusy(true);
    // Paint the busy state before a circuit takes the main thread.
    await new Promise((resolve) => setTimeout(resolve, 16));
    await runStep(index);
    setBusy(false);
  }, [index, runStep]);

  const runAll = useCallback(async () => {
    setBusy(true);
    setAutorun(true);
    stop.current = false;
    const reduced = REDUCED();
    for (let i = index; i < REPLAY_STEPS.length; i++) {
      if (stop.current) break;
      setIndex(i);
      await new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 260));
      const status = await runStep(i);
      if (status === 'error') break;
    }
    setAutorun(false);
    setBusy(false);
  }, [index, runStep]);

  const restart = useCallback(async () => {
    stop.current = true;
    await rewindTo(0);
  }, [rewindTo]);

  const actor = personaMeta(step.actor);
  const status = result?.status ?? 'pending';

  return (
    <>
      <div className="pagehead">
        <p className="crumb">
          <i aria-hidden="true" />
          Guided replay · {REPLAY_STEPS.length} steps, run against the compiled contract
        </p>
        <SectionOpener
          title="The First Brands replay."
          level="h1"
          small
          dek={`${REPLAY_STEPS.length} steps through one receivable: acknowledged, offered, pledged, paid and disclosed — with the frauds that broke First Brands refused on the way. Each step is a real circuit call in this tab, and every refusal is the contract's own assert, not a message this page invented.`}
        />
      </div>

      <div className="replay">
        <nav className="stepnav" aria-label="Replay steps">
          {REPLAY_STEPS.map((s, i) => {
            const state = results[s.id]?.status ?? (i === index ? 'current' : 'pending');
            return (
              <button
                key={s.id}
                type="button"
                data-state={state}
                aria-current={i === index ? 'step' : undefined}
                disabled={busy || i > done}
                onClick={() => void rewindTo(i)}
              >
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  {s.title}
                  {s.refusal ? <span className="state"> · refused</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <article className="stage-card" data-outcome={status} data-testid="step-card">
          {status === 'refused' ? (
            <span className="stamp" aria-hidden="true">
              Refused
            </span>
          ) : null}
          <div className="stage-head">
            <h2>{step.title}</h2>
            <span className="who">
              {actor.role.split('—')[0]?.trim()} · {actor.name}
            </span>
          </div>
          <p className="stage-body">{step.body}</p>

          <div className="runbar">
            {result ? (
              <button
                className="btn"
                type="button"
                data-testid="next-step"
                disabled={busy || index >= REPLAY_STEPS.length - 1}
                onClick={() => setIndex((i) => Math.min(i + 1, REPLAY_STEPS.length - 1))}
              >
                {index >= REPLAY_STEPS.length - 1 ? 'That is the whole replay' : 'Next step'}
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                data-testid="run-step"
                data-busy={busy}
                disabled={busy}
                onClick={() => void runOne()}
              >
                {busy && !autorun ? 'Running the circuit…' : step.cta}
              </button>
            )}
            {result ? (
              <button
                className="btn btn--sm btn--ghost"
                type="button"
                data-testid="replay-from-here"
                disabled={busy}
                onClick={() => void rewindTo(index)}
              >
                Replay from here
              </button>
            ) : null}
            <span className="spacer" />
            <button className="btn btn--sm btn--ghost" type="button" data-testid="run-all" disabled={busy} onClick={() => void runAll()}>
              Run the rest
            </button>
            <button className="btn btn--sm btn--ghost" type="button" data-testid="reset" disabled={busy} onClick={() => void restart()}>
              Reset
            </button>
            <span className="progress">
              {done} of {REPLAY_STEPS.length} run
            </span>
          </div>

          {busy && !result ? (
            <p className="outcome" role="status">
              <span className="meta">Running {step.cta.toLowerCase()} in this tab…</span>
            </p>
          ) : null}

          {result?.status === 'refused' && result.refusal ? (
            <div className="outcome outcome--refused" role="status">
              <code className="code" data-testid="refusal-code">
                {result.refusal.code}
              </code>
              <p>{REFUSAL_MESSAGES[result.refusal.code]}</p>
              <p className="meta">
                Refused by {result.refusal.circuit} while the transaction was being built, in {ms(result.durationMs)}.
                Nothing reached the ledger.
              </p>
            </div>
          ) : null}

          {result?.status === 'ok' ? (
            <div className="outcome" role="status">
              <p>
                <strong>Accepted.</strong> {step.chain}
              </p>
              <p className="meta">Circuits ran in {ms(result.durationMs)}.</p>
            </div>
          ) : null}

          {result?.status === 'error' ? (
            <div className="outcome outcome--refused" role="alert">
              <p>
                <strong>That did not run.</strong> {result.message}
              </p>
            </div>
          ) : null}

          <div className="stage-split">
            <div>
              {result && result.facts.length > 0 ? (
                <div data-testid="facts">
                  <p className="lbl">What came back</p>
                  <KeyValues rows={result.facts.map((f) => ({ label: f.label, value: f.value, mono: f.mono }))} />
                </div>
              ) : null}
              <p className="ledgernote">
                <b>On the ledger</b>
                {step.chain}
              </p>
              <p className="ledgernote">
                <b>Stays with the parties</b>
                {step.kept}
              </p>
            </div>
            <RecordPanel />
          </div>
        </article>
      </div>

      <p className="note">
        Every step above is reversible: pick any step in the list to rewind the whole world to just before it. Running
        step one puts the registry back to the state it was deployed in, so the replay always starts from an empty
        ledger.{' '}
        <Link to="/app/ledger">Open the public ledger</Link> to see exactly what these calls wrote, or take a role
        yourself in the <Link to="/app/seller">workspaces</Link>.
      </p>
    </>
  );
}
