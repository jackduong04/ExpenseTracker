# Architecture and data decisions

The application is intentionally single-user and local-first. React state is a reducer/context in `src/app/store.tsx`; validated ledgers are persisted as stable JSON records in the browser's IndexedDB and the last active ledger is restored on launch. Domain calculations never import React or browser APIs. Imported JSON enters trusted state only after size, Zod structure, date, ID, category-reference, and kind invariants pass.

Money is authoritative only as safe integer minor units. Dates are local calendar strings (`YYYY-MM-DD`) and are compared lexically for inclusive ranges, avoiding UTC conversion. JSON schema version 1 is explicit and stable-serialized with two-space indentation. `ledgerId` and `revision` support manual cross-device handoff; automatic synchronization and merging are deliberately out of scope. Autosave coalesces edits and commits revisions to IndexedDB.

The browser file service is behind an interface so import, share-sheet, and download behavior can evolve without changing the domain or UI. IndexedDB is origin/profile-specific and is not a backup or synchronization service; users must export JSON before moving devices or clearing site data. Financial content is not placed in localStorage, Cache Storage, cookies, or service-worker caches.
