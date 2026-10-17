// SPDX-License-Identifier: Apache-2.0
//
// What changed in Wave 2. A changelog for somebody who saw the previous submission: each item is
// what it is, why it exists, and a link to the thing itself. Items that have not landed are
// printed as unfinished rather than left out.
import { Link } from 'react-router-dom';
import { Footer, Topbar } from '../components/chrome.js';
import { SectionOpener, useTitle } from '../components/ui.js';
import { CHANGES, WAVE, inFlight, shipped, type Change } from '../lib/whatsnew.js';

function Entry({ change, n }: { change: Change; n: number }) {
  return (
    <li className="change" data-status={change.status}>
      <div className="change-head">
        <span className="change-n">{String(n).padStart(2, '0')}</span>
        <h3>{change.title}</h3>
        <span className={change.status === 'shipped' ? 'tag' : 'tag tag--quiet'}>
          {change.status === 'shipped' ? 'Shipped' : 'Not shipped yet'}
        </span>
      </div>

      <div className="change-body">
        <div>
          <p className="lbl">What it is</p>
          <p>{change.what}</p>
        </div>
        <div>
          <p className="lbl">Why it exists</p>
          <p>{change.why}</p>
          {change.judge ? (
            <blockquote className="judge">
              <p>“{change.judge.quote}”</p>
              <cite>{change.judge.source}</cite>
            </blockquote>
          ) : null}
        </div>
      </div>

      {change.links && change.links.length > 0 ? (
        <p className="change-links">
          {change.links.map((link) =>
            link.to ? (
              <Link className="quiet" key={link.label} to={link.to}>
                {link.label}
              </Link>
            ) : (
              <a className="quiet" key={link.label} href={link.href}>
                {link.label}
              </a>
            ),
          )}
        </p>
      ) : (
        <p className="change-links change-links--none">
          Nothing to link to yet. This entry stays here, saying so, until there is.
        </p>
      )}
    </li>
  );
}

export function WhatsNew() {
  useTitle(`What changed in ${WAVE.label}`);
  const done = shipped();
  const open = inFlight();

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
              {WAVE.label} changelog · {done.length} shipped
              {open.length > 0 ? `, ${open.length} still being built` : ''}
            </p>
            <SectionOpener
              title={`What changed in ${WAVE.label}.`}
              level="h1"
              small
              dek={`Every change made since the ${WAVE.previous} submission, with what it is, why it exists and where to go and look at it. Three of them answer a note from the ${WAVE.previous} review, quoted underneath. This wave closes ${WAVE.closes}.`}
            />
          </div>

          <ol className="changes">
            {done.map((change, i) => (
              <Entry key={change.id} change={change} n={i + 1} />
            ))}
          </ol>

          {open.length > 0 ? (
            <section className="sec sec--tight">
              <SectionOpener
                title="Declared, and not shipped."
                small
                dek="Work this wave that has not landed in the build you are looking at. It is listed because leaving it out would be the more flattering mistake; nothing on this site claims any of it."
              />
              <ol className="changes changes--open">
                {open.map((change, i) => (
                  <Entry key={change.id} change={change} n={done.length + i + 1} />
                ))}
              </ol>
            </section>
          ) : null}

          <section className="panel panel--quiet">
            <h3>How to check any of this</h3>
            <p>
              Every shipped item above is a page you can open right now. The registry itself runs in your browser tab
              with no wallet and no install: the <Link to="/app/replay">guided replay</Link> drives the compiled
              contract through seventeen steps, three of which are refused by the contract’s own asserts. What was
              deployed, and what was run against it, is on <Link to="/proof">the proof page</Link>, generated from the
              files the command-line tool wrote.
            </p>
            <p className="mono">{CHANGES.length} entries · web/src/lib/whatsnew.ts</p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
