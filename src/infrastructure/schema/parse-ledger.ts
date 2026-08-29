import { ledgerV1Schema } from './ledger-v1';
import type { Ledger } from '../../domain/ledger/types';
import { isCalendarDate } from '../../domain/ledger/dates';
export const IMPORT_LIMIT = 10 * 1024 * 1024;
export function parseLedger(text: string, size?: number): Ledger {
  if ((size ?? new Blob([text]).size) > IMPORT_LIMIT)
    throw new Error('This file is larger than the 10 MB import limit.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  const version =
    typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
      ? (raw as { schemaVersion?: number }).schemaVersion
      : undefined;
  if (version !== undefined && version > 1)
    throw new Error('This ledger was created by a newer app version.');
  const result = ledgerV1Schema.safeParse(raw);
  if (!result.success)
    throw new Error(
      'This is not a valid Expense Tracker ledger. Check its schema and required fields.',
    );
  const ledger = result.data as Ledger;
  const ids = new Set<string>();
  const categoryIds = new Set<string>();
  for (const c of ledger.categories) {
    if (categoryIds.has(c.id) || ids.has(c.id))
      throw new Error('The ledger contains duplicate IDs.');
    categoryIds.add(c.id);
    ids.add(c.id);
  }
  for (const t of ledger.transactions) {
    const category = ledger.categories.find((c) => c.id === t.categoryId);
    if (ids.has(t.id) || !isCalendarDate(t.date) || !category || category.kind !== t.kind)
      throw new Error('The ledger contains an invalid transaction or category reference.');
    ids.add(t.id);
  }
  for (const kind of ['expense', 'income'] as const) {
    const names = new Set<string>();
    for (const c of ledger.categories.filter((c) => c.kind === kind)) {
      const n = c.name.trim().toLocaleLowerCase();
      if (names.has(n)) throw new Error('The ledger contains duplicate category names.');
      names.add(n);
    }
  }
  return ledger;
}
export function stableSerialize(ledger: Ledger) {
  return JSON.stringify(ledger, null, 2) + '\n';
}
export async function contentHash(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
