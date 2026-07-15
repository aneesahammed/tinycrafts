# Roadmap: SeeQLite v1

## Overview

SeeQLite reaches release through six vertical capabilities. Phase 1 proves the exact browser, worker, WASM, TinyCrafts, and `/seeqlite/` production shape before feature breadth. Phase 2 establishes the one trustworthy read-only database generation and normalized catalog that every later surface consumes. Phase 3 completes the query-to-result loop, including plan, cancellation, recovery, and history. Phase 4 makes declared relationships understandable through equivalent visual and structured paths. Phase 5 turns the bounded result into safe takeaway formats and makes the stable shell repeat-offline capable. Phase 6 audits the exact artifact across security, privacy, performance, accessibility, browsers, and the shared TinyCrafts release pipeline.

## Phases

- [ ] **Phase 1: Walking Skeleton and Browser Harness** - Prove the real production-shaped open-to-query slice, TinyCrafts shell, and cross-browser test foundation.
- [ ] **Phase 2: Safe Database Lifecycle and Catalog** - Open one file safely, enforce read-only SQLite policy, and expose a complete bounded catalog.
- [ ] **Phase 3: Query Workspace** - Deliver accessible SQL authoring, exact bounded results, plans, cancellation/recovery, and local history.
- [ ] **Phase 4: ER Understanding** - Make declared relationships navigable through a bounded interactive diagram and equivalent structured list.
- [ ] **Phase 5: Takeaway and Offline Shell** - Export the held bounded result honestly and make the installable application shell update safely offline.
- [ ] **Phase 6: Security Performance Accessibility and Release** - Prove the public claims and quality budgets on the exact TinyCrafts production artifact.

## Dependency Flow

```text
Production-shaped worker/WASM thin slice
  -> one safe file/worker generation and normalized catalog
     -> exact query/result/plan/history contracts
        -> ER graph and relationship list from the catalog
        -> CSV/JSON from the result model
     -> stable built asset manifest and offline shell
  -> cross-cutting production audit and TinyCrafts release
```

## Cross-Cutting Constraints

- Database bytes, schema, query text, results, and derived markers never leave the browser; no analytics, runtime CDN, remote fonts, or backend.
- One transient database, one serialized database worker, and one SQLite connection; the main thread never owns a SQLite handle.
- User SQL is parameter-free, one statement, and read-only through SQLite import/open flags, defensive configuration, a connection-lifetime authorizer, statement checks, limits, and deadlines.
- Database-derived text is untrusted, escaped, bounded, never passed to a raw HTML sink, and quoted centrally when used as a SQLite identifier.
- Results, catalog work, layouts, persistence, exports, and caches are bounded; safe degradation is preferable to hidden retries or tab failure.
- Every engine-facing phase test uses the pinned real SQLite WASM and production module worker; mocks are limited to pure unit seams.
- Light and dark themes, keyboard operation, focus, reduced motion, responsive behavior, and non-color meaning ship with each owning feature rather than being postponed.
- Build relative assets for `/seeqlite/`; service-worker scope and cache deletion are restricted to SeeQLite; DataDuck is a regression gate.
- Follow YAGNI exclusions in `REQUIREMENTS.md`: no backend, mutation, OPFS database persistence, relationship inference, custom SQL parser, worker pool, unbounded export, or speculative framework.

## Phase Details

### Phase 1: Walking Skeleton and Browser Harness

**Goal**: Users can load a TinyCrafts-styled production artifact at `/seeqlite/`, pass an honest capability check, open a committed SQLite fixture locally, and see a real bounded `SELECT` result without data-derived network traffic.

**Depends on**: Nothing (first phase)

**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, UX-01, TEST-01

**Success Criteria** (what must be TRUE):

