# Project Research Summary

**Project:** SeeQLite
**Domain:** Browser-only, local-first SQLite explorer, ER viewer, and read-only query workbench
**Researched:** 2026-07-15
**Confidence:** HIGH overall; MEDIUM for package-binding details and measured browser budgets

## Executive Summary

SeeQLite should be built as a static TinyCrafts application that opens one local SQLite database, keeps its bytes inside the browser, normalizes its catalog once, and connects that catalog to three practical workflows: exploration, a declared-foreign-key ER view, and safe SQL querying. The recommended implementation is React + TypeScript + Vite, with the official `@sqlite.org/sqlite-wasm` package loaded inside an application-owned module worker. SQLite—not string matching—must parse, authorize, execute, and plan SQL. CodeMirror provides the query-authoring experience, while React Flow and ELK provide a bounded, accessible schema visualization. The application remains intentionally serverless, account-free, transient, and read-only.

The hardest work is not the visible shell. It is preserving the product promises under failure: read-only enforcement requires several SQLite controls; a synchronous worker query must be cancelled by terminating and rehydrating the worker; memory must be bounded by file, statement, row, column, cell, byte, text, BLOB, schema, and graph limits; WAL-dependent and corrupt files require cautious classification; and SQLite values must retain duplicate column names, 64-bit integers, `NULL`, BLOB, and truncation semantics. These concerns belong in shared engine and domain contracts before the explorer, grid, ER canvas, or export UI is broadened.

The roadmap should use six vertical phases. Phase 1 proves the exact headerless GitHub Pages topology with real WASM in Chromium, Firefox, and WebKit. Phase 2 makes file handling, read-only policy, and catalog normalization trustworthy. Phase 3 completes the query workbench. Phase 4 adds ER understanding from the normalized catalog. Phase 5 adds bounded export and a safely scoped offline shell. Phase 6 hardens security, privacy, accessibility, performance, deployment, and TinyCrafts integration. This order converts the largest unknowns into early release gates and avoids investing in feature breadth on an unproven runtime.

## Canonical Product Boundary

### Locked for v1

- Open exactly one local `.sqlite`, `.sqlite3`, or `.db` file through portable file input or drag-and-drop.
- Keep database bytes, schema, SQL, results, and database-derived identifiers off the network.
- Run all SQLite work off the main thread using the official SQLite WASM package inside an app-owned module worker.
- Inspect main-schema tables, views, virtual/shadow objects, columns, keys, indexes, and SQL definitions.
- Show declared foreign keys only; never imply inferred relationships are schema facts.
- Run exactly one non-empty, parameter-free, read-only SQLite statement at a time.
- Provide bounded results, query-plan inspection, automatic timeout, user cancellation, local bounded history, and displayed-result CSV/JSON export.
- Provide a React Flow ER canvas and an equivalent structured relationship list.
- Ship as a static, installable, repeat-offline application at `/seeqlite/` in equal-quality light and dark TinyCrafts themes.
- Support evergreen Chromium, Firefox, and Safari/WebKit baselines through feature detection and production-artifact tests.

### Explicitly deferred

- Mutation, save-back, schema editing, transactions, script execution, or parameter sessions.
- Multiple databases, `ATTACH`, remote URLs, cloud storage, accounts, collaboration, or sharing.
- OPFS database persistence, multi-tab locking, and required File System Access APIs.
- SQLCipher, native/arbitrary extensions, relationship inference, AI features, or analytics.
- Unbounded results/export, enterprise grids, diagram editing, notes, image export, or layout-engine settings.
- Backend services, generalized RPC frameworks, worker pools, routers, global state libraries, and reusable design-system packages.

## Key Findings

### Recommended Stack

The stack is deliberately narrow. Expensive capabilities are lazy boundaries: the initial shell is small; SQLite/WASM loads after file intent; CodeMirror loads for Query; React Flow loads for ER; ELK runs only when layout is needed.

