import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

export var PledgeStatus;
(function (PledgeStatus) {
  PledgeStatus[PledgeStatus['OFFERED'] = 0] = 'OFFERED';
  PledgeStatus[PledgeStatus['PLEDGED'] = 1] = 'PLEDGED';
  PledgeStatus[PledgeStatus['RELEASED'] = 2] = 'RELEASED';
  PledgeStatus[PledgeStatus['SETTLED'] = 3] = 'SETTLED';
})(PledgeStatus || (PledgeStatus = {}));

const _descriptor_0 = __compactRuntime.CompactTypeJubjubPoint;

const _descriptor_1 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_2 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_3 = __compactRuntime.CompactTypeField;

const _descriptor_4 = new __compactRuntime.CompactTypeVector(5, _descriptor_3);

class _CipherRecord_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_0.alignment().concat(_descriptor_4.alignment()));
  }
  fromValue(value_0) {
    return {
      version: _descriptor_2.fromValue(value_0),
      E: _descriptor_0.fromValue(value_0),
      ct: _descriptor_4.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.version).concat(_descriptor_0.toValue(value_0.E).concat(_descriptor_4.toValue(value_0.ct)));
  }
}

const _descriptor_5 = new _CipherRecord_0();

const _descriptor_6 = __compactRuntime.CompactTypeBoolean;

const _descriptor_7 = new __compactRuntime.CompactTypeVector(3, _descriptor_6);

class _DisclosureRequest_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_7.alignment()));
  }
  fromValue(value_0) {
    return {
      recordId: _descriptor_1.fromValue(value_0),
      caseRef: _descriptor_1.fromValue(value_0),
      approvals: _descriptor_7.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.recordId).concat(_descriptor_1.toValue(value_0.caseRef).concat(_descriptor_7.toValue(value_0.approvals)));
  }
}

const _descriptor_8 = new _DisclosureRequest_0();

const _descriptor_9 = new __compactRuntime.CompactTypeVector(2, _descriptor_3);

class _CipherShare_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_0.alignment().concat(_descriptor_9.alignment()));
  }
  fromValue(value_0) {
    return {
      version: _descriptor_2.fromValue(value_0),
      E2: _descriptor_0.fromValue(value_0),
      ct: _descriptor_9.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.version).concat(_descriptor_0.toValue(value_0.E2).concat(_descriptor_9.toValue(value_0.ct)));
  }
}

const _descriptor_10 = new _CipherShare_0();

const _descriptor_11 = new __compactRuntime.CompactTypeVector(3, _descriptor_0);

class _UserAddress_0 {
  alignment() {
    return _descriptor_1.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.bytes);
  }
}

const _descriptor_12 = new _UserAddress_0();

const _descriptor_13 = new __compactRuntime.CompactTypeEnum(3, 1);

const _descriptor_14 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

class _PledgeState_0 {
  alignment() {
    return _descriptor_13.alignment().concat(_descriptor_3.alignment().concat(_descriptor_14.alignment().concat(_descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_14.alignment().concat(_descriptor_6.alignment()))))));
  }
  fromValue(value_0) {
    return {
      status: _descriptor_13.fromValue(value_0),
      holderTag: _descriptor_3.fromValue(value_0),
      expiry: _descriptor_14.fromValue(value_0),
      recordId: _descriptor_1.fromValue(value_0),
      payeeTag: _descriptor_3.fromValue(value_0),
      amount: _descriptor_14.fromValue(value_0),
      claimed: _descriptor_6.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_13.toValue(value_0.status).concat(_descriptor_3.toValue(value_0.holderTag).concat(_descriptor_14.toValue(value_0.expiry).concat(_descriptor_1.toValue(value_0.recordId).concat(_descriptor_3.toValue(value_0.payeeTag).concat(_descriptor_14.toValue(value_0.amount).concat(_descriptor_6.toValue(value_0.claimed)))))));
  }
}

const _descriptor_15 = new _PledgeState_0();

class _Invoice_0 {
  alignment() {
    return _descriptor_3.alignment().concat(_descriptor_3.alignment().concat(_descriptor_14.alignment().concat(_descriptor_14.alignment().concat(_descriptor_14.alignment().concat(_descriptor_3.alignment())))));
  }
  fromValue(value_0) {
    return {
      debtorId: _descriptor_3.fromValue(value_0),
      sellerId: _descriptor_3.fromValue(value_0),
      invoiceNo: _descriptor_14.fromValue(value_0),
      amount: _descriptor_14.fromValue(value_0),
      dueDate: _descriptor_14.fromValue(value_0),
      salt: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.debtorId).concat(_descriptor_3.toValue(value_0.sellerId).concat(_descriptor_14.toValue(value_0.invoiceNo).concat(_descriptor_14.toValue(value_0.amount).concat(_descriptor_14.toValue(value_0.dueDate).concat(_descriptor_3.toValue(value_0.salt))))));
  }
}

const _descriptor_16 = new _Invoice_0();

class _PoolSlot_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_14.alignment());
  }
  fromValue(value_0) {
    return {
      n: _descriptor_1.fromValue(value_0),
      amount: _descriptor_14.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.n).concat(_descriptor_14.toValue(value_0.amount));
  }
}

const _descriptor_17 = new _PoolSlot_0();

const _descriptor_18 = new __compactRuntime.CompactTypeVector(4, _descriptor_1);

class _Certificate_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_14.alignment().concat(_descriptor_2.alignment().concat(_descriptor_14.alignment().concat(_descriptor_18.alignment())))));
  }
  fromValue(value_0) {
    return {
      borrowerCommit: _descriptor_1.fromValue(value_0),
      lenderRef: _descriptor_1.fromValue(value_0),
      floor: _descriptor_14.fromValue(value_0),
      count: _descriptor_2.fromValue(value_0),
      validUntil: _descriptor_14.fromValue(value_0),
      nullifiers: _descriptor_18.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.borrowerCommit).concat(_descriptor_1.toValue(value_0.lenderRef).concat(_descriptor_14.toValue(value_0.floor).concat(_descriptor_2.toValue(value_0.count).concat(_descriptor_14.toValue(value_0.validUntil).concat(_descriptor_18.toValue(value_0.nullifiers))))));
  }
}

const _descriptor_19 = new _Certificate_0();

class _MerkleTreeDigest_0 {
  alignment() {
    return _descriptor_3.alignment();
  }
  fromValue(value_0) {
    return {
      field: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.field);
  }
}

const _descriptor_20 = new _MerkleTreeDigest_0();

const _descriptor_21 = new __compactRuntime.CompactTypeVector(4, _descriptor_3);

const _descriptor_22 = new __compactRuntime.CompactTypeVector(4, _descriptor_6);

class _MerkleTreePathEntry_0 {
  alignment() {
    return _descriptor_20.alignment().concat(_descriptor_6.alignment());
  }
  fromValue(value_0) {
    return {
      sibling: _descriptor_20.fromValue(value_0),
      goes_left: _descriptor_6.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_20.toValue(value_0.sibling).concat(_descriptor_6.toValue(value_0.goes_left));
  }
}

const _descriptor_23 = new _MerkleTreePathEntry_0();

const _descriptor_24 = new __compactRuntime.CompactTypeVector(16, _descriptor_23);

class _MerkleTreePath_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_24.alignment());
  }
  fromValue(value_0) {
    return {
      leaf: _descriptor_1.fromValue(value_0),
      path: _descriptor_24.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.leaf).concat(_descriptor_24.toValue(value_0.path));
  }
}

const _descriptor_25 = new _MerkleTreePath_0();

const _descriptor_26 = new __compactRuntime.CompactTypeVector(4, _descriptor_16);

const _descriptor_27 = new __compactRuntime.CompactTypeVector(10, _descriptor_23);

class _MerkleTreePath_1 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_27.alignment());
  }
  fromValue(value_0) {
    return {
      leaf: _descriptor_1.fromValue(value_0),
      path: _descriptor_27.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.leaf).concat(_descriptor_27.toValue(value_0.path));
  }
}

const _descriptor_28 = new _MerkleTreePath_1();

const _descriptor_29 = new __compactRuntime.CompactTypeVector(4, _descriptor_14);

const _descriptor_30 = new __compactRuntime.CompactTypeUnsignedInteger(73786976294838206463n, 9);

class _AckNullifierPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_14.alignment())));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      sk: _descriptor_1.fromValue(value_0),
      sellerId: _descriptor_3.fromValue(value_0),
      invoiceNo: _descriptor_14.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_1.toValue(value_0.sk).concat(_descriptor_3.toValue(value_0.sellerId).concat(_descriptor_14.toValue(value_0.invoiceNo))));
  }
}

const _descriptor_31 = new _AckNullifierPreimage_0();

class _PayeeTagPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_1.alignment()));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      sellerId: _descriptor_3.fromValue(value_0),
      n: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_3.toValue(value_0.sellerId).concat(_descriptor_1.toValue(value_0.n)));
  }
}

const _descriptor_32 = new _PayeeTagPreimage_0();

const _descriptor_33 = new __compactRuntime.CompactTypeVector(2, _descriptor_1);

class _BorrowerPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_1.alignment()));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      sellerId: _descriptor_3.fromValue(value_0),
      nonce: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_3.toValue(value_0.sellerId).concat(_descriptor_1.toValue(value_0.nonce)));
  }
}

const _descriptor_34 = new _BorrowerPreimage_0();

const _descriptor_35 = new __compactRuntime.CompactTypeVector(3, _descriptor_1);

class _ShareKeyPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_2.alignment()));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      requestId: _descriptor_1.fromValue(value_0),
      index: _descriptor_2.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_1.toValue(value_0.requestId).concat(_descriptor_2.toValue(value_0.index)));
  }
}

const _descriptor_36 = new _ShareKeyPreimage_0();

class _FingerprintPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_16.alignment());
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      inv: _descriptor_16.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_16.toValue(value_0.inv));
  }
}

const _descriptor_37 = new _FingerprintPreimage_0();

const _descriptor_38 = new __compactRuntime.CompactTypeBytes(6);

class _LeafPreimage_0 {
  alignment() {
    return _descriptor_38.alignment().concat(_descriptor_1.alignment());
  }
  fromValue(value_0) {
    return {
      domain_sep: _descriptor_38.fromValue(value_0),
      data: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_38.toValue(value_0.domain_sep).concat(_descriptor_1.toValue(value_0.data));
  }
}

const _descriptor_39 = new _LeafPreimage_0();

class _RecordIdPreimage_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment())));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_1.fromValue(value_0),
      n: _descriptor_1.fromValue(value_0),
      ex: _descriptor_3.fromValue(value_0),
      ey: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.domain).concat(_descriptor_1.toValue(value_0.n).concat(_descriptor_3.toValue(value_0.ex).concat(_descriptor_3.toValue(value_0.ey))));
  }
}

const _descriptor_40 = new _RecordIdPreimage_0();

const _descriptor_41 = new __compactRuntime.CompactTypeVector(3, _descriptor_3);

class _Either_0 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_1.alignment().concat(_descriptor_1.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_6.fromValue(value_0),
      left: _descriptor_1.fromValue(value_0),
      right: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0.is_left).concat(_descriptor_1.toValue(value_0.left).concat(_descriptor_1.toValue(value_0.right)));
  }
}

const _descriptor_42 = new _Either_0();

const _descriptor_43 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_1.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0.bytes);
  }
}

const _descriptor_44 = new _ContractAddress_0();

class _Either_1 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_44.alignment().concat(_descriptor_12.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_6.fromValue(value_0),
      left: _descriptor_44.fromValue(value_0),
      right: _descriptor_12.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0.is_left).concat(_descriptor_44.toValue(value_0.left).concat(_descriptor_12.toValue(value_0.right)));
  }
}