1. A user can load the built application at `/seeqlite/` in Chromium, Firefox, and WebKit and see the responsive TinyCrafts shell in matched light/dark themes.
2. A user can open the committed fixture and run `SELECT 1`; official SQLite WASM runs in an app-owned module worker while the main thread remains responsive.
3. A user missing a required browser primitive sees the exact unsupported capability before file intake; optional storage/offline failures degrade without blocking the thin slice.
4. Production capture shows no root-path asset failures, CSP errors, COOP/COEP dependency, or database-derived network request, and the same Node 24 pipeline keeps DataDuck green.

**Plans**: 6 plans

Plans:

- [ ] 01-01: Establish the strict Vite/React/TypeScript toolchain, test harness, and dependency type-smoke checks.
- [ ] 01-02: Prove the typed app-owned SQLite module worker and bounded readiness protocol.
- [ ] 01-03: Assemble and verify the exact `/seeqlite/` artifact and shared Pages pipeline.
- [ ] 01-04: Build the responsive TinyCrafts shell, themes, and same-origin capability gate.
- [ ] 01-05: Complete the user-visible fixture open-to-bounded-query walking slice.
- [ ] 01-06: Close cross-engine privacy, CSP, accessibility, visual, bundle, performance, and DataDuck evidence.

**UI hint**: yes

**Implementation spikes**:

- **Release-blocking worker/WASM topology:** Prove official transient SQLite WASM at `/seeqlite/` with `crossOriginIsolated === false`, Pages-like headers, production CSP, and all three Playwright engines. If it fails, record an architecture decision before feature work; never move execution silently to the main thread.
- **Toolchain compatibility:** Compile exact SQLite, CodeMirror, React Flow, ELK, resizable-panel, React, Vite, and strict TypeScript versions; isolate any declaration workaround and keep Node 24/DataDuck compatibility.
- **Baseline budgets:** Record reference environment, shell/chunk/worker/WASM sizes, readiness timings, and initial long-task/network evidence so later phases ratchet instead of guessing.

**Exit criteria**:

- The production build opens the committed fixture and returns a real SQLite result in Chromium, Firefox, and WebKit at the real subpath.
- No database marker reaches network, URL, Cache Storage, or logs; no required asset loads from a remote runtime origin.
- Missing Worker/WASM/BigInt is actionable and tested; storage/service-worker absence does not break the thin slice.
- TinyCrafts/DataDuck build and current regression tests pass under the selected Node 24 toolchain.

### Phase 2: Safe Database Lifecycle and Catalog

**Goal**: Users can repeatedly open, replace, inspect, close, and recover one local SQLite database with honest file outcomes, engine-enforced read-only safety, and a complete searchable catalog that remains useful under unusual or hostile schemas.

**Depends on**: Phase 1

**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, FILE-05, SAFE-01, SAFE-02, SAFE-03, CAT-01, CAT-02, CAT-03, CAT-04, CAT-05

**Success Criteria** (what must be TRUE):

1. A user can open or replace one valid database by picker/drop, receives cautious actionable outcomes for invalid, corrupt, encrypted-looking, sidecar, WAL-mode, and over-budget files, and can recover by opening a valid file without reloading.
2. A user cannot mutate or attach through any tested SQL class; allowed catalog reads continue working and the source `File` remains byte-for-byte unchanged.
3. A user can search tables, views, virtual/shadow objects, indexes, columns, keys, constraints, flags, and safe SQL definitions, including SQLite-specific edge cases.
4. A large or partly broken catalog remains searchable through lazy, failure-isolated details and explicit limited mode rather than an unbounded allocation or graph attempt.
5. Replacing, closing, failing, or reopening never publishes stale catalog/detail state and repeated cycles do not leak workers, listeners, statements, connections, or WASM allocations.

**Plans**: 6 plans

Plans:

