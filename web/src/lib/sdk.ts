// SPDX-License-Identifier: Apache-2.0
//
// The Sandbox slice of the SDK.
//
// `@stockandfoil/sdk` is one barrel, and it re-exports the network backend — which pulls in
// midnight-js and a ten-megabyte ledger WebAssembly module. The Sandbox needs none of that: it
// runs the compiled circuits through `compact-runtime` alone. Importing the simulator, the role
// clients and the types directly keeps the first paint of this app to the contract runtime, and
// leaves the whole network stack behind the one dynamic import in `network.ts`.
export { SimulatorBackend, type SimulatorSnapshot } from '../../../sdk/src/backend/simulator.js';
export { decodeSnapshot, encodeSnapshot } from '../../../sdk/src/backend/snapshot.js';
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
  findPledge,
  findRecord,
  findRequest,
  PledgeStatus,
  type CertificateView,
  type Encumbrance,
  type Invoice,
  type PledgeView,
  type Point,
  type PublicLedgerView,
  type RecordView,
  type RequestView,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from '../../../sdk/src/types.js';
