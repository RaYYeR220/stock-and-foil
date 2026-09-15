// SPDX-License-Identifier: Apache-2.0
//
// The evidence page. It reads whatever the CLI wrote into `cli/deployments/` and `cli/evidence/`
// at build time. If nothing is there, this page says so plainly — it never claims a deployment,
// it never turns a local devnet into a public one, and it never claims an audit.
import { Link } from 'react-router-dom';
import { Footer, Topbar } from '../components/chrome.js';
import { KeyValues, SectionOpener } from '../components/ui.js';
import {
  DEPLOYMENTS,
  EVIDENCE,
  addressUrl,
  hasProof,
  isLocal,
  subscanUrl,
  txUrl,
  when,
  type Deployment,
} from '../lib/evidence.js';
import { ms, shortHex } from '../lib/format.js';

const NETWORK_LABEL: Record<string, string> = {
  undeployed: 'local devnet',
  preview: 'preview',
  preprod: 'preprod',
};

function TxLink({ network, txId, deployment }: { network: string; txId: string; deployment?: Deployment }) {
  const url = txUrl(network, txId, deployment);
  const subscan = subscanUrl(network, txId);
  if (!url) return <span className="mono">{shortHex(txId, 10, 6)}</span>;
  return (
    <span className="mono">
      <a href={url}>{shortHex(txId, 10, 6)}</a>
      {subscan ? (
        <>
          {' · '}
          <a href={subscan}>subscan</a>
        </>
      ) : null}
    </span>
  );
}

