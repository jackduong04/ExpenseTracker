import { describe, expect, it } from 'vitest';
import { parseLedger, stableSerialize } from './parse-ledger';
import type { Ledger } from '../../domain/ledger/types';
const valid: Ledger = {
  schemaVersion: 1,
  ledgerId: '2ea8085c-1995-4cfe-98b5-c7d271d9d3d0',
  revision: 1,
  name: 'Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    currency: 'NZD',
    locale: 'en-NZ',
    openingBalanceMinor: 0,
    defaultDatePreset: 'this-month',
    weekStartsOn: 1,
    theme: 'system',
  },
  categories: [],
  transactions: [],
};
describe('ledger boundary', () => {
  it('round trips stable JSON', () => {
    expect(parseLedger(stableSerialize(valid))).toEqual(valid);
  });
  it('rejects future schemas and invalid references', () => {
    expect(() => parseLedger(JSON.stringify({ ...valid, schemaVersion: 2 }))).toThrow(/newer/);
    expect(() =>
      parseLedger(
        JSON.stringify({
          ...valid,
          transactions: [
            {
              id: '9dc005f9-0001-4f00-a001-000000000001',
              date: '2026-01-01',
              kind: 'expense',
              amountMinor: 1,
              categoryId: 'e897aeb6-0001-4f00-a001-000000000001',
              note: '',
              createdAt: valid.createdAt,
              updatedAt: valid.updatedAt,
            },
          ],
        }),
      ),
    ).toThrow(/invalid transaction/);
  });
});
