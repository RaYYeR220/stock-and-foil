import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum PledgeStatus { OFFERED = 0, PLEDGED = 1, RELEASED = 2, SETTLED = 3 }

export type PledgeState = { status: PledgeStatus;
                            holderTag: bigint;
                            expiry: bigint;
                            recordId: Uint8Array;
                            payeeTag: bigint;
                            amount: bigint;
                            claimed: boolean
                          };

export type DisclosureRequest = { recordId: Uint8Array;
                                  caseRef: Uint8Array;
                                  approvals: boolean[]
                                };

export type CipherRecord = { version: bigint;
                             E: __compactRuntime.JubjubPoint;
                             ct: bigint[]
                           };

export type CipherShare = { version: bigint;
                            E2: __compactRuntime.JubjubPoint;
                            ct: bigint[]
                          };

export type Invoice = { debtorId: bigint;
                        sellerId: bigint;
                        invoiceNo: bigint;
                        amount: bigint;
                        dueDate: bigint;
                        salt: bigint
                      };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localScalar(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  ephemeralScalar(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  callInvoice(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Invoice];
  debtorPathFor(context: __compactRuntime.WitnessContext<Ledger, PS>,
                leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                            path: { sibling: { field: bigint },
                                                    goes_left: boolean
                                                  }[]
                                          }];
  financierPathFor(context: __compactRuntime.WitnessContext<Ledger, PS>,
                   leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                               path: { sibling: { field: bigint
                                                                },
                                                       goes_left: boolean
                                                     }[]
                                             }];
  ackPathFor(context: __compactRuntime.WitnessContext<Ledger, PS>,
             leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                         path: { sibling: { field: bigint },
                                                 goes_left: boolean
                                               }[]
                                       }];
}

