// SPDX-License-Identifier: Apache-2.0
//
// The landing page. One claim, one call to action, and the three refusals the registry exists to
// perform — the same three run for real one click away, in the guided replay.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer, Mark } from '../components/chrome.js';
import { Press } from '../components/Press.js';
import { SectionOpener } from '../components/ui.js';
import { inflate, notches, type Notch } from '../lib/press.js';
import { BAR_VIEW, HERO_HASH, HERO_VIEW, HERO_VIEW_PHONE, STRIP_VIEW, SX, bar, exchange } from '../lib/tally.js';
import { PUBLIC_DEPLOYMENTS } from '../lib/evidence.js';

const HASH = {
  pledge: HERO_HASH,
  rogue: '0xa9d0e4175c3b86f2a14e09d7c68b35f1e2a70c94d5b186e3f07a42c9d1b5e860',
  ack: '0x7d21e0a45f9c3b8016ea27d5c4b39f80e1a6d72c9b0453fe81a2c6d37e90b514',
  settled: '0x5c48fb1d20e9a7c36b0d84f5127ae63c90b4d8e1a6f327c05d9b1e84a3f60c72',
};

const N_PLEDGE = notches(HASH.pledge);
const N_ROGUE = notches(HASH.rogue);
const N_ACK = notches(HASH.ack);
const N_SETTLE = notches(HASH.settled);
const INF = inflate(N_PLEDGE, 4, `${HASH.pledge}inflate`);

const usePhone = (): boolean => {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 560px)');
    const listener = (e: MediaQueryListEvent) => setPhone(e.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return phone;
};

const PARTIES = [
  {
    n: '01',
    who: 'Debtor',
    title: 'The buyer acknowledges',
    body: 'The buyer confirms it owes this invoice, at this amount, due on this date. The registry keeps a hash of the acknowledgment — never the invoice.',
    sees: 'One more acknowledgment leaf, plus a marker that stops the same invoice being acknowledged twice.',
  },
  {
    n: '02',
    who: 'Seller',
    title: 'The supplier offers',
    body: 'The supplier proves the invoice is acknowledged, not yet due and not already pledged, then offers it to one named financier.',
    sees: 'A pledge marker set to offered, and a sealed copy of the record that nobody can open yet.',
  },
  {
    n: '03',
    who: 'Factor or lender',
    title: 'The financier accepts',
    body: 'The financier proves the offer was addressed to it, and takes the pledge. When the buyer pays through the contract, the money goes to the pledge holder rather than the supplier.',
    sees: 'The marker flips to pledged. No name, no amount, no link to the financier’s other pledges.',
  },
  {
    n: '04',
    who: 'Auditor, with 3 keyholders',
    title: 'A trustee opens a record',
    body: 'An auditor asks for one specific record. Two of three keyholders approve on-chain. The record decrypts and checks itself against the ledger, so a doctored disclosure fails.',
    sees: 'The request and the approvals. The contents go to the auditor and to nobody else.',
  },
];

const DEMOS = [
  {
    id: 'forged',
    title: 'A forged invoice',
    body: 'The supplier pledges an invoice the buyer never acknowledged. There is no second half for it to match.',
    cta: 'Offer a forged invoice',
    pending: 'Nothing offered yet. The dashed outline is where the buyer’s half would be, if the buyer had ever cut one.',
    code: 'NOT_ACKNOWLEDGED',
    verdict:
      'No acknowledgment exists for this invoice, so the offer cannot be proved. The supplier cannot even build the transaction.',
    open: 'translate(1%, -21%)',
    shut: 'translate(0, 0)',
  },
  {
    id: 'inflated',
    title: 'An inflated invoice',
    body: 'The buyer acknowledged $2,300. The supplier pledges $23,000. The amount is part of what was acknowledged, so the extra notches have nothing beneath them.',
    cta: 'Pledge $23,000 against $2,300',
    pending: 'Nothing offered yet. Four notches on the pink half were cut after the buyer signed.',
    code: 'NOT_ACKNOWLEDGED',
    verdict:
      'The amount is part of what the buyer signed. $23,000 is a different invoice from the $2,300 on record, and nothing acknowledges it.',
    open: 'translate(1%, -21%)',
    shut: 'translate(0, 0)',
  },
  {
    id: 'double',
    title: 'A double pledge',
    body: 'The same acknowledged invoice is offered to a second financier. It is already spoken for — and that is the whole of what the second financier is told.',
    cta: 'Try to pledge it twice',
    pending: 'Pledge 1 is on the record: the two halves below are in register. Offer the same invoice again.',
    code: 'ALREADY_ENCUMBERED',
    verdict:
      'A pledge already exists against this invoice. The second financier learns that and nothing else: not the holder, not the date, not the amount.',
    open: 'translate(3%, -42%) rotate(1.6deg)',
    shut: 'translate(1%, -15%) rotate(1deg)',
  },
] as const;

