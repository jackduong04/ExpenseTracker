import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { Category, Ledger, LedgerSettings, Transaction } from '../domain/ledger/types';
import { stableSerialize } from '../infrastructure/schema/parse-ledger';

type Action =
  | { type: 'load'; ledger: Ledger; filename: string; hash: string; handle?: unknown }
  | { type: 'close' }
  | { type: 'saved'; ledger: Ledger; filename: string; hash: string; handle?: unknown }
  | { type: 'ledger'; update: (ledger: Ledger) => Ledger };
export interface AppState {
  ledger: Ledger | null;
  filename: string | null;
  handle?: unknown;
  savedSnapshot: string | null;
  savedHash: string | null;
  error: string | null;
  message: string | null;
}
const initialState: AppState = {
  ledger: null,
  filename: null,
  handle: undefined,
  savedSnapshot: null,
  savedHash: null,
  error: null,
  message: null,
};
const now = () => new Date().toISOString();
export function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'load')
    return {
      ledger: action.ledger,
      filename: action.filename,
      handle: action.handle,
      savedSnapshot: stableSerialize(action.ledger),
      savedHash: action.hash,
      error: null,
      message: `Opened ${action.filename}`,
    };
  if (action.type === 'close') return initialState;
  if (action.type === 'saved')
    return {
      ...state,
      ledger: action.ledger,
      filename: action.filename,
      handle: action.handle ?? state.handle,
      savedSnapshot: stableSerialize(action.ledger),
      savedHash: action.hash,
      message: `Saved revision ${action.ledger.revision}`,
      error: null,
    };
  if (action.type === 'ledger')
    return { ...state, ledger: action.update(state.ledger!), error: null, message: null };
  return state;
}
export const isDirty = (state: AppState) =>
  !!state.ledger && stableSerialize(state.ledger) !== state.savedSnapshot;
export function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
export function newLedger(name: string, settings: LedgerSettings, categories: Category[]): Ledger {
  const timestamp = now();
  return {
    schemaVersion: 1,
    ledgerId: makeId(),
    revision: 1,
    name: name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    settings,
    categories,
    transactions: [],
  };
}
export function mutateLedger(ledger: Ledger, update: (ledger: Ledger) => Ledger): Ledger {
  const next = update(ledger);
  return { ...next, updatedAt: now() };
}
export function categoryDraft(
  name: string,
  kind: Category['kind'],
  color = kind === 'expense' ? '#4f8a6b' : '#4d78a8',
): Category {
  const timestamp = now();
  return {
    id: makeId(),
    name: name.trim(),
    kind,
    color,
    icon: null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
export function transactionDraft(
  input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
): Transaction {
  const timestamp = now();
  return { ...input, id: makeId(), createdAt: timestamp, updatedAt: timestamp };
}
const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}
export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider');
  return context;
}
export function useDirty() {
  const { state } = useStore();
  return useMemo(() => isDirty(state), [state]);
}
