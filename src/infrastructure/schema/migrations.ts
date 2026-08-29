import type { Ledger } from '../../domain/ledger/types';

/** Explicit migration entry point reserved for future supported schema versions. */
export function migrateLedger(input: unknown): unknown {
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    (input as { schemaVersion?: number }).schemaVersion === 1
  )
    return structuredClone(input);
  return input;
}
export type CurrentLedger = Ledger;
