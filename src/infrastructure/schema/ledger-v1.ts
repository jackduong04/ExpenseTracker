import { z } from 'zod';
const iso = z.string().datetime({ offset: true });
const category = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  kind: z.enum(['expense', 'income']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icon: z.string().nullable(),
  archived: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});
const transaction = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['expense', 'income']),
  amountMinor: z.number().int().safe().positive(),
  categoryId: z.string().uuid(),
  note: z.string().max(500),
  createdAt: iso,
  updatedAt: iso,
});
export const ledgerV1Schema = z.object({
  schemaVersion: z.literal(1),
  ledgerId: z.string().uuid(),
  revision: z.number().int().min(1),
  name: z.string().min(1).max(200),
  createdAt: iso,
  updatedAt: iso,
  settings: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: z.string().min(2).max(50),
    openingBalanceMinor: z.number().int().safe(),
    defaultDatePreset: z.enum([
      'this-month',
      'previous-month',
      'last-7-days',
      'last-30-days',
      'this-year',
      'all-time',
      'custom',
    ]),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    theme: z.enum(['system', 'light', 'dark']),
  }),
  categories: z.array(category),
  transactions: z.array(transaction),
});
