// SPDX-License-Identifier: Apache-2.0
//
// Refusals. A fraudulent or unauthorised call fails while the transaction is being built, so
// nothing reaches the chain: the contract's assert message is the refusal code, and this module
// turns it into a typed error every front end can render.

/**
 * Every assert message the contract can emit, taken from `contract/test/refusals.test.ts`
 * and `contract/README.md`. `BAD_EPHEMERAL` is not in the design spec: it guards against a
 * degenerate sealing scalar, which would leave a record with no secrecy at all.
 */
export const REFUSAL_CODES = [
  'ALREADY_ACKNOWLEDGED',
  'ALREADY_APPROVED',
  'ALREADY_CLAIMED',
  'ALREADY_ENCUMBERED',
  'ALREADY_SETTLED',
  'BAD_EPHEMERAL',
  'BAD_EXPIRY',
  'BELOW_FLOOR',
  'DUPLICATE_CERTIFICATE',
  'DUPLICATE_INVOICE',
  'DUPLICATE_REQUEST',
  'EMPTY_POOL',
  'INVOICE_OVERDUE',
  'NOT_ACKNOWLEDGED',
  'NOT_ADDRESSEE',
  'NOT_AUDITOR',
  'NOT_HOLDER',
  'NOT_INVOICE_OWNER',
  'NOT_KEYHOLDER',
  'NOT_LICENSED',
  'NOT_OPERATOR',
  'NOT_PAYEE',
  'NOT_PLEDGED',
  'NOT_REGISTERED_DEBTOR',
  'NOT_SETTLED',
  'NOT_YOUR_INVOICE',
  'NO_SUCH_OFFER',
  'NO_SUCH_RECORD',
  'NO_SUCH_REQUEST',
  'OFFER_EXPIRED',
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Plain-language rendering of every refusal, for UI surfaces that must not print raw codes. */
export const REFUSAL_MESSAGES: Record<RefusalCode, string> = {
  ALREADY_ACKNOWLEDGED: 'This debtor already acknowledged an invoice with that number from this seller.',
  ALREADY_APPROVED: 'This keyholder has already approved that disclosure request.',
  ALREADY_CLAIMED: 'The proceeds of this invoice have already been paid out.',
  ALREADY_ENCUMBERED: 'This receivable is already pledged to a financier.',
  ALREADY_SETTLED: 'This invoice has already been settled through the registry.',
  BAD_EPHEMERAL: 'The sealing key for this record was degenerate; retry with fresh randomness.',
  BAD_EXPIRY: 'The expiry date has already passed.',
  BELOW_FLOOR: 'The pooled invoices are worth less than the floor the certificate claims.',
  DUPLICATE_CERTIFICATE: 'A certificate with that lender reference and nonce already exists.',
  DUPLICATE_INVOICE: 'The same invoice cannot fill two slots of one borrowing base.',
  DUPLICATE_REQUEST: 'That record and case reference have already been requested.',
  EMPTY_POOL: 'A borrowing-base certificate must lock at least one invoice.',
  INVOICE_OVERDUE: 'The invoice is due before the offer or certificate would expire.',
  NOT_ACKNOWLEDGED: 'The debtor never acknowledged this invoice, at this amount, with these terms.',
  NOT_ADDRESSEE: 'This offer is addressed to a different financier.',
  NOT_AUDITOR: 'Only the registry auditor can open a disclosure request.',
  NOT_HOLDER: 'Only the financier holding this pledge can release it.',
  NOT_INVOICE_OWNER: 'Only the seller named in the invoice can offer it.',
  NOT_KEYHOLDER: 'That approval slot belongs to a different keyholder.',
  NOT_LICENSED: 'This financier is not admitted to the registry.',
  NOT_OPERATOR: 'Only the registry operator can admit participants.',
  NOT_PAYEE: 'These proceeds belong to another party.',
  NOT_PLEDGED: 'There is no live pledge to release.',
  NOT_REGISTERED_DEBTOR: 'This debtor is not admitted to the registry.',
  NOT_SETTLED: 'The debtor has not paid this invoice through the registry yet.',
  NOT_YOUR_INVOICE: 'This invoice names a different debtor.',
  NO_SUCH_OFFER: 'There is no open offer under that nullifier.',
  NO_SUCH_RECORD: 'No sealed record exists under that record id.',
  NO_SUCH_REQUEST: 'No disclosure request exists under that request id.',
  OFFER_EXPIRED: 'This offer has expired.',
};

const CODES: ReadonlySet<string> = new Set(REFUSAL_CODES);

export const isRefusalCode = (value: string): value is RefusalCode => CODES.has(value);

/**
 * A transaction the contract refused to build. It never reached the network: the assert fires
 * while the circuit runs locally, before proving and before submission.
 */
export class Refusal extends Error {
  readonly code: RefusalCode;
  readonly circuit: string;

  constructor(code: RefusalCode, circuit: string, options?: { cause?: unknown }) {
    super(`${circuit} refused: ${code} — ${REFUSAL_MESSAGES[code]}`, options);
    this.name = 'Refusal';
    this.code = code;
    this.circuit = circuit;
  }
}

export const isRefusal = (error: unknown): error is Refusal => error instanceof Refusal;

/**
 * Flattens an error and its `cause` chain. The simulator throws
 * `CompactError: failed assert: X`; `callTx` wraps the same text in a scoped-transaction error
 * whose `cause.message` carries it.
 */
function messages(error: unknown, depth = 0): string {
  if (error === null || error === undefined || depth > 8) return '';
  const own = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown }).cause;
  return cause === undefined ? own : `${own} ${messages(cause, depth + 1)}`;
}

/** The refusal code carried by an error, or `undefined` if it is not a refusal. */
export function refusalCodeOf(error: unknown): RefusalCode | undefined {
  if (error instanceof Refusal) return error.code;
  const match = /failed assert: ([A-Z_]+)/.exec(messages(error));
  return match && isRefusalCode(match[1]!) ? match[1] : undefined;
}

/** Wraps an error as a `Refusal` when it carries a refusal code, otherwise returns `undefined`. */
export function asRefusal(error: unknown, circuit: string): Refusal | undefined {
  if (error instanceof Refusal) return error;
  const code = refusalCodeOf(error);
  return code === undefined ? undefined : new Refusal(code, circuit, { cause: error });
}

/** Rethrows an error as a typed `Refusal` when it is one, and unchanged when it is not. */
export function rethrowAsRefusal(error: unknown, circuit: string): never {
  throw asRefusal(error, circuit) ?? error;
}
