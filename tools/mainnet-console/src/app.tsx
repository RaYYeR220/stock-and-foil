// SPDX-License-Identifier: Apache-2.0
//
// The console itself.
//
// One rule governs the whole component and is enforced in one place: `guard()`. Every action
// that can reach the wallet goes through it, and it refuses to start a second one while the
// first is in flight. There is never more than one dialog open, because there is never more
// than one operation running.
//
// The other rule is that nothing happens on a timer. Every transaction is a button the
// operator presses after reading what it is for. A failure stops the run where it is and names
// who refused; nothing is retried automatically, least of all on a network where the fees are
// somebody else's money.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { DeploymentFile, KeysFile } from '../../../cli/src/records.js';
import type { NetworkBackend } from '@stockandfoil/sdk';
import { formatDust } from '@stockandfoil/sdk';
import {
  getDeployment,
  getKeysFile,
  getPreflight,
  getState,
  putState,
  type Check,
  type ServerPreflight,
} from './lib/api.js';
import { runCeremony } from './lib/ceremony.js';
import { DEPLOY_TOTAL, describeDeployTx, runStagedDeploy, type DeployTxView } from './lib/deploy.js';
import { writeRunEvidence } from './lib/evidence.js';
import { prepareLifecycle, promptsRemaining, toStepRecord, type LifecycleStep } from './lib/lifecycle.js';
import { dryRun, TOTAL_PROMPTS, type DryRun } from './lib/preflight.js';
import { connectRegistry, keysFromFile, openSession, type ConsoleSession, type RegistryKeyMaterial } from './lib/session.js';
import { attribute, ConsoleStop, emptyState, whoRefused, type ConsoleState, type RunFailure } from './lib/state.js';
import { detectWallet } from './lib/wallet.js';

interface LogLine {
  at: string;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

const short = (value: string | undefined, head = 10, tail = 6): string =>
  !value ? '—' : value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

const statusMark = { ok: '✓', warn: '!', fail: '✕' } as const;

function CheckList({ checks }: { checks: Check[] }): JSX.Element {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.id} className={`check check-${c.status}`}>
          <span className="mark">{statusMark[c.status]}</span>
          <div>
            <strong>{c.title}</strong>
            <p>{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function App(): JSX.Element {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const stateRef = useRef<ConsoleState>(emptyState());
  const busyRef = useRef<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [server, setServer] = useState<ServerPreflight | null>(null);
  const [keysFile, setKeysFile] = useState<KeysFile | null>(null);
  const [session, setSession] = useState<ConsoleSession | null>(null);
  const [backend, setBackend] = useState<NetworkBackend | null>(null);
  const [deployment, setDeployment] = useState<DeploymentFile | null>(null);
  const [steps, setSteps] = useState<LifecycleStep[] | null>(null);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [nextDeployTx, setNextDeployTx] = useState<DeployTxView | null>(null);
  const [failure, setFailure] = useState<RunFailure | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  const say = useCallback((text: string, tone: LogLine['tone'] = 'info') => {
    setLog((lines) => [...lines, { at: new Date().toLocaleTimeString(), text, tone }]);
  }, []);

  const save = useCallback(async (next: ConsoleState) => {
    stateRef.current = next;
    await putState(next);
    bump();
  }, []);

  /**
   * The single-prompt guard.
   *
   * A declined dialog, a double-clicked button and an impatient reload are the three ways two
   * prompts end up open at once, and a wallet with two open dialogs will balance the second
   * against state the first has not committed. One operation at a time, always.
   */
  const guard = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      if (busyRef.current) {
        say(`"${name}" was not started: "${busyRef.current}" is still waiting on the wallet.`, 'bad');
        return;
      }
      busyRef.current = name;
      setBusy(name);
      setFailure(null);
      try {
        await fn();
      } catch (error) {
        const attributed = attribute(error, name);
        setFailure(attributed);
        say(`${name} stopped: ${attributed.message}`, 'bad');
      } finally {
        busyRef.current = null;
        setBusy(null);
        bump();
      }
    },
    [say],
  );