| Technology | Role | Decision |
|---|---|---|
| Node 24 LTS + npm | CI/build runtime | Move the shared Pages workflow from EOL Node 20; regression-build DataDuck on the new runtime. |
| React 19 + React DOM | Workspace UI | Use reducer/context and feature-local state; no Redux/Zustand application layer. |
| TypeScript | Worker protocol and domain contracts | Strict types are required at the worker, catalog, result, graph, and persistence boundaries. |
| Vite | Static build, module workers, relative assets | Use `base: './'`, emitted WASM/worker assets, and a deploy-shaped `/seeqlite/` test artifact. |
| `@sqlite.org/sqlite-wasm` | SQLite execution | Exact-pin the official browser package; do not use deprecated Worker1/Promiser APIs. |
| CodeMirror 6 + SQLite SQL language | Query editor | Selection-aware execution, SQLite syntax, shortcuts, undo, and catalog completion. |
| React Flow | ER canvas | Provides pan/zoom/focus/selection and accessible graph primitives that are not worth reimplementing. |
| ELK | Layered ER layout | Isolate behind one adapter and run in a dedicated layout worker; expose one opinionated Arrange action. |
| `react-resizable-panels` | Desktop/tablet workspace splits | Reuse tested keyboard and ARIA separator behavior. |
| Plain CSS + TinyCrafts tokens | Visual system | Reuse warm paper/ink/rule/blue tokens, 36px grid, compact radii, Inter, and JetBrains Mono. |
| Vitest + Testing Library | Unit/component tests | Test pure policies and visible UI behavior without pretending jsdom validates WASM. |
| Playwright + axe | Real-browser integration/E2E | Run production worker/WASM flows in Chromium, Firefox, and WebKit. |
| Browser primitives | Input, persistence, export, PWA | File input/drop, bounded versioned `localStorage`, `Blob`, object URLs, manifest, and a small custom service worker. |

Current researched package versions are implementation targets, not permission to skip lockfile review. `@sqlite.org/sqlite-wasm` must be exact-pinned. React/React DOM must share a patch. TypeScript 7 and its lint/type ecosystem require a Phase 1 compatibility spike before the complete dependency set is locked.

### Expected Features

**Table stakes**

- Dependable open/replace/close flow with honest validation and recovery.
- Searchable catalog explorer with accurate SQLite-specific metadata.
- CodeMirror query editor with one-statement and selection semantics.
- Typed, bounded, paginated results with precise truncation states.
- Query timeout and terminate/rehydrate cancellation.
- `EXPLAIN QUERY PLAN` view tied to an immutable SQL/database generation.
- Declared-FK graph plus relationship list and quoted join generation.
- Bounded local query history that never stores results or database bytes.
- Parseable CSV/JSON exports of exactly the held result.
- Responsive, accessible light/dark workspace and repeat-offline shell.
- Static subpath deployment that does not damage sibling TinyCrafts applications.

**Competitive differentiators**

- Verifiable no-upload operation with no runtime CDN, analytics, or data-derived requests.
- Engine-enforced read-only behavior rather than an editor keyword filter.
- Catalog-to-ER-to-query continuity with exact SQLite identifier quoting.
- Truthful relationship and truncation handling, including unresolved declarations.
- Disposable-worker cancellation that recovers without losing the SQL draft.
- Exact positional SQLite value handling, including duplicate names and signed 64-bit values.
- Equivalent visual and structured ER representations.
- A crafted TinyCrafts workshop character rather than a generic admin dashboard.

**Defer to v2+ only after validated demand**

- Database persistence, mutation, multiple connections, remote sources, AI, relationship inference, collaboration, generalized export, or diagram authoring.

### Architecture Approach

The database worker is the trust boundary. It privately owns SQLite initialization, one connection, the connection-lifetime safety policy, serial commands, catalog extraction, query execution, result bounding, plan generation, and cleanup. The main thread retains the browser `File` for recovery and owns only serializable UI state. Request IDs and worker epochs prevent stale responses from a cancelled, crashed, or replaced generation from mutating the current interface.

Normalize SQLite metadata once into stable catalog, relationship, and value DTOs. The explorer, CodeMirror completion, ER graph/list, and join generator consume that shared catalog. Results use column metadata plus positional row arrays, never objects, because SQLite permits duplicate column names. React Flow and ELK are rendering/layout adapters, not sources of truth. The service worker owns only the versioned SeeQLite shell cache and never handles user database content.

**Major components**