const _descriptor_45 = new _Either_1();

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    if (typeof(witnesses_0.localSecretKey) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named localSecretKey');
    }
    if (typeof(witnesses_0.localScalar) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named localScalar');
    }
    if (typeof(witnesses_0.ephemeralScalar) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named ephemeralScalar');
    }
    if (typeof(witnesses_0.callInvoice) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named callInvoice');
    }
    if (typeof(witnesses_0.debtorPathFor) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named debtorPathFor');
    }
    if (typeof(witnesses_0.financierPathFor) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named financierPathFor');
    }
    if (typeof(witnesses_0.ackPathFor) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named ackPathFor');
    }
    if (typeof(witnesses_0.certInvoices) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named certInvoices');
    }
    if (typeof(witnesses_0.certUsed) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named certUsed');
    }
    if (typeof(witnesses_0.certHolderTags) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named certHolderTags');
    }
    if (typeof(witnesses_0.certEphemerals) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named certEphemerals');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      operatorIdOf(context, ...args_1) {
        return { result: pureCircuits.operatorIdOf(...args_1), context };
      },
      debtorLeaf(context, ...args_1) {
        return { result: pureCircuits.debtorLeaf(...args_1), context };
      },
      debtorIdOf(context, ...args_1) {
        return { result: pureCircuits.debtorIdOf(...args_1), context };
      },
      sellerIdOf(context, ...args_1) {
        return { result: pureCircuits.sellerIdOf(...args_1), context };
      },
      financierLeaf(context, ...args_1) {
        return { result: pureCircuits.financierLeaf(...args_1), context };
      },
      ackNullifierOf(context, ...args_1) {
        return { result: pureCircuits.ackNullifierOf(...args_1), context };
      },
      holderTagOf(context, ...args_1) {
        return { result: pureCircuits.holderTagOf(...args_1), context };
      },
      sellerPayeeTagOf(context, ...args_1) {
        return { result: pureCircuits.sellerPayeeTagOf(...args_1), context };
      },
      fingerprint(context, ...args_1) {
        return { result: pureCircuits.fingerprint(...args_1), context };
      },
      ackLeafFromFingerprint(context, ...args_1) {
        return { result: pureCircuits.ackLeafFromFingerprint(...args_1), context };
      },
      nullifierFromFingerprint(context, ...args_1) {
        return { result: pureCircuits.nullifierFromFingerprint(...args_1), context };
      },
      ackLeafOf(context, ...args_1) {
        return { result: pureCircuits.ackLeafOf(...args_1), context };
      },
      nullifierOf(context, ...args_1) {
        return { result: pureCircuits.nullifierOf(...args_1), context };
      },
      packFields(context, ...args_1) {
        return { result: pureCircuits.packFields(...args_1), context };
      },
      cipherVersion(context, ...args_1) {
        return { result: pureCircuits.cipherVersion(...args_1), context };
      },
      pubKeyOf(context, ...args_1) {
        return { result: pureCircuits.pubKeyOf(...args_1), context };
      },
      mulPoint(context, ...args_1) {
        return { result: pureCircuits.mulPoint(...args_1), context };
      },
      addPoints(context, ...args_1) {
        return { result: pureCircuits.addPoints(...args_1), context };
      },
      identityPoint(context, ...args_1) {
        return { result: pureCircuits.identityPoint(...args_1), context };
      },
      maskOf(context, ...args_1) {
        return { result: pureCircuits.maskOf(...args_1), context };
      },
      recordIdOf(context, ...args_1) {
        return { result: pureCircuits.recordIdOf(...args_1), context };
      },
      requestIdOf(context, ...args_1) {
        return { result: pureCircuits.requestIdOf(...args_1), context };
      },
      shareKeyOf(context, ...args_1) {
        return { result: pureCircuits.shareKeyOf(...args_1), context };
      },
      certIdOf(context, ...args_1) {
        return { result: pureCircuits.certIdOf(...args_1), context };
      },
      borrowerCommitOf(context, ...args_1) {
        return { result: pureCircuits.borrowerCommitOf(...args_1), context };
      },
      poolCount(context, ...args_1) {
        return { result: pureCircuits.poolCount(...args_1), context };
      },
      poolTotal(context, ...args_1) {
        return { result: pureCircuits.poolTotal(...args_1), context };
      },
      poolDistinct(context, ...args_1) {
        return { result: pureCircuits.poolDistinct(...args_1), context };
      },
      admitDebtor: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`admitDebtor: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const leaf_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('admitDebtor',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 103 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('admitDebtor',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 103 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(leaf_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._admitDebtor_0(context, partialProofData, leaf_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      admitFinancier: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`admitFinancier: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const leaf_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('admitFinancier',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 108 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('admitFinancier',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 108 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(leaf_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._admitFinancier_0(context,
                                                partialProofData,
                                                leaf_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      acknowledge: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`acknowledge: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('acknowledge',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 116 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._acknowledge_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      offer: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`offer: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const holderTag_0 = args_1[1];
        const expiry_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('offer',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 172 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(holderTag_0) === 'bigint' && holderTag_0 >= 0 && holderTag_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('offer',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 172 char 1',
                                     'Field',
                                     holderTag_0)
        }
        if (!(typeof(expiry_0) === 'bigint' && expiry_0 >= 0n && expiry_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('offer',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 172 char 1',
                                     'Uint<0..18446744073709551616>',
                                     expiry_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_3.toValue(holderTag_0).concat(_descriptor_14.toValue(expiry_0)),
            alignment: _descriptor_3.alignment().concat(_descriptor_14.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._offer_0(context,
                                       partialProofData,
                                       holderTag_0,
                                       expiry_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      accept: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`accept: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const n_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('accept',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 191 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
          __compactRuntime.typeError('accept',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 191 char 1',
                                     'Bytes<32>',
                                     n_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(n_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._accept_0(context, partialProofData, n_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      release: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`release: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const n_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('release',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 206 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
          __compactRuntime.typeError('release',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 206 char 1',
                                     'Bytes<32>',
                                     n_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(n_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._release_0(context, partialProofData, n_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      certifyBorrowingBase: (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`certifyBorrowingBase: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const lenderRef_0 = args_1[1];
        const lenderNonce_0 = args_1[2];
        const floor_0 = args_1[3];
        const validUntil_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('certifyBorrowingBase',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 260 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(lenderRef_0.buffer instanceof ArrayBuffer && lenderRef_0.BYTES_PER_ELEMENT === 1 && lenderRef_0.length === 32)) {
          __compactRuntime.typeError('certifyBorrowingBase',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 260 char 1',
                                     'Bytes<32>',
                                     lenderRef_0)
        }
        if (!(lenderNonce_0.buffer instanceof ArrayBuffer && lenderNonce_0.BYTES_PER_ELEMENT === 1 && lenderNonce_0.length === 32)) {
          __compactRuntime.typeError('certifyBorrowingBase',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 260 char 1',
                                     'Bytes<32>',
                                     lenderNonce_0)
        }
        if (!(typeof(floor_0) === 'bigint' && floor_0 >= 0n && floor_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('certifyBorrowingBase',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'stock-and-foil.compact line 260 char 1',
                                     'Uint<0..18446744073709551616>',
                                     floor_0)
        }
        if (!(typeof(validUntil_0) === 'bigint' && validUntil_0 >= 0n && validUntil_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('certifyBorrowingBase',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'stock-and-foil.compact line 260 char 1',
                                     'Uint<0..18446744073709551616>',
                                     validUntil_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(lenderRef_0).concat(_descriptor_1.toValue(lenderNonce_0).concat(_descriptor_14.toValue(floor_0).concat(_descriptor_14.toValue(validUntil_0)))),
            alignment: _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_14.alignment().concat(_descriptor_14.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._certifyBorrowingBase_0(context,
                                                      partialProofData,
                                                      lenderRef_0,
                                                      lenderNonce_0,
                                                      floor_0,
                                                      validUntil_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      payInvoice: (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`payInvoice: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('payInvoice',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 304 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._payInvoice_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      claimAsHolder: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`claimAsHolder: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const n_0 = args_1[1];
        const to_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('claimAsHolder',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 345 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
          __compactRuntime.typeError('claimAsHolder',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 345 char 1',
                                     'Bytes<32>',
                                     n_0)
        }
        if (!(typeof(to_0) === 'object' && to_0.bytes.buffer instanceof ArrayBuffer && to_0.bytes.BYTES_PER_ELEMENT === 1 && to_0.bytes.length === 32)) {
          __compactRuntime.typeError('claimAsHolder',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 345 char 1',
                                     'struct UserAddress<bytes: Bytes<32>>',
                                     to_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(n_0).concat(_descriptor_12.toValue(to_0)),
            alignment: _descriptor_1.alignment().concat(_descriptor_12.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._claimAsHolder_0(context,
                                               partialProofData,
                                               n_0,
                                               to_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      claimAsSeller: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`claimAsSeller: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const n_0 = args_1[1];
        const to_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('claimAsSeller',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 349 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
          __compactRuntime.typeError('claimAsSeller',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 349 char 1',
                                     'Bytes<32>',
                                     n_0)
        }
        if (!(typeof(to_0) === 'object' && to_0.bytes.buffer instanceof ArrayBuffer && to_0.bytes.BYTES_PER_ELEMENT === 1 && to_0.bytes.length === 32)) {
          __compactRuntime.typeError('claimAsSeller',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 349 char 1',
                                     'struct UserAddress<bytes: Bytes<32>>',
                                     to_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(n_0).concat(_descriptor_12.toValue(to_0)),
            alignment: _descriptor_1.alignment().concat(_descriptor_12.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._claimAsSeller_0(context,
                                               partialProofData,
                                               n_0,
                                               to_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requestDisclosure: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`requestDisclosure: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const recordId_0 = args_1[1];
        const caseRef_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requestDisclosure',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 360 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(recordId_0.buffer instanceof ArrayBuffer && recordId_0.BYTES_PER_ELEMENT === 1 && recordId_0.length === 32)) {
          __compactRuntime.typeError('requestDisclosure',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 360 char 1',
                                     'Bytes<32>',
                                     recordId_0)
        }
        if (!(caseRef_0.buffer instanceof ArrayBuffer && caseRef_0.BYTES_PER_ELEMENT === 1 && caseRef_0.length === 32)) {
          __compactRuntime.typeError('requestDisclosure',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 360 char 1',
                                     'Bytes<32>',
                                     caseRef_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(recordId_0).concat(_descriptor_1.toValue(caseRef_0)),
            alignment: _descriptor_1.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requestDisclosure_0(context,
                                                   partialProofData,
                                                   recordId_0,
                                                   caseRef_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      approveDisclosure: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`approveDisclosure: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const requestId_0 = args_1[1];
        const index_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('approveDisclosure',
                                     'argument 1 (as invoked from Typescript)',
                                     'stock-and-foil.compact line 371 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(requestId_0.buffer instanceof ArrayBuffer && requestId_0.BYTES_PER_ELEMENT === 1 && requestId_0.length === 32)) {
          __compactRuntime.typeError('approveDisclosure',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'stock-and-foil.compact line 371 char 1',
                                     'Bytes<32>',
                                     requestId_0)
        }
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0n && index_0 <= 255n)) {
          __compactRuntime.typeError('approveDisclosure',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'stock-and-foil.compact line 371 char 1',
                                     'Uint<0..256>',
                                     index_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(requestId_0).concat(_descriptor_2.toValue(index_0)),
            alignment: _descriptor_1.alignment().concat(_descriptor_2.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._approveDisclosure_0(context,
                                                   partialProofData,
                                                   requestId_0,
                                                   index_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      admitDebtor: this.circuits.admitDebtor,
      admitFinancier: this.circuits.admitFinancier,
      acknowledge: this.circuits.acknowledge,
      offer: this.circuits.offer,
      accept: this.circuits.accept,
      release: this.circuits.release,
      certifyBorrowingBase: this.circuits.certifyBorrowingBase,
      payInvoice: this.circuits.payInvoice,
      claimAsHolder: this.circuits.claimAsHolder,
      claimAsSeller: this.circuits.claimAsSeller,
      requestDisclosure: this.circuits.requestDisclosure,
      approveDisclosure: this.circuits.approveDisclosure
    };
    this.provableCircuits = {
      admitDebtor: this.circuits.admitDebtor,
      admitFinancier: this.circuits.admitFinancier,
      acknowledge: this.circuits.acknowledge,
      offer: this.circuits.offer,
      accept: this.circuits.accept,
      release: this.circuits.release,
      certifyBorrowingBase: this.circuits.certifyBorrowingBase,
      payInvoice: this.circuits.payInvoice,
      claimAsHolder: this.circuits.claimAsHolder,
      claimAsSeller: this.circuits.claimAsSeller,
      requestDisclosure: this.circuits.requestDisclosure,
      approveDisclosure: this.circuits.approveDisclosure
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 6) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 6 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    const opId_0 = args_0[1];
    const dPk_0 = args_0[2];
    const kPks_0 = args_0[3];
    const aPk_0 = args_0[4];
    const color_0 = args_0[5];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!(opId_0.buffer instanceof ArrayBuffer && opId_0.BYTES_PER_ELEMENT === 1 && opId_0.length === 32)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 1 (argument 2 as invoked from Typescript)',
                                 'stock-and-foil.compact line 87 char 1',
                                 'Bytes<32>',
                                 opId_0)
    }
    if (!(Array.isArray(kPks_0) && kPks_0.length === 3 && kPks_0.every((t) => true))) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 3 (argument 4 as invoked from Typescript)',
                                 'stock-and-foil.compact line 87 char 1',
                                 'Vector<3, Opaque<"JubjubPoint">>',
                                 kPks_0)
    }
    if (!(color_0.buffer instanceof ArrayBuffer && color_0.BYTES_PER_ELEMENT === 1 && color_0.length === 32)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 5 (argument 6 as invoked from Typescript)',
                                 'stock-and-foil.compact line 87 char 1',
                                 'Bytes<32>',
                                 color_0)
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('admitDebtor', new __compactRuntime.ContractOperation());
    state_0.setOperation('admitFinancier', new __compactRuntime.ContractOperation());
    state_0.setOperation('acknowledge', new __compactRuntime.ContractOperation());
    state_0.setOperation('offer', new __compactRuntime.ContractOperation());
    state_0.setOperation('accept', new __compactRuntime.ContractOperation());
    state_0.setOperation('release', new __compactRuntime.ContractOperation());
    state_0.setOperation('certifyBorrowingBase', new __compactRuntime.ContractOperation());
    state_0.setOperation('payInvoice', new __compactRuntime.ContractOperation());
    state_0.setOperation('claimAsHolder', new __compactRuntime.ContractOperation());
    state_0.setOperation('claimAsSeller', new __compactRuntime.ContractOperation());
    state_0.setOperation('requestDisclosure', new __compactRuntime.ContractOperation());
    state_0.setOperation('approveDisclosure', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(1n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(({x: 0n, y: 1n})),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(2n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(new Array(3).fill(({x: 0n, y: 1n}))),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(3n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(4n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(({x: 0n, y: 1n})),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(5n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(6n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(10)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                        alignment: _descriptor_14.alignment() })).arrayPush(__compactRuntime.StateValue.newMap(
                                                                                                                                                                              new __compactRuntime.StateMap()
                                                                                                                                                                            ))
                                                          .encode() } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(7n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(10)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                        alignment: _descriptor_14.alignment() })).arrayPush(__compactRuntime.StateValue.newMap(
                                                                                                                                                                              new __compactRuntime.StateMap()
                                                                                                                                                                            ))
                                                          .encode() } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(8n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(16)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                        alignment: _descriptor_14.alignment() })).arrayPush(__compactRuntime.StateValue.newMap(
                                                                                                                                                                              new __compactRuntime.StateMap()
                                                                                                                                                                            ))
                                                          .encode() } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(9n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(10n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(11n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(12n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(13n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(14n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(opId_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(1n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(dPk_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(2n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(kPks_0),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = 2n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(3n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(4n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(aPk_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(5n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(color_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _left_0(value_0) {
    return { is_left: true, left: value_0, right: new Uint8Array(32) };
  }
  _right_0(value_0) {
    return { is_left: false, left: { bytes: new Uint8Array(32) }, right: value_0 };
  }
  _merkleTreePathRoot_0(path_0) {
    return { field:
               this._folder_0((...args_0) =>
                                this._merkleTreePathEntryRoot_0(...args_0),
                              this._degradeToTransient_0(this._persistentHash_0({ domain_sep:
                                                                                    new Uint8Array([109, 100, 110, 58, 108, 104]),
                                                                                  data:
                                                                                    path_0.leaf })),
                              path_0.path) };
  }
  _merkleTreePathRoot_1(path_0) {
    return { field:
               this._folder_1((...args_0) =>
                                this._merkleTreePathEntryRoot_0(...args_0),
                              this._degradeToTransient_0(this._persistentHash_0({ domain_sep:
                                                                                    new Uint8Array([109, 100, 110, 58, 108, 104]),
                                                                                  data:
                                                                                    path_0.leaf })),
                              path_0.path) };
  }
  _merkleTreePathEntryRoot_0(recursiveDigest_0, entry_0) {
    const left_0 = entry_0.goes_left ? recursiveDigest_0 : entry_0.sibling.field;
    const right_0 = entry_0.goes_left ?
                    entry_0.sibling.field :
                    recursiveDigest_0;
    return this._transientHash_0([left_0, right_0]);
  }
  _blockTimeLt_0(context, partialProofData, time_0) {
    return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                     partialProofData,
                                                                     [
                                                                      { dup: { n: 2 } },
                                                                      { idx: { cached: true,
                                                                               pushPath: false,
                                                                               path: [
                                                                                      { tag: 'value',
                                                                                        value: { value: _descriptor_2.toValue(2n),
                                                                                                 alignment: _descriptor_2.alignment() } }] } },
                                                                      { push: { storage: false,
                                                                                value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(time_0),
                                                                                                                             alignment: _descriptor_14.alignment() }).encode() } },
                                                                      'lt',
                                                                      { popeq: { cached: true,
                                                                                 result: undefined } }]).value);
  }
  _blockTimeGte_0(context, partialProofData, time_0) {
    return !this._blockTimeLt_0(context, partialProofData, time_0);
  }
  _sendUnshielded_0(context, partialProofData, color_0, amount_0, recipient_0) {
    const tmp_0 = this._left_0(color_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(7n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_42.toValue(tmp_0),
                                                                                              alignment: _descriptor_42.alignment() }).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_43.toValue(amount_0),
                                                                                              alignment: _descriptor_43.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    const tmp_1 = this._left_0(color_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(8n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.alignedConcat(
                                                                                              { value: _descriptor_42.toValue(tmp_1),
                                                                                                alignment: _descriptor_42.alignment() },
                                                                                              { value: _descriptor_45.toValue(recipient_0),
                                                                                                alignment: _descriptor_45.alignment() }
                                                                                            )).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_43.toValue(amount_0),
                                                                                              alignment: _descriptor_43.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    if (recipient_0.is_left
        &&
        this._equal_0(recipient_0.left.bytes,
                      _descriptor_44.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                 partialProofData,
                                                                                 [
                                                                                  { dup: { n: 2 } },
                                                                                  { idx: { cached: true,
                                                                                           pushPath: false,
                                                                                           path: [
                                                                                                  { tag: 'value',
                                                                                                    value: { value: _descriptor_2.toValue(0n),
                                                                                                             alignment: _descriptor_2.alignment() } }] } },
                                                                                  { popeq: { cached: true,
                                                                                             result: undefined } }]).value).bytes))
    {
      const tmp_2 = this._left_0(color_0);
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { swap: { n: 0 } },
                                         { idx: { cached: true,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_2.toValue(6n),
                                                                    alignment: _descriptor_2.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_42.toValue(tmp_2),
                                                                                                alignment: _descriptor_42.alignment() }).encode() } },
                                         { dup: { n: 1 } },
                                         { dup: { n: 1 } },
                                         'member',
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_43.toValue(amount_0),
                                                                                                alignment: _descriptor_43.alignment() }).encode() } },
                                         { swap: { n: 0 } },
                                         'neg',
                                         { branch: { skip: 4 } },
                                         { dup: { n: 2 } },
                                         { dup: { n: 2 } },
                                         { idx: { cached: true,
                                                  pushPath: false,
                                                  path: [ { tag: 'stack' }] } },
                                         'add',
                                         { ins: { cached: true, n: 2 } },
                                         { swap: { n: 0 } }]);
    }
    return [];
  }
  _receiveUnshielded_0(context, partialProofData, color_0, amount_0) {
    const tmp_0 = this._left_0(color_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { swap: { n: 0 } },
                                       { idx: { cached: true,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(6n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_42.toValue(tmp_0),
                                                                                              alignment: _descriptor_42.alignment() }).encode() } },
                                       { dup: { n: 1 } },
                                       { dup: { n: 1 } },
                                       'member',
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_43.toValue(amount_0),
                                                                                              alignment: _descriptor_43.alignment() }).encode() } },
                                       { swap: { n: 0 } },
                                       'neg',
                                       { branch: { skip: 4 } },
                                       { dup: { n: 2 } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: true,
                                                pushPath: false,
                                                path: [ { tag: 'stack' }] } },
                                       'add',
                                       { ins: { cached: true, n: 2 } },
                                       { swap: { n: 0 } }]);
    return [];
  }
  _transientHash_0(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_9, value_0);
    return result_0;
  }
  _transientHash_1(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_41, value_0);
    return result_0;
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_39, value_0);
    return result_0;
  }
  _persistentHash_1(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_40, value_0);
    return result_0;
  }
  _persistentHash_2(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_36, value_0);
    return result_0;
  }
  _persistentHash_3(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_37, value_0);
    return result_0;
  }
  _persistentHash_4(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_34, value_0);
    return result_0;
  }
  _persistentHash_5(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_35, value_0);
    return result_0;
  }
  _persistentHash_6(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_32, value_0);
    return result_0;
  }
  _persistentHash_7(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_33, value_0);
    return result_0;
  }
  _persistentHash_8(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_31, value_0);
    return result_0;
  }
  _degradeToTransient_0(x_0) {
    const result_0 = __compactRuntime.degradeToTransient(x_0);
    return result_0;
  }
  _jubjubPointX_0(np_0) {
    const result_0 = __compactRuntime.jubjubPointX(np_0);
    return result_0;
  }
  _jubjubPointY_0(np_0) {
    const result_0 = __compactRuntime.jubjubPointY(np_0);
    return result_0;
  }
  _ecAdd_0(a_0, b_0) {
    const result_0 = __compactRuntime.ecAdd(a_0, b_0);
    return result_0;
  }
  _ecMul_0(a_0, b_0) {
    const result_0 = __compactRuntime.ecMul(a_0, b_0);
    return result_0;
  }
  _ecMulGenerator_0(b_0) {
    const result_0 = __compactRuntime.ecMulGenerator(b_0);
    return result_0;
  }
  _constructJubjubPoint_0(x_0, y_0) {
    const result_0 = __compactRuntime.constructJubjubPoint(x_0, y_0);
    return result_0;
  }
  _operatorIdOf_0(sk_0) {
    return this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 111, 112, 101, 114, 97, 116, 111, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   sk_0]);
  }
  _debtorLeaf_0(sk_0) {
    return this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 100, 101, 98, 116, 111, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   sk_0]);
  }
  _debtorIdOf_0(sk_0) {
    return this._degradeToTransient_0(this._debtorLeaf_0(sk_0));
  }
  _sellerIdOf_0(sk_0) {
    return this._degradeToTransient_0(this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 115, 101, 108, 108, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                                              sk_0]));
  }
  _financierLeaf_0(sk_0) {
    return this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 102, 105, 110, 97, 110, 99, 105, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   sk_0]);
  }
  _ackNullifierOf_0(sk_0, sellerId_0, invoiceNo_0) {
    return this._persistentHash_8({ domain:
                                      new Uint8Array([115, 110, 102, 58, 118, 49, 58, 97, 99, 107, 110, 117, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    sk: sk_0,
                                    sellerId: sellerId_0,
                                    invoiceNo: invoiceNo_0 });
  }
  _holderTagOf_0(sk_0, n_0) {
    return this._degradeToTransient_0(this._persistentHash_5([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 104, 111, 108, 100, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                                              sk_0,
                                                              n_0]));
  }
  _sellerPayeeTagOf_0(sellerId_0, n_0) {
    return this._degradeToTransient_0(this._persistentHash_6({ domain:
                                                                 new Uint8Array([115, 110, 102, 58, 118, 49, 58, 115, 101, 108, 108, 101, 114, 112, 97, 121, 101, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                                               sellerId:
                                                                 sellerId_0,
                                                               n: n_0 }));
  }
  _fingerprint_0(inv_0) {
    return this._persistentHash_3({ domain:
                                      new Uint8Array([115, 110, 102, 58, 118, 49, 58, 105, 110, 118, 111, 105, 99, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    inv: inv_0 });
  }
  _ackLeafFromFingerprint_0(f_0) {
    return this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 97, 99, 107, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   f_0]);
  }
  _nullifierFromFingerprint_0(f_0) {
    return this._persistentHash_7([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 112, 108, 101, 100, 103, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   f_0]);
  }
  _ackLeafOf_0(inv_0) {
    return this._ackLeafFromFingerprint_0(this._fingerprint_0(inv_0));
  }
  _nullifierOf_0(inv_0) {
    return this._nullifierFromFingerprint_0(this._fingerprint_0(inv_0));
  }
  _packFields_0(invoiceNo_0, amount_0, dueDate_0) {
    return __compactRuntime.addField(__compactRuntime.addField(__compactRuntime.mulField(invoiceNo_0,
                                                                                         340282366920938463463374607431768211456n),
                                                               __compactRuntime.mulField(amount_0,
                                                                                         18446744073709551616n)),
                                     dueDate_0);
  }
  _cipherVersion_0() { return 1n; }
  _pubKeyOf_0(k_0) { return this._ecMulGenerator_0(k_0); }
  _mulPoint_0(P_0, k_0) { return this._ecMul_0(P_0, k_0); }
  _addPoints_0(P_0, Q_0) { return this._ecAdd_0(P_0, Q_0); }
  _identityPoint_0() { return this._constructJubjubPoint_0(0n, 1n); }
  _maskOf_0(S_0, j_0) {
    return this._transientHash_1([this._jubjubPointX_0(S_0),
                                  this._jubjubPointY_0(S_0),
                                  j_0]);
  }
  _recordIdOf_0(n_0, E_0) {
    return this._persistentHash_1({ domain:
                                      new Uint8Array([115, 110, 102, 58, 118, 49, 58, 114, 101, 99, 111, 114, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    n: n_0,
                                    ex: this._jubjubPointX_0(E_0),
                                    ey: this._jubjubPointY_0(E_0) });
  }
  _requestIdOf_0(recordId_0, caseRef_0) {
    return this._persistentHash_5([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 114, 101, 113, 117, 101, 115, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   recordId_0,
                                   caseRef_0]);
  }
  _shareKeyOf_0(requestId_0, index_0) {
    return this._persistentHash_2({ domain:
                                      new Uint8Array([115, 110, 102, 58, 118, 49, 58, 115, 104, 97, 114, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    requestId: requestId_0,
                                    index: index_0 });
  }
  _certIdOf_0(lenderRef_0, lenderNonce_0) {
    return this._persistentHash_5([new Uint8Array([115, 110, 102, 58, 118, 49, 58, 99, 101, 114, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   lenderRef_0,
                                   lenderNonce_0]);
  }
  _borrowerCommitOf_0(sellerId_0, lenderNonce_0) {
    return this._persistentHash_4({ domain:
                                      new Uint8Array([115, 110, 102, 58, 118, 49, 58, 98, 111, 114, 114, 111, 119, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    sellerId: sellerId_0,
                                    nonce: lenderNonce_0 });
  }
  _poolCount_0(used_0) {
    return (used_0[0] ? 1n : 0n) + (used_0[1] ? 1n : 0n) + (used_0[2] ? 1n : 0n)
           +
           (used_0[3] ? 1n : 0n);
  }
  _poolTotal_0(amounts_0) {
    return amounts_0[0] + amounts_0[1] + amounts_0[2] + amounts_0[3];
  }
  _poolDistinct_0(used_0, ns_0) {
    return (!(used_0[0] && used_0[1]) || !this._equal_1(ns_0[0], ns_0[1]))
           &&
           (!(used_0[0] && used_0[2]) || !this._equal_2(ns_0[0], ns_0[2]))
           &&
           (!(used_0[0] && used_0[3]) || !this._equal_3(ns_0[0], ns_0[3]))
           &&
           (!(used_0[1] && used_0[2]) || !this._equal_4(ns_0[1], ns_0[2]))
           &&
           (!(used_0[1] && used_0[3]) || !this._equal_5(ns_0[1], ns_0[3]))
           &&
           (!(used_0[2] && used_0[3]) || !this._equal_6(ns_0[2], ns_0[3]));
  }
  _localSecretKey_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.localSecretKey(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('localSecretKey',
                                 'return value',
                                 'stock-and-foil.compact line 75 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_1.toValue(result_0),
      alignment: _descriptor_1.alignment()
    });
    return result_0;
  }
  _localScalar_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.localScalar(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0 && result_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('localScalar',
                                 'return value',
                                 'stock-and-foil.compact line 76 char 1',
                                 'Field',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment()
    });
    return result_0;
  }
  _ephemeralScalar_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.ephemeralScalar(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0 && result_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('ephemeralScalar',
                                 'return value',
                                 'stock-and-foil.compact line 77 char 1',
                                 'Field',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment()
    });
    return result_0;
  }
  _callInvoice_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.callInvoice(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && typeof(result_0.debtorId) === 'bigint' && result_0.debtorId >= 0 && result_0.debtorId <= __compactRuntime.MAX_FIELD && typeof(result_0.sellerId) === 'bigint' && result_0.sellerId >= 0 && result_0.sellerId <= __compactRuntime.MAX_FIELD && typeof(result_0.invoiceNo) === 'bigint' && result_0.invoiceNo >= 0n && result_0.invoiceNo <= 18446744073709551615n && typeof(result_0.amount) === 'bigint' && result_0.amount >= 0n && result_0.amount <= 18446744073709551615n && typeof(result_0.dueDate) === 'bigint' && result_0.dueDate >= 0n && result_0.dueDate <= 18446744073709551615n && typeof(result_0.salt) === 'bigint' && result_0.salt >= 0 && result_0.salt <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('callInvoice',
                                 'return value',
                                 'stock-and-foil.compact line 78 char 1',
                                 'struct Invoice<debtorId: Field, sellerId: Field, invoiceNo: Uint<0..18446744073709551616>, amount: Uint<0..18446744073709551616>, dueDate: Uint<0..18446744073709551616>, salt: Field>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_16.toValue(result_0),
      alignment: _descriptor_16.alignment()
    });
    return result_0;
  }
  _debtorPathFor_0(context, partialProofData, leaf_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.debtorPathFor(witnessContext_0,
                                                                        leaf_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 10 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('debtorPathFor',
                                 'return value',
                                 'stock-and-foil.compact line 79 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<10, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_28.toValue(result_0),
      alignment: _descriptor_28.alignment()
    });
    return result_0;
  }
  _financierPathFor_0(context, partialProofData, leaf_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.financierPathFor(witnessContext_0,
                                                                           leaf_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 10 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('financierPathFor',
                                 'return value',
                                 'stock-and-foil.compact line 80 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<10, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_28.toValue(result_0),
      alignment: _descriptor_28.alignment()
    });
    return result_0;
  }
  _ackPathFor_0(context, partialProofData, leaf_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.ackPathFor(witnessContext_0,
                                                                     leaf_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 16 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('ackPathFor',
                                 'return value',
                                 'stock-and-foil.compact line 81 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<16, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_25.toValue(result_0),
      alignment: _descriptor_25.alignment()
    });
    return result_0;
  }
  _certInvoices_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.certInvoices(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 4 && result_0.every((t) => typeof(t) === 'object' && typeof(t.debtorId) === 'bigint' && t.debtorId >= 0 && t.debtorId <= __compactRuntime.MAX_FIELD && typeof(t.sellerId) === 'bigint' && t.sellerId >= 0 && t.sellerId <= __compactRuntime.MAX_FIELD && typeof(t.invoiceNo) === 'bigint' && t.invoiceNo >= 0n && t.invoiceNo <= 18446744073709551615n && typeof(t.amount) === 'bigint' && t.amount >= 0n && t.amount <= 18446744073709551615n && typeof(t.dueDate) === 'bigint' && t.dueDate >= 0n && t.dueDate <= 18446744073709551615n && typeof(t.salt) === 'bigint' && t.salt >= 0 && t.salt <= __compactRuntime.MAX_FIELD))) {
      __compactRuntime.typeError('certInvoices',
                                 'return value',
                                 'stock-and-foil.compact line 82 char 1',
                                 'Vector<4, struct Invoice<debtorId: Field, sellerId: Field, invoiceNo: Uint<0..18446744073709551616>, amount: Uint<0..18446744073709551616>, dueDate: Uint<0..18446744073709551616>, salt: Field>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_26.toValue(result_0),
      alignment: _descriptor_26.alignment()
    });
    return result_0;
  }
  _certUsed_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.certUsed(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 4 && result_0.every((t) => typeof(t) === 'boolean'))) {
      __compactRuntime.typeError('certUsed',
                                 'return value',
                                 'stock-and-foil.compact line 83 char 1',
                                 'Vector<4, Boolean>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_22.toValue(result_0),
      alignment: _descriptor_22.alignment()
    });
    return result_0;
  }
  _certHolderTags_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.certHolderTags(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 4 && result_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
      __compactRuntime.typeError('certHolderTags',
                                 'return value',
                                 'stock-and-foil.compact line 84 char 1',
                                 'Vector<4, Field>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_21.toValue(result_0),
      alignment: _descriptor_21.alignment()
    });
    return result_0;
  }
  _certEphemerals_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.certEphemerals(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 4 && result_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
      __compactRuntime.typeError('certEphemerals',
                                 'return value',
                                 'stock-and-foil.compact line 85 char 1',
                                 'Vector<4, Field>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_21.toValue(result_0),
      alignment: _descriptor_21.alignment()
    });
    return result_0;
  }
  _assertOperator_0(context, partialProofData) {
    __compactRuntime.assert(this._equal_7(this._operatorIdOf_0(this._localSecretKey_0(context,
                                                                                      partialProofData)),
                                          _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_2.toValue(0n),
                                                                                                                                alignment: _descriptor_2.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value)),
                            'NOT_OPERATOR');
    return [];
  }
  _admitDebtor_0(context, partialProofData, leaf_0) {
    this._assertOperator_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(6n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                              { value: _descriptor_1.toValue(leaf_0),
                                                                                                alignment: _descriptor_1.alignment() }
                                                                                            )).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { addi: { immediate: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _admitFinancier_0(context, partialProofData, leaf_0) {
    this._assertOperator_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(7n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                              { value: _descriptor_1.toValue(leaf_0),
                                                                                                alignment: _descriptor_1.alignment() }
                                                                                            )).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { addi: { immediate: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _acknowledge_0(context, partialProofData) {
    const sk_0 = this._localSecretKey_0(context, partialProofData);
    const leaf_0 = this._debtorLeaf_0(sk_0);
    const path_0 = this._debtorPathFor_0(context, partialProofData, leaf_0);
    __compactRuntime.assert(this._equal_8(path_0.leaf, leaf_0),
                            'NOT_REGISTERED_DEBTOR');
    let tmp_0;
    __compactRuntime.assert((tmp_0 = this._merkleTreePathRoot_0(path_0),
                             _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(6n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(2n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_20.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'NOT_REGISTERED_DEBTOR');
    const inv_0 = this._callInvoice_0(context, partialProofData);
    __compactRuntime.assert(this._degradeToTransient_0(leaf_0)
                            ===
                            inv_0.debtorId,
                            'NOT_YOUR_INVOICE');
    const ackNul_0 = this._ackNullifierOf_0(sk_0,
                                            inv_0.sellerId,
                                            inv_0.invoiceNo);
    __compactRuntime.assert(!_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(9n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(ackNul_0),
                                                                                                                                               alignment: _descriptor_1.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'ALREADY_ACKNOWLEDGED');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(9n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(ackNul_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = this._ackLeafOf_0(inv_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(8n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                              { value: _descriptor_1.toValue(tmp_1),
                                                                                                alignment: _descriptor_1.alignment() }
                                                                                            )).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(1n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { addi: { immediate: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(2n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(0n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _acknowledgedNullifier_0(context, partialProofData, inv_0) {
    const f_0 = this._fingerprint_0(inv_0);
    const leaf_0 = this._ackLeafFromFingerprint_0(f_0);
    const path_0 = this._ackPathFor_0(context, partialProofData, leaf_0);
    __compactRuntime.assert(this._equal_9(path_0.leaf, leaf_0),
                            'NOT_ACKNOWLEDGED');
    let tmp_0;
    __compactRuntime.assert((tmp_0 = this._merkleTreePathRoot_1(path_0),
                             _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(8n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(2n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_20.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'NOT_ACKNOWLEDGED');
    return this._nullifierFromFingerprint_0(f_0);
  }
  _assertFree_0(context, partialProofData, n_0) {
    if (_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                  partialProofData,
                                                                  [
                                                                   { dup: { n: 0 } },
                                                                   { idx: { cached: false,
                                                                            pushPath: false,
                                                                            path: [
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_2.toValue(10n),
                                                                                              alignment: _descriptor_2.alignment() } }] } },
                                                                   { push: { storage: false,
                                                                             value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(n_0),
                                                                                                                          alignment: _descriptor_1.alignment() }).encode() } },
                                                                   'member',
                                                                   { popeq: { cached: true,
                                                                              result: undefined } }]).value))
    {
      const p_0 = _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_2.toValue(10n),
                                                                                                         alignment: _descriptor_2.alignment() } }] } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_1.toValue(n_0),
                                                                                                         alignment: _descriptor_1.alignment() } }] } },
                                                                              { popeq: { cached: false,
                                                                                         result: undefined } }]).value);
      __compactRuntime.assert(p_0.status !== 3, 'ALREADY_SETTLED');
      __compactRuntime.assert(p_0.status === 2
                              ||
                              p_0.status === 0
                              &&
                              this._blockTimeGte_0(context,
                                                   partialProofData,
                                                   p_0.expiry),
                              'ALREADY_ENCUMBERED');
    }
    return [];
  }
  _sealRecord_0(context, partialProofData, n_0, inv_0, holderTag_0, e_0) {
    const E_0 = this._ecMulGenerator_0(e_0);
    __compactRuntime.assert(!this._equal_10(E_0, this._identityPoint_0()),
                            'BAD_EPHEMERAL');
    const S_0 = this._ecMul_0(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_2.toValue(1n),
                                                                                                                    alignment: _descriptor_2.alignment() } }] } },
                                                                                         { popeq: { cached: false,
                                                                                                    result: undefined } }]).value),
                              e_0);
    const ct_0 = [__compactRuntime.addField(inv_0.debtorId,
                                            this._maskOf_0(S_0, 0n)),
                  __compactRuntime.addField(inv_0.sellerId,
                                            this._maskOf_0(S_0, 1n)),
                  __compactRuntime.addField(this._packFields_0(inv_0.invoiceNo,
                                                               inv_0.amount,
                                                               inv_0.dueDate),
                                            this._maskOf_0(S_0, 2n)),
                  __compactRuntime.addField(inv_0.salt, this._maskOf_0(S_0, 3n)),
                  __compactRuntime.addField(holderTag_0, this._maskOf_0(S_0, 4n))];
    const recordId_0 = this._recordIdOf_0(n_0, E_0);
    const tmp_0 = { version: this._cipherVersion_0(), E: E_0, ct: ct_0 };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(11n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(recordId_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(tmp_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return recordId_0;
  }
  _offer_0(context, partialProofData, holderTag_0, expiry_0) {
    const inv_0 = this._callInvoice_0(context, partialProofData);
    __compactRuntime.assert(this._sellerIdOf_0(this._localSecretKey_0(context,
                                                                      partialProofData))
                            ===
                            inv_0.sellerId,
                            'NOT_INVOICE_OWNER');
    const n_0 = this._acknowledgedNullifier_0(context, partialProofData, inv_0);
    __compactRuntime.assert(this._blockTimeLt_0(context,
                                                partialProofData,
                                                expiry_0),
                            'BAD_EXPIRY');
    __compactRuntime.assert(expiry_0 <= inv_0.dueDate, 'INVOICE_OVERDUE');
    this._assertFree_0(context, partialProofData, n_0);
    const recordId_0 = this._sealRecord_0(context,
                                          partialProofData,
                                          n_0,
                                          inv_0,
                                          holderTag_0,
                                          this._ephemeralScalar_0(context,
                                                                  partialProofData));
    const tmp_0 = { status: 0,
                    holderTag: holderTag_0,
                    expiry: expiry_0,
                    recordId: recordId_0,
                    payeeTag: 0n,
                    amount: 0n,
                    claimed: false };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(10n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(n_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_0),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _accept_0(context, partialProofData, n_0) {
    const sk_0 = this._localSecretKey_0(context, partialProofData);
    const leaf_0 = this._financierLeaf_0(sk_0);
    const path_0 = this._financierPathFor_0(context, partialProofData, leaf_0);
    __compactRuntime.assert(this._equal_11(path_0.leaf, leaf_0), 'NOT_LICENSED');
    let tmp_0;
    __compactRuntime.assert((tmp_0 = this._merkleTreePathRoot_0(path_0),
                             _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(7n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(2n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_20.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'NOT_LICENSED');
    const k_0 = n_0;
    __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_2.toValue(10n),
                                                                                                                  alignment: _descriptor_2.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'NO_SUCH_OFFER');
    const p_0 = _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_2.toValue(10n),
                                                                                                       alignment: _descriptor_2.alignment() } }] } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_1.toValue(k_0),
                                                                                                       alignment: _descriptor_1.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    __compactRuntime.assert(p_0.status === 0, 'NO_SUCH_OFFER');
    __compactRuntime.assert(p_0.holderTag === this._holderTagOf_0(sk_0, k_0),
                            'NOT_ADDRESSEE');
    __compactRuntime.assert(this._blockTimeLt_0(context,
                                                partialProofData,
                                                p_0.expiry),
                            'OFFER_EXPIRED');
    const tmp_1 = { status: 1,
                    holderTag: p_0.holderTag,
                    expiry: p_0.expiry,
                    recordId: p_0.recordId,
                    payeeTag: p_0.payeeTag,
                    amount: p_0.amount,
                    claimed: p_0.claimed };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(10n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_1),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _release_0(context, partialProofData, n_0) {
    const k_0 = n_0;
    __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_2.toValue(10n),
                                                                                                                  alignment: _descriptor_2.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'NOT_PLEDGED');
    const p_0 = _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_2.toValue(10n),
                                                                                                       alignment: _descriptor_2.alignment() } }] } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_1.toValue(k_0),
                                                                                                       alignment: _descriptor_1.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    __compactRuntime.assert(p_0.status === 1, 'NOT_PLEDGED');
    __compactRuntime.assert(p_0.holderTag
                            ===
                            this._holderTagOf_0(this._localSecretKey_0(context,
                                                                       partialProofData),
                                                k_0),
                            'NOT_HOLDER');
    const tmp_0 = { status: 2,
                    holderTag: p_0.holderTag,
                    expiry: p_0.expiry,
                    recordId: p_0.recordId,
                    payeeTag: p_0.payeeTag,
                    amount: p_0.amount,
                    claimed: p_0.claimed };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(10n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_0),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _checkSlot_0(context, partialProofData, inv_0, used_0, me_0, validUntil_0) {
    const f_0 = this._fingerprint_0(inv_0);
    const leaf_0 = this._ackLeafFromFingerprint_0(f_0);
    const path_0 = this._ackPathFor_0(context, partialProofData, leaf_0);
    const root_0 = this._merkleTreePathRoot_1(path_0);
    const u_0 = used_0;
    if (u_0) {
      __compactRuntime.assert(me_0 === inv_0.sellerId, 'NOT_INVOICE_OWNER');
      __compactRuntime.assert(this._equal_12(path_0.leaf, leaf_0),
                              'NOT_ACKNOWLEDGED');
      __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_2.toValue(8n),
                                                                                                                    alignment: _descriptor_2.alignment() } }] } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_2.toValue(2n),
                                                                                                                    alignment: _descriptor_2.alignment() } }] } },
                                                                                         { push: { storage: false,
                                                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(root_0),
                                                                                                                                                alignment: _descriptor_20.alignment() }).encode() } },
                                                                                         'member',
                                                                                         { popeq: { cached: true,
                                                                                                    result: undefined } }]).value),
                              'NOT_ACKNOWLEDGED');
      __compactRuntime.assert(validUntil_0 <= inv_0.dueDate, 'INVOICE_OVERDUE');
    }
    return { n: this._nullifierFromFingerprint_0(f_0),
             amount: u_0 ? inv_0.amount : 0n };
  }
  _lockSlot_0(context,
              partialProofData,
              inv_0,
              used_0,
              slot_0,
              tag_0,
              e_0,
              validUntil_0)
  {
    const u_0 = used_0;
    const k_0 = slot_0.n;
    if (u_0) {
      this._assertFree_0(context, partialProofData, k_0);
      const tmp_0 = { status: 0,
                      holderTag: tag_0,
                      expiry: validUntil_0,
                      recordId:
                        this._sealRecord_0(context,
                                           partialProofData,
                                           k_0,
                                           inv_0,
                                           tag_0,
                                           e_0),
                      payeeTag: 0n,
                      amount: 0n,
                      claimed: false };
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_2.toValue(10n),
                                                                    alignment: _descriptor_2.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_0),
                                                                                                alignment: _descriptor_15.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    }
    if (u_0) {
      return k_0;
    } else {
      return new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  }
  _certifyBorrowingBase_0(context,
                          partialProofData,
                          lenderRef_0,
                          lenderNonce_0,
                          floor_0,
                          validUntil_0)
  {
    __compactRuntime.assert(this._blockTimeLt_0(context,
                                                partialProofData,
                                                validUntil_0),
                            'BAD_EXPIRY');
    const certId_0 = this._certIdOf_0(lenderRef_0, lenderNonce_0);
    __compactRuntime.assert(!_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(12n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(certId_0),
                                                                                                                                               alignment: _descriptor_1.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'DUPLICATE_CERTIFICATE');
    const me_0 = this._sellerIdOf_0(this._localSecretKey_0(context,
                                                           partialProofData));
    const invs_0 = this._certInvoices_0(context, partialProofData);
    const used_0 = this._certUsed_0(context, partialProofData);
    const count_0 = this._poolCount_0(used_0);
    __compactRuntime.assert(count_0 > 0n, 'EMPTY_POOL');
    const s0_0 = this._checkSlot_0(context,
                                   partialProofData,
                                   invs_0[0],
                                   used_0[0],
                                   me_0,
                                   validUntil_0);
    const s1_0 = this._checkSlot_0(context,
                                   partialProofData,
                                   invs_0[1],
                                   used_0[1],
                                   me_0,
                                   validUntil_0);
    const s2_0 = this._checkSlot_0(context,
                                   partialProofData,
                                   invs_0[2],
                                   used_0[2],
                                   me_0,
                                   validUntil_0);
    const s3_0 = this._checkSlot_0(context,
                                   partialProofData,
                                   invs_0[3],
                                   used_0[3],
                                   me_0,
                                   validUntil_0);
    __compactRuntime.assert(this._poolDistinct_0(used_0,
                                                 [s0_0.n, s1_0.n, s2_0.n, s3_0.n]),
                            'DUPLICATE_INVOICE');
    let t_0;
    __compactRuntime.assert((t_0 = this._poolTotal_0([s0_0.amount,
                                                      s1_0.amount,
                                                      s2_0.amount,
                                                      s3_0.amount]),
                             t_0 >= floor_0),
                            'BELOW_FLOOR');
    const tags_0 = this._certHolderTags_0(context, partialProofData);
    const es_0 = this._certEphemerals_0(context, partialProofData);
    const ns_0 = [this._lockSlot_0(context,
                                   partialProofData,
                                   invs_0[0],
                                   used_0[0],
                                   s0_0,
                                   tags_0[0],
                                   es_0[0],
                                   validUntil_0),
                  this._lockSlot_0(context,
                                   partialProofData,
                                   invs_0[1],
                                   used_0[1],
                                   s1_0,
                                   tags_0[1],
                                   es_0[1],
                                   validUntil_0),
                  this._lockSlot_0(context,
                                   partialProofData,
                                   invs_0[2],
                                   used_0[2],
                                   s2_0,
                                   tags_0[2],
                                   es_0[2],
                                   validUntil_0),
                  this._lockSlot_0(context,
                                   partialProofData,
                                   invs_0[3],
                                   used_0[3],
                                   s3_0,
                                   tags_0[3],
                                   es_0[3],
                                   validUntil_0)];
    const tmp_0 = { borrowerCommit:
                      this._borrowerCommitOf_0(me_0, lenderNonce_0),
                    lenderRef: lenderRef_0,
                    floor: floor_0,
                    count: count_0,
                    validUntil: validUntil_0,
                    nullifiers: ns_0 };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(12n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(certId_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_19.toValue(tmp_0),
                                                                                              alignment: _descriptor_19.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _payInvoice_0(context, partialProofData) {
    const sk_0 = this._localSecretKey_0(context, partialProofData);
    const inv_0 = this._callInvoice_0(context, partialProofData);
    __compactRuntime.assert(this._debtorIdOf_0(sk_0) === inv_0.debtorId,
                            'NOT_YOUR_INVOICE');
    const n_0 = this._acknowledgedNullifier_0(context, partialProofData, inv_0);
    const amount_0 = inv_0.amount;
    const sellerPayee_0 = this._sellerPayeeTagOf_0(inv_0.sellerId, n_0);
    this._receiveUnshielded_0(context,
                              partialProofData,
                              _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_2.toValue(5n),
                                                                                                                    alignment: _descriptor_2.alignment() } }] } },
                                                                                         { popeq: { cached: false,
                                                                                                    result: undefined } }]).value),
                              amount_0);
    if (_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                  partialProofData,
                                                                  [
                                                                   { dup: { n: 0 } },
                                                                   { idx: { cached: false,
                                                                            pushPath: false,
                                                                            path: [
                                                                                   { tag: 'value',
                                                                                     value: { value: _descriptor_2.toValue(10n),
                                                                                              alignment: _descriptor_2.alignment() } }] } },
                                                                   { push: { storage: false,
                                                                             value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(n_0),
                                                                                                                          alignment: _descriptor_1.alignment() }).encode() } },
                                                                   'member',
                                                                   { popeq: { cached: true,
                                                                              result: undefined } }]).value))
    {
      const p_0 = _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_2.toValue(10n),
                                                                                                         alignment: _descriptor_2.alignment() } }] } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_1.toValue(n_0),
                                                                                                         alignment: _descriptor_1.alignment() } }] } },
                                                                              { popeq: { cached: false,
                                                                                         result: undefined } }]).value);
      __compactRuntime.assert(p_0.status !== 3, 'ALREADY_SETTLED');
      const tmp_0 = { status: 3,
                      holderTag: p_0.holderTag,
                      expiry: p_0.expiry,
                      recordId: p_0.recordId,
                      payeeTag: p_0.status === 1 ? p_0.holderTag : sellerPayee_0,
                      amount: amount_0,
                      claimed: false };
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_2.toValue(10n),
                                                                    alignment: _descriptor_2.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(n_0),
                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_0),
                                                                                                alignment: _descriptor_15.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    } else {
      const tmp_1 = { status: 3,
                      holderTag: 0n,
                      expiry: 0n,
                      recordId:
                        new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                      payeeTag: sellerPayee_0,
                      amount: amount_0,
                      claimed: false };
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_2.toValue(10n),
                                                                    alignment: _descriptor_2.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(n_0),
                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_1),
                                                                                                alignment: _descriptor_15.alignment() }).encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    }
    return [];
  }
  _claim_0(context, partialProofData, n_0, payeeTag_0, to_0) {
    const k_0 = n_0;
    __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_2.toValue(10n),
                                                                                                                  alignment: _descriptor_2.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'NOT_SETTLED');
    const p_0 = _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                           partialProofData,
                                                                           [
                                                                            { dup: { n: 0 } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_2.toValue(10n),
                                                                                                       alignment: _descriptor_2.alignment() } }] } },
                                                                            { idx: { cached: false,
                                                                                     pushPath: false,
                                                                                     path: [
                                                                                            { tag: 'value',
                                                                                              value: { value: _descriptor_1.toValue(k_0),
                                                                                                       alignment: _descriptor_1.alignment() } }] } },
                                                                            { popeq: { cached: false,
                                                                                       result: undefined } }]).value);
    __compactRuntime.assert(p_0.status === 3, 'NOT_SETTLED');
    __compactRuntime.assert(p_0.payeeTag === payeeTag_0, 'NOT_PAYEE');
    __compactRuntime.assert(!p_0.claimed, 'ALREADY_CLAIMED');
    const tmp_0 = { status: p_0.status,
                    holderTag: p_0.holderTag,
                    expiry: p_0.expiry,
                    recordId: p_0.recordId,
                    payeeTag: p_0.payeeTag,
                    amount: p_0.amount,
                    claimed: true };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(10n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(k_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(tmp_0),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    this._sendUnshielded_0(context,
                           partialProofData,
                           _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                     partialProofData,
                                                                                     [
                                                                                      { dup: { n: 0 } },
                                                                                      { idx: { cached: false,
                                                                                               pushPath: false,
                                                                                               path: [
                                                                                                      { tag: 'value',
                                                                                                        value: { value: _descriptor_2.toValue(5n),
                                                                                                                 alignment: _descriptor_2.alignment() } }] } },
                                                                                      { popeq: { cached: false,
                                                                                                 result: undefined } }]).value),
                           p_0.amount,
                           this._right_0(to_0));
    return [];
  }
  _claimAsHolder_0(context, partialProofData, n_0, to_0) {
    this._claim_0(context,
                  partialProofData,
                  n_0,
                  this._holderTagOf_0(this._localSecretKey_0(context,
                                                             partialProofData),
                                      n_0),
                  to_0);
    return [];
  }
  _claimAsSeller_0(context, partialProofData, n_0, to_0) {
    this._claim_0(context,
                  partialProofData,
                  n_0,
                  this._sellerPayeeTagOf_0(this._sellerIdOf_0(this._localSecretKey_0(context,
                                                                                     partialProofData)),
                                           n_0),
                  to_0);
    return [];
  }
  _requestDisclosure_0(context, partialProofData, recordId_0, caseRef_0) {
    __compactRuntime.assert(this._equal_13(this._ecMulGenerator_0(this._localScalar_0(context,
                                                                                      partialProofData)),
                                           _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_2.toValue(4n),
                                                                                                                                 alignment: _descriptor_2.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value)),
                            'NOT_AUDITOR');
    const rid_0 = recordId_0;
    __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_2.toValue(11n),
                                                                                                                  alignment: _descriptor_2.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(rid_0),
                                                                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'NO_SUCH_RECORD');
    const requestId_0 = this._requestIdOf_0(rid_0, caseRef_0);
    __compactRuntime.assert(!_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_2.toValue(13n),
                                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(requestId_0),
                                                                                                                                               alignment: _descriptor_1.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'DUPLICATE_REQUEST');
    const tmp_0 = { recordId: rid_0,
                    caseRef: caseRef_0,
                    approvals: [false, false, false] };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(13n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(requestId_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_8.toValue(tmp_0),
                                                                                              alignment: _descriptor_8.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _approveDisclosure_0(context, partialProofData, requestId_0, index_0) {
    const s_0 = this._localScalar_0(context, partialProofData);
    const i_0 = index_0;
    __compactRuntime.assert(i_0 < 3n, 'NOT_KEYHOLDER');
    const pks_0 = _descriptor_11.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_2.toValue(2n),
                                                                                                         alignment: _descriptor_2.alignment() } }] } },
                                                                              { popeq: { cached: false,
                                                                                         result: undefined } }]).value);
    __compactRuntime.assert(this._equal_14(this._ecMulGenerator_0(s_0),
                                           this._equal_15(i_0, 0n) ?
                                           pks_0[0] :
                                           this._equal_16(i_0, 1n) ?
                                           pks_0[1] :
                                           pks_0[2]),
                            'NOT_KEYHOLDER');
    const rid_0 = requestId_0;
    __compactRuntime.assert(_descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_2.toValue(13n),
                                                                                                                  alignment: _descriptor_2.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(rid_0),
                                                                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'NO_SUCH_REQUEST');
    const req_0 = _descriptor_8.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_2.toValue(13n),
                                                                                                        alignment: _descriptor_2.alignment() } }] } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_1.toValue(rid_0),
                                                                                                        alignment: _descriptor_1.alignment() } }] } },
                                                                             { popeq: { cached: false,
                                                                                        result: undefined } }]).value);
    const done_0 = req_0.approvals;
    __compactRuntime.assert(!(this._equal_17(i_0, 0n) ?
                              done_0[0] :
                              this._equal_18(i_0, 1n) ? done_0[1] : done_0[2]),
                            'ALREADY_APPROVED');
    const e2_0 = this._ephemeralScalar_0(context, partialProofData);
    const E2_0 = this._ecMulGenerator_0(e2_0);
    __compactRuntime.assert(!this._equal_19(E2_0, this._identityPoint_0()),
                            'BAD_EPHEMERAL');
    const S2_0 = this._ecMul_0(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                         partialProofData,
                                                                                         [
                                                                                          { dup: { n: 0 } },
                                                                                          { idx: { cached: false,
                                                                                                   pushPath: false,
                                                                                                   path: [
                                                                                                          { tag: 'value',
                                                                                                            value: { value: _descriptor_2.toValue(4n),
                                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                                          { popeq: { cached: false,
                                                                                                     result: undefined } }]).value),
                               e2_0);
    let tmp_0;
    const D_0 = this._ecMul_0((tmp_0 = req_0.recordId,
                               _descriptor_5.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                         partialProofData,
                                                                                         [
                                                                                          { dup: { n: 0 } },
                                                                                          { idx: { cached: false,
                                                                                                   pushPath: false,
                                                                                                   path: [
                                                                                                          { tag: 'value',
                                                                                                            value: { value: _descriptor_2.toValue(11n),
                                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                                          { idx: { cached: false,
                                                                                                   pushPath: false,
                                                                                                   path: [
                                                                                                          { tag: 'value',
                                                                                                            value: { value: _descriptor_1.toValue(tmp_0),
                                                                                                                     alignment: _descriptor_1.alignment() } }] } },
                                                                                          { popeq: { cached: false,
                                                                                                     result: undefined } }]).value)).E,
                              s_0);
    const ct_0 = [__compactRuntime.addField(this._jubjubPointX_0(D_0),
                                            this._maskOf_0(S2_0, 0n)),
                  __compactRuntime.addField(this._jubjubPointY_0(D_0),
                                            this._maskOf_0(S2_0, 1n))];
    const tmp_1 = this._shareKeyOf_0(rid_0, i_0);
    const tmp_2 = { version: this._cipherVersion_0(), E2: E2_0, ct: ct_0 };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(14n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_1),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(tmp_2),
                                                                                              alignment: _descriptor_10.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_3 = { recordId: req_0.recordId,
                    caseRef: req_0.caseRef,
                    approvals:
                      [done_0[0] || this._equal_21(i_0, 0n),
                       done_0[1] || this._equal_22(i_0, 1n),
                       done_0[2] || this._equal_20(i_0, 2n)] };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_2.toValue(13n),
                                                                  alignment: _descriptor_2.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(rid_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_8.toValue(tmp_3),
                                                                                              alignment: _descriptor_8.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 10; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_1(f, x, a0) {
    for (let i = 0; i < 16; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_3(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_4(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_5(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_6(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_7(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_8(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_9(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_10(x0, y0) {
    {
      let x1 = x0.x;
      let y1 = y0.x;
      if (x1 !== y1) { return false; }
    }
    {
      let x1 = x0.y;
      let y1 = y0.y;
      if (x1 !== y1) { return false; }
    }
    return true;
  }
  _equal_11(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_12(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_13(x0, y0) {
    {
      let x1 = x0.x;
      let y1 = y0.x;
      if (x1 !== y1) { return false; }
    }
    {
      let x1 = x0.y;
      let y1 = y0.y;
      if (x1 !== y1) { return false; }
    }
    return true;
  }
  _equal_14(x0, y0) {
    {
      let x1 = x0.x;
      let y1 = y0.x;
      if (x1 !== y1) { return false; }
    }
    {
      let x1 = x0.y;
      let y1 = y0.y;
      if (x1 !== y1) { return false; }
    }
    return true;
  }
  _equal_15(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_16(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_17(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_18(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_19(x0, y0) {
    {
      let x1 = x0.x;
      let y1 = y0.x;
      if (x1 !== y1) { return false; }
    }
    {
      let x1 = x0.y;
      let y1 = y0.y;
      if (x1 !== y1) { return false; }
    }
    return true;
  }
  _equal_20(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_21(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_22(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get operatorId() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(0n),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get disclosurePk() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(1n),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get keyholderPks() {
      return _descriptor_11.fromValue(__compactRuntime.queryLedgerState(context,
                                                                        partialProofData,
                                                                        [
                                                                         { dup: { n: 0 } },
                                                                         { idx: { cached: false,
                                                                                  pushPath: false,
                                                                                  path: [
                                                                                         { tag: 'value',
                                                                                           value: { value: _descriptor_2.toValue(2n),
                                                                                                    alignment: _descriptor_2.alignment() } }] } },
                                                                         { popeq: { cached: false,
                                                                                    result: undefined } }]).value);
    },
    get threshold() {
      return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(3n),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get auditorPk() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(4n),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get settlementColor() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(5n),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    debtors: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(6n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(1n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(1024n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'stock-and-foil.compact line 61 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(6n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(2n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_20.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[6];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[6];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 61 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'stock-and-foil.compact line 61 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[6];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 61 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[6];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      history(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`history: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[6];
        return self_0.asArray()[2].asMap().keys().map(  (elem) => __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    financiers: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(7n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(1n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(1024n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'stock-and-foil.compact line 62 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(7n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(2n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_20.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[7];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[7];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 62 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'stock-and-foil.compact line 62 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[7];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 62 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[7];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(10, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      history(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`history: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[7];
        return self_0.asArray()[2].asMap().keys().map(  (elem) => __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    acks: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(8n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(1n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(65536n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'stock-and-foil.compact line 63 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(8n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(2n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_20.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_20.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[8];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[8];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 63 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'stock-and-foil.compact line 63 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[8];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(16, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'stock-and-foil.compact line 63 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[8];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(16, _descriptor_1).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_1.toValue(leaf_0),      alignment: _descriptor_1.alignment()    }  )?.value);
      },
      history(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`history: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[8];
        return self_0.asArray()[2].asMap().keys().map(  (elem) => __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    ackNullifiers: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(9n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(9n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 64 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(9n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[9];
        return self_0.asMap().keys().map((elem) => _descriptor_1.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    pledges: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(10n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(10n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 66 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(10n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(key_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'stock-and-foil.compact line 66 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_15.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(10n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_1.toValue(key_0),
                                                                                                      alignment: _descriptor_1.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[10];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_1.fromValue(key.value),      _descriptor_15.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    records: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(11n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(11n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 67 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(11n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(key_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'stock-and-foil.compact line 67 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_5.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(11n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_1.toValue(key_0),
                                                                                                     alignment: _descriptor_1.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[11];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_1.fromValue(key.value),      _descriptor_5.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    certificates: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(12n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(12n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 68 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(12n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(key_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'stock-and-foil.compact line 68 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_19.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(12n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_1.toValue(key_0),
                                                                                                      alignment: _descriptor_1.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[12];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_1.fromValue(key.value),      _descriptor_19.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    requests: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(13n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(13n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 69 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(13n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(key_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'stock-and-foil.compact line 69 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_8.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(13n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_1.toValue(key_0),
                                                                                                     alignment: _descriptor_1.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[13];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_1.fromValue(key.value),      _descriptor_8.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    shares: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(14n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                                                                 alignment: _descriptor_14.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(14n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           'size',
                                                                           { popeq: { cached: true,
                                                                                      result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'stock-and-foil.compact line 70 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(14n),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(key_0),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'stock-and-foil.compact line 70 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_10.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_2.toValue(14n),
                                                                                                      alignment: _descriptor_2.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_1.toValue(key_0),
                                                                                                      alignment: _descriptor_1.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[14];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_1.fromValue(key.value),      _descriptor_10.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({
  localSecretKey: (...args) => undefined,
  localScalar: (...args) => undefined,
  ephemeralScalar: (...args) => undefined,
  callInvoice: (...args) => undefined,
  debtorPathFor: (...args) => undefined,
  financierPathFor: (...args) => undefined,
  ackPathFor: (...args) => undefined,
  certInvoices: (...args) => undefined,
  certUsed: (...args) => undefined,
  certHolderTags: (...args) => undefined,
  certEphemerals: (...args) => undefined
});
export const pureCircuits = {
  operatorIdOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`operatorIdOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('operatorIdOf',
                                 'argument 1',
                                 'Identity.compact line 14 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._operatorIdOf_0(sk_0);
  },
  debtorLeaf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`debtorLeaf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('debtorLeaf',
                                 'argument 1',
                                 'Identity.compact line 19 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._debtorLeaf_0(sk_0);
  },
  debtorIdOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`debtorIdOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('debtorIdOf',
                                 'argument 1',
                                 'Identity.compact line 24 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._debtorIdOf_0(sk_0);
  },
  sellerIdOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`sellerIdOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('sellerIdOf',
                                 'argument 1',
                                 'Identity.compact line 29 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._sellerIdOf_0(sk_0);
  },
  financierLeaf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`financierLeaf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('financierLeaf',
                                 'argument 1',
                                 'Identity.compact line 34 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._financierLeaf_0(sk_0);
  },
  ackNullifierOf: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`ackNullifierOf: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    const sellerId_0 = args_0[1];
    const invoiceNo_0 = args_0[2];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('ackNullifierOf',
                                 'argument 1',
                                 'Identity.compact line 39 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    if (!(typeof(sellerId_0) === 'bigint' && sellerId_0 >= 0 && sellerId_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('ackNullifierOf',
                                 'argument 2',
                                 'Identity.compact line 39 char 3',
                                 'Field',
                                 sellerId_0)
    }
    if (!(typeof(invoiceNo_0) === 'bigint' && invoiceNo_0 >= 0n && invoiceNo_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('ackNullifierOf',
                                 'argument 3',
                                 'Identity.compact line 39 char 3',
                                 'Uint<0..18446744073709551616>',
                                 invoiceNo_0)
    }
    return _dummyContract._ackNullifierOf_0(sk_0, sellerId_0, invoiceNo_0);
  },
  holderTagOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`holderTagOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    const n_0 = args_0[1];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('holderTagOf',
                                 'argument 1',
                                 'Identity.compact line 48 char 3',
                                 'Bytes<32>',
                                 sk_0)
    }
    if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
      __compactRuntime.typeError('holderTagOf',
                                 'argument 2',
                                 'Identity.compact line 48 char 3',
                                 'Bytes<32>',
                                 n_0)
    }
    return _dummyContract._holderTagOf_0(sk_0, n_0);
  },
  sellerPayeeTagOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`sellerPayeeTagOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const sellerId_0 = args_0[0];
    const n_0 = args_0[1];
    if (!(typeof(sellerId_0) === 'bigint' && sellerId_0 >= 0 && sellerId_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('sellerPayeeTagOf',
                                 'argument 1',
                                 'Identity.compact line 53 char 3',
                                 'Field',
                                 sellerId_0)
    }
    if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
      __compactRuntime.typeError('sellerPayeeTagOf',
                                 'argument 2',
                                 'Identity.compact line 53 char 3',
                                 'Bytes<32>',
                                 n_0)
    }
    return _dummyContract._sellerPayeeTagOf_0(sellerId_0, n_0);
  },
  fingerprint: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`fingerprint: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const inv_0 = args_0[0];
    if (!(typeof(inv_0) === 'object' && typeof(inv_0.debtorId) === 'bigint' && inv_0.debtorId >= 0 && inv_0.debtorId <= __compactRuntime.MAX_FIELD && typeof(inv_0.sellerId) === 'bigint' && inv_0.sellerId >= 0 && inv_0.sellerId <= __compactRuntime.MAX_FIELD && typeof(inv_0.invoiceNo) === 'bigint' && inv_0.invoiceNo >= 0n && inv_0.invoiceNo <= 18446744073709551615n && typeof(inv_0.amount) === 'bigint' && inv_0.amount >= 0n && inv_0.amount <= 18446744073709551615n && typeof(inv_0.dueDate) === 'bigint' && inv_0.dueDate >= 0n && inv_0.dueDate <= 18446744073709551615n && typeof(inv_0.salt) === 'bigint' && inv_0.salt >= 0 && inv_0.salt <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('fingerprint',
                                 'argument 1',
                                 'Invoice.compact line 23 char 3',
                                 'struct Invoice<debtorId: Field, sellerId: Field, invoiceNo: Uint<0..18446744073709551616>, amount: Uint<0..18446744073709551616>, dueDate: Uint<0..18446744073709551616>, salt: Field>',
                                 inv_0)
    }
    return _dummyContract._fingerprint_0(inv_0);
  },
  ackLeafFromFingerprint: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`ackLeafFromFingerprint: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const f_0 = args_0[0];
    if (!(f_0.buffer instanceof ArrayBuffer && f_0.BYTES_PER_ELEMENT === 1 && f_0.length === 32)) {
      __compactRuntime.typeError('ackLeafFromFingerprint',
                                 'argument 1',
                                 'Invoice.compact line 28 char 3',
                                 'Bytes<32>',
                                 f_0)
    }
    return _dummyContract._ackLeafFromFingerprint_0(f_0);
  },
  nullifierFromFingerprint: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`nullifierFromFingerprint: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const f_0 = args_0[0];
    if (!(f_0.buffer instanceof ArrayBuffer && f_0.BYTES_PER_ELEMENT === 1 && f_0.length === 32)) {
      __compactRuntime.typeError('nullifierFromFingerprint',
                                 'argument 1',
                                 'Invoice.compact line 33 char 3',
                                 'Bytes<32>',
                                 f_0)
    }
    return _dummyContract._nullifierFromFingerprint_0(f_0);
  },
  ackLeafOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`ackLeafOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const inv_0 = args_0[0];
    if (!(typeof(inv_0) === 'object' && typeof(inv_0.debtorId) === 'bigint' && inv_0.debtorId >= 0 && inv_0.debtorId <= __compactRuntime.MAX_FIELD && typeof(inv_0.sellerId) === 'bigint' && inv_0.sellerId >= 0 && inv_0.sellerId <= __compactRuntime.MAX_FIELD && typeof(inv_0.invoiceNo) === 'bigint' && inv_0.invoiceNo >= 0n && inv_0.invoiceNo <= 18446744073709551615n && typeof(inv_0.amount) === 'bigint' && inv_0.amount >= 0n && inv_0.amount <= 18446744073709551615n && typeof(inv_0.dueDate) === 'bigint' && inv_0.dueDate >= 0n && inv_0.dueDate <= 18446744073709551615n && typeof(inv_0.salt) === 'bigint' && inv_0.salt >= 0 && inv_0.salt <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('ackLeafOf',
                                 'argument 1',
                                 'Invoice.compact line 37 char 3',
                                 'struct Invoice<debtorId: Field, sellerId: Field, invoiceNo: Uint<0..18446744073709551616>, amount: Uint<0..18446744073709551616>, dueDate: Uint<0..18446744073709551616>, salt: Field>',
                                 inv_0)
    }
    return _dummyContract._ackLeafOf_0(inv_0);
  },
  nullifierOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`nullifierOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const inv_0 = args_0[0];
    if (!(typeof(inv_0) === 'object' && typeof(inv_0.debtorId) === 'bigint' && inv_0.debtorId >= 0 && inv_0.debtorId <= __compactRuntime.MAX_FIELD && typeof(inv_0.sellerId) === 'bigint' && inv_0.sellerId >= 0 && inv_0.sellerId <= __compactRuntime.MAX_FIELD && typeof(inv_0.invoiceNo) === 'bigint' && inv_0.invoiceNo >= 0n && inv_0.invoiceNo <= 18446744073709551615n && typeof(inv_0.amount) === 'bigint' && inv_0.amount >= 0n && inv_0.amount <= 18446744073709551615n && typeof(inv_0.dueDate) === 'bigint' && inv_0.dueDate >= 0n && inv_0.dueDate <= 18446744073709551615n && typeof(inv_0.salt) === 'bigint' && inv_0.salt >= 0 && inv_0.salt <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('nullifierOf',
                                 'argument 1',
                                 'Invoice.compact line 41 char 3',
                                 'struct Invoice<debtorId: Field, sellerId: Field, invoiceNo: Uint<0..18446744073709551616>, amount: Uint<0..18446744073709551616>, dueDate: Uint<0..18446744073709551616>, salt: Field>',
                                 inv_0)
    }
    return _dummyContract._nullifierOf_0(inv_0);
  },
  packFields: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`packFields: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const invoiceNo_0 = args_0[0];
    const amount_0 = args_0[1];
    const dueDate_0 = args_0[2];
    if (!(typeof(invoiceNo_0) === 'bigint' && invoiceNo_0 >= 0n && invoiceNo_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('packFields',
                                 'argument 1',
                                 'Invoice.compact line 49 char 3',
                                 'Uint<0..18446744073709551616>',
                                 invoiceNo_0)
    }
    if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('packFields',
                                 'argument 2',
                                 'Invoice.compact line 49 char 3',
                                 'Uint<0..18446744073709551616>',
                                 amount_0)
    }
    if (!(typeof(dueDate_0) === 'bigint' && dueDate_0 >= 0n && dueDate_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('packFields',
                                 'argument 3',
                                 'Invoice.compact line 49 char 3',
                                 'Uint<0..18446744073709551616>',
                                 dueDate_0)
    }
    return _dummyContract._packFields_0(invoiceNo_0, amount_0, dueDate_0);
  },
  cipherVersion: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`cipherVersion: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._cipherVersion_0();
  },
  pubKeyOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`pubKeyOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const k_0 = args_0[0];
    if (!(typeof(k_0) === 'bigint' && k_0 >= 0 && k_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('pubKeyOf',
                                 'argument 1',
                                 'Cipher.compact line 39 char 3',
                                 'Field',
                                 k_0)
    }
    return _dummyContract._pubKeyOf_0(k_0);
  },
  mulPoint: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`mulPoint: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const P_0 = args_0[0];
    const k_0 = args_0[1];
    if (!(typeof(k_0) === 'bigint' && k_0 >= 0 && k_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('mulPoint',
                                 'argument 2',
                                 'Cipher.compact line 43 char 3',
                                 'Field',
                                 k_0)
    }
    return _dummyContract._mulPoint_0(P_0, k_0);
  },
  addPoints: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`addPoints: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const P_0 = args_0[0];
    const Q_0 = args_0[1];
    return _dummyContract._addPoints_0(P_0, Q_0);
  },
  identityPoint: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`identityPoint: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._identityPoint_0();
  },
  maskOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`maskOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const S_0 = args_0[0];
    const j_0 = args_0[1];
    if (!(typeof(j_0) === 'bigint' && j_0 >= 0 && j_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('maskOf',
                                 'argument 2',
                                 'Cipher.compact line 57 char 3',
                                 'Field',
                                 j_0)
    }
    return _dummyContract._maskOf_0(S_0, j_0);
  },
  recordIdOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`recordIdOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const n_0 = args_0[0];
    const E_0 = args_0[1];
    if (!(n_0.buffer instanceof ArrayBuffer && n_0.BYTES_PER_ELEMENT === 1 && n_0.length === 32)) {
      __compactRuntime.typeError('recordIdOf',
                                 'argument 1',
                                 'Cipher.compact line 62 char 3',
                                 'Bytes<32>',
                                 n_0)
    }
    return _dummyContract._recordIdOf_0(n_0, E_0);
  },
  requestIdOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`requestIdOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const recordId_0 = args_0[0];
    const caseRef_0 = args_0[1];
    if (!(recordId_0.buffer instanceof ArrayBuffer && recordId_0.BYTES_PER_ELEMENT === 1 && recordId_0.length === 32)) {
      __compactRuntime.typeError('requestIdOf',
                                 'argument 1',
                                 'Cipher.compact line 68 char 3',
                                 'Bytes<32>',
                                 recordId_0)
    }
    if (!(caseRef_0.buffer instanceof ArrayBuffer && caseRef_0.BYTES_PER_ELEMENT === 1 && caseRef_0.length === 32)) {
      __compactRuntime.typeError('requestIdOf',
                                 'argument 2',
                                 'Cipher.compact line 68 char 3',
                                 'Bytes<32>',
                                 caseRef_0)
    }
    return _dummyContract._requestIdOf_0(recordId_0, caseRef_0);
  },
  shareKeyOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`shareKeyOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const requestId_0 = args_0[0];
    const index_0 = args_0[1];
    if (!(requestId_0.buffer instanceof ArrayBuffer && requestId_0.BYTES_PER_ELEMENT === 1 && requestId_0.length === 32)) {
      __compactRuntime.typeError('shareKeyOf',
                                 'argument 1',
                                 'Cipher.compact line 73 char 3',
                                 'Bytes<32>',
                                 requestId_0)
    }
    if (!(typeof(index_0) === 'bigint' && index_0 >= 0n && index_0 <= 255n)) {
      __compactRuntime.typeError('shareKeyOf',
                                 'argument 2',
                                 'Cipher.compact line 73 char 3',
                                 'Uint<0..256>',
                                 index_0)
    }
    return _dummyContract._shareKeyOf_0(requestId_0, index_0);
  },
  certIdOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`certIdOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const lenderRef_0 = args_0[0];
    const lenderNonce_0 = args_0[1];
    if (!(lenderRef_0.buffer instanceof ArrayBuffer && lenderRef_0.BYTES_PER_ELEMENT === 1 && lenderRef_0.length === 32)) {
      __compactRuntime.typeError('certIdOf',
                                 'argument 1',
                                 'BorrowingBase.compact line 33 char 3',
                                 'Bytes<32>',
                                 lenderRef_0)
    }
    if (!(lenderNonce_0.buffer instanceof ArrayBuffer && lenderNonce_0.BYTES_PER_ELEMENT === 1 && lenderNonce_0.length === 32)) {
      __compactRuntime.typeError('certIdOf',
                                 'argument 2',
                                 'BorrowingBase.compact line 33 char 3',
                                 'Bytes<32>',
                                 lenderNonce_0)
    }
    return _dummyContract._certIdOf_0(lenderRef_0, lenderNonce_0);
  },
  borrowerCommitOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`borrowerCommitOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const sellerId_0 = args_0[0];
    const lenderNonce_0 = args_0[1];
    if (!(typeof(sellerId_0) === 'bigint' && sellerId_0 >= 0 && sellerId_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('borrowerCommitOf',
                                 'argument 1',
                                 'BorrowingBase.compact line 38 char 3',
                                 'Field',
                                 sellerId_0)
    }
    if (!(lenderNonce_0.buffer instanceof ArrayBuffer && lenderNonce_0.BYTES_PER_ELEMENT === 1 && lenderNonce_0.length === 32)) {
      __compactRuntime.typeError('borrowerCommitOf',
                                 'argument 2',
                                 'BorrowingBase.compact line 38 char 3',
                                 'Bytes<32>',
                                 lenderNonce_0)
    }
    return _dummyContract._borrowerCommitOf_0(sellerId_0, lenderNonce_0);
  },
  poolCount: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`poolCount: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const used_0 = args_0[0];
    if (!(Array.isArray(used_0) && used_0.length === 4 && used_0.every((t) => typeof(t) === 'boolean'))) {
      __compactRuntime.typeError('poolCount',
                                 'argument 1',
                                 'BorrowingBase.compact line 44 char 3',
                                 'Vector<4, Boolean>',
                                 used_0)
    }
    return _dummyContract._poolCount_0(used_0);
  },
  poolTotal: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`poolTotal: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const amounts_0 = args_0[0];
    if (!(Array.isArray(amounts_0) && amounts_0.length === 4 && amounts_0.every((t) => typeof(t) === 'bigint' && t >= 0n && t <= 18446744073709551615n))) {
      __compactRuntime.typeError('poolTotal',
                                 'argument 1',
                                 'BorrowingBase.compact line 49 char 3',
                                 'Vector<4, Uint<0..18446744073709551616>>',
                                 amounts_0)
    }
    return _dummyContract._poolTotal_0(amounts_0);
  },
  poolDistinct: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`poolDistinct: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const used_0 = args_0[0];
    const ns_0 = args_0[1];
    if (!(Array.isArray(used_0) && used_0.length === 4 && used_0.every((t) => typeof(t) === 'boolean'))) {
      __compactRuntime.typeError('poolDistinct',
                                 'argument 1',
                                 'BorrowingBase.compact line 54 char 3',
                                 'Vector<4, Boolean>',
                                 used_0)
    }
    if (!(Array.isArray(ns_0) && ns_0.length === 4 && ns_0.every((t) => t.buffer instanceof ArrayBuffer && t.BYTES_PER_ELEMENT === 1 && t.length === 32))) {
      __compactRuntime.typeError('poolDistinct',
                                 'argument 2',
                                 'BorrowingBase.compact line 54 char 3',
                                 'Vector<4, Bytes<32>>',
                                 ns_0)
    }
    return _dummyContract._poolDistinct_0(used_0, ns_0);
  }
};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
