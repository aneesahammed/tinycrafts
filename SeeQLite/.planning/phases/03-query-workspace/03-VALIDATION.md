---
phase: 3
slug: query-workspace
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-15
---

# Phase 3 — Validation Strategy

## Infrastructure and Sampling

| Property | Contract |
|---|---|
| Unit/component | Vitest + Testing Library |
| Real worker/WASM + E2E | Playwright Chromium/Firefox/WebKit against built `/seeqlite/` |
| Quick | `cd SeeQLite && npm run test -- src/query src/history src/engine` |
| Full | `cd SeeQLite && npm run typecheck && npm run test && npm run build && npm run test:e2e -- tests/integration/query-*.spec.ts tests/integration/result-values.spec.ts tests/e2e/query-authoring.spec.ts tests/e2e/result-grid.spec.ts tests/e2e/query-plan.spec.ts tests/e2e/query-cancellation.spec.ts tests/e2e/query-history.spec.ts` |

Each task creates the test file listed in its own `<files>` RED-first; an existing Phase 2 test may be extended only where the production artifact it owns is extended. Run the task command after each task, the owning plan's Chromium smoke after each wave, and the full three-engine suite before verification. Pure feedback target is <30 seconds and a Chromium smoke <60 seconds.

## Task Map and RED Ownership

| Task | Wave | Requirement | RED-first owner | Exact command |
|---|---:|---|---|---|
| 03-01-01 | 1 | SQL-02 | `src/query/query-scope.test.ts` | `cd SeeQLite && npm run test -- src/query/query-scope.test.ts src/engine/statement-policy.test.ts && npm run typecheck` |
| 03-01-02 | 1 | SQL-02 | `tests/integration/query-statement-policy.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/integration/query-statement-policy.spec.ts --project=chromium && npm run typecheck` |
| 03-02-01 | 2 | RES-01/02 | `src/engine/result-reader.test.ts` | `cd SeeQLite && npm run test -- src/engine/result-reader.test.ts && npm run typecheck` |
| 03-02-02 | 2 | RES-01/02 | `tests/integration/result-values.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/integration/result-values.spec.ts --project=chromium && npm run typecheck` |
| 03-04-01 | 3 | SQL-03/04 | `src/query/query-controller.test.ts` | `cd SeeQLite && npm run test -- src/query/query-controller.test.ts && npm run typecheck` |
| 03-04-02 | 3 | SQL-01/04 | `src/query/QueryWorkspace.test.tsx` | `cd SeeQLite && npm run test -- src/query/QueryWorkspace.test.tsx && npm run typecheck` |
| 03-04-03 | 3 | SQL-01/03/04 | `tests/e2e/query-authoring.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/query-authoring.spec.ts --project=chromium && npm run typecheck` |
| 03-05-01 | 4 | RES-03 | `result-sort.test.ts`, `ResultGrid.test.tsx` | `cd SeeQLite && npm run test -- src/query/result-sort.test.ts src/query/ResultGrid.test.tsx && npm run typecheck` |
| 03-05-02 | 4 | RES-03 | `src/query/query-controller.test.ts` result-bridge cases | `cd SeeQLite && npm run test -- src/query/query-controller.test.ts && npm run typecheck` |
| 03-05-03 | 4 | RES-03 | `tests/e2e/result-grid.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/result-grid.spec.ts --project=chromium && npm run typecheck` |
| 03-06-01 | 5 | PLAN-01 | `src/engine/query-plan.test.ts` | `cd SeeQLite && npm run test -- src/engine/query-plan.test.ts && npm run typecheck` |
| 03-06-02 | 5 | PLAN-01 | `src/query/query-controller.test.ts` plan-bridge cases | `cd SeeQLite && npm run test -- src/query/query-controller.test.ts && npm run typecheck` |
| 03-06-03 | 5 | PLAN-01 | `tests/e2e/query-plan.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/query-plan.spec.ts --project=chromium && npm run typecheck` |
| 03-03-01 | 6 | CANCEL-01 | `tests/e2e/query-cancellation.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/query-cancellation.spec.ts --project=chromium && npm run typecheck` |
| 03-03-02 | 6 | CANCEL-02 | `src/engine/progress-deadline.test.ts` | `cd SeeQLite && npm run test -- src/engine/progress-deadline.test.ts && npm run typecheck` |
| 03-07-01 | 7 | HIST-01/02 | `src/history/history-store.test.ts` | `cd SeeQLite && npm run test -- src/history/history-store.test.ts && npm run typecheck` |
| 03-07-02 | 7 | HIST-01/02 | `src/history/history-effect.test.ts` and finalized controller cases | `cd SeeQLite && npm run test -- src/history/history-effect.test.ts src/query/query-controller.test.ts && npm run typecheck` |
| 03-07-03 | 7 | HIST-01/02 | `src/history/QueryHistory.test.tsx`, `tests/e2e/query-history.spec.ts` | `cd SeeQLite && npm run test -- src/history/QueryHistory.test.tsx && npm run test:e2e -- tests/e2e/query-history.spec.ts --project=chromium && npm run typecheck` |

## Mandatory Matrices

- **SQL/policy:** selection/full, comment-only, semicolon strings/comments, parameters, batches, malformed, every denied class, next SELECT 1, handle finalization.
- **Value/limits:** duplicate labels, signed 64-bit bounds, NULL/empty/zero/text NULL, invalid UTF-8 with source/held byte lengths and replacement flag, embedded NUL, text `NaN`/`Infinity`/`-Infinity`, zero-row columns, 250/251 columns, 1,000/1,001 rows, 50,000 cells, 8 MiB payload, 64 KiB text, 256-byte BLOB, first huge cell, allocation failure.
- **Plan:** same `prepareSingleReadOnly()` path; 1,000/1,001 steps, 8 KiB detail, 1 MiB payload, orphans, hostile detail, stale SQL/database, denied input, valid Result preservation.
- **Lifecycle:** double stop, completion before/after stop, replace before/during/after rehydrate, replacement failure, crash, explicit reopen, duplicate/stale responses. A newer replacement operation token always wins.
- **History:** finalized current outcome only, 101st, 256 KiB total, 32 KiB SQL, Unicode truncation, every status, corrupt/version/quota/security/storage event, clear/reload; exact persisted fields contain no affinity/fingerprint/rows/schema/file/BLOB/diagnostics.

## Security, Performance, Accessibility

- Unique markers never enter network, URL, Cache Storage, console, raw file metadata, or unauthorized persistence.
- Result response never crosses six caps; DOM has one 50-row page. Plan never crosses step/detail/payload caps.
- Stop acknowledgement ≤250 ms in three engines; rehydration separately measured; worker/listener/request counts return to baseline.
- Axe/keyboard/light-dark/375-768-1024-wide/200%-zoom/reduced-motion checks cover editor, grid, plan, stop/recovery, and history.
- Manual VoiceOver/NVDA verifies CodeMirror/IME, result grid, plan, stop focus, and history confirmation.

## Sign-Off

- [x] Every production task owns or explicitly extends its RED test.
- [x] Every TS task runs typecheck.
- [x] Unit, real-WASM integration, production E2E, negative, security, performance, accessibility, and regression evidence are specified.
- [x] `nyquist_compliant: true`.

**Approval:** pending implementation evidence