- [ ] 02-01: Prove bounded file classification, import ownership, size/WAL policy, and normalized file outcomes.
- [ ] 02-02: Implement exact fail-closed authorizer/PRAGMA/function policy, limits, queueing, and cleanup.
- [ ] 02-03: Extract and golden-test the complete bounded normalized SQLite catalog, including related triggers.
- [ ] 02-04: Deliver atomic open/replace/close/reopen lifecycle UI with stale-generation protection.
- [ ] 02-05: Deliver searchable, incrementally bounded catalog navigation and failure-isolated object details.
- [ ] 02-06: Deliver safely quoted identifier copy/object actions without premature editor insertion.

**UI hint**: yes

**Implementation spikes**:

- **Import ownership and WAL:** Verify exact pinned bindings for allocation, `sqlite3_deserialize`, read-only flags, cleanup versus `FREEONCLOSE`, repeated open/close memory, and copied-buffer-only WAL handling or a transient-VFS alternative without changing the worker contract.
- **C API safety surface:** Verify authorizer, defensive configuration, trusted-schema behavior, limits, statement read-only/tail inspection, progress and byte-length functions in the exact package. Unknown authorizer actions must fail closed.
- **Catalog budgets:** Generate ordinary and hostile schemas around the 5,000-object/50,000-column baselines; tune downward only with recorded evidence and preserve searchable limited mode.

**Exit criteria**:

- Real-WASM allow/deny tests cover DML, DDL, transactions, PRAGMAs, attach/detach, extension loading, comments, CTEs, `RETURNING`, and unknown actions; the next `SELECT 1` succeeds after every denial.
- File fixtures cover cancel picker, unusual extension, invalid header, truncated/corrupt/encrypted-looking input, sidecars, WAL main file, soft/hard thresholds, read failure, and OOM with subsequent valid-open recovery.
- Golden normalized catalog models cover `STRICT`, `WITHOUT ROWID`, virtual/shadow, generated/hidden, auto/expression/partial indexes, composite/implicit FKs, self/cycle/parallel/missing parent, quoted names, empty and broken objects.
- Lifecycle stress proves stale epochs cannot publish and resources return to baseline without modifying source bytes.

### Phase 3: Query Workspace

**Goal**: Users can author one read-only SQLite statement, obtain exact bounded results or a plan, cancel or time out expensive work with deterministic recovery, and reuse bounded local query history.

**Depends on**: Phase 2

**Requirements**: SQL-01, SQL-02, SQL-03, SQL-04, RES-01, RES-02, RES-03, PLAN-01, CANCEL-01, CANCEL-02, HIST-01, HIST-02

**Success Criteria** (what must be TRUE):

1. A user can author SQL with SQLite syntax/catalog completion and run the selection or full draft; empty, parameterized, multi-statement, unsafe, and malformed input receives precise recoverable feedback.
2. A user can inspect an exact positional result that preserves duplicate labels, 64-bit integers, `NULL`, BLOB/text previews, zero-row columns, and explicit row/column/cell/byte truncation.
3. A user can page, keyboard-navigate, and bounded-sort a semantic result grid, or inspect an accessible query-plan hierarchy tied to the captured SQL.
4. A user can Cancel with UI acknowledgement/worker termination within 250 ms or receive a distinct automatic timeout; after rehydration the draft and safe workspace state remain and the next query works.
5. A user can reopen/delete/clear up to 100 byte-bounded metadata-only history entries, while denied/corrupt/full storage falls back to session memory without blocking queries.

**Plans**: 7 plans

Plans:

- [ ] 03-01: Extend the canonical statement policy with query scope and protocol contracts.
- [ ] 03-02: Implement exact byte-aware positional value conversion and result budgets.
- [ ] 03-03: Complete terminate/rehydrate cancellation, lifecycle-token races, and worker-local timeout.
- [ ] 03-04: Integrate lazy CodeMirror, completion, serialized command lifecycle, and query navigation.
- [ ] 03-05: Publish bounded QueryResult state and integrate the accessible paged/sorted result grid.
- [ ] 03-06: Implement and render the independently bounded query-plan hierarchy.
- [ ] 03-07: Record finalized outcomes once and mount bounded affinity-free local history.

