// SPDX-License-Identifier: Apache-2.0
//
// The DApp Connector adapter, against a fake 1AM wallet.
//
// This suite exists because `dappConnectorWalletAdapter` was written, type-checked and never
// run against a wallet, and the first time it met one it died on the first call midnight-js
// makes — `getCoinPublicKey()` — with `Cannot read properties of undefined (reading 'decode')`,
// before a single wallet prompt appeared. TypeScript cannot catch that class of bug: every
// value involved is a `string`, and the question is only which *encoding* of a key it is.
//
// So the fake below implements the surface 1AM documents at https://1am.xyz/developers — the
// methods, their return shapes, and both encodings a wallet is observed to use for keys — and
// the tests drive the adapter the way midnight-js drives it.
//
// Two call sites in `@midnight-ntwrk/midnight-js-contracts` 4.1.1 decide what "correct" means
// here, and they disagree, which is why hex is the only safe answer:
//
//   createUnprovenDeployTx (line 997) and createUnprovenCallTx (1460/1463) wrap the coin
//     public key in `parseCoinPublicKeyToHex(...)`, so they accept either encoding — but they
//     pass `getEncryptionPublicKey()` straight through with no conversion at all;
//   createUnprovenInsertVerifierKeyTx (399), …RemoveVerifierKey (471) and …ReplaceAuthority
//     (548) pass `getCoinPublicKey()` straight through too.
//
// Line 399 is our ten verifier-key maintenance transactions. An adapter that returned Bech32m
// would have deployed and then failed at transaction 2 of 11, on mainnet, after the money was
// spent. Hex out of the adapter satisfies both kinds of call site.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MidnightBech32m,
  Bech32mSymbol,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
  UnshieldedAddress,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';
import { dappConnectorWalletAdapter, loadAddressCodecs, type DAppConnectorWallet } from '../src/index.js';
import { hex } from '../src/bytes.js';

const NETWORK = 'mainnet';
const COIN_HEX = 'ab'.repeat(32);
const ENC_HEX = 'cd'.repeat(32);
const ADDR_HEX = 'ef'.repeat(32);

/** The same values a wallet would hand over Bech32m-encoded, built by the library itself. */
const bech32 = {
  coin: ShieldedCoinPublicKey.codec
    .encode(NETWORK, ShieldedCoinPublicKey.fromHexString(COIN_HEX))
    .asString(),
  enc: ShieldedEncryptionPublicKey.codec
    .encode(NETWORK, ShieldedEncryptionPublicKey.fromHexString(ENC_HEX))
    .asString(),
  address: UnshieldedAddress.codec
    .encode(NETWORK, new UnshieldedAddress(Buffer.from(ADDR_HEX, 'hex')))
    .asString(),
};

interface FakeCalls {
  balanced: Array<{ tx: string; options?: { payFees?: boolean } }>;
  submitted: string[];
}

/**
 * A 1AM wallet that is not there.
 *
 * It answers exactly the ConnectedAPI methods the adapter uses, in the shapes the developer
 * guide documents, and records what it was handed. `encoding` picks between the two forms a
 * wallet may report its keys in: 1AM's own sample passes them straight into
 * `getCoinPublicKey`, which only works if they are already hex, while the Bech32m form is what
 * every other Midnight wallet returns. The adapter has to cope with both.
 */
/** What the fake implements beyond the subset the adapter itself needs. */
type FakeOneAm = DAppConnectorWallet & {
  calls: FakeCalls;
  getProvingProvider(): Promise<{ check(): Promise<never>; prove(): Promise<never> }>;
};

