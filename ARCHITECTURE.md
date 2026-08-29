# Architecture and data decisions

The application is intentionally single-user and single-ledger. React state is a reducer/context in `src/app/store.tsx`; ledger data exists only in memory while the app is open. Domain calculations never import React or browser APIs. Imported JSON enters trusted state only after size, Zod structure, date, ID, category-reference, and kind invariants pass.

Money is authoritative only as safe integer minor units. Dates are local calendar strings (`YYYY-MM-DD`) and are compared lexically for inclusive ranges, avoiding UTC conversion. JSON schema version 1 is explicit and stable-serialized with two-space indentation. `ledgerId` and `revision` support manual cross-device handoff; automatic synchronization and merging are deliberately out of scope.

The browser file service is behind an interface so File System Access, share-sheet, and download behavior can evolve without changing the domain or UI. Non-financial revision metadata may use local storage in a later hardening pass; financial content is never put in local storage, IndexedDB, Cache Storage, cookies, or service-worker caches.
