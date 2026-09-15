// SPDX-License-Identifier: Apache-2.0
//
// The six role clients. Each is written once against `RegistryBackend`, so the same workflow
// runs in the browser Sandbox and against a deployed contract without changing a line.
export { RoleClient } from './base.js';
export { OperatorClient } from './operator.js';
export { DebtorClient } from './debtor.js';
export { SellerClient, type CertifyOptions, type PoolSlot } from './seller.js';
export { FinancierClient } from './financier.js';
export { AuditorClient, type Disclosure } from './auditor.js';
export { KeyholderClient, type KeyholderIndex } from './keyholder.js';
