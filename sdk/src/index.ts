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
  findPeer,
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
  type PeerView,
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
export { decodeSnapshot, encodeSnapshot } from './backend/snapshot.js';
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
  type CreateProvidersOptions,
  type DAppConnectorOptions,
  type DAppConnectorWallet,
  type RegistryProviders,
  type WalletAdapter,
} from './backend/providers.js';

// Where each network lives, and how a Blockfrost token reaches it
export {
  blockfrostTokenFor,
  BlockfrostTokenMismatchError,
  CHAIN_NETWORKS,
  isChainNetwork,
  MissingBlockfrostTokenError,
  NETWORK_DESCRIPTORS,
  NETWORKS,
  redactEndpoint,
  redactEndpoints,
  requiresBlockfrostToken,
  resolveEndpoints,
  type ChainNetwork,
  type Environment,
  type NetworkDescriptor,
  type NetworkEndpoints,
  type ResolveEndpointsOptions,
} from './backend/endpoints.js';

// Indexer reads midnight-js does not expose: chain time, explorer anchors, fees paid
export {
  chainTimeSeconds,
  clearIndexerSchemaCache,
  fetchRawTransactions,
  formatDust,
  indexerFeeShape,
  indexerQuery,
  IndexerError,
  latestBlock,
  resolveTransactions,
  SPECK_PER_DUST,
  totalFeeSpeck,
  type FeeShape,
  type TxAnchor,
} from './backend/indexer.js';

// DUST fee sponsorship
export {
  describeTransaction,
  deserializeSponsoredTx,
  requestSponsorship,
  serializeSponsoredTx,
  SPONSOR_PATH,
  SPONSOR_PROTOCOL_VERSION,
  SponsorError,
  sponsoredWalletAdapter,
  type SponsorClientOptions,
  type SponsoredWalletOptions,
  type SponsorErrorBody,
  type SponsorRefusalCode,
  type SponsorRequest,
  type SponsorResponse,
  type TransactionAction,
  type TransactionDescription,
} from './backend/sponsor.js';

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
  type ContractAddressValue,
  type Disclosure,
  type FederatedEncumbrance,
  type KeyholderIndex,
  type PeerDeclaration,
  type PoolSlot,
  type RegistryEncumbrance,
} from './roles/index.js';