1. `FileController` — portable input, extension advisory, header/size checks, retained `File`, replacement and reopen semantics.
2. `DatabaseClient` — worker creation, typed RPC, serialized commands, request IDs, epochs, pending-promise cleanup, and recovery.
3. `sqlite.worker.ts` — official SQLite module, one connection, trusted initialization, dispatcher, and guaranteed teardown.
4. `ReadOnlyPolicy` — deserialized/read-only import, `query_only`, defensive settings, connection-lifetime authorizer, statement read-only check, PRAGMA/function policy, runtime limits, and deadlines.
5. `CatalogAdapter` — `sqlite_schema` plus table-valued PRAGMAs, lazy details, budgets, and stable normalization.
6. `QueryExecutor` — SQLite-owned statement boundaries, parameter rejection, type-safe stepping, result budgets, finalization, and plan generation.
7. App reducer/contexts — lifecycle, workspace, query, diagram, preferences, and bounded history DTOs only.
8. `GraphModel` and layout client — pure nodes/relationships/join inputs plus a disposable ELK worker.
9. Persistence/export adapters — versioned bounded local records and deterministic CSV/JSON from the held result.
10. Scoped service worker — build-derived shell precache, atomic update behavior, and `seeqlite-*` cache isolation.

### Critical Pitfalls

1. **Incomplete read-only controls** — combine read-only import/open semantics, `PRAGMA query_only`, defensive/trusted-schema settings where supported, a deny-by-default connection-lifetime authorizer, a PRAGMA/function allowlist, `sqlite3_stmt_readonly`, and one-statement enforcement.
2. **Cancel queued behind synchronous SQLite** — terminate the active worker, reject its epoch, reread the retained `File`, and rehydrate. Use the worker-local progress handler for automatic deadlines.
3. **Row-only memory limits** — bound file size, SQL/runtime limits, columns, rows, total cells, total serialized bytes, per-cell text, BLOB preview, catalog size, and graph size before data crosses boundaries.
4. **Misclassified SQLite files** — extension and magic header are preliminary only; accept readable WAL-mode main files with a checkpoint warning, reject sidecars, and use cautious wording for corrupt/encrypted/incomplete input.
5. **Lossy SQLite value mapping** — preserve positional rows, duplicate labels, exact `bigint`, distinct `NULL`, and typed BLOB/truncated-text metadata from worker through export.
6. **Hostile names and values** — render database-derived text through escaped React/DOM paths, centralize SQL identifier quoting, bound display length, self-host assets, and enforce a narrow CSP.
7. **Unbounded catalog/ER/grid rendering** — use eager summary/lazy detail, schema budgets, selected connected subgraphs, one-page semantic tables, and off-main-thread layout.
8. **Origin-wide cache damage** — delete only older `seeqlite-*` caches; failed precache installation must preserve the last complete offline version and sibling caches.
9. **Canvas-only accessibility** — ship the relationship list and keyboard actions from the same model in the ER phase, with focus preservation and non-color semantics.
10. **Mock confidence** — every engine-facing guarantee requires real SQLite WASM, the real module worker, the production subpath, and cross-engine evidence.

## Resolved Contradictions and Decision Status

### Locked decisions

| Topic | Canonical decision | Resolution |
|---|---|---|
| SQLite worker API | App-owned module worker with a narrow typed protocol | Supersedes any Worker1/Promiser examples; upstream deprecates those APIs. |
| Cancellation | Terminate database worker and rehydrate from retained `File` | A queued same-worker cancel message cannot interrupt synchronous execution. |
| Layout execution | Dedicated ELK layout worker behind one adapter | Resolves “move only if slow” versus “two-worker architecture” in favor of predictable main-thread responsiveness; the worker remains small and single-purpose. |
| Read-only security | Engine-layered, deny-by-default policy | SQL regex/prefix checks may improve copy only and are never an authorization control. |
| WAL main files | Attempt a safe read of the main file and display a checkpoint/sidecar warning; reject `.wal`, `.shm`, and journal sidecars | A WAL header does not prove uncheckpointed frames exist, so blanket rejection is incorrect. |
| Results | Positional rows with typed values and bounded client-side sort/paging | Supersedes DataDuck-style object rows and whole-result sorting. |
| ER semantics | Declared FKs only, with unresolved relationships preserved | No DDL guessing or naming inference in v1. |
| Offline | Custom scoped shell service worker with a build-generated asset list | No Workbox; no database persistence; no cross-app cache cleanup. |
| Styling/state | Plain CSS and React reducer/context | No Tailwind/component kit/global state dependency. |
| Deployment | Relative Vite assets under `/seeqlite/`, Node 24 CI, and DataDuck regression gate | The shared runtime change is not complete until both applications build and test. |