**UI hint**: yes

**Implementation spikes**:

- **Exact C stepping surface:** Validate statement-tail/parameter count, `sqlite3_column_bytes`, signed 64-bit conversion, progress-handler teardown, finalization, and plan rows against the exact build.
- **Cancellation lifecycle:** Measure termination acknowledgement separately from file reread/rehydration across repeated normal, boundary, double-cancel, replace-during-cancel, and crash cycles.
- **Result budgets:** Validate the 1,000-row, 250-column, 50,000-cell, 8 MiB payload, 64 KiB text, 256-byte BLOB, 50-row page, and 30-second deadline baselines; increases require ADR and regression evidence.

**Exit criteria**:

- Real-WASM and production E2E prove one-statement/policy behavior with comments, strings containing semicolons, CTEs, parameters, batches, denied writes, syntax errors, and rapid Run/Plan actions.
- Duplicate names, signed 64-bit bounds, `NULL` distinctions, BLOB/large text, zero rows, wide/multi-limit results, paging, and bounded sort pass exact-value and accessibility tests.
- Cancel/timeout/crash/replacement/stale-response races pass in Chromium, Firefox, and WebKit; every recoverable path ends with a successful `SELECT 1`.
- History persistence, 101st-entry eviction, byte cap, corrupt/quota/disabled storage, clear, reload, and forbidden-data inspection pass.

### Phase 4: ER Understanding

**Goal**: Users can truthfully understand every declared foreign-key relationship through a performant interactive diagram and a feature-equivalent structured path, then safely turn a relationship into queryable join SQL.

**Depends on**: Phase 3

**Requirements**: ER-01, ER-02, ER-03, ER-04, ER-05

**Success Criteria** (what must be TRUE):

1. A user sees exactly one relationship for each declared FK with ordered column pairs and rules; no naming inference or DDL guessing appears.
2. Composite, self-referencing, cyclic, parallel, implicit-parent, quoted, and unresolved relationships remain visible and accurate without crashing.
3. A user can search, select, pan, zoom, fit, and arrange a bounded graph; large schemas start in connected-subgraph mode and layout failure does not affect database work.
4. A keyboard or screen-reader user can find, inspect, and act on the identical relationships in a structured list without using the canvas.
5. A user can generate correctly quoted join SQL for a resolved relation, with confirmation protecting any dirty editor draft.

**Plans**: 4 plans

Plans:

- [ ] 04-01: Build the pure declared-FK graph model and equivalent structured relationship list.
- [ ] 04-02: Implement independent node/edge/payload limits, connected subgraphs, and the ELK layout worker.
- [ ] 04-03: Complete keyboard/screen-reader equivalence, join generation, dirty-draft protection, and scale evidence.
- [ ] 04-04: Integrate the bounded React Flow canvas, workspace navigation, and non-identifying view preference.

**UI hint**: yes

**Implementation spikes**:

- **Layout and bundle threshold:** Measure lazy chunks and 25/75/150/500-node fixtures across supported engines; ELK remains in its dedicated worker while the released whole-graph/subgraph threshold is recorded.
- **Graph accessibility:** Validate library focus/ARIA behavior against the shared relationship model; the structured list, not library internals, is the guaranteed equivalent path.
- **Join aliasing:** Lock deterministic aliases for self/parallel relationships and validate all identifiers through the shared quoting helper.

**Exit criteria**:

- Graph and relationship list have identical relationship counts, ordered pairs, rules, and unresolved status for all golden fixtures.
- Large schemas never auto-render an unbounded graph; performance runs show no release-budget main-thread stall and layout worker failures recover locally.
- Keyboard-only and screen-reader smoke completes table search, relationship inspection, and join generation in both themes without dragging or color-only semantics.
- Generated joins handle composite/self/parallel/quoted relationships and never replace a dirty draft without confirmation.