type DemoId = (typeof DEMOS)[number]['id'];

const layersFor = (id: DemoId): Array<{ key: string; moves?: boolean; layer: Parameters<typeof Press>[0]['layers'][0] }> => {
  const mk = (color: string, angle: number, seed: string, half: 'stock' | 'foil', N: readonly Notch[]) => ({
    color,
    angle,
    cell: 2.9,
    seed,
    view: BAR_VIEW,
    draw: bar(half, N),
  });
  if (id === 'forged') return [{ key: 'stock', moves: true, layer: mk('#FF48B0', 75, 'f2', 'stock', N_PLEDGE) }];
  if (id === 'inflated')
    return [
      { key: 'foil', layer: mk('#0000FE', 15, 'i1', 'foil', N_PLEDGE) },
      { key: 'stock', moves: true, layer: mk('#FF48B0', 75, 'i2', 'stock', INF.all) },
    ];
  return [
    { key: 'foil', layer: mk('#0000FE', 15, 'd1', 'foil', N_PLEDGE) },
    { key: 'stock', layer: mk('#FF48B0', 75, 'd2', 'stock', N_PLEDGE) },
    { key: 'rogue', moves: true, layer: mk('#FF48B0', 45, 'd3', 'stock', N_ROGUE) },
  ];
};

