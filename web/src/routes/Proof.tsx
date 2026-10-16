// SPDX-License-Identifier: Apache-2.0
//
// The evidence page. It reads whatever the CLI wrote into `cli/deployments/` and `cli/evidence/`
// at build time. If nothing is there, this page says so plainly — it never claims a deployment,
// it never turns a local devnet into a public one, and it never claims an audit.
import { Link } from 'react-router-dom';
import { Footer, Topbar } from '../components/chrome.js';
import { KeyValues, SectionOpener, useTitle } from '../components/ui.js';
import {
  DEPLOYMENTS,
  EVIDENCE,
  FEDERATION,
  SPONSORSHIP,
  addressUrl,
  hasProof,
  isLocal,
  subscanUrl,
  txUrl,
  when,
  type Deployment,
  type FederationVerdict,
} from '../lib/evidence.js';
import { ms, shortHex } from '../lib/format.js';

const NETWORK_LABEL: Record<string, string> = {
  undeployed: 'local devnet',
  preview: 'preview',
  preprod: 'preprod',
};

/**
 * One network now holds two registries, so a deployment is named by the cross-registry run that
 * used it rather than by its network alone. A deployment no run has touched keeps its own name.
 */
const registryOf = (address: string) => FEDERATION?.registries.find((r) => r.contractAddress === address);

const deploymentTitle = (deployment: Deployment): string => {
  const registry = registryOf(deployment.contractAddress);
  const where = NETWORK_LABEL[deployment.network] ?? deployment.network;
  return registry
    ? `Registry ${registry.role} — ${registry.name}, on ${where}`
    : `Deployed on the ${where}`;
};

/**
 * The explorer keys a transaction by its ledger hash, so a link needs the hash the tool recorded
 * next to the identifier. Without one, the identifier is still shown — as text, not as a dead link.
 */
function TxLink({
  network,
  txId,
  txHash,
  blockHeight,
  deployment,
}: {
  network: string;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  deployment?: Deployment;
}) {
  const label = shortHex(txHash ?? txId ?? '', 10, 6);
  const url = txUrl(network, txHash, deployment);
  const subscan = subscanUrl(network, blockHeight, deployment);
  if (!url) return <span className="mono">{label}</span>;
  return (
    <span className="mono">
      <a href={url}>{label}</a>
      {subscan ? (
        <>
          {' · '}
          <a href={subscan}>subscan</a>
        </>
      ) : null}
    </span>
  );
}

/**
 * One cross-registry answer: who was asked, what each said, and what the lender concludes. The
 * conclusion is the file's own, not this page's arithmetic — and an incomplete answer says so
 * rather than being rounded to "free".
 */
function Verdict({ verdict }: { verdict: FederationVerdict }) {
  const rows = [
    { ...verdict.here, role: 'the lender’s own registry' },
    ...verdict.peers.map((peer) => ({ ...peer, role: 'a declared peer' })),
  ];
  return (
    <div className="verdict-block">
      <p className="verdict-subject">{verdict.subject}</p>
      <p className="mono">marker {verdict.nullifier}</p>
      <ol className="steps-list">
        {rows.map((row) => (
          <li key={row.contractAddress}>
            <span>
              <strong>{registryOf(row.contractAddress)?.name ?? shortHex(row.contractAddress, 10, 6)}</strong>
              <span className="mono"> · {row.role}</span>
            </span>
            <span className="mono">{row.unreachable ? 'did not answer' : row.encumbrance}</span>
          </li>
        ))}
      </ol>
      <p className="verdict-sum">
        <strong>{verdict.encumberedAnywhere ? 'Encumbered somewhere.' : 'Free everywhere asked.'}</strong>{' '}
        {verdict.complete
          ? 'Every registry answered.'
          : 'One registry did not answer, so this is what was learned, not what is true everywhere.'}
      </p>
    </div>
  );
}