function fakeOneAm(encoding: 'bech32m' | 'hex'): FakeOneAm {
  const calls: FakeCalls = { balanced: [], submitted: [] };
  const keys = encoding === 'bech32m' ? bech32 : { coin: COIN_HEX, enc: ENC_HEX, address: ADDR_HEX };
  return {
    calls,
    async getShieldedAddresses() {
      return {
        shieldedAddress: 'mn_shield-addr1exampleexampleexample',
        shieldedCoinPublicKey: keys.coin,
        shieldedEncryptionPublicKey: keys.enc,
      };
    },
    async getUnshieldedAddress() {
      return { unshieldedAddress: keys.address };
    },
    // ledger-v8 requires `{ check, prove }`; 1AM's `getProvingProvider` returns one backed by
    // ProofStation. A deploy transaction carries verifier keys rather than circuit proofs, so
    // neither method is reached by a deploy — the lifecycle calls are what exercise them.
    async getProvingProvider() {
      return {
        check: () => Promise.reject(new Error('ProofStation would be called here')),
        prove: () => Promise.reject(new Error('ProofStation would be called here')),
      };
    },
    // Echoes the bytes back, which is *not* what a wallet does: a real one funds, signs and
    // binds, changing the binding from `embedded-fr` to `pedersen-schnorr`. The echo is how
    // the "wallet answered with something unusable" path gets tested.
    async balanceUnsealedTransaction(tx: string, options?: { payFees?: boolean }) {
      calls.balanced.push({ tx, options });
      return { tx };
    },
    async submitTransaction(tx: string) {
      calls.submitted.push(tx);
    },
  };
}

const adapterFor = async (encoding: 'bech32m' | 'hex') => {
  const wallet = fakeOneAm(encoding);
  const shielded = await wallet.getShieldedAddresses();
  const codecs = await loadAddressCodecs(NETWORK);
  return {
    wallet,
    adapter: dappConnectorWalletAdapter(
      wallet,
      {
        coinPublicKey: shielded.shieldedCoinPublicKey,
        encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
      },
      { ...codecs },
    ),
  };
};

describe('the upstream quirk this all turns on', () => {
  // Pinned deliberately. `MidnightBech32m.prototype.decode(tclass, …)` resolves
  // `tclass[Bech32mSymbol]`, and in wallet-sdk-address-format 3.1.2 the two shielded *key*
  // classes carry only `static codec`, while the three *address* classes carry both. So the
  // obvious call throws for keys and works for addresses. If a future version attaches the
  // symbol to all five, this test fails and we can simplify.
  it('omits Bech32mSymbol on the shielded key classes but not on addresses', () => {
    expect(ShieldedCoinPublicKey[Bech32mSymbol as never]).toBeUndefined();
    expect(ShieldedEncryptionPublicKey[Bech32mSymbol as never]).toBeUndefined();
    expect(UnshieldedAddress[Bech32mSymbol as never]).toBeDefined();
  });

  it('therefore throws exactly the error the operator saw', () => {
    expect(() => MidnightBech32m.parse(bech32.coin).decode(ShieldedCoinPublicKey as never, NETWORK)).toThrow(
      "Cannot read properties of undefined (reading 'decode')",
    );
    // The address class works, which is why the failure surfaced on the key and not the address.
    expect(() =>
      MidnightBech32m.parse(bech32.address).decode(UnshieldedAddress as never, NETWORK),
    ).not.toThrow();
  });

  it('is routed around by going through the class codec, as midnight-js does', () => {
    const decoded = ShieldedCoinPublicKey.codec.decode(NETWORK, MidnightBech32m.parse(bech32.coin));
    expect(decoded.toHexString()).toBe(COIN_HEX);
  });

  // The replaced code chose which key class to decode with by sniffing the Bech32m type for
  // 'esk' or 'enc'. The real type strings are 'shield-cpk' and 'shield-epk', so an encryption
  // key was decoded as a coin key — a second bug hiding behind the first.
  it('spells the encryption key type "shield-epk", which matches neither "esk" nor "enc"', () => {
    const type = MidnightBech32m.parse(bech32.enc).type;
    expect(type).toBe('shield-epk');
    expect(type.includes('esk') || type.includes('enc')).toBe(false);
  });
});

