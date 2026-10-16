// SPDX-License-Identifier: Apache-2.0
//
// The cold-start answer, drawn. Three independent registries, one marker, one lender reading all
// three — the point being that the marker is the same in every registry without anybody agreeing
// to anything, so a lender never has to wait for a consortium to exist.
//
// The diagram is a diagram. It reports no verdicts, because `federationSource` is null in this
// build; the panel underneath says so in as many words.
import { Link } from 'react-router-dom';
import { HERO_HASH } from '../lib/tally.js';
import { REGISTRY_SHAPES, federationSource } from '../lib/federation.js';

const MARKER = `${HERO_HASH.slice(0, 18)}…${HERO_HASH.slice(-6)}`;

/** Where each registry box sits in the diagram's own coordinates. */
const BOXES = [
  { x: 24, label: 'Registry A', sub: 'one factoring house', read: { x: 32, end: false } },
  { x: 420, label: 'Registry B', sub: 'a bank’s own book', read: { x: 428, end: false } },
  { x: 816, label: 'Registry C', sub: 'a trade body', read: { x: 1108, end: true } },
] as const;

function Diagram() {
  return (
    <svg
      className="fed-svg"
      viewBox="0 0 1140 410"
      role="img"
      aria-label="One lender computes a single pledge marker from an invoice and reads it against three independent registries — its own, a bank's and a trade body's. Each registry answers free or encumbered about that marker alone. No registry shares anything with another."
    >
      {/* the three registries */}
      {BOXES.map((box) => (
        <g key={box.label}>
          <rect x={box.x + 7} y={17} width={300} height={124} className="fed-shadow" />
          <rect x={box.x} y={10} width={300} height={124} className="fed-box" />
          <text x={box.x + 24} y={56} className="fed-h">
            {box.label}
          </text>
          <text x={box.x + 24} y={88} className="fed-sub">
            {box.sub}
          </text>
          <text x={box.x + 24} y={116} className="fed-mono">
            own operator · own members
          </text>
        </g>
      ))}

      {/* nothing passes between them: the gaps are the point */}
      {([
        { a: 324, b: 420 },
        { a: 720, b: 816 },
      ] as const).map(({ a, b }) => (
        <g key={a}>
          <line x1={a + 14} y1={72} x2={b - 14} y2={72} className="fed-cut" />
          <text x={(a + b) / 2} y={60} className="fed-mono fed-mid">
            no link
          </text>
        </g>
      ))}

      {/* three reads, out of the one lender */}
      {BOXES.map((box) => (
        <path
          key={`ray-${box.label}`}
          d={`M570 254 L${box.x + 150} 146`}
          className="fed-ray"
          markerEnd="url(#fed-head)"
        />
      ))}
      <defs>
        <marker id="fed-head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L12 6 L0 12 z" fill="#0000FE" />
        </marker>
      </defs>
      {BOXES.map((box) => (
        <text
          key={`read-${box.label}`}
          x={box.read.x}
          y={170}
          className="fed-mono"
          textAnchor={box.read.end ? 'end' : 'start'}
        >
          one read
        </text>
      ))}

      {/* the lender, and the one marker it computed */}
      <rect x={181} y={261} width={786} height={142} className="fed-shadow" />
      <rect x={174} y={254} width={786} height={142} className="fed-lender" />
      <text x={206} y={302} className="fed-h fed-on">
        One lender. One marker.
      </text>
      <text x={206} y={336} className="fed-sub fed-on">
        computed from the invoice it was offered — the same in every registry
      </text>
      <text x={206} y={372} className="fed-mono fed-on">
        {MARKER}
      </text>
    </svg>
  );
}

export function Federation() {
  return (
    <>
      <div className="fed-plate">
        <Diagram />
        {/* Narrow screens get the same three facts set as type; the drawn version sets labels at
            sizes that stop being legible below roughly 760px. */}
        <div className="fed-stack">
          <ul>
            {BOXES.map((box) => (
              <li key={box.label}>
                <strong>{box.label}</strong>
                <span>{box.sub}</span>
                <em>own operator · own members · no link to the others</em>
              </li>
            ))}
          </ul>
          <p className="fed-stack-read">three reads, one marker</p>
          <div className="fed-stack-lender">
            <strong>One lender. One marker.</strong>
            <span>computed from the invoice it was offered — the same in every registry</span>
            <span className="mono">{MARKER}</span>
          </div>
        </div>
      </div>

      <div className="fed-notes">
        {REGISTRY_SHAPES.map((shape) => (
          <div key={shape.key}>
            <h3>{shape.label}</h3>
            <p>{shape.note}</p>
          </div>
        ))}
      </div>

      <div className="fed-seam panel">
        <div>
          <p className="lbl">The live cross-registry read</p>
          <h3>{federationSource ? 'Wired up' : 'Not wired up in this build'}</h3>
          <p>
            {federationSource
              ? 'This build holds a federation source, so the panel above reports verdicts read from each registry.'
              : 'The mechanism is settled and the seam is typed, but no registry other than our own has been read from this app. Nothing above is a result, and this page will not print one until a read has actually happened.'}
          </p>
        </div>
        <div>
          <p className="lbl">What is running today</p>
          <p>
            One registry, the one in your browser tab, with the same marker arithmetic. Run{' '}
            <Link to="/app/replay">the guided replay</Link> to watch a second pledge against an existing marker get
            refused, or read <Link to="/proof">what was deployed</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
