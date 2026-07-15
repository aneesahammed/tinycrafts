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

## Verification evidence

```text
npm run typecheck       PASS
npm test                PASS
npm run build           PASS
npm run check:bundle    PASS
npm run test:e2e -- --project=chromium PASS (7 production-preview tests)
npm run test:e2e -- --project=firefox  PASS (7 production-preview tests)
npm run test:e2e -- --project=webkit   PASS (7 production-preview tests)
node scripts/build-pages.mjs       PASS
node scripts/verify-pages-build.mjs PASS
```

The browser tests cover local file open, sample open, BLOB rendering, mutation rejection, readiness, catalog table targeting, and ER diagram rendering. The full three-engine production/privacy/accessibility matrix described by `01-06-PLAN.md` remains a later release gate.
