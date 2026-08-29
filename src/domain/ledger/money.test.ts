import { describe, expect, it } from 'vitest';
import { formatMinorUnits, parseMoneyInputToMinorUnits } from './money';
describe('money helpers', () => {
  it('parses exact minor units', () => {
    expect(parseMoneyInputToMinorUnits('1,234.50', 'NZD')).toBe(123450);
    expect(parseMoneyInputToMinorUnits('-4.25', 'NZD')).toBe(-425);
  });
  it('rejects excess precision', () => {
    expect(() => parseMoneyInputToMinorUnits('1.001', 'NZD')).toThrow();
  });
  it('formats with the ledger locale', () => {
    expect(formatMinorUnits(12345, 'NZD', 'en-NZ')).toContain('123.45');
  });
});
