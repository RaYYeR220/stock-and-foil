// SPDX-License-Identifier: Apache-2.0
//
// Auditor and keyholder workspaces. A disclosure is public in its asking and private in its
// answer: the request and both approvals are on the ledger, the contents reach one auditor, and
// what it gets proves itself against the ledger keys it was filed under.
import { useState } from 'react';
import { fromHex, type Disclosure } from '../../lib/sdk.js';
import { Field, KeyValues, Outcome } from '../../components/ui.js';
import { labelToBytes32 } from '../../lib/book.js';
import { day, money, shortField, shortHex } from '../../lib/format.js';
import { useAction, useRegistry, useWorld } from '../../state/registry.js';

export function AuditorWork() {
  const world = useWorld();
  const { view } = useRegistry();
  const [caseRef, setCaseRef] = useState('Case 26-11049');
  const [opened, setOpened] = useState<Disclosure | null>(null);

  const request = useAction(async (recordId: string) => {
    const receipt = await world.auditor.request(recordId, labelToBytes32(caseRef));
    return {
      message: `Requested record ${shortHex(recordId)} under “${caseRef}”. Two of three keyholders must now approve, on the ledger.`,
      receipt,
    };
  });

  const open = useAction(async (requestId: string) => {
    const result = await world.auditor.open(requestId);
    setOpened(result);
    return {
      message: result.verified
        ? 'The record opened and proved itself against the ledger.'
        : 'Not enough approvals: what came out is not a readable record, and it does not verify. That is the honest answer, not an error.',
    };
  });

  const records = view?.records ?? [];
  const requests = view?.requests ?? [];

  return (
    <>
      <section className="panel">
        <h3>Request a record</h3>
        <p>
          You can name one sealed record and one case reference. Asking is public; it opens nothing by itself, and it
          cannot be done quietly.
        </p>
        <Field
          label="Case reference"
          hint="A public label for the matter. It is hashed into the request id."
          inputProps={{ value: caseRef, onChange: (e) => setCaseRef(e.target.value), maxLength: 32 }}
        />
        {records.length === 0 ? (
          <p className="empty">No sealed records exist yet. A supplier has to offer a receivable first.</p>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Masked fields</th>
                  <th>Already requested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const already = requests.some((r) => r.recordId === record.recordId);
                  return (
                    <tr key={record.recordId}>
                      <td className="num">{shortHex(record.recordId, 10, 6)}</td>
                      <td>{record.ct.length}</td>
                      <td>{already ? 'yes' : 'no'}</td>
                      <td>
                        <button
                          className="btn btn--sm"
                          type="button"
                          disabled={request.busy || !caseRef.trim()}
                          onClick={() => void request.run(record.recordId)}
                        >
                          Request disclosure
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Outcome state={request.state} />
      </section>

      <section className="panel">
        <h3>Open a request</h3>
        {requests.length === 0 ? (
          <p className="empty">Nothing has been requested yet.</p>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Record</th>
                  <th>Approvals</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.requestId}>
                    <td className="num">{shortHex(r.requestId, 10, 6)}</td>
                    <td className="num">{shortHex(r.recordId)}</td>
                    <td>
                      {r.approvals.filter(Boolean).length} of {view?.config.threshold ?? 2}
                    </td>
                    <td>
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        disabled={open.busy}
                        onClick={() => void open.run(r.requestId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Outcome state={open.state} />
      </section>

      {opened ? (
        <section className="panel" data-testid="disclosure">
          <h3>{opened.verified ? 'The record, opened' : 'Nothing readable came out'}</h3>
          <KeyValues
            rows={
              opened.verified
                ? [
                    { label: 'Invoice number', value: String(opened.invoice.invoiceNo) },
                    { label: 'Amount', value: money(opened.invoice.amount) },
                    { label: 'Due', value: day(opened.invoice.dueDate) },
                    { label: 'Holder tag', value: shortField(opened.holderTag), mono: true },
                    { label: 'Shares combined', value: opened.indices.join(' and ') },
                    { label: 'Recomputed pledge marker', value: shortHex(opened.nullifier), mono: true },
                    { label: 'Record id recomputes', value: opened.recordIdMatches ? 'yes' : 'no' },
                    { label: 'Disclosure verified', value: opened.verified ? 'yes' : 'no' },
                  ]
                : [
                    { label: 'Shares combined', value: opened.indices.length ? opened.indices.join(' and ') : 'none' },
                    { label: 'Threshold', value: `${view?.config.threshold ?? 2} approvals needed` },
                    { label: 'Disclosure verified', value: 'no' },
                  ]
            }
          />
          <p className="rec-note">
            {opened.verified
              ? 'The opened record recomputes the invoice fingerprint, hence the pledge marker and the record id, and both equal the ledger keys it was filed under. Nobody has to trust the auditor’s transcription.'
              : 'Fewer than two shares cannot reconstruct the masking secret, so the plaintext is noise and the self-check fails. This is what a disclosure without a threshold looks like.'}
          </p>
        </section>
      ) : null}
    </>
  );
}

export function KeyholderWork() {
  const world = useWorld();
  const { view } = useRegistry();
  const requests = view?.requests ?? [];

  const approve = useAction(async (index: 0 | 1 | 2, requestId: string) => {
    const receipt = await world.keyholders[index].approve(fromHex(requestId));
    return {
      message: `Keyholder ${index + 1} approved. Its share of the answer is on the ledger, sealed to the auditor’s key.`,
      receipt,
    };
  });

  return (
    <>
      <section className="panel">
        <h3>The bench</h3>
        <p>
          Three parties — say the operator, a court and a regulator — each hold one share of the disclosure key. Two
          must approve before a record can be opened, and approving is proved in circuit: a share is never published.
        </p>
        <KeyValues
          rows={world.keyholders.map((keyholder, i) => ({
            label: `Keyholder ${i + 1} · Shamir index ${keyholder.shamirIndex}`,
            value: shortField(keyholder.publicKey.x, 10, 8),
            mono: true,
          }))}
        />
      </section>

      <section className="panel">
        <h3>Requests waiting on you</h3>
        {requests.length === 0 ? (
          <p className="empty">No disclosure has been requested.</p>
        ) : (
          requests.map((request) => (
            <div key={request.requestId}>
              <p className="lbl">
                Request {shortHex(request.requestId, 10, 6)} · record {shortHex(request.recordId)}
              </p>
              <div className="row">
                {request.approvals.map((approved, i) => (
                  <div className="actions" key={i}>
                    <button
                      className={approved ? 'btn btn--sm btn--ghost' : 'btn btn--sm'}
                      type="button"
                      disabled={approved || approve.busy}
                      onClick={() => void approve.run(i as 0 | 1 | 2, request.requestId)}
                    >
                      {approved ? `Keyholder ${i + 1} approved` : `Approve as keyholder ${i + 1}`}
                    </button>
                  </div>
                ))}
              </div>
              <p className="hint">
                {request.approvals.filter(Boolean).length} of {view?.config.threshold ?? 2} approvals. The auditor can
                try to open at any point; below the threshold it gets nothing readable.
              </p>
            </div>
          ))
        )}
        <Outcome state={approve.state} />
      </section>
    </>
  );
}
