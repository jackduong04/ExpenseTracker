import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardStats, filterTransactions, trendData } from '../domain/ledger/calculations';
import { dateRangeForPreset, todayLocal } from '../domain/ledger/dates';
import { formatMinorUnits, parseMoneyInputToMinorUnits } from '../domain/ledger/money';
import type {
  DatePreset,
  Ledger,
  Theme,
  Transaction,
  TransactionFilters,
  TransactionKind,
  SortState,
} from '../domain/ledger/types';
import { BrowserLedgerFileService } from '../infrastructure/files/BrowserLedgerFileService';
import {
  BrowserLedgerPersistence,
  type LedgerSummary,
} from '../infrastructure/persistence/BrowserLedgerPersistence';
import { stableSerialize } from '../infrastructure/schema/parse-ledger';
import {
  categoryDraft,
  makeId,
  mutateLedger,
  newLedger,
  transactionDraft,
  useDirty,
  useStore,
} from './store';

type Page = 'dashboard' | 'transactions' | 'categories' | 'settings';
const files = new BrowserLedgerFileService();
const persistence = new BrowserLedgerPersistence();
const starter = () =>
  (
    [
      ['Groceries', 'expense', '#4f8a6b'],
      ['Dining', 'expense', '#d47c4f'],
      ['Transport', 'expense', '#6d63a8'],
      ['Housing', 'expense', '#3c7f86'],
      ['Salary', 'income', '#4d78a8'],
      ['Other income', 'income', '#92703f'],
    ] as const
  ).map(([name, kind, color]) => categoryDraft(name, kind, color));