describe.each(['bech32m', 'hex'] as const)('a 1AM wallet reporting %s keys', (encoding) => {
  it('gives midnight-js a hex coin public key', async () => {
    const { adapter } = await adapterFor(encoding);
    expect(adapter.getCoinPublicKey()).toBe(COIN_HEX);
  });

  it('gives midnight-js a hex encryption public key', async () => {
    const { adapter } = await adapterFor(encoding);
    expect(adapter.getEncryptionPublicKey()).toBe(ENC_HEX);
  });

  // The converting call sites run the value through these. Unchanged output proves the adapter
  // and midnight-js agree; a Bech32m value would also survive here, which is exactly why this
  // assertion is not sufficient on its own and the plain-hex ones above exist.
  it('produces keys midnight-js own parsers pass through unchanged', async () => {
    const { adapter } = await adapterFor(encoding);
    expect(parseCoinPublicKeyToHex(adapter.getCoinPublicKey(), NETWORK)).toBe(COIN_HEX);
    expect(parseEncPublicKeyToHex(adapter.getEncryptionPublicKey(), NETWORK)).toBe(ENC_HEX);
  });

  it('decodes the unshielded address to the 32 bytes a claim pays to', async () => {
    const { adapter } = await adapterFor(encoding);
    const address = await adapter.userAddress!();
    expect(address.bytes).toHaveLength(32);
    expect(hex(address.bytes)).toBe(ADDR_HEX);
  });

  it('submits the transaction as hex and reports the identifier back', async () => {
    const { adapter, wallet } = await adapterFor(encoding);
    const bytes = new Uint8Array([1, 2, 3, 0xff]);
    const stub = { serialize: () => bytes, identifiers: () => ['tx-identifier'], transactionHash: () => 'hash' };
    const id = await adapter.submitTx(stub as never);
    expect(wallet.calls.submitted).toEqual(['010203ff']);
    expect(id).toBe('tx-identifier');
  });

  it('asks the wallet to balance, and tells it who pays the fee', async () => {
    const { adapter, wallet } = await adapterFor(encoding);
    const stub = { serialize: () => new Uint8Array([0xaa]) };
    await adapter.balanceTx(stub as never).catch(() => undefined);
    expect(wallet.calls.balanced).toHaveLength(1);
    expect(wallet.calls.balanced[0]!.tx).toBe('aa');
    expect(wallet.calls.balanced[0]!.options).toEqual({ payFees: true });
  });

  it('says so plainly when the wallet gives back something that is not a bound transaction', async () => {
    const { adapter } = await adapterFor(encoding);
    const stub = { serialize: () => new Uint8Array([0xaa]) };
    // The fake echoes the bytes, which is the real failure mode: a wallet that balanced but
    // did not bind. Without this the operator sees a complaint about a serialization header
    // tag, which says nothing about what to do.
    await expect(adapter.balanceTx(stub as never)).rejects.toThrow(
      /balanceUnsealedTransaction.*not a signed, proven, bound transaction/s,
    );
    await expect(adapter.balanceTx(stub as never)).rejects.toThrow(/the exact bytes it was sent/);
  });

  it('reports that the wallet pays its own DUST, so it is never double-balanced', async () => {
    const { adapter } = await adapterFor(encoding);
    // 1AM balances from its own pool, so from the registry's side this is a self-funded
    // wallet. `sponsoredWalletAdapter` refuses anything else, which is the intended guard.
    expect(adapter.paysDustFees).toBe(true);
  });
});

describe('when the wallet returns something the adapter cannot use', () => {
  it('names the call and shows what it got, rather than failing deep inside a codec', async () => {
    const codecs = await loadAddressCodecs(NETWORK);
    const adapter = dappConnectorWalletAdapter(
      fakeOneAm('hex'),
      { coinPublicKey: 'not-a-key-at-all', encryptionPublicKey: ENC_HEX },
      { ...codecs },
    );
    expect(() => adapter.getCoinPublicKey()).toThrowError(
      /coin public key.*not-a-key-at-all|not-a-key-at-all.*coin public key/is,
    );
  });

  it('refuses a key of the wrong kind instead of silently decoding it', async () => {
    const codecs = await loadAddressCodecs(NETWORK);
    const adapter = dappConnectorWalletAdapter(
      fakeOneAm('hex'),
      // The encryption key where the coin key belongs: a wallet wiring mistake that must not
      // produce a plausible-looking 32 bytes.
      { coinPublicKey: bech32.enc, encryptionPublicKey: ENC_HEX },
      { ...codecs },
    );
    expect(() => adapter.getCoinPublicKey()).toThrow(/shield-cpk|shield-epk|coin public key/i);
  });

  it('without codecs, says so instead of handing Bech32m to midnight-js', () => {
    const adapter = dappConnectorWalletAdapter(fakeOneAm('bech32m'), {
      coinPublicKey: bech32.coin,
      encryptionPublicKey: bech32.enc,
    });
    // The default has to reject Bech32m loudly: passing it through reaches a call site that
    // does not convert, and the failure would then surface as a malformed transaction.
    expect(() => adapter.getCoinPublicKey()).toThrow(/loadAddressCodecs/);
  });

  it('without codecs, still accepts hex, which is what 1AM documents', () => {
    const adapter = dappConnectorWalletAdapter(fakeOneAm('hex'), {
      coinPublicKey: COIN_HEX,
      encryptionPublicKey: ENC_HEX,
    });
    expect(adapter.getCoinPublicKey()).toBe(COIN_HEX);
    expect(adapter.getEncryptionPublicKey()).toBe(ENC_HEX);
  });
});