### Bounded implementation spikes

These spikes choose mechanics without changing public contracts. A failed release-blocking spike stops dependent work and triggers an explicit architecture decision; it does not authorize an undocumented fallback.

1. **Headerless Pages worker/WASM (Phase 1, release blocking):** prove transient official SQLite WASM in an app-owned worker under `/seeqlite/`, `crossOriginIsolated === false`, the production CSP, and no COOP/COEP dependency in Chromium, Firefox, and WebKit. If it fails, compare a vendored official build or `sql.js`, or change hosting; never move queries silently to the main thread.
2. **Import ownership and WAL mechanics (Phase 2):** verify the exact pinned bindings for allocation, `sqlite3_deserialize`, read-only flags, explicit cleanup versus `FREEONCLOSE`, repeated open/close memory, and a copied-buffer-only WAL normalization or transient-VFS alternative. The source file must never be modified.
3. **C API and safety surface (Phase 2/3):** verify authorizer, defensive configuration, limits, statement tail/read-only, progress handler, byte-length inspection, and teardown in the exact package.
4. **TypeScript/toolchain compatibility (Phase 1):** compile the proposed SQLite, CodeMirror, React Flow, ELK, and panel adapters under strict TypeScript; isolate declaration workarounds and select compatible lint packages from official guidance.
5. **Numeric budgets (Phases 1–4):** begin with 256 MiB warning, 512 MiB block, 1,000 rows, 250 columns, 50,000 cells, 8 MiB serialized result, 64 KiB text preview, 256-byte BLOB preview, 30-second deadline, 5,000 catalog objects, 50,000 catalog columns, 50-row pages, and a 75-node full-layout threshold. Record measured values and require an ADR plus regression evidence for changes. The earlier 200-column suggestion is superseded by 250 columns plus the independent cell/byte limits.
6. **Graph/bundle threshold (Phase 4):** measure 25/75/150/500-node fixtures, confirm lazy chunks, and lock the released connected-subgraph threshold. ELK stays off the main thread regardless of the final threshold.
7. **CSV hardening (Phase 5):** select one disclosed spreadsheet-hardening transformation, test delimiter/quote edge cases, avoid universal safety claims, and direct exact-data users to tagged JSON.
8. **Deployed headers and Safari evidence (Phase 6):** inspect actual Pages responses. Do not claim `frame-ancestors` without an HTTP header. Treat Playwright WebKit as CI evidence plus a manual current Safari smoke test.

## Implications for Roadmap

### Phase 1: Walking Skeleton and Browser Harness

**Rationale:** The official SQLite module worker, WASM asset resolution, new Node/toolchain, subpath, and headerless Pages topology are release-blocking unknowns. Prove them before building feature breadth.
**Delivers:** TinyCrafts light/dark shell, capability gate, one committed fixture, real file open, one bounded `SELECT`, worker termination/reopen skeleton, production-preview Playwright, baseline privacy/performance evidence, and strict toolchain.
**Addresses:** Local file open, no-upload proof, static deployment, theme foundation, real-browser harness.
**Avoids:** PF-05 hostile rendering, PF-12 dev/production drift, PF-14 mock confidence.
**Exit gate:** A production `/seeqlite/` artifact opens a fixture and runs real SQLite WASM in all three Playwright engines without COOP/COEP, root-path requests, CSP errors, or database-derived network traffic. DataDuck also builds/tests under Node 24.

### Phase 2: Safe Database Lifecycle and Catalog

**Rationale:** Every later feature depends on one trustworthy database generation and normalized catalog. Safety exceptions must not be reimplemented per screen.
**Delivers:** File validation/replace/close/reopen, import-ownership decision, layered read-only policy, runtime limits, cautious WAL/corrupt/encrypted handling, normalized catalog, lazy details, explorer, and catalog budgets.
**Addresses:** Honest opening, complete inspection, engine-enforced read-only, accurate completion/ER source data.
**Avoids:** PF-01 policy bypass, PF-03 memory exhaustion, PF-04 file misclassification, PF-06 catalog omissions.
**Exit gate:** Real-WASM hostile SQL is denied; valid, weird, corrupt, pending-WAL, and over-budget fixtures produce correct and recoverable outcomes; normalized golden models cover SQLite-specific schema cases; no source byte changes.

### Phase 3: Query Workspace

