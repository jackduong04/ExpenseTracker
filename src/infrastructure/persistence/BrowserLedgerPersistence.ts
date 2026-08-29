import type { Ledger } from '../../domain/ledger/types';
import { contentHash, parseLedger, stableSerialize } from '../schema/parse-ledger';

export interface StoredLedgerRecord {
  ledgerId: string;
  json: string;
  hash: string;
  filename: string;
  revision: number;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface LedgerSummary {
  ledgerId: string;
  name: string;
  filename: string;
  revision: number;
  updatedAt: string;
  lastOpenedAt: string;
}

const DATABASE = 'expense-tracker';
const VERSION = 1;
const LEDGERS = 'ledgers';
const APP_STATE = 'app-state';
const ACTIVE_KEY = 'active-ledger';

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });

export class BrowserLedgerPersistence {
  private database?: Promise<IDBDatabase>;

  private openDatabase() {
    if (!('indexedDB' in window))
      throw new Error('This browser does not support local ledger storage.');
    this.database ||= new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LEDGERS))
          database.createObjectStore(LEDGERS, { keyPath: 'ledgerId' });
        if (!database.objectStoreNames.contains(APP_STATE)) database.createObjectStore(APP_STATE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error('Unable to open local ledger storage.'));
      request.onblocked = () =>
        reject(new Error('Local ledger storage is blocked by another browser tab.'));
    });
    return this.database;
  }

  async list(): Promise<LedgerSummary[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction(LEDGERS, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult<StoredLedgerRecord[]>(
      transaction.objectStore(LEDGERS).getAll(),
    );
    await done;
    return records
      .map(({ ledgerId, json, filename, revision, updatedAt, lastOpenedAt }) => {
        let name = filename;
        try {
          name = (JSON.parse(json) as Partial<Ledger>).name || filename;
        } catch {
          /* The full read path reports corrupt records. */
        }
        return { ledgerId, name, filename, revision, updatedAt, lastOpenedAt };
      })
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  async getRecord(ledgerId: string): Promise<StoredLedgerRecord | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(LEDGERS, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult<StoredLedgerRecord | undefined>(
      transaction.objectStore(LEDGERS).get(ledgerId),
    );
    await done;
    return record || null;
  }

  async load(ledgerId: string): Promise<{ ledger: Ledger; record: StoredLedgerRecord }> {
    const record = await this.getRecord(ledgerId);
    if (!record) throw new Error('That local ledger no longer exists.');
    const ledger = parseLedger(record.json, new Blob([record.json]).size);
    return { ledger, record };
  }

  async getActiveId(): Promise<string | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(APP_STATE, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestResult<string | undefined>(
      transaction.objectStore(APP_STATE).get(ACTIVE_KEY),
    );
    await done;
    return value || null;
  }

  async save(
    ledger: Ledger,
    filename = `expense-tracker-${ledger.name}.json`,
  ): Promise<StoredLedgerRecord> {
    const json = stableSerialize(ledger);
    const record: StoredLedgerRecord = {
      ledgerId: ledger.ledgerId,
      json,
      hash: await contentHash(json),
      filename,
      revision: ledger.revision,
      updatedAt: ledger.updatedAt,
      lastOpenedAt: new Date().toISOString(),
    };
    const database = await this.openDatabase();
    const transaction = database.transaction([LEDGERS, APP_STATE], 'readwrite');
    transaction.objectStore(LEDGERS).put(record);
    transaction.objectStore(APP_STATE).put(ledger.ledgerId, ACTIVE_KEY);
    await transactionDone(transaction);
    return record;
  }

  async activate(ledgerId: string): Promise<void> {
    const record = await this.getRecord(ledgerId);
    if (!record) throw new Error('That local ledger no longer exists.');
    const database = await this.openDatabase();
    const transaction = database.transaction([LEDGERS, APP_STATE], 'readwrite');
    transaction.objectStore(LEDGERS).put({ ...record, lastOpenedAt: new Date().toISOString() });
    transaction.objectStore(APP_STATE).put(ledgerId, ACTIVE_KEY);
    await transactionDone(transaction);
  }

  async remove(ledgerId: string): Promise<void> {
    const active = await this.getActiveId();
    const database = await this.openDatabase();
    const transaction = database.transaction([LEDGERS, APP_STATE], 'readwrite');
    transaction.objectStore(LEDGERS).delete(ledgerId);
    if (active === ledgerId) transaction.objectStore(APP_STATE).delete(ACTIVE_KEY);
    await transactionDone(transaction);
  }
}
