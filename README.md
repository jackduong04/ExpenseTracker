# Expense Tracker

Expense Tracker is a local-first React/TypeScript PWA for personal ledgers. The browser's IndexedDB is the canonical local store and supports multiple ledgers; JSON is used for import and explicit backup/export. The app does not use a backend, accounts, analytics, or transaction-data network requests.

## Setup and commands

Node.js 24.15 or newer is recommended.

```bash
npm install
npm run dev          # development server
npm run typecheck   # strict TypeScript check
npm run lint        # ESLint
npm test            # Vitest unit tests
npm run e2e         # Playwright smoke flow (after a production build is available)
npm run build       # static production output in dist/
npm run preview     # preview dist locally
```

`VITE_BASE_PATH` controls root versus subpath deployment, for example `VITE_BASE_PATH=/expenses/ npm run build`. The Vite PWA manifest and service-worker scope use that same base setting. Deploy the contents of `dist/` to any HTTPS static host. Configure `index.html` and service-worker files to revalidate, and hashed assets to use long-lived immutable caching where your host supports headers.

### GitHub Pages

The included `.github/workflows/deploy-pages.yml` workflow verifies, builds, and deploys `dist/` whenever `main` is pushed. It derives `VITE_BASE_PATH` from the GitHub repository name, while retaining `/` for a root `<username>.github.io` repository.

After pushing the repository to GitHub, open **Settings → Pages** and select **GitHub Actions** as the build and deployment source. The workflow can also be started manually from the Actions tab.

## Using the app

Create or import a ledger; changes are autosaved locally after a short idle delay. Use **Export backup** to download a JSON copy for another browser/device or an external backup. The library lets you switch between multiple browser-local ledgers. Always retain a backup before moving between devices. Revisions are monotonically increasing; use one canonical copy and avoid editing two copies concurrently. The app warns about conflicting imports and never replaces a valid local ledger with an invalid import.

Amounts are stored and calculated in integer minor units. The version-1 schema includes `ledgerId`, `revision`, categories, transactions, and settings. Future schema versions are rejected with a newer-app message. Migration hooks belong at `src/infrastructure/schema/migrations.ts` when a later schema is introduced.

## Installation and offline behavior

On Windows, open the HTTPS deployment in current Edge or Chrome and choose the install icon in the address bar or the browser menu. On iOS 17+, open the site in Safari, tap Share, choose **Add to Home Screen**, and launch the standalone app from the Home Screen. The service worker precaches the application shell and does not cache ledger JSON or generated exports. After the first successful online load and service-worker activation, opening, editing, reporting, and exporting an available file work offline. Browser cache eviction or cleared site data means the hosted app may need to be opened online again.

The static host receives requests for application assets only. A ledger can still be exposed to anyone who can access the unencrypted JSON file or the browser profile; file encryption and automatic cloud sync are not part of this MVP. Clearing browser/site data removes local IndexedDB ledgers.

## Project structure

- `src/domain/ledger`: pure types, date/money helpers, calculations, and selectors.
- `src/infrastructure`: Zod boundary validation, stable serialization, hashes, and browser file operations.
- `src/app`: reducer/context state and responsive UI pages.
- `public/icons`: bundled PWA icon assets.
- `src/**/*.test.ts`: domain and import-boundary tests; `e2e/` contains the Playwright smoke flow.

Known platform limitation: the baseline file picker and download/share flows are supported everywhere in the target matrix. Direct same-file writing through the File System Access API is intentionally a progressive enhancement point; the current fallback always exports a safe replacement copy.