**Rationale:** The query UI can now depend on proven policy/catalog contracts, and its result model becomes the input to plan, history, and later exports.
**Delivers:** CodeMirror, selection/full-draft semantics, SQLite-owned single-statement handling, parameter rejection, exact typed bounded results, semantic 50-row paging, bounded sorting, plan view, timeout, terminate/rehydrate cancel, and 100-entry/byte-capped history.
**Addresses:** Querying, results, plan, cancellation, history, catalog completion.
**Avoids:** PF-02 ineffective cancel, PF-03 result memory, PF-07 value loss, PF-10 secret persistence.
**Exit gate:** Cancellation, timeout, stale-response, replacement, and rapid-action races pass in three engines; duplicate names/64-bit/BLOB/zero-row fixtures remain exact; storage failure never blocks execution; the next `SELECT 1` succeeds after every recoverable error.

### Phase 4: ER Understanding

**Rationale:** ER derives from the stable catalog and shared identifier quoter; building it earlier would duplicate or fossilize incomplete SQLite metadata assumptions.
**Delivers:** Pure graph model, composite/self/cycle/parallel/unresolved edges, structured relationship list, dedicated ELK worker, React Flow canvas, threshold/subset behavior, search/fit/arrange, and confirmation-safe join SQL generation.
**Addresses:** Declared-FK visualization, non-canvas access, catalog-to-query continuity.
**Avoids:** PF-06 schema loss, PF-08 main-thread graph stalls, PF-13 inaccessible canvas.
**Exit gate:** Graph and relationship list have identical relationship counts/ordered pairs; hostile and complex FK fixtures work; large schemas do not auto-render unbounded graphs; keyboard users can inspect and generate a join without dragging.

### Phase 5: Takeaway and Offline Shell

**Rationale:** Export requires the final typed bounded result contract, and offline precaching requires stable built worker/WASM/chunk paths.
**Delivers:** Deterministic RFC 4180 CSV, positional tagged JSON, explicit hardening/truncation metadata, object-URL cleanup, manifest/installability, build-derived shell precache, atomic updates, and sibling-cache isolation.
**Addresses:** CSV/JSON takeaway, repeat-offline use, installability, static product delivery.
**Avoids:** PF-09 unsafe/lossy export, PF-11 cross-product cache damage.
**Exit gate:** Independent parsers validate golden exports; failed export preserves the result; repeat offline load can open a newly selected local DB; a failed update preserves the previous shell; seeded `dataduck-*` caches survive install/update/reset.

### Phase 6: Security, Performance, Accessibility, and Release

**Rationale:** Cross-cutting controls are implemented with their owning features, then audited together against the exact artifact and public claims.
**Delivers:** CSP/privacy audit, malicious/negative matrix, measured budget ratchets, dependency/license inventory, keyboard and screen-reader evidence, responsive/theme verification, service-worker upgrade proof, TinyCrafts catalogue entry, Pages pipeline integration, and release notes with limitations.
**Addresses:** All v1 requirements and the complete release claim.
**Avoids:** Every PF item, especially claim drift and regression gaps.
**Release gate:** Every requirement has real-browser evidence; every Critical/High risk has passing prevention and recovery tests; no database-derived network/cache leak exists; accessibility/manual Safari checks are recorded; build verification covers every worker/WASM/PWA asset and sibling app regression.

### Phase Ordering Rationale

```text
Production-shaped shell and capability proof
  -> safe file/worker generation and read-only SQLite policy
     -> one normalized catalog
        -> explorer + editor completion + ER graph source
     -> one typed bounded result contract
        -> grid + plan + history + export
  -> stable production asset manifest
     -> safe offline shell
  -> cross-cutting release audit and TinyCrafts integration
```

- Production topology precedes feature breadth because worker/WASM/subpath failure would invalidate the stack.
- File and SQL safety precede catalog/query/ER because one trust boundary must serve every surface.
- Catalog normalization precedes completion and ER to prevent divergent SQLite interpretations.
- Result typing precedes grid/export so duplicate names, BigInt, BLOBs, and truncation have one meaning.
- Cancellation is designed with worker lifecycle from Phase 1 and completed with queries; it is not a late UI feature.
- Relationship list and canvas ship together; accessibility is not deferred hardening.
- Offline follows stable assets so caching cannot amplify worker/WASM version mismatches.

### Research Flags

**Deeper implementation research/spikes required**

