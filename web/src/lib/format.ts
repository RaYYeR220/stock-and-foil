// SPDX-License-Identifier: Apache-2.0
//
// Formatting for values the registry deals in: minor-unit amounts, unix block times, and the
// 32-byte identifiers that make up most of what the public ledger holds.

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

/** Amounts are held in minor units, the way the circuits see them. */
export const money = (minorUnits: bigint): string => MONEY.format(Number(minorUnits) / 100);

export const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const DATETIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export const day = (unixSeconds: bigint): string => DATE.format(new Date(Number(unixSeconds) * 1000));
export const moment = (unixSeconds: bigint): string => DATETIME.format(new Date(Number(unixSeconds) * 1000));

/** How many whole days from `from` to `to`, rounded down; negative when `to` is in the past. */
export const daysBetween = (from: bigint, to: bigint): number => Number((to - from) / 86_400n);

/** Ledger identifiers are 32 bytes; print the ends, which is how anyone reads them anyway. */
export function shortHex(value: string | Uint8Array | undefined, head = 6, tail = 4): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('');
  const body = text.startsWith('0x') ? text.slice(2) : text;
  if (body.length <= head + tail + 2) return `0x${body}`;
  return `0x${body.slice(0, head)}…${body.slice(-tail)}`;
}

export const toHexString = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A field element as a short decimal-free label; tags and ciphertexts are big numbers. */
export function shortField(value: bigint | string, head = 6, tail = 4): string {
  const body = (typeof value === 'bigint' ? value.toString(16) : value).padStart(2, '0');
  if (body.length <= head + tail + 2) return `0x${body}`;
  return `0x${body.slice(0, head)}…${body.slice(-tail)}`;
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const ms = (value: number): string => (value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`);
