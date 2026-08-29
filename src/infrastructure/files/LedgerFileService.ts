import type { Ledger } from '../../domain/ledger/types';
export interface LedgerFileService {
  importLedger(): Promise<{ ledger: Ledger; filename: string; hash: string } | null>;
  exportCopy(ledger: Ledger): Promise<{ filename: string; hash: string }>;
}