- **Phase 1:** exact official package worker/WASM behavior on headerless Pages; TypeScript 7/lint/type compatibility; first production bundle and performance baselines.
- **Phase 2:** exact import allocation/ownership, WAL copied-buffer/transient-VFS behavior, C-binding availability, defensive settings, and calibrated SQLite runtime limits.
- **Phase 3:** exact progress-handler/teardown behavior and cancellation memory over repeated generations.
- **Phase 4:** React Flow/ELK production bundle, layout-worker protocol, threshold, and browser-long-task measurements.
- **Phase 5:** chosen CSV transformation wording and build-derived service-worker install/update mechanics.
- **Phase 6:** actual Pages response headers, current Safari behavior, and final dependency/license inventory.

**Well-documented patterns; skip a general research phase**

- React reducer/context state, semantic result paging, localStorage failure fallback, React text escaping, responsive CSS, theme tokens, and file input/drop.
- Catalog/SQL semantics already have primary SQLite documentation; use targeted package spikes rather than broad ecosystem research.
- PWA scope/cache principles and WCAG keyboard requirements are established; validate the implementation instead of reopening the product decision.

## Complete Testing Implications

### Unit

- Table-driven authorizer decisions, including unknown action codes denied.
- Statement-tail handling, parameter detection, identifier quoting, and normalized error mapping.
- Catalog normalization for ordinary, STRICT, WITHOUT ROWID, virtual/shadow, generated/hidden, expression/partial index, composite/implicit FK, self/cycle/parallel/missing parent, quoted names, and broken objects.
- Value DTOs, exact BigInt display, `NULL` distinction, BLOB/text previews, truncation accounting, query-plan tree normalization.
- History entry/byte limits, corrupt/quota storage fallback, and clear behavior.
- CSV/JSON golden encoders, formula-like cells, duplicate labels, zero rows, object-URL lifecycle seams.
- Graph derivation, connected-subgraph limits, join generation, focus targets, cache-name filtering, and service-worker asset-list logic.

### Real-browser integration

- Actual pinned SQLite WASM inside the actual module worker; no engine mock for import, authorization, limits, C-API lifetime, result stepping, plan, timeout, or worker replacement.
- File transfer and repeated open/close/cancel/reopen cycles with worker/statement/allocation cleanup evidence.
- Allow/deny SQL matrix covering comments, mixed case, CTEs, `RETURNING`, DDL/DML, transactions, writable/read-only PRAGMAs, `ATTACH`/`DETACH`, extension loading, multiple statements, and parameters.
- Production graph/layout worker behavior and real download parsing.

### End-to-end

- Serve the built artifact at the real subpath in Chromium, Firefox, and WebKit.
- Cover open, replace, inspect, search, query, result paging/sort, plan, cancel, timeout, history, ER/list, join generation, export, theme, responsive modes, install, update, and repeat offline use.
- Capture console, failed requests, content types, worker/service-worker scope, and CSP errors on failure.
- Include a manual current Safari smoke path because Playwright WebKit is not identical to released Safari.

### Negative and security

- Zero-byte, wrong-header, valid unusual-extension, corrupt, encrypted-looking, truncated, WAL-mode, pending-WAL, sidecar, soft-limit, hard-limit, and memory-failure files.
- Malicious identifiers/values/errors with HTML, quotes, bidi/zero-width controls, long strings, embedded newlines, and CSV formula starters.
- Worker crash, old-epoch responses, cancel-at-completion, double cancel, replacement during cancel, missing WASM, absent browser features, CSP denial, and storage failure.
- Unique-marker privacy test across network, URLs, console, localStorage, Cache Storage, service-worker keys, and generated downloads.
- Seeded sibling cache test proving only `seeqlite-*` caches are changed.

### Performance and scalability

- Record environment and baselines in Phase 1, then ratchet in Phase 6.
- Measure shell/worker/WASM readiness; 25/50 MiB open-to-catalog; 64/128/256 MiB memory/reopen behavior; 1,000-by-20 query-to-first-paint; max-cell paging/sort/export; 25/75/150/500-node graphs; Cancel acknowledgement; and rehydration separately.
- Assert no full database buffer clone on the main thread, no result response above caps, no full large BLOB transfer, no unbounded graph render, and no more than one result page of rows in the DOM.
- There is no server concurrency problem; scaling is per-tab asset, WASM memory, catalog, query, result, graph, and main-thread responsiveness.