  const refresh = useCallback(async () => {
    const [preflight, keys, saved, existing] = await Promise.all([
      getPreflight(true),
      getKeysFile(),
      getState(),
      getDeployment(),
    ]);
    setServer(preflight);
    setKeysFile(keys);
    setDeployment(existing);
    if (saved) stateRef.current = saved;
    bump();
  }, []);

  // Reading this machine is idempotent and touches no wallet, so it does not take the guard —
  // StrictMode invokes this twice in development and a guarded second call would log a refusal
  // that means nothing. Everything that can reach the wallet does take it.
  useEffect(() => {
    refresh().catch((error: unknown) => say(`could not read this machine: ${String(error)}`, 'bad'));
  }, [refresh, say]);

  const keys: RegistryKeyMaterial | null = keysFile ? keysFromFile(keysFile) : null;
  const state = stateRef.current;
  const deployProgress = state.deploy;
  const deployDone = deployProgress?.completedAt !== undefined || deployment !== null;
  const inserted = deployProgress?.insertedCircuits.length ?? 0;
  const deployAt = deployProgress?.contractAddress ? inserted + 1 : 0;
  const doneSteps = new Set((state.lifecycle?.steps ?? []).map((s) => s.id));
  const nextStep = steps?.find((s) => !doneSteps.has(s.id)) ?? null;

  // ------------------------------------------------------------------------------- actions

  const onCeremony = () =>
    guard('key ceremony', async () => {
      const result = await runCeremony(keysFile !== null);
      say(`ceremony checked out: ${result.check.shares.length} shares, every pair interpolating. Wrote ${result.writtenTo}`, 'good');
      await refresh();
    });

  const onConnect = () =>
    guard('connect the wallet', async () => {
      const initial = await detectWallet();
      if (!initial) {
        throw new ConsoleStop(
          'the 1AM extension did not inject itself at window.midnight["1am"] within five seconds. ' +
            'Install or unlock it, then reload.',
        );
      }
      const opened = await openSession({
        initial,
        // Both names, before it goes out. If anything is ever lost again, these are the two
        // strings that find it — the identifier for the indexer, the ledger hash for an explorer.
        onSubmitting: ({ txId, ledgerHash }) =>
          say(`submitting — identifier ${txId}, ledger hash ${ledgerHash}`),
        onSubmitted: (txId, r) =>
          say(`in block ${r.blockHash.slice(0, 18)}… (extrinsic ${r.extrinsicHash.slice(0, 18)}…) — ${txId}`, 'good'),
      });
      setSession(opened);
      say(
        `connected to ${opened.walletName} on ${opened.reportedNetworkId}; DUST ` +
          `${opened.reading.dustBalanceSpeck} SPECK (${formatDust(opened.reading.dustBalanceSpeck)}).`,
        'good',
      );
      const address = deployment?.contractAddress ?? state.deploy?.contractAddress;
      if (address && (deployment !== null || state.deploy?.completedAt)) {
        const connected = await connectRegistry(opened, address);
        setBackend(connected);
        say(`re-attached to the registry at ${address}`);
      }
    });

  const onDryRun = () =>
    guard('dry run', async () => {
      if (!session) throw new ConsoleStop('connect the wallet first; the dry run reads it and stops there.');
      const preflight = await getPreflight(true);
      setServer(preflight);
      const result = await dryRun(session, preflight.checks);
      setDry(result);
      say(
        `dry run: ${result.verdict}. ${result.planned.length} units of work, ${result.prompts} wallet ` +
          'prompts. Nothing was built, proved, balanced or submitted.',
        result.verdict === 'blocked' ? 'bad' : 'good',
      );
    });

  const onDeploy = () =>
    guard(deployProgress?.contractAddress ? 'resume the deployment' : 'deploy the registry', async () => {
      if (!session || !keys) throw new ConsoleStop('connect the wallet and run the ceremony first.');
      if (!dry || dry.verdict === 'blocked') {
        throw new ConsoleStop('run the dry run first, and clear anything it marks ✕. Mainnet has no faucet.');
      }
      const result = await runStagedDeploy({
        session,
        keys,
        state: stateRef.current,
        save,
        onTx: (view) => {
          setNextDeployTx(view);
          say(`tx ${view.index}/${view.total} — ${view.title}`);
        },
      });
      setBackend(result.backend);
      setDeployment(result.deployment);
      setNextDeployTx(null);
      say(`deployed ${result.deployment.contractAddress}; wrote ${result.writtenTo}`, 'good');
      if (result.note) say(result.note, 'bad');
      await refresh();
    });

