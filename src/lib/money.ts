/**
 * Money handling.
 *
 * Everything is integer cents. Floating point money is a bug waiting for a
 * rounding boundary, and it always arrives in the totals rather than the inputs,
 * where nobody is looking.
 */

export const CURRENCY = 'EUR';
const LOCALE = 'de-DE';

const formatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
});

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** Compact form for tiles and chart labels, where the cents are noise. */
export function formatCentsShort(cents: number): string {
  const euros = Math.round(cents / 100);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: CURRENCY, maximumFractionDigits: 0,
  }).format(euros);
}

/**
 * Parses a typed amount into cents.
 *
 * Accepts both German and English conventions because a German keyboard's numpad
 * produces a comma and the phone keyboard produces a dot, and a user should not
 * have to care which. `1.234,56` and `1,234.56` both mean the same thing; the
 * rule is that the LAST separator is the decimal one when there are two kinds.
 *
 * Returns null for anything unparseable rather than silently yielding 0 - a
 * typo becoming a zero-euro expense is worse than an error message.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[€\s ]/g, '');
  if (trimmed === '') return null;
  if (!/^[\d.,]+$/.test(trimmed)) return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  let normalised: string;

  if (lastComma === -1 && lastDot === -1) {
    normalised = trimmed;
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator: strip dots as thousands separators.
    normalised = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = trimmed.replace(/,/g, '');
  }

  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;
  // Round rather than truncate: 0.005 should not silently become 0.
  return Math.round(value * 100);
}

// --- months ---------------------------------------------------------------

/** An ISO month key, `YYYY-MM`. Sortable as a string, which is why it is used. */
export type MonthKey = string;

export function currentMonth(today = new Date()): MonthKey {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month: MonthKey): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  // Day 0 of the next month is the last day of this one, which avoids having to
  // know how long February is.
  const to = new Date(Date.UTC(year, monthNumber, 0));
  return { from: isoDate(from), to: isoDate(to) };
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(month: MonthKey): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  // Local date, not UTC: an expense entered at 23:00 CET belongs to that day,
  // not to tomorrow.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
