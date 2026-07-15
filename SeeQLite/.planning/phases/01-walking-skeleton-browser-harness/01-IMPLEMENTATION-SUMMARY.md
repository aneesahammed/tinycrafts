# Phase 1 implementation checkpoint

Status: foundation slice shipped; remaining release-matrix evidence is still pending.

## Delivered

- Exact-pinned React/TypeScript/Vite app with relative `base: './'` and same-origin manifest.
- Official `@sqlite.org/sqlite-wasm` module worker. SQLite handles and imported bytes remain worker-owned.
- Transfer-based open, bounded read-only query execution, BLOB preview normalization, 1 MB query cap, 512 MB file cap, 1,000-row display cap.
- Epoch-aware client protocol. Late, duplicate, unknown, or prior-session responses cannot settle current requests.
- Synthetic fixture and same-origin sample database.
- Catalog extraction for tables/views, columns, indexes, and declared foreign keys.
- Query workspace, table picker, fixed readiness check, result table, and dependency-free SVG ER diagram.
- Query plan inspection, bounded UI-only query history, CSV/JSON export, stop/reset/reopen handling, table details, and self-hosted Inter/JetBrains Mono fonts.
- Pages assembler and verifier now emit `/seeqlite/` and retain DataDuck checks.
- Same-origin installable shell with an asset-only service worker, plus a TinyCrafts landing specimen entry for SeeQLite.

## Verification evidence

```text
npm run typecheck       PASS
npm test                PASS
npm run build           PASS
npm run check:bundle    PASS
npm run test:e2e -- --project=chromium PASS (7 production-preview tests)
npm run test:e2e -- --project=firefox  PASS (7 production-preview tests)
npm run test:e2e -- --project=webkit   PASS (7 production-preview tests)
Full matrix                         PASS (33 production-preview tests across Chromium, Firefox, WebKit)
node scripts/build-pages.mjs       PASS
node scripts/verify-pages-build.mjs PASS
npm audit                    PASS (0 known vulnerabilities)
```

The browser tests cover local file open, sample open, BLOB rendering, mutation rejection, readiness, catalog table targeting, ER diagram rendering, same-origin privacy, capability gating, responsive focus, and shell-cache boundaries. The three-engine production matrix described by `01-06-PLAN.md` is green for the implemented surface.

DataDuck build and bundle verification remain green. Its unit suite currently reports one pre-existing `responsive-css.test.js` failure (53 passed, 1 failed) for an assistant-panel selector expectation; no DataDuck source was changed by SeeQLite.