### Phase 5: Takeaway and Offline Shell

**Goal**: Users can download the exact bounded result in disclosed CSV/JSON forms and can reinstall/reopen the stable SeeQLite shell offline without corrupting updates or sibling TinyCrafts caches.

**Depends on**: Phase 4

**Requirements**: EXP-01, EXP-02, EXP-03, OFF-01, OFF-02, OFF-03

**Success Criteria** (what must be TRUE):

1. A user sees the exact displayed/truncated scope before exporting, and export never reruns the query or discards the current result on failure.
2. A user can download independently parseable RFC 4180 CSV with disclosed formula handling or positional tagged JSON that preserves duplicate labels, BigInt, BLOB, and truncation semantics.
3. After one complete online visit, a user can reload the shell offline, select a new local database, and use documented offline workflows; first-ever offline use is described honestly.
4. A failed update preserves the prior complete shell, only `seeqlite-*` caches are changed, and a seeded DataDuck/unrelated cache survives install, activation, update, reset, and failure.
5. Manifest/service-worker/storage failure remains a non-blocking offline limitation while normal online workflows continue.

**Plans**: 5 plans

Plans:

- [ ] 05-01: Implement and golden-test the pure CSV/JSON, filename, and download contracts.
- [ ] 05-02: Generate the manifest and content-addressed byte-verified service-worker asset set.
- [ ] 05-03: Prove built-subpath offline/install/update/multi-tab/privacy and sibling-cache behavior.
- [ ] 05-04: Integrate service-worker lifecycle and honest non-blocking runtime status UI.
- [ ] 05-05: Integrate held-result export disclosure and user-facing download actions.

**UI hint**: yes

**Implementation spikes**:

- **CSV hardening contract:** Choose one documented transformation, test formula starters including whitespace/control variants, avoid universal safety claims, and direct exact-data users to JSON.
- **Build-derived precache:** Prove every required emitted worker/WASM/font/icon/lazy chunk is included and an incomplete install cannot replace the previous complete cache.
- **Shared-origin isolation:** Exercise multi-tab update/reset and seeded sibling caches against the actual `/seeqlite/` scope and Pages-like artifact.

**Exit criteria**:

- Independent parsers validate CSV/JSON goldens for zero rows, duplicate labels, delimiters/quotes/CRLF, Unicode, `NULL`, BigInt, BLOBs, formulas, and truncation; repeated/failed exports leak no Blob URLs.
- Production offline E2E reloads the complete shell and opens a newly selected local database after one online visit; no prior database is persisted or promised.
- Missing precache assets and interrupted/quota-failed installs preserve the prior complete app; service-worker failure leaves online use intact.
- `dataduck-*` and unrelated seeded caches survive every SeeQLite cache lifecycle test.

### Phase 6: Security Performance Accessibility and Release

**Goal**: Users can rely on SeeQLite's privacy, read-only, responsiveness, accessibility, browser, offline, and TinyCrafts claims because each is verified against the exact public artifact and residual limitations are disclosed.

**Depends on**: Phase 5

**Requirements**: SEC-01, SEC-02, PERF-01, A11Y-01, REL-01, REL-02

**Success Criteria** (what must be TRUE):

1. Hostile database-derived content remains inert under the production CSP, and privacy markers appear only in explicitly allowed local UI/history/download locations.
2. Primary workflows pass keyboard, screen-reader, zoom, focus, responsive, reduced-motion, light-theme, and dark-theme evidence at representative viewports.
3. Recorded release benchmarks meet ratcheted shell/import/query/result/graph/cancel/rehydration/bundle budgets or activate documented safe degradation without freezing or unbounded transfer/rendering.
4. The full automated matrix passes on the production artifact with real WASM in Chromium, Firefox, and WebKit; a current Safari manual smoke and dependency/license/advisory review are recorded.
5. TinyCrafts publishes a truthful design-consistent SeeQLite catalogue entry and verified `/seeqlite/` build while landing-page and DataDuck regressions remain green.

