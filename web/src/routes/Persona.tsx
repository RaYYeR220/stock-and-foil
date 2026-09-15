// SPDX-License-Identifier: Apache-2.0
//
// Persona workspaces. Each role acts against the same registry with only the powers and the sight
// it actually has — the aside on every page says what this party can see and what it cannot, and
// the actions are the circuits that party is allowed to call.
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { KeyValues, SectionOpener, useTitle } from '../components/ui.js';
import { PERSONAS, personaMeta, type PersonaId } from '../lib/world.js';
import { useRegistry } from '../state/registry.js';
import { DebtorWork, OperatorWork } from './work/parties.js';
import { AuditorWork, KeyholderWork } from './work/disclosure.js';
import { FinancierWork, SellerWork } from './work/trade.js';

const isPersona = (value: string | undefined): value is PersonaId =>
  PERSONAS.some((p) => p.id === value);

export function Persona() {
  const { persona } = useParams();
  const { view } = useRegistry();
  if (!isPersona(persona)) return <Navigate to="/app/operator" replace />;
  const meta = personaMeta(persona);
  return <Workspace meta={meta} persona={persona} view={view} />;
}

function Workspace({
  meta,
  persona,
  view,
}: {
  meta: ReturnType<typeof personaMeta>;
  persona: PersonaId;
  view: ReturnType<typeof useRegistry>['view'];
}) {
  useTitle(meta.name);

  return (
    <>
      <nav className="personabar" aria-label="Personas">
        {PERSONAS.map((p) => (
          <NavLink key={p.id} to={`/app/${p.id}`}>
            {p.role.split('—')[0]?.trim()}
          </NavLink>
        ))}
      </nav>

      <div className="pagehead">
        <p className="crumb">
          <i aria-hidden="true" />
          {meta.role}
        </p>
        <SectionOpener title={`${meta.name}.`} level="h1" small dek={meta.summary} />
      </div>

      <div className="workspace">
        <div className="work">
          {persona === 'operator' ? <OperatorWork /> : null}
          {persona === 'debtor' ? <DebtorWork /> : null}
          {persona === 'seller' ? <SellerWork /> : null}
          {persona === 'financier-a' ? <FinancierWork id="financier-a" /> : null}
          {persona === 'financier-b' ? <FinancierWork id="financier-b" /> : null}
          {persona === 'auditor' ? <AuditorWork /> : null}
          {persona === 'keyholders' ? <KeyholderWork /> : null}
        </div>

        <aside className="aside">
          <div className="panel">
            <h3>What this party sees</h3>
            <ul className="seelist">
              {meta.sees.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel panel--quiet">
            <h3>And what it does not</h3>
            <ul className="seelist seelist--blind">
              {meta.blind.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <h3>The registry right now</h3>
            <KeyValues
              rows={[
                { label: 'Debtors', value: String(view?.counts.debtors ?? 0) },
                { label: 'Financiers', value: String(view?.counts.financiers ?? 0) },
                { label: 'Acknowledgments', value: String(view?.counts.acks ?? 0) },
                { label: 'Pledge markers', value: String(view?.counts.pledges ?? 0) },
                { label: 'Sealed records', value: String(view?.counts.records ?? 0) },
                { label: 'Certificates', value: String(view?.counts.certificates ?? 0) },
                { label: 'Disclosure requests', value: String(view?.counts.requests ?? 0) },
              ]}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
