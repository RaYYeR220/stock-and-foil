// SPDX-License-Identifier: Apache-2.0
//
// Federation: the answer to "this only works once everybody joins the same registry".
//
// A pledge marker is a deterministic function of the invoice — `nullifier = H(domain ‖ invoice)`
// — so the same receivable produces the same marker in every registry that exists. Nothing about
// a marker is scoped to one deployment. A lender therefore does not need everyone in one place:
// it computes the marker once and reads it against every registry address it knows. No shared
// operator, no data-sharing agreement, no consortium — three independent reads.
//
// This module is the seam where that read plugs in. It is deliberately inert: `federationSource`
// is `null` in this build, and the UI renders the mechanism rather than a result, because a
// cross-registry check that has not run must not be drawn as though it had.

/** Where a registry lives relative to the lender doing the checking. */
export type PeerKind = 'own' | 'peer';

export interface RegistryPeer {
  id: string;
  /** What the lender calls this registry in its own console. */
  label: string;
  /** Who runs it. Not who is in it — membership is never public. */
  operator: string;
  /** The Midnight network the registry contract is deployed on. */
  network: string;
  kind: PeerKind;
  /** The deployed contract address, once there is one to read. */
  contractAddress?: string;
}

/** What one registry can answer about one marker. There is no fourth possibility. */
export type MarkerVerdict = 'free' | 'encumbered' | 'unreachable';

export interface PeerAnswer {
  peerId: string;
  verdict: MarkerVerdict;
  /** ISO timestamp of the read that produced this verdict. */
  readAt: string;
}

export interface CrossRegistryAnswer {
  /** The marker that was checked, hex, as every registry would compute it. */
  marker: string;
  answers: readonly PeerAnswer[];
}

/**
 * The live cross-registry check.
 *
 * TODO(wave-2): implement against `@stockandfoil/sdk` once `registerPeer` and the multi-address
 * read land in `sdk/src/backend`. The implementation is one `publicState()` read per address plus
 * a marker lookup — it needs no new circuit, because the marker is already the same everywhere.
 * Wire it here and the section below starts reporting verdicts instead of describing them; until
 * then the UI must keep saying that nothing has been checked.
 */
export const federationSource: FederationSource | null = null;

export interface FederationSource {
  peers(): readonly RegistryPeer[];
  check(marker: string): Promise<CrossRegistryAnswer>;
}

/**
 * The shapes a deployment takes, drawn in the diagram. These are architecture, not customers:
 * nothing here claims that any of these registries exists today. The one registry this project
 * has actually deployed is reported on `/proof`, from the files the CLI wrote.
 */
export interface RegistryShape {
  key: string;
  label: string;
  note: string;
}

export const REGISTRY_SHAPES: readonly RegistryShape[] = [
  {
    key: 'own',
    label: 'Its own registry',
    note: 'One factoring house, its own branches and borrowers. Catches the same invoice pledged twice inside one book — on day one, with nobody else’s agreement.',
  },
  {
    key: 'bank',
    label: 'A bank’s registry',
    note: 'A different operator, a different member list, the same contract. The lender holds its address the way it holds a counterparty’s LEI.',
  },
  {
    key: 'body',
    label: 'A trade body’s registry',
    note: 'The consortium, if and when it happens. It is one more address to read, not the precondition for reading any of them.',
  },
];