**Plans**: 6 plans

Plans:

- [ ] 06-01: Audit CSP, hostile rendering, privacy, source integrity, read-only behavior, and produce explicit gap-closure inputs.
- [ ] 06-02: Ratchet three-engine performance/scalability and automated accessibility/visual/keyboard evidence.
- [ ] 06-03: Integrate the shared Pages release gate, limitations, evidence, and rollback rehearsal.
- [ ] 06-04: Make PF-01..PF-14 prevention/recovery evidence and dependencies mechanically auditable.
- [ ] 06-05: Validate recorded current Safari and assistive-technology manual evidence.
- [ ] 06-06: Add SeeQLite to the TinyCrafts catalogue with accurate product and limitation copy.

**UI hint**: yes

**Implementation spikes**:

- **Actual Pages headers:** Inspect deployed responses; do not claim `frame-ancestors` or another header-only protection unless the header is present. Keep CSP capability minimal and documented.
- **Budget ratchet:** Replace provisional thresholds with measured release budgets or explicit lower safe limits; any increase requires an ADR plus regression evidence.
- **Safari evidence:** Treat Playwright WebKit as CI evidence and separately record a smoke test in the current released Safari.

**Exit criteria**:

- All 48 requirements have linked evidence and every Definition of Done item in `REQUIREMENTS.md` passes.
- Every Critical/High risk has prevention and recovery tests; no derived marker leaks to network/log/URL/cache/unapproved persistence and source bytes are unchanged.
- Typecheck, lint, unit, real-WASM integration, three-engine production E2E, negative/security, accessibility, performance, bundle, export parser, PWA update, and Pages artifact verification pass without hidden skips/retries.
- Current Safari/manual accessibility records, dependency/license inventory, limitation copy, rollback path, TinyCrafts landing entry, and DataDuck regression evidence are complete.

## Coverage Validation

| Phase | Requirement count | Requirement IDs |
|---|---:|---|
| 1. Walking Skeleton and Browser Harness | 6 | PLAT-01, PLAT-02, PLAT-03, PLAT-04, UX-01, TEST-01 |
| 2. Safe Database Lifecycle and Catalog | 13 | FILE-01, FILE-02, FILE-03, FILE-04, FILE-05, SAFE-01, SAFE-02, SAFE-03, CAT-01, CAT-02, CAT-03, CAT-04, CAT-05 |
| 3. Query Workspace | 12 | SQL-01, SQL-02, SQL-03, SQL-04, RES-01, RES-02, RES-03, PLAN-01, CANCEL-01, CANCEL-02, HIST-01, HIST-02 |
| 4. ER Understanding | 5 | ER-01, ER-02, ER-03, ER-04, ER-05 |
| 5. Takeaway and Offline Shell | 6 | EXP-01, EXP-02, EXP-03, OFF-01, OFF-02, OFF-03 |
| 6. Security Performance Accessibility and Release | 6 | SEC-01, SEC-02, PERF-01, A11Y-01, REL-01, REL-02 |

**Coverage:** 48/48 requirements assigned exactly once. No orphaned or duplicate phase assignments.

## Progress

**Execution order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6. Decimal phases are reserved only for urgent inserted work.

| Phase | Plans Complete | Status | Completed |
|---|---:|---|---|
| 1. Walking Skeleton and Browser Harness | 0/6 | Planned | - |
| 2. Safe Database Lifecycle and Catalog | 0/6 | Planned | - |
| 3. Query Workspace | 0/7 | Planned | - |
| 4. ER Understanding | 0/4 | Planned | - |
| 5. Takeaway and Offline Shell | 0/5 | Planned | - |
| 6. Security Performance Accessibility and Release | 0/6 | Planned | - |

---
*Roadmap created: 2026-07-15 from approved project scope and research synthesis*
