import type { Ledger } from '../../domain/ledger/types';
import { contentHash, parseLedger, stableSerialize } from '../schema/parse-ledger';
import type { LedgerFileService } from './LedgerFileService';

const safeName = (name: string) =>
  name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'ledger';
const filenameFor = (ledger: Ledger) =>
  `expense-tracker-${safeName(ledger.name)}-r${ledger.revision}-${ledger.updatedAt.slice(0, 10)}.json`;
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function supportsIOSFileSharing(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (
    (isIOS || isIPadOS) && typeof navigator.share === 'function' && typeof File !== 'undefined'
  );
}
export class BrowserLedgerFileService implements LedgerFileService {
  async open() {
    const picker = (
      window as Window & {
        showOpenFilePicker?: (
          options?: unknown,
        ) => Promise<Array<{ getFile: () => Promise<File> }>>;
      }
    ).showOpenFilePicker;
    if (picker) {
      try {
        const [handle] = await picker({
          types: [
            { description: 'Expense Tracker ledger', accept: { 'application/json': ['.json'] } },
          ],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        return {
          ledger: parseLedger(text, file.size),
          filename: file.name,
          hash: await contentHash(text),
          handle,
        };
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return null;
        throw error;
      }
    }
    return new Promise<{ ledger: Ledger; filename: string; hash: string; handle?: unknown } | null>(
      (resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          try {
            const text = await file.text();
            const ledger = parseLedger(text, file.size);
            resolve({ ledger, filename: file.name, hash: await contentHash(text) });
          } catch (e) {
            reject(e);
          }
        };
        input.oncancel = () => resolve(null);
        input.click();
      },
    );
  }
  async save(ledger: Ledger, handle?: unknown) {
    const text = stableSerialize(ledger);
    const hash = await contentHash(text);
    const filename = filenameFor(ledger);
    const candidate = handle as
      | {
          createWritable?: () => Promise<{
            write: (data: string) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }
      | undefined;
    if (candidate?.createWritable) {
      const writable = await candidate.createWritable();
      await writable.write(text);
      await writable.close();
      return { filename, hash, handle };
    }
    download(text, filename);
    return { filename, hash };
  }
  async exportCopy(ledger: Ledger) {
    const text = stableSerialize(ledger);
    const filename = filenameFor(ledger);

    if (supportsIOSFileSharing()) {
      try {
        const file = new File([text], filename, { type: 'application/json' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Expense Tracker backup' });
        } else {
          download(text, filename);
        }
      } catch (error) {
        const name = (error as DOMException).name;
        if (name === 'AbortError') throw new Error('Export was cancelled.', { cause: error });
        if (name === 'NotAllowedError' || name === 'SecurityError') download(text, filename);
        else throw error;
      }
    } else {
      download(text, filename);
    }

    return { filename, hash: await contentHash(text) };
  }
}
