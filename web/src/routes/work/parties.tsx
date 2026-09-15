// SPDX-License-Identifier: Apache-2.0
//
// Operator and debtor workspaces. The operator admits; the buyer acknowledges and pays. Between
// them they hold the only two facts the registry trusts anybody for.
import { useState } from 'react';
import { pureCircuits } from '@stockandfoil/contract';
import { fromHex, generatePersona, toHex } from '../../lib/sdk.js';
import { Field, KeyValues, Outcome, Select } from '../../components/ui.js';
import { isHex32, useBook } from '../../lib/book.js';
import { day, money, shortHex } from '../../lib/format.js';
import { useAction, useRegistry, useWorld } from '../../state/registry.js';

export function OperatorWork() {
  const world = useWorld();
  const { view } = useRegistry();
  const [kind, setKind] = useState<'debtor' | 'financier'>('financier');
  const [leaf, setLeaf] = useState('');
  const valid = isHex32(leaf);

  const admit = useAction(async () => {
    const bytes = fromHex(leaf.trim());
    const receipt =
      kind === 'debtor' ? await world.operator.admitDebtor(bytes) : await world.operator.admitFinancier(bytes);
    return { message: `Admitted one ${kind}. The leaf is now in the ${kind} tree.`, receipt };
  });

  // A fresh participant is the honest case: a new secret, and the leaf derived from it.
  const generate = () => {
    const { secretKey } = generatePersona(kind);
    setLeaf(toHex(kind === 'debtor' ? pureCircuits.debtorLeaf(secretKey) : pureCircuits.financierLeaf(secretKey)));
    admit.reset();
  };

  return (
    <>
      <section className="panel">
        <h3>Admit a participant</h3>
        <p>
          Know-your-business happens off the registry. What reaches the contract is one leaf: a hash of a secret only
          that party holds. Admitting is the operator’s whole power — it cannot pledge, settle or open a record.
        </p>
        <div className="row">
          <Select
            label="Tree"
            value={kind}
            onChange={(value) => setKind(value as 'debtor' | 'financier')}
            options={[
              { value: 'financier', label: 'Financiers' },
              { value: 'debtor', label: 'Debtors' },
            ]}
          />
          <Field
            label="Membership leaf"
            mono
            error={leaf && !valid ? 'A leaf is 32 bytes: 64 hexadecimal characters.' : undefined}
            hint="Paste a leaf, or generate a fresh participant to admit."
            inputProps={{
              value: leaf,
              onChange: (e) => setLeaf(e.target.value),
              placeholder: '64 hex characters',
              spellCheck: false,
              autoComplete: 'off',
            }}
          />
          <div className="actions">
            <button className="btn btn--sm btn--ghost" type="button" onClick={generate}>
              Generate a participant
            </button>
          </div>
        </div>
        <button
          className="btn"
          type="button"
          data-busy={admit.busy}
          disabled={!valid || admit.busy}
          onClick={() => void admit.run()}
        >
          {admit.busy ? 'Running admitDebtor…' : `Admit ${kind}`}
        </button>
        <Outcome state={admit.state} />
      </section>

      <section className="panel">
        <h3>The registry’s own parties</h3>
        <p>
          These are the three the demo starts with. After a reset they have to be admitted again — paste a leaf above.
        </p>
        <KeyValues
          rows={[
            { label: 'Debtor · Ardmore Retail', value: shortHex(toHex(world.debtor.leaf)), mono: true },
            { label: 'Financier A · Meridian', value: shortHex(toHex(world.financierA.leaf)), mono: true },
            { label: 'Financier B · Calder', value: shortHex(toHex(world.financierB.leaf)), mono: true },
            { label: 'Debtors admitted', value: String(view?.counts.debtors ?? 0) },
            { label: 'Financiers admitted', value: String(view?.counts.financiers ?? 0) },
          ]}
        />
      </section>
    </>
  );
}

export function DebtorWork() {
  const world = useWorld();
  const rows = useBook();
  const [selected, setSelected] = useState<string | null>(null);

  const acknowledge = useAction(async (ref: string) => {
    const receipt = await world.debtor.acknowledge(world.invoice(ref));
    return { message: `Acknowledged ${ref}. The amount and due date are now fixed, and the marker is public forever.`, receipt };
  });

  const pay = useAction(async (ref: string) => {
    const receipt = await world.debtor.pay(world.invoice(ref));
    return {
      message: `Paid ${money(world.invoice(ref).amount)} into the contract. Only the party holding the payee tag can take it out.`,
      receipt,
    };
  });

  return (
    <>
      <section className="panel">
        <h3>Payables addressed to you</h3>
        <p>
          Acknowledging is the root of trust in the registry: it is the only moment anybody attests that a receivable is
          real and priced correctly, and the marker it writes cannot be taken back.
        </p>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Acknowledged</th>
                <th>Registry status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.entry.ref}>
                  <td>
                    <strong>{row.entry.ref}</strong>
                    {row.entry.fabricated ? (
                      <>
                        <br />
                        <span className="hint">Never sent to you by the supplier.</span>
                      </>
                    ) : null}
                  </td>
                  <td className="num">{money(row.entry.invoice.amount)}</td>
                  <td>{day(row.entry.invoice.dueDate)}</td>
                  <td>{row.acknowledged ? 'yes' : 'no'}</td>
                  <td>
                    {row.pledge ? row.pledge.status : row.acknowledged ? 'free' : '—'}
                  </td>
                  <td>
                    {!row.acknowledged ? (
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={acknowledge.busy}
                        onClick={() => {
                          setSelected(row.entry.ref);
                          void acknowledge.run(row.entry.ref);
                        }}
                      >
                        Acknowledge
                      </button>
                    ) : row.pledge?.status === 'SETTLED' ? (
                      <span className="hint">Settled</span>
                    ) : (
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        disabled={pay.busy}
                        onClick={() => {
                          setSelected(row.entry.ref);
                          void pay.run(row.entry.ref);
                        }}
                      >
                        Pay through the contract
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Outcome state={acknowledge.state} />
        <Outcome state={pay.state} />
      </section>

      {selected ? (
        <section className="panel panel--quiet">
          <h3>What {selected} wrote to the ledger</h3>
          <KeyValues
            rows={[
              {
                label: 'Acknowledgment leaf',
                value: shortHex(toHex(world.ackLeaf(selected))),
                mono: true,
              },
              {
                label: 'Acknowledgment marker',
                value: shortHex(toHex(world.debtor.ackNullifierOf(world.invoice(selected)))),
                mono: true,
              },
              { label: 'Amount', value: 'not written — only a hash of the whole invoice' },
              { label: 'Your identity', value: 'not written — proved against the debtor tree' },
            ]}
          />
        </section>
      ) : null}
    </>
  );
}
