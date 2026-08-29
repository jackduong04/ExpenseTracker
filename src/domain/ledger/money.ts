export function minorUnitDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function parseMoneyInputToMinorUnits(value: string, currency: string): number {
  const digits = minorUnitDigits(currency);
  const text = value.trim().replace(/,/g, '');
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(text)) throw new Error('Enter a valid amount.');
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (fraction.length > digits) throw new Error(`Use no more than ${digits} decimal places.`);
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
  if (!Number.isSafeInteger(minor)) throw new Error('Amount is too large.');
  return negative ? -minor : minor;
}

export function formatMinorUnits(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(amountMinor / 10 ** minorUnitDigits(currency));
}
export const addMinorUnits = (a: number, b: number) => assertSafe(a + b);
export const subtractMinorUnits = (a: number, b: number) => assertSafe(a - b);
function assertSafe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Money total exceeded safe integer range.');
  return value;
}
