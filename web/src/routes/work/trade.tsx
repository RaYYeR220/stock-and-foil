// SPDX-License-Identifier: Apache-2.0
//
// Seller and financier workspaces: issuing invoices, offering them, taking pledges, releasing them
// and collecting proceeds. A financier finds its own offers by re-deriving its holder tag from
// every public pledge marker — which is exactly what it can do on a real chain, and all it can do.
import { useMemo, useState } from 'react';
import { fromHex, userAddress, type PledgeView } from '../../lib/sdk.js';
import { Field, KeyValues, Outcome, Select } from '../../components/ui.js';
import { labelToBytes32, useBook, type BookRow } from '../../lib/book.js';
import { day, money, shortField, shortHex } from '../../lib/format.js';
import { DAY, type PersonaId } from '../../lib/world.js';
import { useAction, useRegistry, useWorld } from '../../state/registry.js';

const dollars = (value: string): bigint | undefined => {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return BigInt(Math.round(parsed * 100));
};

export function SellerWork() {
  const world = useWorld();
  const { now, refresh } = useRegistry();
  const rows = useBook();

  const [invoiceNo, setInvoiceNo] = useState('1010');
  const [amount, setAmount] = useState('4,150.00');
  const [dueDays, setDueDays] = useState('60');

  const [offerRef, setOfferRef] = useState('');
  const [offerTo, setOfferTo] = useState<'financier-a' | 'financier-b'>('financier-a');
  const [expiryDays, setExpiryDays] = useState('7');

  const [pool, setPool] = useState<string[]>([]);
  const [lender, setLender] = useState('Northgate Capital');
  const [floor, setFloor] = useState('2,000.00');
  const [validDays, setValidDays] = useState('30');

  const offerable = rows.filter((r) => r.acknowledged && r.encumbrance === 'FREE');
  const poolable = offerable;
  const claimable = rows.filter(
    (r) => r.pledge?.status === 'SETTLED' && !r.pledge.claimed && BigInt(r.pledge.payeeTag) === world.seller.payeeTagOf(r.nullifier),
  );

  const amountValue = dollars(amount);
  const floorValue = dollars(floor);
  const invoiceNoValue = /^\d+$/.test(invoiceNo.trim()) ? BigInt(invoiceNo.trim()) : undefined;
  const duplicateNo = rows.some((r) => r.entry.invoice.invoiceNo === invoiceNoValue);

  const issue = useAction(async () => {
    if (invoiceNoValue === undefined || amountValue === undefined) return;
    const entry = world.addInvoice({
      invoiceNo: invoiceNoValue,
      amount: amountValue,
      dueDate: now + BigInt(Math.max(1, Number(dueDays) || 30)) * DAY,
    });
    await refresh();
    return {
      message: `Issued ${entry.ref} for ${money(entry.invoice.amount)}. It carries a fresh salt, so nobody can test whether it is encumbered without being shown it.`,
    };
  });

  const offer = useAction(async () => {
    const row = rows.find((r) => r.entry.ref === offerRef);
    if (!row) return;
    const financier = world.financier(offerTo);
    const expiry = now + BigInt(Math.max(1, Number(expiryDays) || 7)) * DAY;
    const receipt = await world.seller.offer(row.entry.invoice, financier.holderTag(row.nullifier), expiry);
    return { message: `Offered ${row.entry.ref} until ${day(expiry)}. The ledger gained a marker and a sealed record.`, receipt };
  });

  const certify = useAction(async () => {
    if (floorValue === undefined) return;
    const slots = pool
      .map((ref) => rows.find((r) => r.entry.ref === ref))
      .filter((r): r is BookRow => r !== undefined)
      .map((r) => ({ invoice: r.entry.invoice, holderTag: world.financierB.holderTag(r.nullifier) }));
    const receipt = await world.seller.certify(slots, {
      lenderRef: labelToBytes32(lender),
      lenderNonce: labelToBytes32(`${lender}:nonce`),
      floor: floorValue,
      validUntil: now + BigInt(Math.max(1, Number(validDays) || 30)) * DAY,
    });
    return {
      message: `Certified a base of ${slots.length} invoices over ${money(floorValue)} for ${lender}. Each one is now locked to that lender as an offer.`,
      receipt,
    };
  });

  const claim = useAction(async (ref: string) => {
    const row = rows.find((r) => r.entry.ref === ref);
    if (!row) return;
    const receipt = await world.seller.claim(row.nullifier, userAddress(new Uint8Array(32).fill(0x5e)));
    return { message: `Took the proceeds of ${ref}: nobody had financed it.`, receipt };
  });

  return (
    <>
      <section className="panel">
        <h3>Your invoice book</h3>
        <p>
          Private to you. The registry never holds an invoice — only a hash of the whole document, which is why the salt
          below matters: without it, a financier who guesses an invoice still cannot test whether it is encumbered.
        </p>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Acknowledged</th>
                <th>Encumbrance</th>
                <th>Pledge marker</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.entry.ref}>
                  <td>
                    <strong>{row.entry.ref}</strong>
                    {row.entry.note ? (
                      <>
                        <br />
                        <span className="hint">{row.entry.note}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="num">{money(row.entry.invoice.amount)}</td>
                  <td>{day(row.entry.invoice.dueDate)}</td>
                  <td>{row.acknowledged ? 'yes' : 'no'}</td>
                  <td>{row.encumbrance === 'FREE' ? 'free' : row.encumbrance.toLowerCase()}</td>
                  <td className="num">{row.pledge ? shortHex(row.pledge.nullifier) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Offer a receivable</h3>
        <p>
          An offer proves the invoice is acknowledged, not yet due and not already pledged, and addresses it to one
          financier by the tag that financier gave you.
        </p>
        <div className="row">
          <Select
            label="Invoice"
            value={offerRef}
            onChange={setOfferRef}
            options={[
              { value: '', label: offerable.length ? 'Choose an invoice' : 'Nothing is free to offer' },
              ...offerable.map((r) => ({
                value: r.entry.ref,
                label: `${r.entry.ref} · ${money(r.entry.invoice.amount)}`,
              })),
            ]}
          />
          <Select
            label="Financier"
            value={offerTo}
            onChange={(value) => setOfferTo(value as 'financier-a' | 'financier-b')}
            options={[
              { value: 'financier-a', label: 'Meridian Factoring (A)' },
              { value: 'financier-b', label: 'Calder Credit (B)' },
            ]}
          />
          <Field
            label="Offer expires in"
            hint="Days from now. It may not outlive the invoice’s due date."
            inputProps={{
              type: 'number',
              min: 1,
              max: 365,
              value: expiryDays,
              onChange: (e) => setExpiryDays(e.target.value),
            }}
          />
        </div>
        <button
          className="btn"
          type="button"
          data-busy={offer.busy}
          disabled={!offerRef || offer.busy}
          onClick={() => void offer.run()}
        >
          {offer.busy ? 'Running offer…' : 'Offer the receivable'}
        </button>
        <Outcome
          state={offer.state}
          idle="Try offering one that is already pledged, and the contract will refuse it with ALREADY_ENCUMBERED."
        />
      </section>

      <section className="panel">
        <h3>Certify a borrowing base</h3>
        <p>
          Up to four acknowledged, unencumbered invoices, proved to be worth at least a floor and locked to one lender.
          The lender learns the floor and the count; it never learns what is in the pool.
        </p>
        <div className="checks">
          {poolable.length === 0 ? (
            <p className="hint">Nothing is acknowledged and free right now.</p>
          ) : (
            poolable.map((row) => (
              <label className="check" key={row.entry.ref}>
                <input
                  type="checkbox"
                  checked={pool.includes(row.entry.ref)}
                  disabled={!pool.includes(row.entry.ref) && pool.length >= 4}
                  onChange={(e) =>
                    setPool((prev) =>
                      e.target.checked ? [...prev, row.entry.ref] : prev.filter((r) => r !== row.entry.ref),
                    )
                  }
                />
                <span>{row.entry.ref}</span>
                <span className="amount">{money(row.entry.invoice.amount)}</span>
              </label>
            ))
          )}
        </div>
        <div className="row">
          <Field
            label="Lender reference"
            hint="A public label for the lender the base is offered to."
            inputProps={{ value: lender, onChange: (e) => setLender(e.target.value), maxLength: 32 }}
          />
          <Field
            label="Floor to prove"
            error={floor && floorValue === undefined ? 'Enter an amount in dollars.' : undefined}
            inputProps={{ value: floor, onChange: (e) => setFloor(e.target.value), inputMode: 'decimal' }}
          />
          <Field
            label="Valid for"
            hint="Days. Must not outlive any invoice in the pool."
            inputProps={{
              type: 'number',
              min: 1,
              max: 365,
              value: validDays,
              onChange: (e) => setValidDays(e.target.value),
            }}
          />
        </div>
        <p className="hint">
          Selected pool: {money(pool.reduce((sum, ref) => sum + (rows.find((r) => r.entry.ref === ref)?.entry.invoice.amount ?? 0n), 0n))} over{' '}
          {pool.length} {pool.length === 1 ? 'invoice' : 'invoices'}.
        </p>
        <button
          className="btn"
          type="button"
          data-busy={certify.busy}
          disabled={pool.length === 0 || floorValue === undefined || certify.busy}
          onClick={() => void certify.run()}
        >
          {certify.busy ? 'Proving the base…' : 'Certify the base'}
        </button>
        <Outcome
          state={certify.state}
          idle="Claim a floor the pool cannot cover and the contract refuses it with BELOW_FLOOR, locking nothing."
        />
      </section>

      <section className="panel">
        <h3>Issue a new invoice</h3>
        <div className="row">
          <Field
            label="Invoice number"
            error={duplicateNo ? 'You already issued that number to this buyer.' : undefined}
            inputProps={{ value: invoiceNo, onChange: (e) => setInvoiceNo(e.target.value), inputMode: 'numeric' }}
          />
          <Field
            label="Amount"
            error={amount && amountValue === undefined ? 'Enter an amount in dollars.' : undefined}
            inputProps={{ value: amount, onChange: (e) => setAmount(e.target.value), inputMode: 'decimal' }}
          />
          <Field
            label="Due in"
            hint="Days from now."
            inputProps={{ type: 'number', min: 1, max: 365, value: dueDays, onChange: (e) => setDueDays(e.target.value) }}
          />
        </div>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={invoiceNoValue === undefined || amountValue === undefined || duplicateNo || issue.busy}
          onClick={() => void issue.run()}
        >
          Issue the invoice
        </button>
        <Outcome state={issue.state} idle="Issuing an invoice writes nothing to the ledger. Only the buyer can change that." />
      </section>

      {claimable.length > 0 ? (
        <section className="panel">
          <h3>Proceeds waiting for you</h3>
          <p>These settled invoices were never financed, so the payee tag is yours.</p>
          {claimable.map((row) => (
            <div className="row" key={row.entry.ref}>
              <span>
                {row.entry.ref} · {money(row.pledge?.amount ?? 0n)}
              </span>
              <div className="actions">
                <button className="btn btn--sm" type="button" disabled={claim.busy} onClick={() => void claim.run(row.entry.ref)}>
                  Claim the proceeds
                </button>
              </div>
            </div>
          ))}
          <Outcome state={claim.state} />
        </section>
      ) : null}
    </>
  );
}

export function FinancierWork({ id }: { id: Extract<PersonaId, 'financier-a' | 'financier-b'> }) {
  const world = useWorld();
  const { view, now } = useRegistry();
  const rows = useBook();
  const me = world.financier(id);
  const other = id === 'financier-a' ? 'Calder Credit' : 'Meridian Factoring';

  /** Offers addressed to this financier: it re-derives its own tag from every public marker. */
  const mine = useMemo(() => {
    if (!view) return [] as Array<{ pledge: PledgeView; tag: bigint }>;
    return view.pledges
      .map((pledge) => ({ pledge, tag: me.holderTag(fromHex(pledge.nullifier)) }))
      .filter(({ pledge, tag }) => BigInt(pledge.holderTag) === tag || BigInt(pledge.payeeTag) === tag);
  }, [view, me]);

  const accept = useAction(async (nullifier: string) => {
    const receipt = await me.accept(fromHex(nullifier));
    return { message: 'Pledge taken. The marker on the ledger flips to pledged, and nothing about you goes with it.', receipt };
  });
  const release = useAction(async (nullifier: string) => {
    const receipt = await me.release(fromHex(nullifier));
    return { message: 'Released. The receivable is free for another financier to take.', receipt };
  });
  const claim = useAction(async (nullifier: string) => {
    const receipt = await me.claim(fromHex(nullifier), userAddress(new Uint8Array(32).fill(id === 'financier-a' ? 0xa1 : 0xb2)));
    return { message: `Proceeds collected: ${money(receipt.unshielded?.sent ?? 0n)}.`, receipt };
  });

  return (
    <>
      <section className="panel">
        <h3>Diligence: is this receivable already financed?</h3>
        <p>
          This is the check the industry cannot run today. It answers from public state alone, and the answer carries
          nothing else — not who holds the pledge, not the amount, not the date. {other} sees exactly the same.
        </p>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice shown to you</th>
                <th>Amount</th>
                <th>Pledge marker</th>
                <th>Holder tag you would issue</th>
                <th>Registry answer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.entry.ref}>
                  <td>
                    <strong>{row.entry.ref}</strong>
                  </td>
                  <td className="num">{money(row.entry.invoice.amount)}</td>
                  <td className="num">{shortHex(row.nullifierHex)}</td>
                  <td className="num">{shortField(me.holderTag(row.nullifier))}</td>
                  <td>
                    {row.encumbrance === 'FREE'
                      ? 'free to finance'
                      : row.encumbrance === 'SETTLED'
                        ? 'settled, never again'
                        : 'already spoken for'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          In the Sandbox every workspace shares one invoice book so you can drive both sides of a trade. On a real
          deployment a financier only ever sees the invoices a supplier hands it during diligence.
        </p>
      </section>

      <section className="panel">
        <h3>Your book</h3>
        <p>
          Found by re-deriving your own holder tag from each public marker. Nobody else can do this, and you cannot do
          it for anyone else’s pledges.
        </p>
        {mine.length === 0 ? (
          <p className="empty">Nothing is addressed to you yet. A supplier has to offer you a receivable first.</p>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Marker</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {mine.map(({ pledge }) => (
                  <tr key={pledge.nullifier}>
                    <td className="num">{shortHex(pledge.nullifier)}</td>
                    <td>{pledge.status}</td>
                    <td>{pledge.expiry > 0n ? day(pledge.expiry) : '—'}</td>
                    <td className="num">{pledge.amount > 0n ? money(pledge.amount) : 'withheld'}</td>
                    <td>
                      {pledge.status === 'OFFERED' && pledge.expiry > now ? (
                        <button className="btn btn--sm" type="button" disabled={accept.busy} onClick={() => void accept.run(pledge.nullifier)}>
                          Accept
                        </button>
                      ) : pledge.status === 'PLEDGED' ? (
                        <button className="btn btn--sm btn--ghost" type="button" disabled={release.busy} onClick={() => void release.run(pledge.nullifier)}>
                          Release
                        </button>
                      ) : pledge.status === 'SETTLED' && !pledge.claimed ? (
                        <button className="btn btn--sm" type="button" disabled={claim.busy} onClick={() => void claim.run(pledge.nullifier)}>
                          Claim {money(pledge.amount)}
                        </button>
                      ) : pledge.claimed ? (
                        <span className="hint">Collected</span>
                      ) : (
                        <span className="hint">Expired</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Outcome state={accept.state} />
        <Outcome state={release.state} />
        <Outcome state={claim.state} />
      </section>

      <section className="panel panel--quiet">
        <h3>What a refusal tells you</h3>
        <KeyValues
          rows={[
            { label: 'Whether the receivable is spoken for', value: 'yes' },
            { label: 'Who holds the first pledge', value: 'withheld' },
            { label: 'When it was taken', value: 'withheld' },
            { label: 'What it is worth', value: 'withheld' },
            { label: 'Whether the same supplier is behind it', value: 'withheld' },
          ]}
        />
      </section>
    </>
  );
}
