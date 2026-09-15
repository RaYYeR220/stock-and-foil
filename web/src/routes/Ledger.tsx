// SPDX-License-Identifier: Apache-2.0
//
// The public ledger explorer: everything the chain holds, and a plain statement of what cannot be
// derived from it. Nothing on this page is privileged — it is built from the same `publicState()`
// any observer can read.
import { encumbranceOf } from '../lib/sdk.js';
import { KeyValues, SectionOpener, TallyStrip } from '../components/ui.js';
import { day, money, shortField, shortHex } from '../lib/format.js';
import { useRegistry } from '../state/registry.js';

const STATUS_TAG: Record<string, string> = {
  OFFERED: 'tag tag--plain',
  PLEDGED: 'tag',
  RELEASED: 'tag tag--quiet',
  SETTLED: 'tag tag--plain',
};

export function Ledger() {
  const { view, now } = useRegistry();
  if (!view) return null;
  const { counts } = view;

  return (
    <>
      <div className="pagehead">
        <p className="crumb">
          <i aria-hidden="true" />
          Public ledger · block time {day(now)}
        </p>
        <SectionOpener
          title="What the chain sees."
          small
          dek="Marks, not documents. Every value below is readable by anyone with the contract address, and none of it can be turned back into an invoice, a party or a position."
        />
      </div>

      <div className="counts" data-testid="counts">
        {[
          ['Debtors', counts.debtors],
          ['Financiers', counts.financiers],
          ['Acknowledgments', counts.acks],
          ['Pledge markers', counts.pledges],
          ['Sealed records', counts.records],
          ['Certificates', counts.certificates],
          ['Disclosure requests', counts.requests],
          ['Sealed shares', counts.shares],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <strong>{String(value)}</strong>
            <span>{String(label)}</span>
          </div>
        ))}
      </div>

      <section className="sec sec--tight">
        <SectionOpener
          title="Pledge markers."
          small
          dek="One entry per receivable that has ever been offered. A marker is a hash of the invoice under a domain nobody can invert, so it names a receivable without describing it."
        />
        {view.pledges.length === 0 ? (
          <p className="empty">
            No receivable has been offered yet. Run the <a href="/app/replay">guided replay</a>, or offer one from the
            seller’s workspace.
          </p>
        ) : (
          <div className="grid grid--3">
            {view.pledges.map((pledge) => {
              const free = encumbranceOf(pledge, now);
              return (
                <article className="rec" key={pledge.nullifier}>
                  <div className="rec-head">
                    <span className="id">{shortHex(pledge.nullifier, 10, 6)}</span>
                    <span className={STATUS_TAG[pledge.status] ?? 'tag'}>{pledge.status}</span>
                  </div>
                  <TallyStrip
                    seed={pledge.nullifier}
                    state={
                      pledge.status === 'SETTLED' ? 'settled' : free === 'ENCUMBERED' ? 'encumbered' : 'acknowledged'
                    }
                    label={`Pledge ${shortHex(pledge.nullifier)}, status ${pledge.status.toLowerCase()}.`}
                  />
                  <KeyValues
                    rows={[
                      { label: 'Holder tag', value: shortField(BigInt(pledge.holderTag)), mono: true },
                      { label: 'Expires', value: pledge.expiry > 0n ? day(pledge.expiry) : '—' },
                      { label: 'Sealed record', value: shortHex(pledge.recordId), mono: true },
                      { label: 'Payee tag', value: pledge.payeeTag === '0' ? '—' : shortField(BigInt(pledge.payeeTag)), mono: true },
                      { label: 'Settled amount', value: pledge.amount > 0n ? money(pledge.amount) : '—' },
                      { label: 'Claimed', value: pledge.claimed ? 'yes' : 'no' },
                      { label: 'Available to finance', value: free === 'FREE' ? 'yes' : free === 'SETTLED' ? 'no, settled' : 'no' },
                    ]}
                  />
                  <p className="rec-note">
                    {free === 'ENCUMBERED'
                      ? 'A second offer against this marker cannot be proved. That is all another lender learns.'
                      : free === 'SETTLED'
                        ? 'Settled and closed. A settled receivable can never be pledged again.'
                        : 'Free: released, expired or never taken up. It can be offered again.'}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="sec sec--tight">
        <SectionOpener
          title="Sealed records."
          small
          dek="Each offer writes an encrypted copy of the receivable, masked field by field to a key that exists only as three shares. These are the ciphertexts, in full."
        />
        {view.records.length === 0 ? (
          <p className="empty">No sealed records yet.</p>
        ) : (
          <div className="grid grid--2">
            {view.records.map((record) => (
              <article className="panel" key={record.recordId}>
                <p className="lbl">Record {shortHex(record.recordId, 10, 6)}</p>
                <KeyValues
                  rows={[
                    { label: 'Cipher version', value: String(record.version) },
                    { label: 'Ephemeral point x', value: shortField(record.E.x, 10, 8), mono: true },
                    { label: 'Ephemeral point y', value: shortField(record.E.y, 10, 8), mono: true },
                    ...record.ct.map((value, i) => ({
                      label: `Masked field ${i}`,
                      value: shortField(value, 12, 10),
                      mono: true,
                    })),
                  ]}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="sec sec--tight">
        <SectionOpener
          title="Borrowing-base certificates."
          small
          dek="A certificate proves a pool of receivables clears a floor and locks each of them to one lender. The floor is public; the line items are not."
        />
        {view.certificates.length === 0 ? (
          <p className="empty">No certificates yet.</p>
        ) : (
          <div className="grid grid--2">
            {view.certificates.map((cert) => (
              <article className="panel" key={cert.certId}>
                <p className="lbl">Certificate {shortHex(cert.certId, 10, 6)}</p>
                <KeyValues
                  rows={[
                    { label: 'Floor proved', value: money(cert.floor) },
                    { label: 'Invoices locked', value: String(cert.count) },
                    { label: 'Valid until', value: day(cert.validUntil) },
                    { label: 'Lender reference', value: shortHex(cert.lenderRef), mono: true },
                    { label: 'Borrower commitment', value: shortHex(cert.borrowerCommit), mono: true },
                    ...cert.nullifiers.map((n, i) => ({
                      label: `Locked marker ${i + 1}`,
                      value: shortHex(n),
                      mono: true,
                    })),
                  ]}
                />
                <p className="rec-note">
                  Only the lender who chose the nonce can test the borrower commitment, so the certificate identifies
                  its borrower to that lender and to nobody else.
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="sec sec--tight">
        <SectionOpener
          title="Disclosure requests."
          small
          dek="Asking to open a record is a public act. The approvals are public too; the contents are not."
        />
        {view.requests.length === 0 ? (
          <p className="empty">No disclosure has been requested.</p>
        ) : (
          <div className="grid grid--2">
            {view.requests.map((request) => (
              <article className="panel" key={request.requestId}>
                <p className="lbl">Request {shortHex(request.requestId, 10, 6)}</p>
                <KeyValues
                  rows={[
                    { label: 'Record', value: shortHex(request.recordId), mono: true },
                    { label: 'Case reference', value: shortHex(request.caseRef), mono: true },
                    {
                      label: 'Approvals',
                      value: request.approvals
                        .map((a, i) => `keyholder ${i + 1} ${a ? 'approved' : 'pending'}`)
                        .join(' · '),
                    },
                    {
                      label: 'Threshold',
                      value: `${request.approvals.filter(Boolean).length} of ${view.config.threshold} collected`,
                    },
                  ]}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="sec sec--tight">
        <div className="grid grid--2">
          <div className="panel">
            <h3>Sealed configuration</h3>
            <p>Fixed at deployment and readable by anyone. It says who may admit and who may approve, never who they are.</p>
            <KeyValues
              rows={[
                { label: 'Operator id', value: shortHex(view.config.operatorId), mono: true },
                { label: 'Disclosure key x', value: shortField(view.config.disclosurePk.x, 10, 8), mono: true },
                ...view.config.keyholderPks.map((pk, i) => ({
                  label: `Keyholder ${i + 1} key x`,
                  value: shortField(pk.x, 10, 8),
                  mono: true,
                })),
                { label: 'Auditor key x', value: shortField(view.config.auditorPk.x, 10, 8), mono: true },
                { label: 'Threshold', value: `${view.config.threshold} of 3` },
                { label: 'Settlement token', value: shortHex(view.config.settlementColor), mono: true },
              ]}
            />
          </div>
          <div className="panel panel--quiet">
            <h3>What cannot be derived from any of this</h3>
            <ul className="seelist seelist--blind">
              <li>
                <span>
                  <b>The invoice.</b> A pledge marker is a hash of the whole invoice under its own domain separator,
                  and the supplier salts the invoice before the buyer acknowledges it — so guessing a known invoice
                  will not reproduce the marker.
                </span>
              </li>
              <li>
                <span>
                  <b>Who holds a pledge.</b> Holder tags are derived per pledge from the financier’s secret, so two
                  tags of the same financier cannot be linked to each other.
                </span>
              </li>
              <li>
                <span>
                  <b>Which buyer acknowledged what.</b> Acknowledgment leaves are unlinkable to pledge markers without
                  the invoice.
                </span>
              </li>
              <li>
                <span>
                  <b>The contents of a sealed record.</b> Only two of three keyholders together can produce the shared
                  secret that masks it.
                </span>
              </li>
              <li>
                <span>
                  <b>The line items of a borrowing base.</b> The certificate proves a floor and a count.
                </span>
              </li>
            </ul>
            <p className="rec-note">
              The one thing settlement does reveal is the amount and the paying and receiving addresses, because
              contract custody of shielded tokens is not available yet. That limit is published rather than hidden.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
