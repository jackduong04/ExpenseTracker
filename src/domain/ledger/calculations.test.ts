import { describe, expect, it } from 'vitest';
import { balanceAt, categoryTotals, dashboardStats, filterTransactions } from './calculations';
import type { Ledger } from './types';

const ledger: Ledger = {
  schemaVersion: 1,
  ledgerId: '2ea8085c-1995-4cfe-98b5-c7d271d9d3d0',
  revision: 1,
  name: 'Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    currency: 'NZD',
    locale: 'en-NZ',
    openingBalanceMinor: 10000,
    defaultDatePreset: 'this-month',
    weekStartsOn: 1,
    theme: 'system',
  },
  categories: [
    {
      id: 'e897aeb6-0001-4f00-a001-000000000001',
      name: 'Food',
      kind: 'expense',
      color: '#4f8a6b',
      icon: null,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e897aeb6-0001-4f00-a001-000000000002',
      name: 'Pay',
      kind: 'income',
      color: '#4d78a8',
      icon: null,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  transactions: [
    {
      id: '9dc005f9-0001-4f00-a001-000000000001',
      date: '2026-01-10',
      kind: 'income',
      amountMinor: 5000,
      categoryId: 'e897aeb6-0001-4f00-a001-000000000002',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '9dc005f9-0001-4f00-a001-000000000002',
      date: '2026-01-15',
      kind: 'expense',
      amountMinor: 1250,
      categoryId: 'e897aeb6-0001-4f00-a001-000000000001',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

describe('ledger calculations', () => {
  it('calculates balance through end date independently of start date', () => {
    expect(balanceAt(ledger, '2026-01-31')).toBe(13750);
    expect(dashboardStats(ledger, { start: '2026-01-20', end: '2026-01-31' }).balance).toBe(13750);
  });
  it('calculates category totals and percentages', () => {
    expect(categoryTotals(ledger, { start: '2026-01-01', end: '2026-01-31' })[0]).toMatchObject({
      amountMinor: 1250,
      percentage: 100,
    });
  });
  it('calculates net, average, and previous-period comparison', () => {
    const stats = dashboardStats(ledger, { start: '2026-01-10', end: '2026-01-15' });
    expect(stats.income).toBe(5000);
    expect(stats.expenses).toBe(1250);
    expect(stats.net).toBe(3750);
    expect(stats.averageDailyExpense).toBe(208);
  });
  it('filters transactions by category', () => {
    const rows = filterTransactions(
      ledger.transactions,
      ledger.categories,
      { categoryIds: ['e897aeb6-0001-4f00-a001-000000000001'], note: '', kind: 'all' },
      { key: 'date', direction: 'desc' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe('e897aeb6-0001-4f00-a001-000000000001');
  });
});
