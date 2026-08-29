import type {
  Category,
  DateRange,
  Ledger,
  SortState,
  Transaction,
  TransactionFilters,
} from './types';
import { daysBetweenInclusive, previousEquivalentRange } from './dates';
export const inRange = (date: string, range: DateRange) => date >= range.start && date <= range.end;
export function sumTransactions(
  transactions: Transaction[],
  kind: Transaction['kind'],
  range?: DateRange,
) {
  return transactions
    .filter((t) => t.kind === kind && (!range || inRange(t.date, range)))
    .reduce((sum, t) => sum + t.amountMinor, 0);
}
export function balanceAt(ledger: Ledger, end: string) {
  return (
    ledger.settings.openingBalanceMinor +
    ledger.transactions
      .filter((t) => t.date <= end)
      .reduce((sum, t) => sum + (t.kind === 'income' ? t.amountMinor : -t.amountMinor), 0)
  );
}
export function categoryTotals(ledger: Ledger, range: DateRange) {
  const total = sumTransactions(ledger.transactions, 'expense', range);
  return ledger.categories
    .map((category) => ({
      category,
      amountMinor: sumTransactions(
        ledger.transactions.filter((t) => t.categoryId === category.id),
        'expense',
        range,
      ),
      percentage: total
        ? (sumTransactions(
            ledger.transactions.filter((t) => t.categoryId === category.id),
            'expense',
            range,
          ) /
            total) *
          100
        : 0,
    }))
    .filter((x) => x.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
export function trendData(ledger: Ledger, range: DateRange) {
  const long = daysBetweenInclusive(range.start, range.end) > 92;
  const map = new Map<string, { label: string; expenses: number; income: number }>();
  for (const t of ledger.transactions.filter((x) => inRange(x.date, range))) {
    const key = long ? t.date.slice(0, 7) : t.date;
    const current = map.get(key) || { label: key, expenses: 0, income: 0 };
    current[t.kind === 'expense' ? 'expenses' : 'income'] += t.amountMinor;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
export function dashboardStats(ledger: Ledger, range: DateRange) {
  const expenses = sumTransactions(ledger.transactions, 'expense', range);
  const income = sumTransactions(ledger.transactions, 'income', range);
  const expenseTransactions = ledger.transactions.filter(
    (t) => t.kind === 'expense' && inRange(t.date, range),
  );
  const largest = expenseTransactions.reduce<Transaction | null>(
    (max, t) => (!max || t.amountMinor > max.amountMinor ? t : max),
    null,
  );
  const categories = categoryTotals(ledger, range);
  const prev = previousEquivalentRange(range);
  const previousNet =
    sumTransactions(ledger.transactions, 'income', prev) -
    sumTransactions(ledger.transactions, 'expense', prev);
  return {
    expenses,
    income,
    net: income - expenses,
    balance: balanceAt(ledger, range.end),
    count: ledger.transactions.filter((t) => inRange(t.date, range)).length,
    averageDailyExpense: Math.round(
      expenses / Math.max(1, daysBetweenInclusive(range.start, range.end)),
    ),
    largest,
    topCategory: categories[0]?.category || null,
    change: income - expenses - previousNet,
    categories,
  };
}
export function filterTransactions(
  transactions: Transaction[],
  categories: Category[],
  filters: TransactionFilters,
  sort: SortState,
) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return transactions
    .filter(
      (t) =>
        (!filters.start || t.date >= filters.start) &&
        (!filters.end || t.date <= filters.end) &&
        (!filters.kind || filters.kind === 'all' || t.kind === filters.kind) &&
        (!filters.categoryIds.length || filters.categoryIds.includes(t.categoryId)) &&
        (!filters.note || t.note.toLocaleLowerCase().includes(filters.note.toLocaleLowerCase())),
    )
    .sort((a, b) => {
      const av = sort.key === 'category' ? byId.get(a.categoryId)?.name || '' : a[sort.key];
      const bv = sort.key === 'category' ? byId.get(b.categoryId)?.name || '' : b[sort.key];
      const order = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return (order || a.id.localeCompare(b.id)) * (sort.direction === 'asc' ? 1 : -1);
    });
}
