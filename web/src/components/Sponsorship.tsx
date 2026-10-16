// SPDX-License-Identifier: Apache-2.0
//
// Fee sponsorship, as a section rather than a promise.
//
// Every Midnight transaction pays a fee in DUST, DUST is generated only by registered NIGHT, and
// a debtor confirming an invoice their employer owes is a finance clerk who will not be made to
// acquire a token first. The official sponsorship pattern removes that step, and a wallet holding
// zero DUST really did transact on preview — the transaction is linked below.
//
// Two honesty rules hold this section together. The numbers come from the evidence file the CLI
// wrote, never from prose; and the sponsor service is a thing you run, not a thing this site
// hosts, so the panel says whether one is configured for this build instead of implying a live
// endpoint that is not there.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyValues } from './ui.js';
import { SPONSORSHIP, txUrl, when } from '../lib/evidence.js';
import { shortHex } from '../lib/format.js';

/** A sponsor endpoint this build was told about, if any. Unset in every public build so far. */
const SPONSOR_URL = import.meta.env.VITE_SPONSOR_URL;

type Liveness = 'unconfigured' | 'probing' | 'answering' | 'silent';

function useSponsorLiveness(): Liveness {
  const [state, setState] = useState<Liveness>(SPONSOR_URL ? 'probing' : 'unconfigured');
  useEffect(() => {
    if (!SPONSOR_URL) return undefined;
    let live = true;
    const base = SPONSOR_URL.endsWith('/') ? SPONSOR_URL : `${SPONSOR_URL}/`;
    fetch(new URL('healthz', base), { signal: AbortSignal.timeout(2500) })
      .then((response) => {
        if (live) setState(response.ok ? 'answering' : 'silent');
      })
      .catch(() => {
        if (live) setState('silent');
      });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

const LIVENESS_TEXT: Record<Liveness, string> = {
  unconfigured:
    'No sponsor endpoint is hosted with this site, so nothing on this page is sponsoring anything right now. The sponsor runs beside the wallet that pays — ours ran on the machine that produced the transaction below. What is published here is the transaction, not a service.',
  probing: 'Checking whether the sponsor this build was pointed at is answering…',
  answering: 'The sponsor this build was pointed at is answering, so a zero-DUST submission can be made from here.',
  silent:
    'This build was pointed at a sponsor, and it is not answering. Zero-DUST submission is therefore unavailable right now — which is what this says instead of pretending otherwise.',
};

/** A Bech32m wallet address, short enough for a record row and still recognisable. */
const shortAddress = (value: string | undefined): string =>
  value === undefined ? '—' : value.length <= 30 ? value : `${value.slice(0, 22)}…${value.slice(-6)}`;

export function Sponsorship() {
  const liveness = useSponsorLiveness();
  const run = SPONSORSHIP;
  const step = run?.steps[0];
  const url = run && step?.txHash ? txUrl(run.network, step.txHash) : undefined;

  return (
    <div className="spons">
      <div className="spons-copy">
        <p>
          Every transaction on Midnight pays its fee in DUST. DUST is generated only by registered NIGHT, it cannot be
          transferred, and a contract cannot hold any. Taken literally, that means the buyer’s accounts-payable clerk
          has to acquire a crypto token before confirming that an invoice is real — which is not going to happen.
        </p>
        <p>
          <b>It does not have to.</b> The party acting proves the circuit, balances the shielded and unshielded sides,
          signs and binds the transaction; a sponsor balances the DUST and submits it. The registry authenticates by
          secret knowledge, not by who paid the fee, so the sponsor buys a block slot and learns nothing — it never
          sees an invoice, a party or an amount.
        </p>
        <p className="spons-live">{LIVENESS_TEXT[liveness]}</p>
      </div>

      {run && step ? (
        <div className="panel spons-proof">
          <p className="lbl">It has actually happened</p>
          <h3>A wallet with no DUST transacted on preview.</h3>
          <KeyValues
            rows={[
              { label: 'Acting wallet', value: shortAddress(run.wallet.address), mono: true },
              { label: 'Its DUST before', value: `${run.wallet.dustBefore ?? '—'} SPECK`, strong: true },
              { label: 'Its DUST after', value: `${run.wallet.dustAfter ?? '—'} SPECK`, strong: true },
              { label: 'Its NIGHT', value: `${run.wallet.nightStar ?? '—'} STAR · ${run.wallet.registered ?? 0} registered for DUST` },
              { label: 'Circuit it ran', value: step.circuit ?? '—', mono: true },
              {
                label: 'Transaction',
                value: url ? <a href={url}>{shortHex(step.txHash, 10, 6)}</a> : shortHex(step.txHash, 10, 6),
                mono: true,
              },
              { label: 'Block', value: step.blockHeight ? String(step.blockHeight) : '—', mono: true },
              { label: 'Fee, paid by the sponsor', value: `${run.totalFeeSpeck ?? step.feeSpeck ?? '—'} SPECK` },
              { label: 'Run at', value: when(run.at) },
            ]}
          />
          <p className="hint">
            Read before the run and again afterwards: zero both times, so it could not have paid. The full record is on{' '}
            <Link to="/proof">the proof page</Link>, from the file the command-line tool wrote.
          </p>
        </div>
      ) : (
        <div className="panel panel--quiet spons-proof">
          <p className="lbl">It has not happened in this build</p>
          <h3>No sponsored transaction is recorded here.</h3>
          <p>
            Nothing on this page claims one. When the command-line tool writes a zero-DUST run, its wallet balances and
            its transaction hash appear here, read from that file.
          </p>
        </div>
      )}
    </div>
  );
}
