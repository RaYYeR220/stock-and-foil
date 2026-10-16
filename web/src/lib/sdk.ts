// SPDX-License-Identifier: Apache-2.0
//
// The Sandbox slice of the SDK.
//
// `@stockandfoil/sdk` is one barrel, and it re-exports the network backend — which pulls in
// midnight-js and a ten-megabyte ledger WebAssembly module. The Sandbox needs none of that: it
// runs the compiled circuits through `compact-runtime` alone. Importing the simulator, the role
// clients and the types directly keeps the first paint of this app to the contract runtime, and
// leaves the whole network stack behind the one dynamic import in `network.ts`.
//
// `contractStateFromHex` is the one thing here that is not the Sandbox: the federation panel
// reads two deployed contracts' public state straight from the preview indexer, which serves it
// as the ledger-serialized bytes of a `ContractState`. Decoding those needs the contract's own
// runtime — already in this bundle, because the Sandbox runs the compiled circuits on it — and
// not one line of midnight-js.
import { ContractState } from '@midnight-ntwrk/compact-runtime';

export { SimulatorBackend, type SimulatorSnapshot } from '../../../sdk/src/backend/simulator.js';
export { decodeSnapshot, encodeSnapshot } from '../../../sdk/src/backend/snapshot.js';
export { toPublicLedgerView } from '../../../sdk/src/backend/view.js';

/** Hex from the indexer's `contractAction { state }` → the state the contract's `ledger()` reads. */
export function contractStateFromHex(hexState: string): ContractState {
  const body = hexState.startsWith('0x') ? hexState.slice(2) : hexState;
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return ContractState.deserialize(bytes);
}
export {
  fromHex,
  hex,
  toBytes32,
  toHex,
  userAddress,
  type UserAddress,
} from '../../../sdk/src/bytes.js';
export {
  isRefusal,
  Refusal,
  REFUSAL_CODES,
  REFUSAL_MESSAGES,
  refusalCodeOf,
  type RefusalCode,
} from '../../../sdk/src/errors.js';
export {
  generatePersona,
  generateRegistryKeys,
  type RegistryKeys,
} from '../../../sdk/src/crypto/keys.js';
export {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  SellerClient,
  type Disclosure,
  type PoolSlot,
} from '../../../sdk/src/roles/index.js';
export {
  encumbranceOf,
  findCertificate,
  findPeer,
  findPledge,
  findRecord,
  findRequest,
  PledgeStatus,
  type CertificateView,
  type Encumbrance,
  type Invoice,
  type PeerView,
  type PledgeView,
  type Point,
  type PublicLedgerView,
  type RecordView,
  type RequestView,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '../../../sdk/src/types.js';