function Demo({ demo }: { demo: (typeof DEMOS)[number] }) {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'closing' | 'refused'>('idle');
  const parts = useMemo(() => layersFor(demo.id), [demo.id]);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (run === 0) return;
    let live = true;
    setPhase('closing');
    const wait = (msec: number) => new Promise((r) => setTimeout(r, reduce ? 0 : msec));
    void (async () => {
      await wait(740);
      if (live) setPhase('refused');
    })();
    return () => {
      live = false;
    };
  }, [run, reduce]);

  const moving = phase === 'idle' ? demo.open : demo.shut;
  return (
    <article className="demo card">
      <h3>{demo.title}</h3>
      <p className="body">{demo.body}</p>
      <figure className={`stage${phase === 'closing' && !reduce ? ' shudder' : ''}`}>
        {demo.id === 'forged' ? (
          <svg className="anno" viewBox="-330 -104 660 224" aria-hidden="true">
            <path
              d="M-223,0 H222 V-32 H302 Q311,-32 311,-20 V20 Q311,32 302,32 H-223 Z"
              fill="none"
              stroke="#0000FE"
              strokeWidth="1.6"
              strokeDasharray="8 6"
              vectorEffect="non-scaling-stroke"
              opacity=".85"
            />
          </svg>
        ) : null}
        {parts.map((part) =>
          part.moves ? (
            <div key={part.key} className="mover" style={{ transform: moving }}>
              <Press
                layers={[part.layer]}
                aspect="660/224"
                style={{ position: 'absolute', inset: 0 }}
                label={`${demo.title}: the supplier’s half of the tally.`}
              />
            </div>
          ) : (
            <Press
              key={part.key}
              layers={[part.layer]}
              aspect="660/224"
              style={{ position: 'absolute', inset: 0 }}
            />
          ),
        )}
        {demo.id === 'inflated' && phase === 'refused' ? (
          <svg className="anno" viewBox="-330 -104 660 224" aria-hidden="true">
            {INF.extra.map(([x, w], i) => (
              <circle
                key={i}
                cx={((x + w / 2) * SX).toFixed(1)}
                cy="-20"
                r={Math.max(26, w * 1.3).toFixed(1)}
                fill="none"
                stroke="#0000FE"
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
      </figure>
      <button
        className="btn btn--sm run"
        type="button"
        data-run={demo.id}
        disabled={phase === 'closing'}
        onClick={() => setRun((r) => r + 1)}
      >
        {demo.cta}
      </button>
      <p className="verdict" aria-live="polite">
        {phase === 'refused' ? (
          <>
            <code>{demo.code}</code>
            <br />
            {demo.verdict}
          </>
        ) : (
          <span className="pending">{demo.pending}</span>
        )}
      </p>
    </article>
  );
}

function HeroPlate() {
  const phone = usePhone();
  const view = phone ? HERO_VIEW_PHONE : HERO_VIEW;
  const layers = useMemo(
    () => [
      { color: '#FF48B0', angle: 75, cell: 4.6, seed: `${HASH.pledge}p`, view, draw: exchange('stock', phone) },
      { color: '#0000FE', angle: 15, cell: 4.6, seed: `${HASH.pledge}b`, view, draw: exchange('foil', phone) },
    ],
    [phone, view],
  );
  return (
    <div className="hero-art">
      <Press
        className="hero-plate plate"
        aspect={phone ? '800/440' : '1042/444'}
        layers={layers}
        revision={phone ? 'phone' : 'wide'}
        label="Halftone print: one hand holds the stock half of a split tally stick, another holds the foil half, and the notched edges meet in the middle."
      >
        <span className="plate-ghost" aria-hidden="true" />
      </Press>
      <p className="plate-cap">
        <span>Stock, kept by the lender · Foil, kept by the buyer</span>
        <span>notches cut from 0x31e5…46f7</span>
      </p>
    </div>
  );
}

export function Landing() {
  const deployed = PUBLIC_DEPLOYMENTS[0];
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="shell">
          <Mark />
          <nav className="topnav" aria-label="Sections">
            <ul>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#ledger">What the chain sees</a>
              </li>
              <li>
                <a href="#refusals">Refusals</a>
              </li>
              <li>
                <Link to="/proof">Proof</Link>
              </li>
            </ul>
          </nav>
          <Link className="btn btn--sm" to="/app/replay">
            Run the replay
          </Link>
        </div>
      </header>

      <main id="main">
        <section className="hero shell" id="top">
          <div className="hero-grid">
            <p className="kicker">
              <i aria-hidden="true" />
              Private collateral registry · built on Midnight
            </p>
            <h1>Every invoice can be pledged once.</h1>
            <div className="hero-side">
              <p className="lede">
                Stock &amp; Foil refuses forged, inflated and double-pledged receivables at the moment of pledging — and
                the refused lender learns nothing about who holds the first pledge.
              </p>
            </div>
            <div className="cta-row">
              <Link className="btn" to="/app/replay">
                Run the replay
              </Link>
              <a className="quiet" href="#how">
                How the proof works
              </a>
            </div>
            <HeroPlate />
          </div>
        </section>

        <section className="sec sec--blue onblue">
          <div className="shell band-grid">
            <h2>Two lenders, one invoice, nobody able to check.</h2>
            <div className="band-copy">
              <p>
                In September 2025 First Brands filed for Chapter 11 carrying roughly <b>$2.3 billion</b> of
                receivables-finance liabilities. Invoices had been presented to more than one financier.
              </p>
              <p>
                The financiers could not have caught it by comparing notes. An invoice file is a client list and a price
                list; handing it to a rival costs more than the fraud does. So everyone keeps their book to themselves,
                and the same receivable gets funded twice.
              </p>
              <p>
                <b>Stock &amp; Foil lets them check without showing each other anything.</b> The registry answers one
                question — is this receivable already spoken for — and answers nothing else.
              </p>
            </div>
            <div className="band-fig">
              <div>
                <strong>$2.3B</strong>
                <span>of receivables-finance liabilities at filing</span>
              </div>
              <div>
                <strong>3</strong>
                <span>frauds refused before a transaction can be built</span>
              </div>
              <div>
                <strong>0</strong>
                <span>facts about the first pledge shown to the second lender</span>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="how">
          <div className="shell">
            <SectionOpener
              title="Four parties, one record."
              dek="A receivable passes through four hands. Each hand proves something, and leaves a mark nobody else can read."
            />
            <ol className="steps">
              {PARTIES.map((party) => (
                <li className="step card" key={party.n}>
                  <span className="step-n">{party.n}</span>
                  <h3>{party.title}</h3>
                  <p className="who">{party.who}</p>
                  <p className="body">{party.body}</p>
                  <p className="sees">
                    <b>On the ledger</b>
                    {party.sees}
                  </p>
                </li>
              ))}
            </ol>
            <p className="note">
              Every refusal happens while the transaction is being built, not after it lands. A fraudulent pledge cannot
              be proved, so it never reaches the chain at all.
            </p>
          </div>
        </section>

        <section className="sec" id="ledger">
          <div className="shell">
            <SectionOpener
              title="What the chain sees."
              dek="The public ledger holds marks, not documents. Everything on the left is visible to anyone; none of it can be turned back into anything on the right."
            />
            <div className="card compare">
              <div>
                <h3>
                  Printed on the ledger <em>public</em>
                </h3>
                <ul>
                  <li>
                    <span>
                      <b>Acknowledgment leaves.</b> One per invoice a buyer has accepted. It does not say which invoice.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Pledge markers and their status.</b> Offered, pledged, released or settled.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Holder tags.</b> A fresh tag for every pledge, so a financier’s book cannot be traced across
                      records.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Sealed records.</b> Openable only after two of three keyholders approve.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Counts and roots.</b> How many parties, how many live pledges, how many settled.
                    </span>
                  </li>
                </ul>
                <p className="foot-note">
                  Settlement is the one exception: paying through the contract reveals the amount and the paying and
                  receiving addresses. That limit is published, not hidden.
                </p>
              </div>
              <div className="private">
                <h3>
                  Never printed <em>stays with the parties</em>
                </h3>
                <ul>
                  <li>
                    <span>
                      <b>The invoice.</b> Number, amount, due date, and who owes it.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Who acknowledged what.</b> A buyer’s payables are not a public list.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Who pledged to whom.</b> No financier can see another financier’s positions.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Borrowing-base line items.</b> A prospective lender learns that the base clears a floor, not
                      what is in it.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Anything about the first pledge.</b> A refused lender gets a refusal and nothing more.
                    </span>
                  </li>
                </ul>
                <p className="foot-note">
                  The supplier salts the invoice before the buyer acknowledges it, so a financier who guesses an invoice
                  still cannot test whether it is encumbered.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="refusals">
          <div className="shell">
            <SectionOpener
              title="Three refusals."
              dek={
                <>
                  A tally was split so that one half could not be forged against the other. These three are the same
                  idea, proved rather than whittled. Run each one, then{' '}
                  <Link to="/app/replay">run them against the real circuits</Link>.
                </>
              }
            />
            <div className="demos">
              {DEMOS.map((demo) => (
                <Demo key={demo.id} demo={demo} />
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="records">
          <div className="shell">
            <SectionOpener
              title="The record card."
              dek="Every receivable is an object with a record. The tally on each card is cut from that record’s own commitment, so the same record always draws the same notches — and how much ink is on the card is its status."
            />
            <div className="records">
              <article className="rec card">
                <div className="rec-head">
                  <span className="id">SF-2026-0418</span>
                  <span className="tag tag--plain">Acknowledged</span>
                </div>
                <Press
                  className="rec-strip"
                  aspect="660/116"
                  layers={[
                    { color: '#0000FE', angle: 15, cell: 2.7, seed: 'ra', view: STRIP_VIEW, draw: bar('foil', N_ACK) },
                  ]}
                  label="Only the blue half is printed: the buyer has acknowledged, nobody has pledged."
                />
                <dl className="kv">
                  <dt>Acknowledged</dt>
                  <dd>28 Aug 2026</dd>
                  <dt>Amount</dt>
                  <dd>withheld</dd>
                  <dt>Pledge</dt>
                  <dd>none recorded</dd>
                  <dt>Ack leaf</dt>
                  <dd className="num">0x7d21…b514</dd>
                </dl>
                <p className="rec-note">Only the buyer’s half is printed. The supplier can still offer this one.</p>
              </article>

              <article className="rec card">
                <div className="rec-head">
                  <span className="id">SF-2026-0417</span>
                  <span className="tag">Encumbered</span>
                </div>
                <Press
                  className="rec-strip"
                  aspect="660/116"
                  layers={[
                    { color: '#0000FE', angle: 15, cell: 2.7, seed: 'rb', view: STRIP_VIEW, draw: bar('foil', N_PLEDGE) },
                    {
                      color: '#FF48B0',
                      angle: 75,
                      cell: 2.7,
                      seed: 'rc',
                      view: STRIP_VIEW,
                      draw: bar('stock', N_PLEDGE),
                    },
                  ]}
                  label="Both halves printed in register, the overprint marking a live pledge."
                />
                <dl className="kv">
                  <dt>Acknowledged</dt>
                  <dd>12 Aug 2026</dd>
                  <dt>Amount</dt>
                  <dd>withheld</dd>
                  <dt>Holder</dt>
                  <dd>withheld, proof held</dd>
                  <dt>Pledge marker</dt>
                  <dd className="num">0x31e5…46f7</dd>
                </dl>
                <p className="rec-note">Both halves in register. A second offer against this marker cannot be proved.</p>
              </article>

              <article className="rec card">
                <div className="rec-head">
                  <span className="id">SF-2026-0402</span>
                  <span className="tag tag--plain">Settled</span>
                </div>
                <Press
                  className="rec-strip"
                  aspect="660/116"
                  layers={[
                    {
                      color: '#0000FE',
                      angle: 15,
                      cell: 2.7,
                      seed: 'rd',
                      view: STRIP_VIEW,
                      draw: bar('foil', N_SETTLE, 0.72),
                    },
                    {
                      color: '#FF48B0',
                      angle: 75,
                      cell: 2.7,
                      seed: 're',
                      view: STRIP_VIEW,
                      draw: bar('stock', N_SETTLE, 0.72),
                    },
                  ]}
                  label="Both halves printed and struck through: the invoice has been paid."
                >
                  <svg className="anno" viewBox="-330 -58 660 116" aria-hidden="true">
                    <path
                      d="M-308 24 L308 -20"
                      fill="none"
                      stroke="#0000FE"
                      strokeWidth="2.6"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </Press>
                <dl className="kv">
                  <dt>Paid</dt>
                  <dd>03 Sep 2026</dd>
                  <dt>Through</dt>
                  <dd>the contract</dd>
                  <dt>Proceeds</dt>
                  <dd>to the pledge holder</dd>
                  <dt>Pledge marker</dt>
                  <dd className="num">0xa9d0…e860</dd>
                </dl>
                <p className="rec-note">Struck through and closed. A settled invoice can never be pledged again.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="sec">
          <div className="shell">
            <div className="card closing">
              <div>
                <h2>Run the three refusals against the real circuits.</h2>
                <p>
                  The guided replay drives the compiled Compact contract in your browser: the buyer acknowledges, the
                  supplier offers, a financier takes the pledge, and three frauds are refused with the contract’s own
                  codes. No wallet, no install, nothing to sign.
                </p>
              </div>
              <div className="closing-cta">
                <Link className="btn" to="/app/replay">
                  Run the replay
                </Link>
                {deployed ? (
                  <p className="hint">
                    A registry is deployed on {deployed.network}.{' '}
                    <Link className="quiet" to="/proof">
                      See the transactions
                    </Link>
                    .
                  </p>
                ) : (
                  <p className="hint">
                    Sandbox runs everything locally. Nothing on this site has been audited, and nothing is on mainnet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