// ---------------------------------------------------------------------------------------------
// The deploy path itself, driven against the fake wallet and stopped at the signature.
//
// The adapter tests above pin the encodings. This one pins the thing that actually broke: that
// `NetworkBackend.deploy` can get all the way from a connected wallet to a built, unproven
// deploy transaction without touching anything the fake cannot answer. Every wallet call
// midnight-js makes on the way — `getCoinPublicKey`, `getEncryptionPublicKey` — happens here,
// in the same order and with the same arguments as on mainnet.
//
// It stops at proving, which is the first step that needs a real wallet, a real proof server
// and the operator's hand: the proof provider throws a sentinel and the test asserts that the
// sentinel is what comes back. Reaching it means everything before it worked.
//
// Skipped when the compiled proving material is absent, which is the case in CI — the keys are
// ~124 MB and gitignored. `npm run compile` makes it run.
describe('the staged deploy, up to the signature', () => {
  const assets = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'contract',
    'src',
    'managed',
    'stock-and-foil',
  );
  const compiled = existsSync(join(assets, 'keys', 'offer.verifier'));

  it.skipIf(!compiled)('builds the deploy transaction from the fake wallet and stops at proving', async () => {
    const { NetworkBackend, createProviders, generateRegistryKeys, generatePersona } = await import(
      '../src/index.js'
    );
    const { nodeZkConfigProvider } = await import('../src/backend/node.js');

    const wallet = fakeOneAm('bech32m');
    const shielded = await wallet.getShieldedAddresses();
    const codecs = await loadAddressCodecs(NETWORK);
    const adapter = dappConnectorWalletAdapter(
      wallet,
      {
        coinPublicKey: shielded.shieldedCoinPublicKey,
        encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
      },
      { ...codecs },
    );

    const reachedProving = new Error('SENTINEL: proving would start here');
    const providers = createProviders({
      network: NETWORK,
      wallet: adapter,
      zkConfigProvider: nodeZkConfigProvider(assets),
      // Stands in for 1AM's ProofStation, which is also where the operator's approval happens.
      proofProvider: {
        proveTx: () => Promise.reject(reachedProving),
      },
      endpoints: {
        // Never dialled: nothing before proving reads the chain.
        indexerHttpUrl: 'http://127.0.0.1:1/never',
        indexerWsUrl: 'ws://127.0.0.1:1/never',
        nodeUrl: 'ws://127.0.0.1:1/never',
        proofServerUrl: 'http://127.0.0.1:1/never',
      },
    });

    const keys = generateRegistryKeys();
    await expect(
      NetworkBackend.deploy({
        network: NETWORK,
        providers,
        compiledAssetsPath: assets,
        constructorArgs: keys.constructorArgs,
        operator: generatePersona('operator'),
      }),
    ).rejects.toThrow(/SENTINEL/);

    // And the wallet really was consulted, in hex, on the way there.
    expect(adapter.getCoinPublicKey()).toBe(COIN_HEX);
  });
});

describe('the ZK config provider', () => {
  // Pins the second thing that only a browser could show. See fetchZkConfigProvider.
  it('hands FetchZkConfigProvider a bound fetch, not the bare global', async () => {
    const { fetchZkConfigProvider } = await import('../src/index.js');
    const provider = fetchZkConfigProvider('http://127.0.0.1:1/zk') as unknown as { fetchFunc?: unknown };
    expect(typeof provider.fetchFunc).toBe('function');
    expect(provider.fetchFunc).not.toBe(globalThis.fetch);
    // A bound function survives being called detached, which is how the provider calls it.
    const detached = provider.fetchFunc as () => Promise<unknown>;
    await expect(detached()).rejects.toThrow(/argument|Failed to parse|fetch/i);
  });
});
