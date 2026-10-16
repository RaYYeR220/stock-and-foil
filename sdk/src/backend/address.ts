// SPDX-License-Identifier: Apache-2.0
//
// Turning what a browser wallet says into what midnight-js takes.
//
// A wallet reports its keys as strings, and midnight-js takes strings, and the two are not
// always the same string. That is the whole problem: TypeScript sees `string` on both sides
// and the mismatch only appears at runtime, deep inside a codec, as something like
// `Cannot read properties of undefined (reading 'decode')`.
//
// Three facts decide everything in this file, and each one was established by reading the
// installed packages rather than their documentation.
//
// 1. `MidnightBech32m.prototype.decode(tclass, networkId)` resolves `tclass[Bech32mSymbol]`.
//    In `@midnight-ntwrk/wallet-sdk-address-format` 3.1.2 the two shielded *key* classes
//    (`ShieldedCoinPublicKey`, `ShieldedEncryptionPublicKey`) carry only `static codec`;
//    `UnshieldedAddress`, `ShieldedAddress` and `DustAddress` carry `static [Bech32mSymbol]`
//    as well. So the obvious call throws for keys and works for addresses. Going through
//    `Class.codec.decode(networkId, parsed)` works for all five, and is what midnight-js's own
//    `parseCoinPublicKeyToHex` does.
//
// 2. Wallets differ on the encoding. 1AM's developer guide passes `shieldedCoinPublicKey`
//    straight into `getCoinPublicKey`, which is only correct if it is already hex; every other
//    Midnight wallet we have seen reports Bech32m. Both have to work, so both are accepted and
//    anything else is an error rather than a guess.
//
// 3. Hex is the only safe output. `@midnight-ntwrk/midnight-js-contracts` 4.1.1 converts the
//    coin public key with `parseCoinPublicKeyToHex` when it builds a deploy or a call, but
//    passes it through unconverted when it builds a verifier-key maintenance transaction — and
//    passes the *encryption* key through unconverted everywhere. A staged deployment uses both
//    kinds of call site, so an adapter that emitted Bech32m would deploy and then fail on the
//    first maintenance transaction.
//
// `wallet-sdk-address-format` also reaches for a global `Buffer` without importing one, so the
// polyfill is installed here, before the first call that needs it, rather than being left as
// something each caller has to remember.

/** Decoders a `dappConnectorWalletAdapter` needs, all of them producing what midnight-js takes. */
export interface AddressCodecs {
  /** Bech32m or hex coin public key, as lower-case hex. */
  decodeCoinPublicKey(value: string): string;
  /** Bech32m or hex encryption public key, as lower-case hex. */
  decodeEncryptionPublicKey(value: string): string;
  /** Bech32m or hex unshielded address, as the 32 bytes a claim circuit pays to. */
  decodeAddress(value: string): Uint8Array;
}

const HEX = /^(0x)?[0-9a-fA-F]+$/;

const isHexString = (value: string): boolean => value.length % 2 === 0 && value !== '' && HEX.test(value);

const stripPrefix = (value: string): string => (value.startsWith('0x') ? value.slice(2) : value);

const bytesFromHex = (value: string): Uint8Array => {
  const body = stripPrefix(value);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Raised when a wallet reports something that is neither hex nor the Bech32m of the kind
 * being asked for.
 *
 * It names the call, says what kind of value was expected, and shows what arrived — because
 * the person reading it is an operator looking at a console, not a developer with a debugger.
 */
export class AddressDecodeError extends Error {
  constructor(
    readonly what: string,
    readonly value: string,
    cause?: unknown,
  ) {
    const shown = value.length > 96 ? `${value.slice(0, 72)}…${value.slice(-12)}` : value;
    const reason = cause instanceof Error ? cause.message : cause === undefined ? undefined : String(cause);
    super(
      `the wallet's ${what} could not be decoded. It reported "${shown}" (${value.length} characters)` +
        `${reason ? `, and decoding it failed with: ${reason}` : ''}. A ${what} has to be either ` +
        'lower-case hex or the Bech32m form of that exact kind of key — a key of a different kind, ' +
        'or one from a different network, is refused here rather than turned into plausible bytes.',
    );
    this.name = 'AddressDecodeError';
  }
}

/**
 * The codecs, with the Bech32m machinery and its `Buffer` dependency loaded on demand.
 *
 * Async because both of those are dynamic imports: a bundle that never talks to a wallet —
 * the published app's Sandbox, for one — should not carry them, and the `Buffer` polyfill has
 * to be in place before `wallet-sdk-address-format` is first touched.
 *
 * `networkId` is the one `setNetworkId` was called with, e.g. `mainnet`. Decoding checks it,
 * so a preview key presented to a mainnet session is an error and not a silent 32 bytes.
 */
export async function loadAddressCodecs(networkId: string): Promise<AddressCodecs> {
  const { Buffer } = await import('buffer');
  (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;

  const { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } = await import('@midnight-ntwrk/midnight-js-utils');
  const { MidnightBech32m, UnshieldedAddress } = await import('@midnight-ntwrk/wallet-sdk-address-format');

  const decodeKey =
    (what: string, parse: (value: string, networkId: string) => string) =>
    (value: string): string => {
      try {
        // Both parsers return a hex input unchanged and otherwise go through the class codec,
        // which is the route that works for the shielded key classes.
        const result = parse(value, networkId);
        if (!isHexString(result)) throw new Error(`decoding produced "${result}", which is not hex`);
        return stripPrefix(result).toLowerCase();
      } catch (cause) {
        throw new AddressDecodeError(what, value, cause);
      }
    };

  return {
    decodeCoinPublicKey: decodeKey('coin public key', parseCoinPublicKeyToHex),
    decodeEncryptionPublicKey: decodeKey('encryption public key', parseEncPublicKeyToHex),
    decodeAddress: (value: string): Uint8Array => {
      try {
        if (isHexString(value)) {
          const bytes = bytesFromHex(value);
          if (bytes.length !== 32) throw new Error(`a hex address must be 32 bytes, this is ${bytes.length}`);
          return bytes;
        }
        const decoded = UnshieldedAddress.codec.decode(networkId as never, MidnightBech32m.parse(value));
        const bytes = new Uint8Array((decoded as unknown as { data: Uint8Array }).data);
        if (bytes.length !== 32) throw new Error(`the decoded address is ${bytes.length} bytes, not 32`);
        return bytes;
      } catch (cause) {
        throw new AddressDecodeError('unshielded address', value, cause);
      }
    },
  };
}

/**
 * The fallback the adapter uses when no codecs were supplied.
 *
 * It accepts hex, which is what 1AM's guide shows a wallet returning, and refuses anything
 * else by name. Passing Bech32m through would reach a midnight-js call site that does not
 * convert it, and the failure would surface later as a malformed transaction — which, on a
 * network with no faucet, is the expensive way to find out.
 */
export const hexOnlyCodec =
  (what: string) =>
  (value: string): string => {
    if (isHexString(value)) return stripPrefix(value).toLowerCase();
    throw new AddressDecodeError(
      what,
      value,
      new Error(
        'it is not hex, so it needs decoding, and this adapter was built without codecs. Build ' +
          'them with `loadAddressCodecs(networkId)` and pass them to dappConnectorWalletAdapter',
      ),
    );
  };
