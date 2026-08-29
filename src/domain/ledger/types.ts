export type TransactionKind = 'expense' | 'income';
export type Theme = 'system' | 'light' | 'dark';
export type DatePreset =
  | 'this-month'
  | 'previous-month'
  | 'last-7-days'
  | 'last-30-days'
  | 'this-year'
  | 'all-time'
  | 'custom';

export interface LedgerSettings {
  currency: string;
  locale: string;
  openingBalanceMinor: number;
  defaultDatePreset: DatePreset;
  weekStartsOn: 0 | 1;
  theme: Theme;
}
export interface Category {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Transaction {
  id: string;
  date: string;
  kind: TransactionKind;
  amountMinor: number;
  categoryId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}
export interface Ledger {
  schemaVersion: 1;
  ledgerId: string;
  revision: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: LedgerSettings;
  categories: Category[];
  transactions: Transaction[];
}
export interface DateRange {
  start: string;
  end: string;
}
export interface TransactionFilters {
  start?: string;
  end?: string;
  kind?: TransactionKind | 'all';
  categoryIds: string[];
  note: string;
}
export type SortKey = 'date' | 'amountMinor' | 'category' | 'createdAt' | 'updatedAt';
export interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}
