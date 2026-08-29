import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ledger } from '../../domain/ledger/types';
import { BrowserLedgerFileService } from './BrowserLedgerFileService';

const ledger: Ledger = {
  schemaVersion: 1,
  ledgerId: '2ea8085c-1995-4cfe-98b5-c7d271d9d3d0',
  revision: 1,
  name: 'Personal Expenses',
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
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

describe('browser ledger export', () => {
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:ledger'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: { digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer) },
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('downloads on desktop even when the Web Share API exists', async () => {
    const share = vi.fn();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0)');
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });

    await new BrowserLedgerFileService().exportCopy(ledger);

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it('falls back to download when iOS sharing is denied', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
    );
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }),
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => true),
    });

    await new BrowserLedgerFileService().exportCopy(ledger);

    expect(click).toHaveBeenCalledOnce();
  });
});