  const onPrepareLifecycle = () =>
    guard('prepare the lifecycle', async () => {
      if (!backend || !keys) throw new ConsoleStop('deploy (or re-attach to) the registry first.');
      const prepared = await prepareLifecycle(backend, keys, stateRef.current);
      stateRef.current.lifecycle = prepared.lifecycle;
      await save(stateRef.current);
      setSteps(prepared.steps);
      say(`lifecycle ready: ${prepared.steps.length} steps, ${prepared.steps.filter((s) => s.prompts).length} prompts.`);
    });

  const onNextStep = () =>
    guard(nextStep ? nextStep.id : 'next step', async () => {
      if (!nextStep) throw new ConsoleStop('every step is done.');
      const lifecycle = stateRef.current.lifecycle;
      if (!lifecycle) throw new ConsoleStop('prepare the lifecycle first.');
      say(`${nextStep.id}: ${nextStep.label}`);
      try {
        const outcome = await nextStep.run();
        lifecycle.steps = [...lifecycle.steps, toStepRecord(nextStep, outcome)];
        lifecycle.lastFailure = undefined;
        await save(stateRef.current);
        if (outcome.refused) {
          say(`REFUSED ${outcome.refused} — no transaction was submitted. ${outcome.note ?? ''}`, 'good');
        } else if (outcome.txId) {
          say(`tx ${outcome.txId} in block ${outcome.blockHeight}`, 'good');
        } else {
          say(outcome.note ?? 'done', 'good');
        }
      } catch (error) {
        lifecycle.lastFailure = attribute(error, nextStep.id);
        await save(stateRef.current);
        throw error;
      }
    });

  const onEvidence = () =>
    guard('write the evidence', async () => {
      if (!backend || !deployment || !stateRef.current.lifecycle) {
        throw new ConsoleStop('the evidence needs the deployment record and at least one lifecycle step.');
      }
      const { file, writtenTo, supersedes } = await writeRunEvidence({
        session: session!,
        backend,
        deployment,
        lifecycle: stateRef.current.lifecycle,
        startedAt: stateRef.current.startedAt,
      });
      say(
        `wrote ${writtenTo}: ${file.summary.transactions} transactions, ${file.summary.refusals.length} ` +
          `refusal(s), ${file.summary.totalFeeDust} DUST of fees — all of it paid by 1AM's pool. ` +
          'Now run: npm run -w cli verify -- --network mainnet',
        'good',
      );
      if (supersedes) {
        say(`${supersedes} already existed and was left untouched; reconcile the two by hand.`, 'bad');
      }
    });

  // ----------------------------------------------------------------------------------- view

