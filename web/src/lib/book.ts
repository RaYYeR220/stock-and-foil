// SPDX-License-Identifier: Apache-2.0
//
// The invoice book, joined to what the ledger says about each entry. A workspace needs both: the
// private document it holds, and the public marker the registry keeps for it.
import { useEffect, useState } from 'react';
import { pureCircuits } from '@stockandfoil/contract';
import { encumbranceOf, findPledge, toHex, type Encumbrance, type PledgeView } from './sdk.js';
import { useRegistry } from '../state/registry.js';
import type { BookEntry } from './world.js';

export interface BookRow {
  entry: BookEntry;
  nullifier: Uint8Array;
  nullifierHex: string;
  ackLeaf: Uint8Array;
  acknowledged: boolean;
  pledge?: PledgeView;
  encumbrance: Encumbrance;
}

/** Every invoice in the sandbox, with its ledger state resolved. Re-reads after every action. */
export function useBook(): BookRow[] {
  const { world, view, now, revision, status } = useRegistry();
  const [rows, setRows] = useState<BookRow[]>([]);

  useEffect(() => {
    if (!world || !view || status !== 'ready') return;
    let live = true;
    void (async () => {
      const resolved = await Promise.all(
        world.book.map(async (entry) => {
          const nullifier = pureCircuits.nullifierOf(entry.invoice);
          const ackLeaf = pureCircuits.ackLeafOf(entry.invoice);
          const acknowledged = (await world.backend.pathForAck(ackLeaf)) !== undefined;
          const pledge = findPledge(view, nullifier);
          return {
            entry,
            nullifier,
            nullifierHex: toHex(nullifier),
            ackLeaf,
            acknowledged,
            pledge,
            encumbrance: encumbranceOf(pledge, now),
          } satisfies BookRow;
        }),
      );
      if (live) setRows(resolved);
    })();
    return () => {
      live = false;
    };
  }, [world, view, now, revision, status]);

  return rows;
}

/** A public label padded into the 32 bytes a lender reference or case reference needs. */
export function labelToBytes32(label: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(label).slice(0, 32));
  return out;
}

export const isHex32 = (value: string): boolean => /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