export function Proof() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Topbar cta={{ to: '/app/replay', label: 'Run the replay' }} />
      <main id="main" className="page">
        <div className="shell shell--wide">
          <div className="pagehead">
            <p className="crumb">
              <i aria-hidden="true" />
              Proof · what was deployed and what was run
            </p>
            <SectionOpener
              title="Show your working."
              small
              dek="Generated from the files the command-line tool wrote when it deployed the contract and ran the scenario against it. Nothing on this page is typed by hand, and a run on a local devnet is labelled as one."
            />
          </div>

          {!hasProof ? (
            <section className="panel">
              <h3>Not deployed yet</h3>
              <p>
                No deployment or evidence file was present when this site was built, so there is nothing to show. That
                is the honest state, and it is the state this page will keep reporting until the tool writes one.
              </p>
              <p>
                Everything the registry does is still runnable right now: the{' '}
                <Link to="/app/replay">guided replay</Link> executes the same compiled circuits in your browser, with no
                chain and no wallet.
              </p>
              <KeyValues
                rows={[
                  { label: 'Deployment files found', value: '0' },
                  { label: 'Evidence files found', value: '0' },
                  { label: 'Audited', value: 'no — nothing here has been audited' },
                  { label: 'Mainnet', value: 'no — mainnet deployment is gated by the Foundation' },
                ]}
              />
            </section>
          ) : null}

          {DEPLOYMENTS.map((deployment) => {
            const local = isLocal(deployment.network);
            const address = addressUrl(deployment.network, deployment.contractAddress, deployment);
            return (
              <section className="panel" key={deployment.network}>
                <h3>Deployed on the {NETWORK_LABEL[deployment.network] ?? deployment.network}</h3>
                {local ? (
                  <p>
                    A devnet running on the machine that built this site. It proves the contract compiles, deploys and
                    executes with real proofs — it is not something you can look up in a public explorer, and this page
                    does not pretend otherwise.
                  </p>
                ) : null}
                <KeyValues
                  rows={[
                    {
                      label: 'Contract address',
                      value: address ? (
                        <a href={address}>{deployment.contractAddress}</a>
                      ) : (
                        deployment.contractAddress
                      ),
                      mono: true,
                    },
                    {
                      label: 'Deploy transaction',
                      value: deployment.deployTx ? (
                        <TxLink network={deployment.network} txId={deployment.deployTx} deployment={deployment} />
                      ) : (
                        '—'
                      ),
                      mono: true,
                    },
                    { label: 'Deployed at', value: when(deployment.deployedAt) },
                    {
                      label: 'Verifier keys added afterwards',
                      value: `${deployment.maintenanceTxs?.length ?? 0} maintenance transactions`,
                    },
                    { label: 'Compact version', value: deployment.compactVersion ?? '—' },
                    {
                      label: 'Settlement token',
                      value: deployment.settlementColor ? shortHex(deployment.settlementColor) : '—',
                      mono: true,
                    },
                  ]}
                />
              </section>
            );
          })}

          {EVIDENCE.map((evidence) => {
            const deployment = DEPLOYMENTS.find((d) => d.network === evidence.network);
            const network = evidence.network ?? deployment?.network ?? 'preprod';
            return (
              <section className="panel" key={evidence.file}>
                <h3>Scenario run</h3>
                <p className="mono">{evidence.file}</p>
                <KeyValues
                  rows={[
                    { label: 'Network', value: NETWORK_LABEL[network] ?? network },
                    { label: 'Started', value: when(evidence.startedAt) },
                    { label: 'Finished', value: when(evidence.finishedAt) },
                    { label: 'Steps', value: String(evidence.steps.length) },
                    { label: 'Transactions on chain', value: String(evidence.transactions) },
                    { label: 'Refused as designed', value: String(evidence.refusals.length) },
                  ]}
                />

                {evidence.refusals.length > 0 ? (
                  <>
                    <p className="lbl">Refusals the contract produced</p>
                    <ol className="steps-list">
                      {evidence.refusals.map((refusal, i) => (
                        <li key={`${refusal.code}-${i}`}>
                          <span>{refusal.label}</span>
                          <span>
                            <code className="code">{refusal.code}</code>
                            {refusal.circuit ? <span className="mono"> · {refusal.circuit}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}

                {evidence.disclosure ? (
                  <>
                    <p className="lbl">Threshold disclosure</p>
                    <KeyValues
                      rows={[
                        { label: 'Record opened', value: shortHex(evidence.disclosure.recordId), mono: true },
                        {
                          label: 'Approvals',
                          value:
                            evidence.disclosure.approvals?.map((a, i) => `${i + 1}${a ? '✓' : '·'}`).join('  ') ?? '—',
                          mono: true,
                        },
                        { label: 'Shares combined', value: evidence.disclosure.shamirIndices?.join(' and ') ?? '—' },
                        {
                          label: 'Marker recomputed from the plaintext',
                          value: shortHex(evidence.disclosure.recomputedNullifier),
                          mono: true,
                        },
                        {
                          label: 'Marker the record was filed under',
                          value: shortHex(evidence.disclosure.ledgerNullifier),
                          mono: true,
                        },
                        { label: 'Self-verified', value: evidence.disclosure.verified ? 'yes' : 'no' },
                      ]}
                    />
                  </>
                ) : null}

                {evidence.counts.length > 0 ? (
                  <div className="counts">
                    {evidence.counts.map((count) => (
                      <div key={count.label}>
                        <strong>{count.value}</strong>
                        <span>{count.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <p className="lbl">Every step, in order</p>
                <ol className="steps-list">
                  {evidence.steps.map((step, i) => (
                    <li key={`${step.id ?? step.label}-${i}`}>
                      <span>
                        <strong>{step.label}</strong>
                        {step.circuit ? <span className="mono"> · {step.circuit}</span> : null}
                        {step.refused ? (
                          <>
                            {' '}
                            <code className="code">{step.refused}</code>
                          </>
                        ) : null}
                      </span>
                      <span className="mono">
                        {step.txId ? (
                          <TxLink network={network} txId={step.txId} deployment={deployment} />
                        ) : step.refused ? (
                          'never submitted'
                        ) : (
                          '—'
                        )}
                        {step.blockHeight ? ` · block ${step.blockHeight}` : ''}
                        {step.durationMs ? ` · ${ms(step.durationMs)}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}

          <section className="panel panel--quiet">
            <h3>Honest limits</h3>
            <ul className="seelist seelist--blind">
              <li>
                <span>Nothing here has been audited.</span>
              </li>
              <li>
                <span>Nothing is deployed to mainnet; mainnet deployment goes through the Foundation.</span>
              </li>
              <li>
                <span>
                  A buyer and a supplier who collude can still acknowledge an invoice that does not exist. The registry
                  makes that non-repudiable rather than impossible.
                </span>
              </li>
              <li>
                <span>
                  Settlement is unshielded, so paying through the contract reveals the amount and the paying and
                  receiving addresses.
                </span>
              </li>
              <li>
                <span>The disclosure key was produced by a dealer, not a distributed key generation.</span>
              </li>
              <li>
                <span>Two keyholders who collude could decrypt a record without an on-chain request.</span>
              </li>
              <li>
                <span>Invoices are entered by hand. There is no ERP integration yet.</span>
              </li>
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
