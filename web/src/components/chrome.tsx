// SPDX-License-Identifier: Apache-2.0
//
// Page chrome shared by every route: the mark, the sticky header, the instrument rail that carries
// the mode switch and the Sandbox clock, and the footer.
import { Link, NavLink, useLocation } from 'react-router-dom';
import { day } from '../lib/format.js';
import { DAY, T0 } from '../lib/world.js';
import { useRegistry } from '../state/registry.js';

export function Mark({ to = '/' }: { to?: string }) {
  return (
    <Link className="mark" to={to}>
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1 3h14v4.2l-2 .9-2-.9-2 .9-2-.9-2 .9-2-.9L1 7.2z" fill="#FF48B0" />
        <path d="M1 9.4l2 .9 2-.9 2 .9 2-.9 2 .9 2-.9 2 .9V13H1z" fill="#0000FE" />
      </svg>
      Stock &amp; Foil
    </Link>
  );
}

const NAV = [
  { to: '/app/replay', label: 'Guided replay' },
  { to: '/app/ledger', label: 'Public ledger' },
  { to: '/app/operator', label: 'Workspaces' },
  { to: '/proof', label: 'Proof' },
];

/** Every `/app/:persona` route belongs to the Workspaces item, not just the operator's. */
const WORKSPACE_ROUTES = /^\/app\/(?!replay$|ledger$)[a-z-]+$/;

export function Topbar({ cta }: { cta?: { to: string; label: string } }) {
  const { pathname } = useLocation();
  const inWorkspaces = WORKSPACE_ROUTES.test(pathname);
  return (
    <header className="topbar">
      <div className="shell shell--wide">
        <Mark />
        <nav className="topnav" aria-label="Main">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} aria-current={item.label === 'Workspaces' && inWorkspaces ? 'page' : undefined}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {cta ? (
          <Link className="btn btn--sm" to={cta.to}>
            {cta.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The status strip. It says, in one line and without flattery, exactly what is running: the real
 * compiled circuits, in this tab, with no chain and no wallet.
 */
export function Rail() {
  const { mode, setMode, now, advance, setClock, reset, status, network } = useRegistry();
  const sandbox = mode === 'sandbox';
  return (
    <div className="rail onblue">
      <div className="shell shell--wide">
        <div className="rail-group">
          <span className="rail-label">Mode</span>
          <div className="switch" role="group" aria-label="Registry mode">
            <button type="button" aria-pressed={sandbox} onClick={() => setMode('sandbox')}>
              Sandbox
            </button>
            <button type="button" aria-pressed={!sandbox} onClick={() => setMode('network')}>
              Network
            </button>
          </div>
        </div>
        <span className="rail-sep" aria-hidden="true" />
        <div className="rail-group">
          <span className="rail-label">Block time</span>
          <span>{day(now)}</span>
          <button className="chip" type="button" disabled={status !== 'ready'} onClick={() => void advance(DAY)}>
            +1 day
          </button>
          <button className="chip" type="button" disabled={status !== 'ready'} onClick={() => void advance(7n * DAY)}>
            +7 days
          </button>
          <button className="chip" type="button" disabled={status !== 'ready'} onClick={() => void setClock(T0)}>
            Reset clock
          </button>
        </div>
        <span className="rail-sep" aria-hidden="true" />
        <button className="chip" type="button" disabled={status !== 'ready'} onClick={() => void reset()}>
          Reset registry
        </button>
        <p className="rail-status">
          {sandbox
            ? 'Sandbox: the real compiled circuits run in this tab. No chain, no wallet, no proofs — refusals are the contract’s own asserts.'
            : network
              ? `Network: connected to ${network.wallet.name} against ${network.backend.contractAddress.slice(0, 12)}…`
              : 'Network: needs a Midnight wallet, a proof server and a deployed contract. Sandbox keeps working either way.'}
        </p>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="shell shell--wide">
        <div className="foot-grid">
          <div className="about">
            <Mark />
            <p>
              A privacy-preserving collateral registry for receivables finance, built on Midnight for the buildathon.
              Nothing here is deployed to mainnet and none of it has been audited.
            </p>
          </div>
          <div>
            <h4>The app</h4>
            <ul>
              <li>
                <Link to="/app/replay">Guided replay</Link>
              </li>
              <li>
                <Link to="/app/ledger">What the chain sees</Link>
              </li>
              <li>
                <Link to="/app/seller">Persona workspaces</Link>
              </li>
              <li>
                <Link to="/proof">Proof</Link>
              </li>
              {/* The deck is a static page beside the app, not a route, so it needs a real href. */}
              <li>
                <a href="/deck">The deck</a> · <a href="/deck/stock-and-foil-deck.pdf">PDF</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Built on</h4>
            <ul>
              <li>
                <a href="https://midnight.network/">midnight.network</a>
              </li>
              <li>
                <a href="https://docs.midnight.network/">Midnight docs</a>
              </li>
              <li>
                <a href="https://docs.midnight.network/develop/reference/compact/">Compact language</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Where this comes from</h4>
            <ul>
              <li>
                <a href="https://collection.sciencemuseumgroup.org.uk/objects/co60506/medieval-exchequer-tally-sticks">
                  Exchequer tally sticks, Science Museum Group
                </a>
              </li>
              <li>
                <a href="https://www.americanbar.org/groups/business_law/resources/business-law-today/2026-february/first-brands-avoid-being-two-timed-by-collateral/">
                  First Brands, ABA Business Law Today
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="foot-base">
          <span>Stock &amp; Foil · 2026</span>
          <span>Refusal codes: NOT_ACKNOWLEDGED · ALREADY_ENCUMBERED · NOT_PAYEE</span>
        </div>
      </div>
    </footer>
  );
}