### Accessibility and visual regression

- Automated axe checks in light/dark and desktop/tablet/mobile layouts at representative 375, 768, 1024, and wide widths.
- Keyboard scripts for open, explorer, query, plan, cancel, relationship list, join generation, result navigation, and export.
- Manual NVDA/VoiceOver smoke scripts; logical focus after layout, filtering, dialogs, worker recovery, and responsive-mode changes.
- Ensure PK/FK/unique/generated/hidden and statuses do not rely on color; respect reduced motion, zoom, target size, and contained horizontal scrolling.

### Regression policy

- Every defect adds the smallest permanent test at the lowest layer that would have caught it.
- Critical binary fixtures remain committed with human-readable generation notes and are never replaced by mocks for speed.
- Dependency upgrades rerun real WASM, worker URL/CSP, authorization, cancellation, graph keyboard, service-worker update, production artifact, and sibling-app suites.
- Release approval cannot rely on mocked engine or dev-server tests.

## Security, Performance, and Release Gates

### Security/privacy gate

- Source `File` bytes remain unchanged and never enter network, persistent storage, Cache Storage, logs, URLs, or exports except through the user's explicit bounded export result.
- Main-thread code cannot access a SQLite handle or bypass the worker policy.
- Every user statement is one parameter-free statement, remains under the connection-lifetime authorizer, is read-only, respects limits/deadlines, and finalizes on every path.
- No database-derived value reaches a raw HTML sink; CSP permits only required same-origin scripts/workers/assets and WASM capability.
- History persists bounded SQL/metadata only, is clearable, and fails to session memory without blocking work.

### Performance gate

- Cancel changes UI state and terminates the active worker within 250 ms; rehydration is measured and reported separately.
- The measured supported file/result/catalog/graph limits fail safely rather than freezing or retrying indefinitely.
- Editor, graph, and ELK chunks stay out of the initial shell chunk until used; bundle reports separate shell/editor/graph/layout/worker/WASM sizes.
- Large schemas enter searchable limited/subgraph mode, and one result page bounds DOM work.

### Release gate

- Typecheck, unit, browser integration, three-engine production E2E, negative/security, accessibility, performance, bundle, and Pages artifact verification all pass.
- Worker, WASM, JS/CSS, fonts, manifest, icons, and service worker exist and resolve relatively under `/seeqlite/` with correct content types.
- Offline install/update works, failed installation preserves the old shell, and sibling caches/apps survive.
- TinyCrafts light/dark/responsive acceptance is complete; DataDuck passes the Node 24/shared-build regression gate.
- Actual deployment response headers and limitations match product copy; no unsupported clickjacking, offline-database, CSV-safety, or maximum-file-size claim is published.

## YAGNI Guardrails

The roadmap may add a dependency only when it replaces non-trivial, measured product work. CodeMirror, React Flow, ELK, and accessible resizable panels meet that test; a backend, global store, SQL parser, grid framework, Workbox, CSV library, general RPC layer, worker pool, and PWA framework do not.

Do not solve hypothetical scale with persistence, streaming, virtualization, shared memory, multiple connections, generalized adapters, or new services. Start with the locked bounded contracts and measured thresholds. If a threshold fails, record evidence, change the smallest owning boundary, add a regression test, and preserve the external contract. A new feature category requires an updated validated requirement, not opportunistic implementation.

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Product boundary and features | HIGH | All research converges on the one-file, read-only, local-only open-inspect-relate-query-export loop. |
| Stack families | HIGH | Framework, editor, graph, browser primitives, and official SQLite choices are supported by primary docs and local TinyCrafts evidence. |
| Exact package versions/tooling | MEDIUM-HIGH | Current versions were checked, but TypeScript/lint/type compatibility needs the bounded Phase 1 spike. |
| Architecture boundaries | HIGH | Worker ownership, epochs, normalization, positional results, and service-worker scope are strongly supported. |
| SQLite import mechanics | MEDIUM | Exact allocation/ownership and WAL handling must be proven against the pinned npm build without changing the worker contract. |
| Security controls | HIGH | SQLite authorization/limits/defensive APIs and browser sink/CSP controls are documented; exact binding availability is a spike. |
| Cancellation | HIGH | Terminate/rehydrate and progress-deadline behavior follow the synchronous worker constraint; browser timing needs measurement. |
| Numeric budgets | MEDIUM | Initial conservative values are actionable but must be calibrated and ratcheted from the production vertical slice. |
| ER/accessibility approach | HIGH | Shared model + graph/list architecture is clear; exact layout threshold and library behavior need browser evidence. |
| Offline/deployment | HIGH concept, MEDIUM implementation | Scope/cache rules are established; final generated asset list, CDN behavior, and response headers require artifact/deployment tests. |