export default function App() {
  const { state, dispatch } = useStore();
  const dirty = useDirty();
  const [page, setPage] = useState<Page>('dashboard');
  const [dialog, setDialog] = useState<
    'new' | 'transaction' | 'transaction-actions' | 'category-actions' | null
  >(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [transactionMode, setTransactionMode] = useState<'add' | 'edit' | 'duplicate'>('add');
  const [selectedCategory, setSelectedCategory] = useState<Ledger['categories'][number] | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [summaries, setSummaries] = useState<LedgerSummary[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const ledgerRef = useRef(state.ledger);
  const committedRef = useRef<Ledger | null>(null);
  const nextRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef(Promise.resolve());
  useEffect(() => {
    ledgerRef.current = state.ledger;
    if (state.ledger)
      nextRevisionRef.current = Math.max(nextRevisionRef.current, state.ledger.revision);
  }, [state.ledger]);
  useEffect(() => {
    if (!state.message) return;
    setToast(state.message);
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [state.message]);
  useEffect(() => {
    const fn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', fn);
    return () => removeEventListener('beforeunload', fn);
  }, [dirty]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const activeId = await persistence.getActiveId();
        if (activeId) {
          try {
            const loaded = await persistence.load(activeId);
            if (!cancelled) {
              dispatch({
                type: 'load',
                ledger: loaded.ledger,
                filename: loaded.record.filename,
                hash: loaded.record.hash,
              });
              committedRef.current = loaded.ledger;
              nextRevisionRef.current = loaded.ledger.revision;
            }
          } catch (error) {
            if (!cancelled) setToast((error as Error).message);
          }
        }
        if (!cancelled) setSummaries(await persistence.list());
      } catch (error) {
        if (!cancelled) setToast((error as Error).message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.ledger?.settings.theme || 'system';
  }, [state.ledger?.settings.theme]);
  const refreshSummaries = async () => setSummaries(await persistence.list());
  const importLedger = async () => {
    try {
      const result = await files.importLedger();
      if (!result) return;
      const existing = await persistence.getRecord(result.ledger.ledgerId);
      if (existing && existing.hash !== result.hash) {
        const ok = confirm(
          `A local copy already exists (revision ${existing.revision}, updated ${existing.updatedAt}). Replace it with the imported revision ${result.ledger.revision}?`,
        );
        if (!ok) return;
      }
      const record = await persistence.save(result.ledger, result.filename);
      dispatch({
        type: 'load',
        ledger: result.ledger,
        filename: record.filename,
        hash: record.hash,
      });
      nextRevisionRef.current = result.ledger.revision;
      await refreshSummaries();
    } catch (error) {
      setToast((error as Error).message);
    }
  };
  const commitLatest = useCallback(async () => {
    const source = ledgerRef.current;
    if (!source || !dirty) return;
    const sourceSnapshot = stableSerialize(source);
    const ledger = {
      ...source,
      revision: ++nextRevisionRef.current,
      updatedAt: new Date().toISOString(),
    };
    committedRef.current = ledger;
    setSaveStatus('saving');
    const task = queueRef.current.then(async () => {
      const record = await persistence.save(
        ledger,
        state.filename || `expense-tracker-${ledger.name}.json`,
      );
      dispatch({
        type: 'autosaved',
        ledger,
        filename: record.filename,
        hash: record.hash,
        sourceSnapshot,
      });
    });
    queueRef.current = task.catch(() => undefined);
    try {
      await task;
      setSaveStatus('saved');
      await refreshSummaries();
    } catch (error) {
      setSaveStatus('error');
      setToast((error as Error).message);
      throw error;
    }
  }, [dirty, dispatch, state.filename]);
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (dirty) await commitLatest();
    await queueRef.current;
  }, [commitLatest, dirty]);
  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void commitLatest().catch(() => undefined), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dirty, commitLatest, state.ledger]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush().catch(() => undefined);
    };
    addEventListener('visibilitychange', onVisibility);
    return () => removeEventListener('visibilitychange', onVisibility);
  }, [flush]);
  const createLedger = async (ledger: Ledger) => {
    const record = await persistence.save(ledger);
    dispatch({ type: 'load', ledger, filename: record.filename, hash: record.hash });
    committedRef.current = ledger;
    nextRevisionRef.current = ledger.revision;
    await refreshSummaries();
    setDialog(null);
  };
  const selectLedger = async (ledgerId: string) => {
    try {
      await flush();
      const loaded = await persistence.load(ledgerId);
      await persistence.activate(ledgerId);
      dispatch({
        type: 'load',
        ledger: loaded.ledger,
        filename: loaded.record.filename,
        hash: loaded.record.hash,
      });
      committedRef.current = loaded.ledger;
      nextRevisionRef.current = loaded.ledger.revision;
      setPage('dashboard');
    } catch (error) {
      setToast((error as Error).message);
    }
  };
  const close = async () => {
    try {
      await flush();
    } catch {
      if (!confirm('Local save failed. Switch ledgers and discard these in-memory changes?'))
        return;
    }
    dispatch({ type: 'close' });
    await refreshSummaries();
    setPage('dashboard');
  };
  const exportBackup = async () => {
    if (!state.ledger) return;
    try {
      await flush();
      await files.exportCopy(committedRef.current || ledgerRef.current || state.ledger);
    } catch (error) {
      setToast((error as Error).message);
    }
  };
  if (booting)
    return (
      <div className="welcome">
        <div className="welcome-card">
          <p className="muted">Loading local ledgers…</p>
        </div>
      </div>
    );
  if (!state.ledger)
    return (
      <LedgerLibrary
        summaries={summaries}
        onOpen={importLedger}
        onSelect={selectLedger}
        onDelete={async (id) => {
          if (confirm('Delete this browser copy? Export a backup first if you need to keep it.')) {
            await persistence.remove(id);
            await refreshSummaries();
          }
        }}
        onNew={() => setDialog('new')}
        dialog={
          dialog === 'new' ? (
            <NewLedger onCancel={() => setDialog(null)} onCreate={createLedger} />
          ) : null
        }
      />
    );
  const change = (update: (ledger: Ledger) => Ledger) =>
    dispatch({ type: 'ledger', update: (ledger) => mutateLedger(ledger, update) });
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('dashboard')}>
          <span className="brand-mark">$</span>
          <span>Expense Tracker</span>
        </button>
        <div className="ledger-status">
          <span className={dirty ? 'status-dot dirty' : 'status-dot'}></span>
          <span>
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'error'
                ? 'Save failed'
                : dirty
                  ? 'Unsaved changes'
                  : 'Saved locally'}
          </span>
          <small>
            {state.filename} · r{state.ledger.revision}
          </small>
        </div>
        <div className="top-actions">
          {saveStatus === 'error' && (
            <button onClick={() => void commitLatest().catch(() => undefined)}>Retry</button>
          )}
          <button className="secondary" onClick={() => void exportBackup()}>
            Export backup
          </button>
          <button className="icon-button" aria-label="Switch ledger" onClick={() => void close()}>
            ⇄
          </button>
        </div>
      </header>
      <div className="layout">
        <nav className="sidebar" aria-label="Main navigation">
          {(['dashboard', 'transactions', 'categories', 'settings'] as Page[]).map((item) => (
            <button
              key={item}
              aria-label={item[0].toUpperCase() + item.slice(1)}
              className={page === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(item)}
            >
              {icons[item]}
              <span>{item[0].toUpperCase() + item.slice(1)}</span>
            </button>
          ))}
          <div className="sidebar-footer">
            <span>Schema v{state.ledger.schemaVersion}</span>
            <span>ID {state.ledger.ledgerId.slice(0, 8)}…</span>
          </div>
        </nav>
        <main className="main-content">
          {page === 'dashboard' && (
            <Dashboard
              ledger={state.ledger}
              onAdd={() => {
                setEditing(null);
                setTransactionMode('add');
                setDialog('transaction');
              }}
            />
          )}
          {page === 'transactions' && (
            <Transactions
              ledger={state.ledger}
              onChange={change}
              onAdd={() => {
                setEditing(null);
                setTransactionMode('add');
                setDialog('transaction');
              }}
              onEdit={(transaction) => {
                setEditing(transaction);
                setTransactionMode('edit');
                setDialog('transaction');
              }}
              onSelect={(transaction) => {
                setEditing(transaction);
                setDialog('transaction-actions');
              }}
            />
          )}
          {page === 'categories' && (
            <Categories
              ledger={state.ledger}
              onChange={change}
              onSelect={(category) => {
                setSelectedCategory(category);
                setDialog('category-actions');
              }}
            />
          )}
          {page === 'settings' && <Settings ledger={state.ledger} onChange={change} />}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {dialog === 'transaction' && (
        <TransactionDialog
          ledger={state.ledger}
          initial={editing}
          mode={transactionMode}
          onCancel={() => setDialog(null)}
          onSave={(transaction) => {
            change((old) => ({
              ...old,
              transactions:
                transactionMode === 'edit'
                  ? old.transactions.map((item) =>
                      item.id === transaction.id ? transaction : item,
                    )
                  : [...old.transactions, transaction],
            }));
            setDialog(null);
          }}
        />
      )}
      {dialog === 'transaction-actions' && editing && (
        <TransactionActions
          transaction={editing}
          ledger={state.ledger}
          onCancel={() => setDialog(null)}
          onEdit={() => {
            setTransactionMode('edit');
            setDialog('transaction');
          }}
          onDuplicate={() => {
            setTransactionMode('duplicate');
            setDialog('transaction');
            setEditing({
              ...editing,
              id: makeId(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }}
          onDelete={() => {
            if (confirm('Delete this transaction?')) {
              change((l) => ({
                ...l,
                transactions: l.transactions.filter((t) => t.id !== editing.id),
              }));
              setDialog(null);
            }
          }}
        />
      )}
      {dialog === 'category-actions' && selectedCategory && (
        <CategoryActions
          category={selectedCategory}
          ledger={state.ledger}
          referenced={state.ledger.transactions.some((t) => t.categoryId === selectedCategory.id)}
          onCancel={() => setDialog(null)}
          onChange={change}
          onDelete={() => {
            if (confirm('Permanently delete this category?')) {
              change((l) => ({
                ...l,
                categories: l.categories.filter((c) => c.id !== selectedCategory.id),
              }));
              setDialog(null);
            }
          }}
        />
      )}
    </div>
  );
}

function LedgerLibrary({
  summaries,
  onOpen,
  onNew,
  onSelect,
  onDelete,
  dialog,
}: {
  summaries: LedgerSummary[];
  onOpen: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  dialog: ReactNode;
}) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand-mark large">$</div>
        <p className="eyebrow">PRIVATE · OFFLINE-FIRST · IN THIS BROWSER</p>
        <h1>Your money, clearly understood.</h1>
        <p className="lead">
          Your ledgers are saved locally in this browser. Export a JSON backup when moving to
          another device.
        </p>
        <div className="welcome-actions">
          <button className="primary large-button" onClick={onNew}>
            Create new ledger
          </button>
          <button className="secondary large-button" onClick={onOpen}>
            Import JSON
          </button>
        </div>
        {summaries.length > 0 && (
          <section className="local-ledgers" aria-label="Local ledgers">
            <h2>Saved ledgers</h2>
            <div className="mini-list">
              {summaries.map((summary) => (
                <div className="mini-row" key={summary.ledgerId}>
                  <button className="ledger-choice" onClick={() => onSelect(summary.ledgerId)}>
                    <strong>{summary.name}</strong>
                    <small>
                      Revision {summary.revision} · Updated {summary.updatedAt.slice(0, 10)}
                    </small>
                  </button>
                  <button className="danger-link" onClick={() => onDelete(summary.ledgerId)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {!summaries.length && <p className="muted">Create or import a ledger to get started.</p>}
      </div>
      {dialog}
    </div>
  );
}

function TransactionActions({
  transaction,
  ledger,
  onCancel,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  transaction: Transaction;
  ledger: Ledger;
  onCancel: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const category = ledger.categories.find((item) => item.id === transaction.categoryId);
  const money = formatMinorUnits(
    transaction.amountMinor,
    ledger.settings.currency,
    ledger.settings.locale,
  );
  return (
    <Modal title="Transaction" eyebrow="RECORD" onCancel={onCancel}>
      <dl className="record-details">
        <dt>Date</dt>
        <dd>{transaction.date}</dd>
        <dt>Kind</dt>
        <dd>{transaction.kind}</dd>
        <dt>Category</dt>
        <dd>{category?.name || 'Archived category'}</dd>
        <dt>Amount</dt>
        <dd>
          {transaction.kind === 'income' ? '+' : '-'}
          {money}
        </dd>
        <dt>Note</dt>
        <dd>{transaction.note || '—'}</dd>
      </dl>
      <div className="modal-actions record-action-buttons">
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="secondary" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="primary" onClick={onEdit}>
          Edit
        </button>
        <button className="danger-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </Modal>
  );
}

function CategoryActions({
  category,
  ledger,
  referenced,
  onCancel,
  onChange,
  onDelete,
}: {
  category: Ledger['categories'][number];
  ledger: Ledger;
  referenced: boolean;
  onCancel: () => void;
  onChange: (update: (ledger: Ledger) => Ledger) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [error, setError] = useState('');
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Category name cannot be empty.');
    if (
      ledger.categories.some(
        (item) =>
          item.id !== category.id &&
          item.kind === category.kind &&
          item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    ) {
      return setError('Category names must be unique within each kind.');
    }
    onChange((ledger) => ({
      ...ledger,
      categories: ledger.categories.map((item) =>
        item.id === category.id
          ? { ...item, name: trimmed, color, updatedAt: new Date().toISOString() }
          : item,
      ),
    }));
    onCancel();
  };
  return (
    <Modal title={category.name} eyebrow="CATEGORY" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        </label>
        <label>
          Color
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions record-action-buttons">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onChange((ledger) => ({
                ...ledger,
                categories: ledger.categories.map((item) =>
                  item.id === category.id
                    ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() }
                    : item,
                ),
              }));
              onCancel();
            }}
          >
            {category.archived ? 'Restore' : 'Archive'}
          </button>
          <button className="primary">Save changes</button>
          <button
            type="button"
            className="danger-button"
            disabled={referenced}
            title={
              referenced ? 'Referenced categories must be archived instead of deleted.' : undefined
            }
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        {referenced && (
          <p className="muted small">
            This category is used by transactions and must be archived instead of deleted.
          </p>
        )}
      </form>
    </Modal>
  );
}

function NewLedger({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (ledger: Ledger) => Promise<void>;
}) {
  const [name, setName] = useState('Personal Expenses');
  const [currency, setCurrency] = useState('NZD');
  const [locale, setLocale] = useState('en-NZ');
  const [opening, setOpening] = useState('0');
  const [error, setError] = useState('');
  return (
    <Modal title="Set up your ledger" eyebrow="NEW LEDGER" onCancel={onCancel}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await onCreate(
              newLedger(
                name,
                {
                  currency,
                  locale,
                  openingBalanceMinor: parseMoneyInputToMinorUnits(opening, currency),
                  defaultDatePreset: 'this-month',
                  weekStartsOn: 1,
                  theme: 'system',
                },
                starter(),
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Ledger name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <div className="form-grid">
          <label>
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>NZD</option>
              <option>AUD</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </label>
          <label>
            Locale
            <input value={locale} onChange={(e) => setLocale(e.target.value)} required />
          </label>
        </div>
        <label>
          Opening balance
          <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary">Create ledger</button>
        </div>
        <p className="muted small">
          Starter categories are editable. Amounts are stored as integer minor units.
        </p>
      </form>
    </Modal>
  );
}
function Modal({
  title,
  eyebrow,
  onCancel,
  children,
}: {
  title: string;
  eyebrow: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Dashboard({ ledger, onAdd }: { ledger: Ledger; onAdd: () => void }) {
  const [preset, setPreset] = useState<DatePreset>(ledger.settings.defaultDatePreset);
  const [custom, setCustom] = useState({ start: todayLocal(), end: todayLocal() });
  const range = preset === 'custom' ? custom : dateRangeForPreset(preset);
  const stats = useMemo(() => dashboardStats(ledger, range), [ledger, range]);
  const money = (amount: number) =>
    formatMinorUnits(amount, ledger.settings.currency, ledger.settings.locale);
  const categoryName = (id: string) =>
    ledger.categories.find((c) => c.id === id)?.name || 'Archived category';
  const pieData = stats.categories.map(({ category, amountMinor }) => ({
    id: category.id,
    name: category.name,
    value: amountMinor,
    color: category.color,
  }));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Good to see you.</h1>
          <p className="muted">
            {range.start === '0000-01-01' ? 'All recorded time' : `${range.start} to ${range.end}`}
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          + Add transaction
        </button>
      </div>
      <div className="range-bar">
        <div className="segmented">
          {(
            [
              'this-month',
              'previous-month',
              'last-7-days',
              'last-30-days',
              'this-year',
              'all-time',
            ] as DatePreset[]
          ).map((p) => (
            <button key={p} className={preset === p ? 'selected' : ''} onClick={() => setPreset(p)}>
              {presetLabel(p)}
            </button>
          ))}
        </div>
        <button
          className={preset === 'custom' ? 'secondary selected' : 'secondary'}
          onClick={() => setPreset('custom')}
        >
          Custom range
        </button>
        {preset === 'custom' && (
          <div className="date-range">
            <input
              type="date"
              value={custom.start}
              onChange={(e) => setCustom({ ...custom, start: e.target.value })}
            />
            <span>to</span>
            <input
              type="date"
              value={custom.end}
              onChange={(e) => setCustom({ ...custom, end: e.target.value })}
            />
          </div>
        )}
      </div>
      <div className="kpi-grid">
        <Kpi label="Expenses" value={money(stats.expenses)} tone="expense" />
        <Kpi label="Income" value={money(stats.income)} tone="income" />
        <Kpi
          label="Net cash flow"
          value={money(stats.net)}
          tone={stats.net >= 0 ? 'income' : 'expense'}
          detail={`${stats.change >= 0 ? '+' : ''}${money(stats.change)} vs previous`}
        />
        <Kpi label="Balance at end" value={money(stats.balance)} />
        <Kpi label="Transactions" value={String(stats.count)} />
        <Kpi label="Avg daily expense" value={money(stats.averageDailyExpense)} />
        <Kpi
          label="Largest expense"
          value={stats.largest ? money(stats.largest.amountMinor) : '—'}
          detail={
            stats.largest
              ? stats.largest.note || categoryName(stats.largest.categoryId)
              : 'No expenses yet'
          }
        />
        <Kpi label="Top expense category" value={stats.topCategory?.name || '—'} />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CASH FLOW</p>
              <h2>Income and expenses over time</h2>
            </div>
          </div>
          <div
            className="chart"
            role="img"
            aria-label="Line chart of income and expenses over time"
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData(ledger, range)}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(value) => money(value).replace(/[^\d.,-]/g, '')}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(value) => money(typeof value === 'number' ? value : 0)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#4d78a8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#d47c4f"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BREAKDOWN</p>
              <h2>Expenses by category</h2>
            </div>
          </div>
          {stats.categories.length ? (
            <div className="breakdown-content">
              <div className="pie-chart" role="img" aria-label="Pie chart of expenses by category">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {pieData.map((item) => (
                        <Cell key={item.id} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => money(typeof value === 'number' ? value : 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="category-list">
                {stats.categories.map(({ category, amountMinor, percentage }) => (
                  <div className="category-row" key={category.id}>
                    <span className="color-dot" style={{ background: category.color }}></span>
                    <span className="category-label">{category.name}</span>
                    <span className="category-value">
                      {money(amountMinor)} <small>{percentage.toFixed(1)}%</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty text="No expenses in this period." />
          )}
        </section>
      </div>
      <section className="panel recent">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RECENT</p>
            <h2>Recent transactions</h2>
          </div>
        </div>
        {ledger.transactions.length ? (
          <div className="mini-list">
            {[...ledger.transactions]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 5)
              .map((t) => (
                <div className="mini-row" key={t.id}>
                  <span className="transaction-kind">{t.kind === 'income' ? '↗' : '↘'}</span>
                  <span>
                    <strong>{categoryName(t.categoryId)}</strong>
                    <small>
                      {t.date}
                      {t.note ? ` · ${t.note}` : ''}
                    </small>
                  </span>
                  <strong className={t.kind === 'income' ? 'income-text' : 'expense-text'}>
                    {t.kind === 'income' ? '+' : '-'}
                    {money(t.amountMinor)}
                  </strong>
                </div>
              ))}
          </div>
        ) : (
          <Empty text="Add your first transaction to see it here." />
        )}
      </section>
    </>
  );
}
function Kpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong className={tone ? `${tone}-text` : ''}>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>○</span>
      <p>{text}</p>
    </div>
  );
}
function presetLabel(p: DatePreset) {
  return (
    {
      'this-month': 'This month',
      'previous-month': 'Previous month',
      'last-7-days': '7 days',
      'last-30-days': '30 days',
      'this-year': 'This year',
      'all-time': 'All time',
      custom: 'Custom',
    } as Record<DatePreset, string>
  )[p];
}

function Transactions({
  ledger,
  onChange,
  onAdd,
  onEdit,
  onSelect,
}: {
  ledger: Ledger;
  onChange: (update: (ledger: Ledger) => Ledger) => void;
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
  onSelect: (transaction: Transaction) => void;
}) {
  const [filters, setFilters] = useState<TransactionFilters>({
    categoryIds: [],
    note: '',
    kind: 'all',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'date', direction: 'desc' });
  const rows = filterTransactions(ledger.transactions, ledger.categories, filters, sort);
  const money = (amount: number) =>
    formatMinorUnits(amount, ledger.settings.currency, ledger.settings.locale);
  const categoryName = (id: string) =>
    ledger.categories.find((c) => c.id === id)?.name || 'Archived category';
  const remove = (id: string) => {
    if (confirm('Delete this transaction?'))
      onChange((l) => ({ ...l, transactions: l.transactions.filter((t) => t.id !== id) }));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEDGER</p>
          <h1>Transactions</h1>
          <p className="muted">
            {rows.length} of {ledger.transactions.length} transactions
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          + Add transaction
        </button>
      </div>
      <button
        className="secondary filter-toggle"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        Filter
      </button>
      <section className={filtersOpen ? 'panel filters filters-open' : 'panel filters'}>
        <div className="filter-grid">
          <label>
            From
            <input
              type="date"
              value={filters.start || ''}
              onChange={(e) => setFilters({ ...filters, start: e.target.value || undefined })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.end || ''}
              onChange={(e) => setFilters({ ...filters, end: e.target.value || undefined })}
            />
          </label>
          <label>
            Kind
            <select
              value={filters.kind}
              onChange={(e) =>
                setFilters({ ...filters, kind: e.target.value as TransactionFilters['kind'] })
              }
            >
              <option value="all">All kinds</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              value={filters.categoryIds[0] || ''}
              onChange={(e) =>
                setFilters({ ...filters, categoryIds: e.target.value ? [e.target.value] : [] })
              }
            >
              <option value="">All categories</option>
              {(['expense', 'income'] as TransactionKind[]).map((categoryKind) => (
                <optgroup
                  key={categoryKind}
                  label={categoryKind === 'expense' ? 'Expense categories' : 'Income categories'}
                >
                  {ledger.categories
                    .filter((category) => category.kind === categoryKind)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.archived ? ' (archived)' : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="filter-wide">
            Note search
            <input
              value={filters.note}
              onChange={(e) => setFilters({ ...filters, note: e.target.value })}
              placeholder="Search notes"
            />
          </label>
          <label>
            Sort by
            <select
              value={sort.key}
              onChange={(e) => setSort({ ...sort, key: e.target.value as SortState['key'] })}
            >
              <option value="date">Date</option>
              <option value="amountMinor">Amount</option>
              <option value="category">Category</option>
              <option value="createdAt">Created</option>
              <option value="updatedAt">Updated</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={sort.direction}
              onChange={(e) =>
                setSort({ ...sort, direction: e.target.value as SortState['direction'] })
              }
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <button
            className="secondary clear-button"
            onClick={() => setFilters({ categoryIds: [], note: '', kind: 'all' })}
          >
            Clear filters
          </button>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Kind</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    <span className={t.kind === 'income' ? 'income-text' : 'expense-text'}>
                      {t.kind}
                    </span>
                  </td>
                  <td>{categoryName(t.categoryId)}</td>
                  <td className="money">
                    {t.kind === 'income' ? '+' : '-'}
                    {money(t.amountMinor)}
                  </td>
                  <td>{t.note || '—'}</td>
                  <td className="row-actions">
                    <button onClick={() => onEdit(t)}>Edit</button>
                    <button
                      onClick={() =>
                        onChange((l) => ({
                          ...l,
                          transactions: [
                            ...l.transactions,
                            {
                              ...t,
                              id: makeId(),
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                            },
                          ],
                        }))
                      }
                    >
                      Duplicate
                    </button>
                    <button className="danger-link" onClick={() => remove(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mobile-record-list">
            {rows.map((t) => (
              <button className="mobile-record" key={t.id} onClick={() => onSelect(t)}>
                <span className="transaction-kind">{t.kind === 'income' ? '↗' : '↘'}</span>
                <span className="mobile-record-copy">
                  <strong>{categoryName(t.categoryId)}</strong>
                  <small>
                    {t.date}
                    {t.note ? ` · ${t.note}` : ''}
                  </small>
                </span>
                <strong className={t.kind === 'income' ? 'income-text' : 'expense-text'}>
                  {t.kind === 'income' ? '+' : '-'}
                  {money(t.amountMinor)}
                </strong>
              </button>
            ))}
          </div>
          {!rows.length && (
            <Empty
              text={
                ledger.transactions.length
                  ? 'No transactions match these filters.'
                  : 'Your transactions will appear here.'
              }
            />
          )}
        </div>
      </section>
    </>
  );
}

function TransactionDialog({
  ledger,
  initial,
  mode,
  onCancel,
  onSave,
}: {
  ledger: Ledger;
  initial: Transaction | null;
  mode: 'add' | 'edit' | 'duplicate';
  onCancel: () => void;
  onSave: (transaction: Transaction) => void;
}) {
  const first =
    ledger.categories.find((c) => !c.archived && c.kind === (initial?.kind || 'expense')) ||
    ledger.categories.find((c) => c.kind === (initial?.kind || 'expense'));
  const [kind, setKind] = useState<TransactionKind>(initial?.kind || 'expense');
  const [date, setDate] = useState(initial?.date || todayLocal());
  const [amount, setAmount] = useState(initial ? String(initial.amountMinor / 100) : '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId || first?.id || '');
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState('');
  const categories = ledger.categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === initial?.categoryId),
  );
  return (
    <Modal
      title={
        mode === 'edit'
          ? 'Edit transaction'
          : mode === 'duplicate'
            ? 'Duplicate transaction'
            : 'Add transaction'
      }
      eyebrow={mode === 'edit' ? 'UPDATE' : mode === 'duplicate' ? 'DUPLICATE' : 'NEW TRANSACTION'}
      onCancel={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const amountMinor = parseMoneyInputToMinorUnits(amount, ledger.settings.currency);
            if (amountMinor <= 0) throw new Error('Amount must be greater than zero.');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid date.');
            if (!categoryId) throw new Error('Choose a category.');
            onSave(
              mode === 'edit' && initial
                ? {
                    ...initial,
                    date,
                    kind,
                    amountMinor,
                    categoryId,
                    note: note.trim(),
                    updatedAt: new Date().toISOString(),
                  }
                : transactionDraft({ date, kind, amountMinor, categoryId, note: note.trim() }),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Type
            <select
              value={kind}
              onChange={(e) => {
                const next = e.target.value as TransactionKind;
                setKind(next);
                const nextCategory = ledger.categories.find((c) => !c.archived && c.kind === next);
                setCategoryId(nextCategory?.id || '');
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Amount ({ledger.settings.currency})
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Choose category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Note <span className="muted">({note.length}/500)</span>
          <textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary">
            {mode === 'edit'
              ? 'Save changes'
              : mode === 'duplicate'
                ? 'Add duplicate'
                : 'Add transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Categories({
  ledger,
  onChange,
  onSelect,
}: {
  ledger: Ledger;
  onChange: (update: (ledger: Ledger) => Ledger) => void;
  onSelect: (category: Ledger['categories'][number]) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [color, setColor] = useState('#4f8a6b');
  const [error, setError] = useState('');
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Category name cannot be empty.');
    if (
      ledger.categories.some(
        (c) => c.kind === kind && c.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    )
      return setError('Category names must be unique within each kind.');
    onChange((l) => ({
      ...l,
      categories: [...l.categories, categoryDraft(trimmed, kind, color)],
    }));
    setName('');
    setColor(kind === 'expense' ? '#4f8a6b' : '#4d78a8');
    setError('');
  };
  const referenced = (id: string) => ledger.transactions.some((t) => t.categoryId === id);
  const archive = (id: string) =>
    onChange((l) => ({
      ...l,
      categories: l.categories.map((c) =>
        c.id === id ? { ...c, archived: !c.archived, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  const remove = (id: string) => {
    if (referenced(id))
      return setError('Referenced categories must be archived instead of deleted.');
    if (confirm('Permanently delete this category?'))
      onChange((l) => ({ ...l, categories: l.categories.filter((c) => c.id !== id) }));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZE</p>
          <h1>Categories</h1>
          <p className="muted">Labels keep color from doing the explaining.</p>
        </div>
      </div>
      <section className="panel add-category">
        <h2>Add a category</h2>
        <div className="inline-form">
          <input
            aria-label="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
          />
          <select
            aria-label="New category type"
            value={kind}
            onChange={(e) => {
              const nextKind = e.target.value as TransactionKind;
              setKind(nextKind);
              setColor(nextKind === 'expense' ? '#4f8a6b' : '#4d78a8');
            }}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <label className="color-picker">
            <span>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="New category color"
            />
          </label>
          <button className="primary" onClick={add}>
            Add
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <div className="category-columns">
        {(['expense', 'income'] as TransactionKind[]).map((categoryKind) => (
          <section className="panel" key={categoryKind}>
            <div className="panel-heading">
              <h2>{categoryKind === 'expense' ? 'Expense categories' : 'Income categories'}</h2>
            </div>
            {ledger.categories
              .filter((c) => c.kind === categoryKind)
              .map((c) => (
                <div
                  className={c.archived ? 'managed-category archived' : 'managed-category'}
                  key={c.id}
                >
                  <span className="color-dot" style={{ background: c.color }}></span>
                  <span>
                    <strong>{c.name}</strong>
                    {c.archived && <small>Archived</small>}
                  </span>
                  <span className="category-actions">
                    <label className="existing-color-picker">
                      <span>Color</span>
                      <input
                        type="color"
                        value={c.color}
                        aria-label={`Color for ${c.name}`}
                        onChange={(event) =>
                          onChange((l) => ({
                            ...l,
                            categories: l.categories.map((category) =>
                              category.id === c.id
                                ? {
                                    ...category,
                                    color: event.target.value,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : category,
                            ),
                          }))
                        }
                      />
                    </label>
                    <button
                      onClick={() => {
                        const next = prompt('Rename category', c.name);
                        if (
                          next?.trim() &&
                          !ledger.categories.some(
                            (x) =>
                              x.id !== c.id &&
                              x.kind === c.kind &&
                              x.name.toLocaleLowerCase() === next.trim().toLocaleLowerCase(),
                          )
                        )
                          onChange((l) => ({
                            ...l,
                            categories: l.categories.map((x) =>
                              x.id === c.id
                                ? { ...x, name: next.trim(), updatedAt: new Date().toISOString() }
                                : x,
                            ),
                          }));
                      }}
                    >
                      Rename
                    </button>
                    <button onClick={() => archive(c.id)}>
                      {c.archived ? 'Restore' : 'Archive'}
                    </button>
                    {!referenced(c.id) && (
                      <button className="danger-link" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                    )}
                  </span>
                  <button className="mobile-category-card" onClick={() => onSelect(c)}>
                    <span className="color-dot" style={{ background: c.color }}></span>
                    <span>
                      <strong>{c.name}</strong>
                      {c.archived && <small>Archived</small>}
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              ))}
            {!ledger.categories.some((c) => c.kind === categoryKind) && (
              <Empty text="No categories yet." />
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function Settings({
  ledger,
  onChange,
}: {
  ledger: Ledger;
  onChange: (update: (ledger: Ledger) => Ledger) => void;
}) {
  const update = (settings: Partial<Ledger['settings']>) =>
    onChange((l) => ({ ...l, settings: { ...l.settings, ...settings } }));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p className="muted">Change how this ledger is presented on this device.</p>
        </div>
      </div>
      <section className="panel settings-form">
        <label>
          Ledger name
          <input
            value={ledger.name}
            onChange={(e) => onChange((l) => ({ ...l, name: e.target.value }))}
          />
        </label>
        <div className="form-grid">
          <label>
            Currency
            <select
              value={ledger.settings.currency}
              onChange={(e) => {
                if (
                  confirm(
                    'Changing currency reinterprets every stored amount; it does not convert historical values. Continue?',
                  )
                )
                  update({ currency: e.target.value });
              }}
            >
              <option>NZD</option>
              <option>AUD</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </label>
          <label>
            Locale
            <input
              value={ledger.settings.locale}
              onChange={(e) => update({ locale: e.target.value })}
            />
          </label>
        </div>
        <label>
          Opening balance
          <input
            inputMode="decimal"
            value={String(ledger.settings.openingBalanceMinor / 100)}
            onChange={(e) => {
              try {
                update({
                  openingBalanceMinor: parseMoneyInputToMinorUnits(
                    e.target.value,
                    ledger.settings.currency,
                  ),
                });
              } catch {
                /* preserve valid value */
              }
            }}
          />
        </label>
        <div className="form-grid">
          <label>
            Default dashboard range
            <select
              value={ledger.settings.defaultDatePreset}
              onChange={(e) => update({ defaultDatePreset: e.target.value as DatePreset })}
            >
              {(
                [
                  'this-month',
                  'previous-month',
                  'last-7-days',
                  'last-30-days',
                  'this-year',
                  'all-time',
                ] as DatePreset[]
              ).map((p) => (
                <option key={p} value={p}>
                  {presetLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            First day of week
            <select
              value={ledger.settings.weekStartsOn}
              onChange={(e) => update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </select>
          </label>
        </div>
        <label>
          Theme
          <select
            value={ledger.settings.theme}
            onChange={(e) => update({ theme: e.target.value as Theme })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
      <section className="panel about">
        <h2>Data and privacy</h2>
        <p>
          Your ledger is autosaved in this browser's IndexedDB. JSON is used for imports and
          explicit backups; the application does not use a backend, account, or analytics.
        </p>
        <dl>
          <dt>Schema</dt>
          <dd>v{ledger.schemaVersion}</dd>
          <dt>Ledger ID</dt>
          <dd>{ledger.ledgerId}</dd>
          <dt>Revision</dt>
          <dd>{ledger.revision}</dd>
          <dt>Last updated</dt>
          <dd>{ledger.updatedAt}</dd>
        </dl>
        <p className="muted">
          Local ledgers are specific to this browser profile. Export a JSON backup before clearing
          site data or moving to another device; static hosting receives application code only.
        </p>
      </section>
    </>
  );
}

const icons: Record<Page, ReactNode> = {
  dashboard: <span aria-hidden="true">◒</span>,
  transactions: <span aria-hidden="true">≡</span>,
  categories: <span aria-hidden="true">◈</span>,
  settings: <span aria-hidden="true">⚙</span>,
};
