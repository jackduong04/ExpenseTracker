import type { Ledger } from '../../domain/ledger/types';
export interface LedgerFileService {
  open(): Promise<{ ledger: Ledger; filename: string; hash: string; handle?: unknown } | null>;
  save(
    ledger: Ledger,
    handle?: unknown,
  ): Promise<{ filename: string; hash: string; handle?: unknown }>;
  exportCopy(ledger: Ledger): Promise<{ filename: string; hash: string }>;
}
