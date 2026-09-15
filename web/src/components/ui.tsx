// SPDX-License-Identifier: Apache-2.0
//
// The small parts every working surface is built from: outcome states (a refusal is a designed
// state, never a raw error), labelled fields, key/value record rows and the tally strip that draws
// a record from its own commitment.
import { useId, type ReactNode } from 'react';
import { REFUSAL_MESSAGES } from '../lib/sdk.js';
import { ms } from '../lib/format.js';
import { notches } from '../lib/press.js';
import { STRIP_VIEW, bar } from '../lib/tally.js';
import type { ActionState } from '../state/registry.js';
import { Press } from './Press.js';

/** What happened after a circuit ran: accepted, refused, or something genuinely broken. */
export function Outcome({ state, idle }: { state: ActionState; idle?: ReactNode }) {
  if (state.status === 'idle') return idle ? <p className="hint">{idle}</p> : null;
  if (state.status === 'running') {
    return (
      <p className="outcome" role="status">
        <span className="meta">Running the circuit in this tab…</span>
      </p>
    );
  }
  if (state.status === 'ok') {
    return (
      <div className="outcome" role="status">
        <p>{state.message}</p>
        {state.receipt ? (
          <p className="meta">
            {state.receipt.circuit} · accepted in {ms(state.receipt.durationMs)}
            {state.receipt.txId ? ` · ${state.receipt.txId.slice(0, 16)}…` : ''}
          </p>
        ) : null}
      </div>
    );
  }
  if (state.status === 'refused') {
    return (
      <div className="outcome outcome--refused" role="status">
        <code className="code">{state.refusal.code}</code>
        <p>{REFUSAL_MESSAGES[state.refusal.code]}</p>
        <p className="meta">
          Refused by {state.refusal.circuit} while the transaction was being built. Nothing reached the ledger.
        </p>
      </div>
    );
  }
  return (
    <div className="outcome outcome--refused" role="alert">
      <p>
        <strong>That did not run.</strong> {state.message}
      </p>
    </div>
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
  children?: ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/** A labelled control. `children` replaces the input when the control is a select or a group. */
export function Field({ label, hint, error, mono, children, inputProps }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children ? (
        children
      ) : (
        <input
          id={id}
          className={mono ? 'mono' : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          {...inputProps}
        />
      )}
      {error ? (
        <span className="bad" id={hintId}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

/** Key/value rows, the registry's own record format. */
export function KeyValues({ rows }: { rows: Array<{ label: string; value: ReactNode; mono?: boolean }> }) {
  return (
    <dl className="kv">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} style={{ display: 'contents' }}>
          <dt>{row.label}</dt>
          <dd className={row.mono ? 'num' : undefined}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionOpener({ title, dek, small }: { title: string; dek?: ReactNode; small?: boolean }) {
  return (
    <>
      <div className={small ? 'opener opener--sm' : 'opener'}>
        <h2 data-ghost={title}>{title}</h2>
        {dek ? <p className="dek">{dek}</p> : null}
      </div>
      <hr className={small ? 'dotrule dotrule--tight' : 'dotrule'} />
    </>
  );
}

export type StripState = 'none' | 'acknowledged' | 'encumbered' | 'settled';

/**
 * A record's tally, cut from its own commitment. How much ink is on the strip is its status:
 * nothing printed means the buyer has not acknowledged it; the buyer's blue half alone means
 * acknowledged and free; both halves in register means encumbered; a worn overprint struck through
 * means settled.
 */
export function TallyStrip({ seed, state, label }: { seed: string; state: StripState; label?: string }) {
  const N = notches(seed);
  const worn = state === 'settled';
  const both = state === 'encumbered' || state === 'settled';
  const k = worn ? 0.72 : 1;
  const layers =
    state === 'none'
      ? []
      : [
          { color: '#0000FE', angle: 15, cell: 2.7, seed: `${seed}-foil`, view: STRIP_VIEW, draw: bar('foil', N, k) },
          ...(both
            ? [
                {
                  color: '#FF48B0',
                  angle: 75,
                  cell: 2.7,
                  seed: `${seed}-stock`,
                  view: STRIP_VIEW,
                  draw: bar('stock', N, k),
                },
              ]
            : []),
        ];
  return (
    <Press className="rec-strip" aspect="660/116" layers={layers} revision={`${seed}-${state}`} label={label}>
      {state === 'none' ? (
        <svg
          className="anno"
          viewBox="-330 -58 660 116"
          role="img"
          aria-label="Nothing printed: the buyer has not acknowledged this receivable."
        >
          <path
            d="M-300,-16 H222 V-32 H290 Q300,-32 300,-22 V10 Q300,20 290,20 H-300 Z"
            fill="none"
            stroke="#0000FE"
            strokeWidth="1.6"
            strokeDasharray="8 6"
            vectorEffect="non-scaling-stroke"
            opacity=".7"
          />
        </svg>
      ) : null}
      {worn ? (
        <svg className="anno" viewBox="-330 -58 660 116" aria-hidden="true">
          <path d="M-308 24 L308 -20" fill="none" stroke="#0000FE" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </Press>
  );
}

export function Busy({ children }: { children?: ReactNode }) {
  return (
    <div className="panel" role="status" aria-live="polite">
      <p className="lbl">Working</p>
      <p>{children ?? 'Running the contract constructor in this tab. It takes a second.'}</p>
    </div>
  );
}
