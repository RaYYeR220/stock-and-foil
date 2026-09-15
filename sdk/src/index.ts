// SPDX-License-Identifier: Apache-2.0
//
// Stock & Foil SDK. One backend interface, two implementations, six role clients.
//
//   import { SimulatorBackend, generateRegistryKeys, SellerClient } from '@stockandfoil/sdk';
//
// Node-only helpers (headless wallet, filesystem ZK artifacts, LevelDB private state) live in
// `@stockandfoil/sdk/node` so that a browser bundle never imports them.

// Bytes and addresses
export {
  bytesEqual,
  fromHex,
  hex,
  NATIVE_TOKEN_COLOR,
  toBytes32,
  toHex,
  userAddress,
  ZERO_BYTES32,
  type UserAddress,
} from './bytes.js';

// Refusals
export {
  asRefusal,
  isRefusal,
  isRefusalCode,
  Refusal,
  REFUSAL_CODES,
  REFUSAL_MESSAGES,
  refusalCodeOf,
  rethrowAsRefusal,
  type RefusalCode,
} from './errors.js';

// Types
export {
  encumbranceOf,
  findCertificate,
  findPledge,
  findRecord,
  findRequest,
  findShare,
  pledgeStatusName,
  PLEDGE_STATUS_NAMES,
  PledgeStatus,
  type Bytes32,
  type CallInputs,
  type CertificateView,
  type Encumbrance,
  type Invoice,
  type MerklePath,
  type NetworkName,
  type PledgeStatusName,
  type PledgeView,
  type Point,
  type PublicLedgerView,
  type RecordView,
  type RegistryBackend,
  type RegistryConfig,
  type RequestView,
  type Role,
  type ShareView,
  type StockAndFoilPrivateState,
  type TxReceipt,
} from './types.js';

// Crypto
export {
  combineShares,
  invL,
  JUBJUB_ORDER,
  FIELD_MODULUS,
  lagrangeAtZero,
  modL,
  randomBytes32,
  randomField,
  randomScalar,
  splitSecret,
  type Share,
} from './crypto/scalar.js';
export {
  checkCeremony,
  combinePublicShares,
  generateAuditorKey,
  generatePersona,
  generateRegistryKeys,
  runDisclosureCeremony,
  verifyRegistryConfig,
  type AuditorKey,
  type CeremonyCheck,
  type DisclosureCeremony,
  type RegistryConfigCheck,
  type RegistryConstructorArgs,
  type RegistryKeys,
} from './crypto/keys.js';
export {
  CIPHER_VERSION,
  CipherVersionError,
  decryptRecord,
  decryptShare,
  modP,
  openFields,
  packFields,
  packRecordFields,
  recoverSharedSecret,
  sealFields,
  unpackFields,
  unpackRecordFields,
  verifyDisclosure,
  verifyRecordDisclosure,
  type DecryptionShare,
  type DisclosureVerification,
  type OpenedRecord,
  type RecordFields,
} from './crypto/records.js';

// Public-ledger audit checks
export {
  openableRecords,
  recordDisclosureState,
  reusedSealingKeys,
  type RecordDisclosureState,
  type ReusedSealingKey,
} from './audit.js';

// Backends
export { SimulatorBackend, type SimulatorDeployOptions, type SimulatorSnapshot } from './backend/simulator.js';
export {
  CIRCUIT_IDS,
  NetworkBackend,
  VERIFIER_KEYS_PER_TX,
  defaultPrivateStateId,
  type NetworkBackendOptionsBase,
  type NetworkConnectOptions,
  type NetworkDeployOptions,
} from './backend/network.js';
export {
  createProviders,
  dappConnectorWalletAdapter,
  DEFAULT_PROOF_TIMEOUT_MS,
  fetchZkConfigProvider,
  inMemoryPrivateStateProvider,
  NETWORKS,
  type ChainNetwork,
  type CreateProvidersOptions,
  type DAppConnectorOptions,
  type DAppConnectorWallet,
  type NetworkEndpoints,
  type RegistryProviders,
  type WalletAdapter,
} from './backend/providers.js';
export { toPublicLedgerView } from './backend/view.js';

// Role clients
export {
  AuditorClient,
  DebtorClient,
  FinancierClient,
  KeyholderClient,
  OperatorClient,
  RoleClient,
  SellerClient,
  type CertificateCheck,
  type CertificateSlot,
  type CertifyOptions,
  type Disclosure,
  type KeyholderIndex,
  type PoolSlot,
} from './roles/index.js';