**Overall confidence:** HIGH in the six-phase plan and system boundaries; MEDIUM only where the plan explicitly schedules measured package/browser spikes.

### Gaps to Address

- Confirm headerless official SQLite WASM under the exact Pages-like artifact before feature implementation continues.
- Confirm deserialization/VFS allocation ownership, read-only semantics, WAL-main-file behavior, and cleanup in the exact package build.
- Lock TypeScript/lint/type-package versions through compilation rather than guessed compatibility.
- Replace provisional file/result/catalog/graph budgets with measured, documented release thresholds.
- Choose and disclose one CSV spreadsheet-hardening transformation.
- Inspect actual Pages headers and run manual current Safari accessibility/runtime smoke checks.

None of these gaps requires broadening the product or changing the typed worker, catalog, result, graph, or persistence contracts.

## Sources

### Primary and authoritative

- [SQLite WASM npm documentation](https://sqlite.org/wasm/doc/trunk/npm.md) — official browser package and npm usage.
- [SQLite Worker1/Promiser documentation](https://sqlite.org/wasm/doc/trunk/api-worker1.md) — deprecation and queued-worker limitations.
- [SQLite OO1 API](https://sqlite.org/wasm/doc/trunk/api-oo1.md) — database and statement APIs.
- [SQLite C-style WASM API](https://sqlite.org/wasm/doc/trunk/api-c-style.md#sqlite3_deserialize) and [deserialize C API](https://sqlite.org/c3ref/deserialize.html) — import flags and ownership.
- [SQLite authorizer](https://sqlite.org/c3ref/set_authorizer.html), [statement read-only](https://sqlite.org/c3ref/stmt_readonly.html), [runtime limits](https://sqlite.org/c3ref/limit.html), and [progress handler](https://sqlite.org/c3ref/progress_handler.html) — query policy, limits, and deadlines.
- [SQLite schema table](https://sqlite.org/schematab.html), [PRAGMA documentation](https://sqlite.org/pragma.html), [foreign keys](https://sqlite.org/foreignkeys.html), [database format](https://sqlite.org/fileformat.html), and [WAL format](https://sqlite.org/walformat.html) — catalog and file semantics.
- [Vite worker features](https://vite.dev/guide/features.html#web-workers) and [static deployment](https://vite.dev/guide/static-deploy.html#github-pages) — module workers and Pages-relative artifacts.
- [React Flow layout](https://reactflow.dev/learn/layouting/layouting) and [accessibility](https://reactflow.dev/learn/advanced-use/accessibility) — graph/layout trade-offs and keyboard/ARIA support.
- [CodeMirror SQL](https://github.com/codemirror/lang-sql) and [completion](https://codemirror.net/examples/autocompletion/) — SQLite dialect and schema completion.
- [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage), and [CSP script source](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) — offline and runtime security constraints.
- [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) — spreadsheet export risk and limits of mitigations.
- [WCAG 2.2 Keyboard understanding](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) — non-pointer equivalence requirement.
- [Node release schedule](https://nodejs.org/en/about/previous-releases) — Node 24 LTS and Node 20 end-of-life status at research time.

### Local high-confidence evidence

- `.planning/PROJECT.md` — product promise, scope, TinyCrafts constraints, and active requirements.
- `.planning/research/STACK.md` — current dependency/runtime research and implementation spikes.
- `.planning/research/FEATURES.md` — v1 feature contract, anti-features, and user-visible acceptance signals.
- `.planning/research/ARCHITECTURE.md` — worker/catalog/result/graph boundaries and lifecycle invariants.
- `.planning/research/PITFALLS.md` — prioritized risk register, failure matrix, and testing/release gates.
- Local DataDuck engine/file/state/editor/result/service-worker tests and TinyCrafts build/Pages scripts — reusable patterns and specific behaviors to replace.

---
*Research completed: 2026-07-15*
*Ready for requirements and roadmap: yes*
