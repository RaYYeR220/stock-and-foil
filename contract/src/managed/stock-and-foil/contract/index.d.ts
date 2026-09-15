import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Invoice = { debtorId: bigint;
                        sellerId: bigint;
                        invoiceNo: bigint;
                        amount: bigint;
                        dueDate: bigint;
                        salt: bigint
                      };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  callInvoice(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Invoice];
  debtorPathFor(context: __compactRuntime.WitnessContext<Ledger, PS>,
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
}

export type ProvableCircuits<PS> = {
  admitDebtor(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  admitFinancier(context: __compactRuntime.CircuitContext<PS>,
                 leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acknowledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  operatorIdOf(sk_0: Uint8Array): Uint8Array;
  debtorLeaf(sk_0: Uint8Array): Uint8Array;
  debtorIdOf(sk_0: Uint8Array): bigint;
  sellerIdOf(sk_0: Uint8Array): bigint;
  financierLeaf(sk_0: Uint8Array): Uint8Array;
  ackNullifierOf(sk_0: Uint8Array, sellerId_0: bigint, invoiceNo_0: bigint): Uint8Array;
  fingerprint(inv_0: Invoice): Uint8Array;
  ackLeafOf(inv_0: Invoice): Uint8Array;
  nullifierOf(inv_0: Invoice): Uint8Array;
  pubKeyOf(k_0: bigint): __compactRuntime.JubjubPoint;
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
  fingerprint(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  ackLeafOf(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  nullifierOf(context: __compactRuntime.CircuitContext<PS>, inv_0: Invoice): __compactRuntime.CircuitResults<PS, Uint8Array>;
  pubKeyOf(context: __compactRuntime.CircuitContext<PS>, k_0: bigint): __compactRuntime.CircuitResults<PS, __compactRuntime.JubjubPoint>;
  admitDebtor(context: __compactRuntime.CircuitContext<PS>, leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  admitFinancier(context: __compactRuntime.CircuitContext<PS>,
                 leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  acknowledge(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
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