export type ImpureCircuits<PS> = {
  admitDebtor(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  admitFinancier(context: __compactRuntime.CircuitContext<PS>,
                 leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acknowledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  offer(context: __compactRuntime.CircuitContext<PS>,
        holderTag_0: bigint,
        expiry_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  release(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  payInvoice(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimAsHolder(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimAsSeller(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  requestDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    recordId_0: Uint8Array,
                    caseRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    requestId_0: Uint8Array,
                    index_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  admitDebtor(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  admitFinancier(context: __compactRuntime.CircuitContext<PS>,
                 leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acknowledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  offer(context: __compactRuntime.CircuitContext<PS>,
        holderTag_0: bigint,
        expiry_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  release(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  payInvoice(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimAsHolder(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimAsSeller(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  requestDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    recordId_0: Uint8Array,
                    caseRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    requestId_0: Uint8Array,
                    index_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  operatorIdOf(sk_0: Uint8Array): Uint8Array;
  debtorLeaf(sk_0: Uint8Array): Uint8Array;
  debtorIdOf(sk_0: Uint8Array): bigint;
  sellerIdOf(sk_0: Uint8Array): bigint;
  financierLeaf(sk_0: Uint8Array): Uint8Array;
  ackNullifierOf(sk_0: Uint8Array, sellerId_0: bigint, invoiceNo_0: bigint): Uint8Array;
  holderTagOf(sk_0: Uint8Array, n_0: Uint8Array): bigint;
  sellerPayeeTagOf(sellerId_0: bigint, n_0: Uint8Array): bigint;
  certIdOf(lenderRef_0: Uint8Array, lenderNonce_0: Uint8Array): Uint8Array;
  borrowerCommitOf(sellerId_0: bigint, lenderNonce_0: Uint8Array): Uint8Array;
  fingerprint(inv_0: Invoice): Uint8Array;
  ackLeafFromFingerprint(f_0: Uint8Array): Uint8Array;
  nullifierFromFingerprint(f_0: Uint8Array): Uint8Array;
  ackLeafOf(inv_0: Invoice): Uint8Array;
  nullifierOf(inv_0: Invoice): Uint8Array;
  packFields(invoiceNo_0: bigint, amount_0: bigint, dueDate_0: bigint): bigint;
  cipherVersion(): bigint;
  pubKeyOf(k_0: bigint): __compactRuntime.JubjubPoint;
  mulPoint(P_0: __compactRuntime.JubjubPoint, k_0: bigint): __compactRuntime.JubjubPoint;
  addPoints(P_0: __compactRuntime.JubjubPoint, Q_0: __compactRuntime.JubjubPoint): __compactRuntime.JubjubPoint;
  identityPoint(): __compactRuntime.JubjubPoint;
  maskOf(S_0: __compactRuntime.JubjubPoint, j_0: bigint): bigint;
  recordIdOf(n_0: Uint8Array, E_0: __compactRuntime.JubjubPoint): Uint8Array;
  requestIdOf(recordId_0: Uint8Array, caseRef_0: Uint8Array): Uint8Array;
  shareKeyOf(requestId_0: Uint8Array, index_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  operatorIdOf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  debtorLeaf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  debtorIdOf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  sellerIdOf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  financierLeaf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  ackNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                 sk_0: Uint8Array,
                 sellerId_0: bigint,
                 invoiceNo_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  holderTagOf(context: __compactRuntime.CircuitContext<PS>,
              sk_0: Uint8Array,
              n_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  sellerPayeeTagOf(context: __compactRuntime.CircuitContext<PS>,
                   sellerId_0: bigint,
                   n_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  certIdOf(context: __compactRuntime.CircuitContext<PS>,
           lenderRef_0: Uint8Array,
           lenderNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  borrowerCommitOf(context: __compactRuntime.CircuitContext<PS>,
                   sellerId_0: bigint,
                   lenderNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  fingerprint(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  ackLeafFromFingerprint(context: __compactRuntime.CircuitContext<PS>,
                         f_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  nullifierFromFingerprint(context: __compactRuntime.CircuitContext<PS>,
                           f_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  ackLeafOf(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  nullifierOf(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  packFields(context: __compactRuntime.CircuitContext<PS>,
             invoiceNo_0: bigint,
             amount_0: bigint,
             dueDate_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  cipherVersion(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  pubKeyOf(context: __compactRuntime.CircuitContext<PS>, k_0: bigint): __compactRuntime.CircuitResults<PS, __compactRuntime.JubjubPoint>;
  mulPoint(context: __compactRuntime.CircuitContext<PS>,
           P_0: __compactRuntime.JubjubPoint,
           k_0: bigint): __compactRuntime.CircuitResults<PS, __compactRuntime.JubjubPoint>;
  addPoints(context: __compactRuntime.CircuitContext<PS>,
            P_0: __compactRuntime.JubjubPoint,
            Q_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, __compactRuntime.JubjubPoint>;
  identityPoint(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, __compactRuntime.JubjubPoint>;
  maskOf(context: __compactRuntime.CircuitContext<PS>,
         S_0: __compactRuntime.JubjubPoint,
         j_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  recordIdOf(context: __compactRuntime.CircuitContext<PS>,
             n_0: Uint8Array,
             E_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  requestIdOf(context: __compactRuntime.CircuitContext<PS>,
              recordId_0: Uint8Array,
              caseRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  shareKeyOf(context: __compactRuntime.CircuitContext<PS>,
             requestId_0: Uint8Array,
             index_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  admitDebtor(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  admitFinancier(context: __compactRuntime.CircuitContext<PS>,
                 leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acknowledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  offer(context: __compactRuntime.CircuitContext<PS>,
        holderTag_0: bigint,
        expiry_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  release(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  payInvoice(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  claimAsHolder(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  claimAsSeller(context: __compactRuntime.CircuitContext<PS>,
                n_0: Uint8Array,
                to_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  requestDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    recordId_0: Uint8Array,
                    caseRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDisclosure(context: __compactRuntime.CircuitContext<PS>,
                    requestId_0: Uint8Array,
                    index_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly operatorId: Uint8Array;
  readonly disclosurePk: __compactRuntime.JubjubPoint;
  readonly keyholderPks: __compactRuntime.JubjubPoint[];
  readonly threshold: bigint;
  readonly auditorPk: __compactRuntime.JubjubPoint;
  readonly settlementColor: Uint8Array;
  debtors: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  financiers: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  acks: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  ackNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  pledges: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): PledgeState;
    [Symbol.iterator](): Iterator<[Uint8Array, PledgeState]>
  };
  records: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): CipherRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, CipherRecord]>
  };
  requests: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): DisclosureRequest;
    [Symbol.iterator](): Iterator<[Uint8Array, DisclosureRequest]>
  };
  shares: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): CipherShare;
    [Symbol.iterator](): Iterator<[Uint8Array, CipherShare]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               opId_0: Uint8Array,
               dPk_0: __compactRuntime.JubjubPoint,
               kPks_0: __compactRuntime.JubjubPoint[],
               aPk_0: __compactRuntime.JubjubPoint,
               color_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