  return (
    <main>
      <header>
        <h1>Stock &amp; Foil — mainnet console</h1>
        <p className="sub">
          Local only. This page is not part of the published site, holds the ceremony secrets, and never
          submits anything you have not approved in the wallet yourself.
          {busy ? <strong className="busy"> Waiting on: {busy}</strong> : null}
        </p>
      </header>

      {failure ? (
        <section className="failure">
          <h2>Stopped</h2>
          <p className="who">{whoRefused(failure)}</p>
          <pre>{failure.message}</pre>
          <p className="fine">
            Nothing is retried automatically. Fix the cause and press the same button again — completed
            transactions are recorded and will be skipped.
          </p>
        </section>
      ) : null}

      <section>
        <h2>1 · This machine</h2>
        <p className="fine">
          Checked before anything is signed: the Blockfrost credential, the indexer, the compiled
          artefacts against the frozen sixteen-circuit build, the staged proving keys, the ceremony.
        </p>
        {server ? <CheckList checks={server.checks} /> : <p>reading…</p>}
        <div className="row">
          <button onClick={() => guard('re-read this machine', refresh)} disabled={busy !== null}>
            Re-check
          </button>
          <button onClick={onCeremony} disabled={busy !== null}>
            {keysFile ? 'Re-run the key ceremony (overwrites)' : 'Run the key ceremony'}
          </button>
        </div>
      </section>

      <section>
        <h2>2 · The wallet</h2>
        {session ? (
          <dl className="facts">
            <dt>Wallet</dt>
            <dd>
              {session.walletName} · DApp Connector {session.apiVersion ?? '?'}
            </dd>
            <dt>Network it reports</dt>
            <dd>{session.reportedNetworkId}</dd>
            <dt>Shielded</dt>
            <dd className="mono">{session.reading.shieldedAddress}</dd>
            <dt>Unshielded</dt>
            <dd className="mono">{session.reading.unshieldedAddress}</dd>
            <dt>DUST address</dt>
            <dd className="mono">{session.reading.dustAddress ?? '—'}</dd>
            <dt>DUST balance</dt>
            <dd>
              {session.reading.dustBalanceSpeck.toString()} SPECK ·{' '}
              {formatDust(session.reading.dustBalanceSpeck)} DUST
              {session.reading.dustBalanceSpeck === 0n ? ' — zero, as expected: 1AM pays the fees' : ''}
            </dd>
            <dt>Proving and balancing</dt>
            <dd className="mono">{session.proverServerUri}</dd>
            <dt>Reads</dt>
            <dd className="mono">{session.publicIndexerUrl} → Blockfrost (token held by the dev server)</dd>
          </dl>
        ) : (
          <p className="fine">Not connected. Connecting reads the wallet; it signs nothing.</p>
        )}
        <div className="row">
          <button onClick={onConnect} disabled={busy !== null}>
            {session ? 'Reconnect' : 'Connect the 1AM wallet'}
          </button>
          <button onClick={onDryRun} disabled={busy !== null || !session}>
            Dry run (stops before any signature)
          </button>
        </div>
      </section>

      {!dry ? (
        <section>
          <h2>3 · Dry run</h2>
          <p className="fine">
            Not run yet. The dry run connects, reads the wallet and the chain, fetches a real proving key
            over HTTP, checks the compiled artefacts against the frozen build, and lists every transaction
            the run will produce with the reason for it — then stops. It signs nothing, and the deployment
            below will not start until it has passed.
          </p>
        </section>
      ) : (
        <section>
          <h2>3 · Dry run — {dry.verdict}</h2>
          <p className="fine">
            {dry.planned.length} units of work, {dry.prompts} of which raise a wallet prompt (
            {DEPLOY_TOTAL} for the deployment, {dry.prompts - DEPLOY_TOTAL} for the lifecycle). Expect about{' '}
            {TOTAL_PROMPTS} approvals in all. Two steps raise none at all, and that is the point of them.
          </p>
          <CheckList checks={dry.checks} />
          <ol className="plan">
            {dry.planned.map((tx) => (
              <li key={`${tx.phase}-${tx.index}`} className={tx.prompts ? '' : 'no-prompt'}>
                <strong>
                  {tx.phase === 'deploy' ? `Deploy ${tx.index}/${DEPLOY_TOTAL}` : `Lifecycle ${tx.index}`} ·{' '}
                  {tx.title}
                </strong>
                {tx.prompts ? null : <em> — no wallet prompt, nothing submitted</em>}
                <p>{tx.why}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2>
          4 · Deployment {deployDone ? '— done' : `— ${deployAt} of ${DEPLOY_TOTAL}`}
        </h2>
        <p className="fine">
          One deploy transaction carrying six verifier keys, then ten maintenance transactions carrying
          one each. Every one of them is a separate approval, and every one is recorded before the next is
          asked for, so a closed tab or a declined prompt costs one transaction.
        </p>
        {deployProgress?.contractAddress ? (
          <dl className="facts">
            <dt>Contract</dt>
            <dd className="mono">{deployProgress.contractAddress}</dd>
            <dt>Deploy tx</dt>
            <dd className="mono">{short(deployProgress.deployTxId, 16, 8)}</dd>
            <dt>Verifier keys inserted</dt>
            <dd>
              {inserted} of {DEPLOY_TOTAL - 1}
              {deployProgress.insertedCircuits.length ? ` — ${deployProgress.insertedCircuits.join(', ')}` : ''}
            </dd>
          </dl>
        ) : null}
        {nextDeployTx ? (
          <div className="next">
            <strong>
              Next · transaction {nextDeployTx.index} of {nextDeployTx.total}: {nextDeployTx.title}
            </strong>
            <p>{nextDeployTx.why}</p>
          </div>
        ) : !deployDone ? (
          <div className="next">
            <strong>
              Next · transaction {deployAt + 1} of {DEPLOY_TOTAL}: {describeDeployTx(deployAt + 1).title}
            </strong>
            <p>{describeDeployTx(deployAt + 1).why}</p>
          </div>
        ) : null}
        <div className="row">
          <button onClick={onDeploy} disabled={busy !== null || deployDone || !session || !keys}>
            {deployProgress?.contractAddress
              ? `Resume at transaction ${deployAt + 1} of ${DEPLOY_TOTAL}`
              : `Start the deployment (${DEPLOY_TOTAL} approvals)`}
          </button>
        </div>
      </section>

      <section>
        <h2>
          5 · Ceremony and lifecycle{' '}
          {steps
            ? `— ${doneSteps.size} of ${steps.length}, ${promptsRemaining(steps, doneSteps)} prompts left`
            : deployDone
              ? ''
              : '(after the deployment)'}
        </h2>
        <p className="fine">
          Ordered so the meaningful part lands first, in case the sponsor stops paying: admissions, an
          acknowledgment, an offer, an acceptance, the double-pledge refusal, then the 2-of-3 disclosure.
          Settlement is not here — those circuits move real NIGHT, and 1AM sponsors the fee, not the
          principal.
        </p>
        {steps ? (
          <ol className="plan">
            {steps.map((step) => {
              const done = state.lifecycle?.steps.find((s) => s.id === step.id);
              return (
                <li key={step.id} className={done ? 'done' : step === nextStep ? 'next-step' : ''}>
                  <strong>
                    {done ? '✓ ' : step === nextStep ? '→ ' : ''}
                    {step.label}
                  </strong>{' '}
                  <span className="fine">
                    {step.circuit} · as {step.persona}
                    {step.prompts ? '' : ' · no wallet prompt'}
                  </span>
                  {done ? (
                    <p className="fine mono">
                      {done.refused ? `REFUSED ${done.refused} — nothing submitted` : (done.txId ?? done.note ?? 'done')}
                    </p>
                  ) : step === nextStep ? (
                    <p>{step.why}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="row">
          <button onClick={onPrepareLifecycle} disabled={busy !== null || !backend || !keys}>
            {steps ? 'Re-read the plan' : 'Prepare the lifecycle'}
          </button>
          <button onClick={onNextStep} disabled={busy !== null || !nextStep}>
            {nextStep
              ? nextStep.prompts
                ? `Run and approve: ${nextStep.label}`
                : `Run (no prompt): ${nextStep.label}`
              : steps
                ? 'Every step is done'
                : 'No plan loaded yet'}
          </button>
        </div>
      </section>

      <section>
        <h2>6 · Evidence</h2>
        <p className="fine">
          Writes <code>cli/deployments/mainnet.json</code> (already written by the deployment) and{' '}
          <code>cli/evidence/mainnet-&lt;timestamp&gt;.json</code>, in the shape{' '}
          <code>cli/src/records.ts</code> defines — the same serializer the CLI uses, so{' '}
          <code>npm run -w cli verify -- --network mainnet</code> and <code>npm run -w cli proof</code> read
          them unchanged.
        </p>
        <div className="row">
          <button onClick={onEvidence} disabled={busy !== null || !backend || !deployment}>
            Write the evidence file
          </button>
        </div>
      </section>

      <section>
        <h2>Log</h2>
        <ol className="log">
          {log.map((line, i) => (
            <li key={i} className={line.tone}>
              <span className="mono">{line.at}</span> {line.text}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