export function Proof() {
  useTitle('Proof');
  // Local aliases: an imported binding is not narrowed inside the callbacks below.
  const sponsorship = SPONSORSHIP;
  const federation = FEDERATION;
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
              level="h1"
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
                  {
                    label: 'Mainnet',
                    value: 'no — permissionless mainnet deployment opened on 28 Sept 2026 and this is not through it',
                  },
                ]}
              />
            </section>
          ) : null}

          {DEPLOYMENTS.map((deployment) => {
            const local = isLocal(deployment.network);
            const address = addressUrl(deployment.network, deployment.contractAddress, deployment);
            const registry = registryOf(deployment.contractAddress);
            return (
              <section className="panel" key={deployment.scope}>
                <h3>{deploymentTitle(deployment)}</h3>
                {registry ? (
                  <p>
                    Its own key ceremony: a different operator, a different disclosure key and a different three
                    keyholders from the other registry. It runs the same sixteen-circuit build from the same compiled
                    artifacts — a rival running the same software, not a second copy of our book.
                  </p>
                ) : null}
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
                        <TxLink
                          network={deployment.network}
                          txId={deployment.deployTx}
                          txHash={deployment.deployTxHash}
                          deployment={deployment}
                        />
                      ) : (
                        '—'
                      ),
                      mono: true,
                    },
                    { label: 'Deployed at', value: when(deployment.deployedAt) },
                    ...(registry?.operatorId
                      ? [{ label: 'Operator id', value: shortHex(registry.operatorId, 12, 6), mono: true }]
                      : []),
                    ...(registry
                      ? [
                          {
                            label: 'Peers declared on chain',
                            value:
                              FEDERATION?.registries
                                .filter((other) => other.contractAddress !== registry.contractAddress)
                                .map((other) => `${other.name} (${shortHex(other.contractAddress, 8, 4)})`)
                                .join(', ') || 'none',
                          },
                        ]
                      : []),
                    {
                      label: 'Verifier keys added afterwards',
                      value:
                        deployment.maintenanceTxs && deployment.maintenanceTxs.length > 0 ? (
                          <span>
                            {deployment.maintenanceTxs.length} maintenance transactions ·{' '}
                            {deployment.maintenanceTxs.map((tx, i) => (
                              <span key={tx.txHash ?? tx.txId ?? i}>
                                {i > 0 ? ' ' : ''}
                                <TxLink
                                  network={deployment.network}
                                  txId={tx.txId}
                                  txHash={tx.txHash}
                                  deployment={deployment}
                                />
                              </span>
                            ))}
                          </span>
                        ) : (
                          '0 maintenance transactions'
                        ),
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
                          <TxLink
                            network={network}
                            txId={step.txId}
                            txHash={step.txHash}
                            blockHeight={step.blockHeight}
                            deployment={deployment}
                          />
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

          {sponsorship && sponsorship.steps.length > 0 ? (
            <section className="panel">
              <h3>A party holding zero DUST transacted anyway</h3>
              <p className="mono">{sponsorship.file}</p>
              <p>{sponsorship.claim}</p>
              <KeyValues
                rows={[
                  { label: 'Network', value: NETWORK_LABEL[sponsorship.network] ?? sponsorship.network },
                  { label: 'Acting wallet', value: sponsorship.wallet.address ?? '—', mono: true },
                  { label: 'Its DUST before', value: `${sponsorship.wallet.dustBefore ?? '—'} SPECK`, strong: true },
                  { label: 'Its DUST after', value: `${sponsorship.wallet.dustAfter ?? '—'} SPECK`, strong: true },
                  {
                    label: 'Its NIGHT',
                    value: `${sponsorship.wallet.nightStar ?? '—'} STAR · ${sponsorship.wallet.registered ?? 0} UTXO(s) registered for DUST generation`,
                  },
                  { label: 'Paid by the sponsor', value: `${sponsorship.totalFeeSpeck ?? '—'} SPECK` },
                  { label: 'Run at', value: when(sponsorship.at) },
                ]}
              />
              <p className="lbl">What it submitted</p>
              <ol className="steps-list">
                {sponsorship.steps.map((step, i) => (
                  <li key={step.txId ?? i}>
                    <span>
                      <strong>{step.label}</strong>
                      {step.circuit ? <span className="mono"> · {step.circuit}</span> : null}
                    </span>
                    <span className="mono">
                      <TxLink
                        network={sponsorship.network}
                        txId={step.txId}
                        txHash={step.txHash}
                        blockHeight={step.blockHeight}
                      />
                      {step.blockHeight ? ` · block ${step.blockHeight}` : ''}
                      {step.feeSpeck ? ` · ${step.feeSpeck} SPECK` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {federation ? (
            <section className="panel">
              <h3>Two registries, and the question a lender puts to both</h3>
              <p className="mono">{federation.file}</p>
              <p>{federation.claim}</p>

              <p className="lbl">The registries</p>
              <ol className="steps-list">
                {federation.registries.map((registry) => {
                  const url = addressUrl(federation.network, registry.contractAddress);
                  return (
                    <li key={registry.contractAddress}>
                      <span>
                        <strong>
                          {registry.role} · {registry.name}
                        </strong>
                        {registry.operatorId ? (
                          <span className="mono"> · operator {shortHex(registry.operatorId, 10, 4)}</span>
                        ) : null}
                      </span>
                      <span className="mono">
                        {url ? (
                          <a href={url}>{shortHex(registry.contractAddress, 12, 8)}</a>
                        ) : (
                          shortHex(registry.contractAddress, 12, 8)
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {federation.marker ? (
                <KeyValues
                  rows={[
                    { label: 'Receivable', value: `invoice #${federation.marker.invoiceNo ?? '—'}` },
                    { label: 'Marker on A’s ledger', value: federation.marker.computedInA ?? '—', mono: true },
                    { label: 'Marker on B’s ledger', value: federation.marker.computedInB ?? '—', mono: true },
                    {
                      label: 'Keyed identically by both',
                      value: federation.marker.identical ? 'yes' : 'no',
                      strong: true,
                    },
                  ]}
                />
              ) : null}

              <p className="lbl">What happened, in order</p>
              <ol className="steps-list">
                {federation.steps.map((step, i) => (
                  <li key={step.id ?? i}>
                    <span>
                      <strong>{step.label}</strong>
                      {step.registry ? <span className="mono"> · {step.registry}</span> : null}
                      {step.circuit ? <span className="mono"> · {step.circuit}</span> : null}
                      {step.refused ? (
                        <>
                          {' '}
                          <code className="code">{step.refused}</code>
                        </>
                      ) : null}
                      {step.note ? <span className="fed-step-note">{step.note}</span> : null}
                    </span>
                    <span className="mono">
                      {step.txId ? (
                        <TxLink
                          network={federation.network}
                          txId={step.txId}
                          txHash={step.txHash}
                          blockHeight={step.blockHeight}
                        />
                      ) : step.refused ? (
                        'never submitted'
                      ) : (
                        'off chain'
                      )}
                      {step.blockHeight ? ` · block ${step.blockHeight}` : ''}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="lbl">The answers a lender gets</p>
              {federation.verdicts.map((verdict) => (
                <Verdict key={verdict.subject} verdict={verdict} />
              ))}
            </section>
          ) : null}

          <section className="panel panel--quiet">
            <h3>Honest limits</h3>
            <ul className="seelist seelist--blind">
              <li>
                <span>Nothing here has been audited.</span>
              </li>
              <li>
                <span>
                  Nothing is deployed to Midnight mainnet. Permissionless mainnet contract deployment went live on
                  28 September 2026, so there is no longer a gate to point at — the registry simply is not there yet,
                  and this page will say so until it is.
                </span>
              </li>
              <li>
                <span>
                  One registry cannot see another. Harbour’s contract accepted a receivable already pledged in Stock
                  &amp; Foil, in block 1322275, and no contract could have refused it — what catches that is the
                  lender’s cross-registry check, run before the advance, not the ledger.
                </span>
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
