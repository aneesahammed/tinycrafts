# Requirements: SeeQLite v1

**Product:** Browser-only, local-first SQLite explorer, ER viewer, and read-only query workbench
**Milestone:** v1 MVP
**Status:** Approved scope, ready for phase planning
**Last updated:** 2026-07-15

## Requirement Rules

- Every requirement is atomic, user-centric, objectively testable, and assigned to exactly one roadmap phase.
- “Given/When/Then” acceptance criteria define the minimum shippable behavior. A phase plan may add stricter checks but may not weaken these criteria.
- Database-derived content includes filenames, schema names and SQL, query text, errors, result values, and BLOB previews.
- “Supported browsers” means current evergreen Chromium, Firefox, and Safari/WebKit with WebAssembly, `BigInt`, transferable `ArrayBuffer`, and module Worker support.
- Initial numeric limits are policies to validate during the named spikes: 256 MiB warning, 512 MiB hard file block, 1,000 rows, 250 columns, 50,000 cells, 8 MiB serialized result, 64 KiB text preview, 256-byte BLOB preview, 30-second query deadline, 5,000 catalog objects, 50,000 catalog columns, and 75 nodes for full-graph layout.

## User Stories and Acceptance Criteria

### Platform and Walking Skeleton

#### PLAT-01 — Local-only database processing

**User story:** As a privacy-conscious user, I can inspect a local SQLite file without uploading it or any derived data.

**Acceptance criteria:**

- Given a fixture containing unique markers in its filename, schema, SQL, and values, when the user opens and queries it, then browser network capture contains none of those markers and no database-derived request is made.
- Given normal use, when browser storage and Cache Storage are inspected, then database bytes and result rows are absent.

**Edge/failure cases:** Runtime CDNs, analytics, crash reporting, remote fonts, URL/query-string leakage, console logging of derived data, and service-worker caching of user data all fail acceptance.

#### PLAT-02 — Production-shaped static subpath

**User story:** As a TinyCrafts visitor, I can use SeeQLite from `/seeqlite/` as a static application.

**Acceptance criteria:**

- Given the production build served at `/seeqlite/`, when the page loads, then HTML, hashed chunks, workers, fonts, icons, manifest, and SQLite WASM resolve beneath that subpath with correct MIME types and no root-relative 404s.
- Given `crossOriginIsolated === false`, when a database is opened, then the app-owned module worker runs official SQLite WASM without COOP/COEP or OPFS.

**Edge/failure cases:** Direct navigation, refresh, missing WASM, a CSP-blocked worker, incorrect worker scope, and Pages-like response headers produce a failed release check rather than a silent main-thread fallback.

#### PLAT-03 — App-owned worker boundary

**User story:** As a user, database work does not freeze the interface or expose a SQLite handle to UI code.

**Acceptance criteria:**

- Given database initialization and a real `SELECT`, when work runs, then it executes in an application-owned module worker through a typed request/response contract and the main thread remains interactive.
- Given source inspection and runtime instrumentation, then no main-thread module obtains a SQLite connection pointer or bypasses the worker protocol.

**Edge/failure cases:** Deprecated Worker1/Promiser APIs, synchronous main-thread execution, generalized worker frameworks, and multiple database workers are excluded.

#### PLAT-04 — Actionable capability gate

**User story:** As a user on an unsupported browser, I understand what is missing before selecting sensitive data.

**Acceptance criteria:**

- Given a required primitive is unavailable, when the app starts, then it shows a specific non-destructive support message and disables file intake.
- Given optional storage or service-worker support is unavailable, when the app starts, then core open/query behavior remains available and the degraded feature is explained.

**Edge/failure cases:** Missing Worker, WebAssembly, `BigInt`, transferable buffers, localStorage, and service-worker registration are covered independently.

#### UX-01 — TinyCrafts workspace shell

**User story:** As a TinyCrafts user, I see a focused SeeQLite workspace that feels native to the studio in light and dark themes.

**Acceptance criteria:**

- Given light or dark preference, when the shell renders, then it uses the TinyCrafts paper/ink/rule/blue tokens, Inter and JetBrains Mono, restrained grid texture, compact radii, direct copy, and no italics.
- Given desktop, tablet, or narrow mobile widths, when the shell renders, then primary navigation and the open-to-query thin slice remain usable without page-level horizontal overflow.
- Given reduced-motion preference, then non-essential transitions are removed.

**Edge/failure cases:** Saved theme preference, system-theme fallback, first-paint theme flash, 200% zoom, 375/768/1024/wide viewports, and both color schemes are covered.

#### TEST-01 — Real-browser walking-skeleton harness

**User story:** As the product owner, I can trust that the production-shaped foundation works before feature breadth is added.

**Acceptance criteria:**

- Given the committed smoke fixture and built artifact, when Playwright runs in Chromium, Firefox, and WebKit, then the user can open the file, see one catalog object, run `SELECT 1`, and see a bounded result from real SQLite WASM.
- Given the same CI runtime, when repository regression checks run, then DataDuck still builds and its existing tests pass.
- Given a failure, then console errors, failed requests, CSP violations, worker URLs, and response content types are attached to the test output.

**Edge/failure cases:** Engine mocks and dev-server-only evidence do not satisfy this requirement.

### Safe Database Lifecycle and Catalog

#### FILE-01 — Portable one-file intake

**User story:** As a user, I can open one local database by picker or drag-and-drop without changing the current session accidentally.

**Acceptance criteria:**

- Given no database is open, when one file is selected or dropped, then exactly that file enters validation.
- Given the picker is cancelled, no file is dropped, or multiple files are dropped, then the current database and workspace remain unchanged and the user receives an actionable response for the unsupported multi-file case.

**Edge/failure cases:** Directories, zero files, multiple files, repeated drop events, and keyboard activation of Open are covered.

#### FILE-02 — Honest SQLite validation

**User story:** As a user, I receive an accurate validation outcome instead of trusting a filename extension.

**Acceptance criteria:**

- Given `.sqlite`, `.sqlite3`, and `.db` files, when bytes are invalid, then they are rejected before a catalog appears.
- Given valid SQLite bytes with an unusual extension, when opened, then the user receives an advisory warning and may continue.
- Given zero-byte, undersized, truncated, corrupt, or encrypted-looking input, then the outcome uses cautious distinct copy where detection is reliable and a later valid open succeeds without reload.

**Edge/failure cases:** Extension case, Unicode filenames, HTML-like filenames, unreadable `File` errors, and SQLite open/catalog failures are covered.

#### FILE-03 — Bounded file import

**User story:** As a user, an oversized or memory-heavy database fails safely instead of crashing the tab.

**Acceptance criteria:**

- Given a file at or above the soft threshold, when opened, then a warning explains memory risk before import continues.
- Given a file above the hard threshold, when opened, then it is blocked before its full contents are allocated or transferred.
- Given an allocation or WASM out-of-memory error below the hard cap, then the app stops without retry looping and permits a later smaller open.

**Edge/failure cases:** Threshold boundaries, browser-reported size mismatch, transfer failure, partial read, and repeated failed imports are covered.

#### FILE-04 — WAL and sidecar handling

**User story:** As a user, I understand when a file may omit uncheckpointed changes.

**Acceptance criteria:**

- Given a `.wal`, `.shm`, or rollback-journal sidecar, when opened, then it is rejected with instructions to open a checkpointed main database.
- Given a readable WAL-mode main database, when opened, then SeeQLite does not mutate its bytes, attempts the validated copied-buffer path, and displays that sidecar-only changes are not included.
- Given the validated import path cannot read a WAL-mode main file correctly, then it is rejected with checkpoint guidance rather than mislabelled as encryption.

**Edge/failure cases:** Empty sidecars, renamed sidecars, pending WAL frames, and read-only copied-buffer header normalization are covered by committed fixtures.

#### FILE-05 — Single-generation lifecycle and recovery

**User story:** As a user, replacing, closing, cancelling, or reopening a database never mixes old and new state.

**Acceptance criteria:**

- Given database A is open, when database B replaces it, then A's statements, connection, allocations, pending requests, catalog, result, and plan are disposed before B becomes current.
- Given a late response from an older worker epoch, when received, then it cannot update the current UI.
- Given close or recoverable failure, when the user reopens, then the retained source `File` is reread and the original browser file bytes remain unchanged.

**Edge/failure cases:** Replacement during open/query/cancel, same filename with different bytes, double close, worker crash, and cleanup failure are covered.

#### SAFE-01 — Layered engine-enforced read-only mode

**User story:** As a user, running SQL cannot alter the source or transient database.

**Acceptance criteria:**

- Given DML, DDL, transactions, savepoints, writable or unknown PRAGMAs, `ATTACH`, `DETACH`, `VACUUM`, `ANALYZE`, `REINDEX`, extension loading, or an unknown authorizer action, when prepared or stepped, then the connection-lifetime deny-by-default policy rejects it.
- Given allowed `SELECT`, read-only CTE, catalog reads, and supported explain operations, then they work under the same authorizer.
- Given a hostile-query suite, the source file hash/bytes are unchanged and the next `SELECT 1` succeeds.

**Edge/failure cases:** Leading comments, mixed case, DML with `RETURNING`, automatic reprepare, virtual tables, and `load_extension()` are covered against real SQLite WASM.

#### SAFE-02 — Central SQLite and application limits

**User story:** As a user, pathological SQL or schemas stop with a clear limit outcome rather than exhausting the tab.

**Acceptance criteria:**

- Given SQL length, column, expression-depth, compound-select, function-argument, catalog-object, or catalog-column limits are exceeded, then work stops at the owning boundary with a normalized recoverable error.
- Given an unknown or over-budget object, then the rest of the open database remains usable where safe.

**Edge/failure cases:** Exact boundary values, integer overflow, nested expressions, enormous definitions, and hostile generated schemas are covered.

#### SAFE-03 — Complete cleanup on every worker path

**User story:** As a user, repeated open/close/failure cycles do not degrade the application.

**Acceptance criteria:**

- Given open success, validation failure, SQLite open/catalog error, worker crash, replacement, reopen, or close, then every lifecycle-owned statement is finalized, the connection is closed, WASM allocations are released, pending lifecycle requests are settled once, and the worker is terminated when required.
- Given repeated lifecycle cycles, then worker/listener counts return to baseline and measured memory does not grow without bound.

**Edge/failure cases:** Partial initialization, exceptions during lifecycle cleanup, duplicate responses, unknown request IDs, double close, and terminate-during-initialization are covered. Active-query cancellation and progress-handler timeout cleanup are owned by CANCEL-01 and CANCEL-02.

#### CAT-01 — Searchable object catalog

**User story:** As a user, I can find and distinguish the database's tables, views, virtual/shadow objects, and indexes.

**Acceptance criteria:**

- Given an opened database, when catalog bootstrap completes, then main-schema objects from `PRAGMA table_list` and `sqlite_schema` appear with exact names, kinds, flags, counts, and safe SQL definitions.
- Given SQLite internals, then they are hidden by default and revealed by an explicit toggle.
- Given search text, then matching remains usable for quoted, Unicode, keyword, bidi-control, and long identifiers without interpreting them as HTML.

**Edge/failure cases:** Empty databases, missing SQL definitions, triggers shown as related metadata rather than query targets, autoindexes, and duplicate-looking Unicode names are covered.

#### CAT-02 — Complete per-object details

**User story:** As a user, I can inspect columns, keys, indexes, constraints, and definitions for a selected object.

**Acceptance criteria:**

- Given a table or view, when details load, then ordered columns include declared type, nullability, default, primary-key order, foreign-key membership, uniqueness, generated/hidden state, and relevant badges.
- Given indexes, then origin, uniqueness, partial/expression status, ordered columns/expressions, and rowid details are represented without inventing metadata.

**Edge/failure cases:** `STRICT`, `WITHOUT ROWID`, generated/hidden columns, composite PKs, implicit parent PKs, expression/partial indexes, views, virtual tables, and null SQL definitions are covered by golden models.

#### CAT-03 — One normalized catalog model

**User story:** As a user, explorer, completion, ER, and join actions agree about the schema.

**Acceptance criteria:**

- Given a catalog fixture, when normalized, then all consumer surfaces read the same stable IDs, exact names, ordered fields, object flags, index metadata, and foreign-key records.
- Given a schema version or database generation change, then stale detail and derived graph data are invalidated.

**Edge/failure cases:** Case-sensitive exact IDs, malformed/broken objects, self references, cycles, parallel relationships, and missing parents are preserved or warned rather than silently dropped.

#### CAT-04 — Lazy, failure-isolated, bounded details

**User story:** As a user, a large or partly broken catalog remains navigable.

**Acceptance criteria:**

- Given a normal database, when opened, then only the useful summary is eager and per-object detail is requested lazily and deduplicated.
- Given one detail query fails, then that object shows a scoped warning while other objects remain available.
- Given catalog budgets are exceeded, then the app enters a searchable limited mode, states the reached limit, and suppresses unbounded full-graph layout.

**Edge/failure cases:** Rapid selection changes, stale detail replies, 5,000-object/50,000-column boundaries, broken views/indexes, and low-memory failure are covered.

#### CAT-05 — Safe catalog-to-query actions

**User story:** As a user, I can copy a catalog identifier or bounded SELECT statement without manually escaping unusual names.

**Acceptance criteria:**

- Given any SQLite identifier, when an explorer action copies an identifier or bounded SELECT statement, then it uses centralized double-quote escaping and cannot produce an unintended second identifier or statement.
- Given clipboard success or failure, then the copied/generated text is explicit and bounded; failure exposes selectable text without changing database or workspace state.

**Edge/failure cases:** Embedded quotes, keywords, dots, brackets, Unicode, newlines, hostile HTML-like names, clipboard denial, and definition-preview truncation are covered. Dirty-editor replacement confirmation is owned by ER-05 when a generated join is inserted into the Phase 3 editor.

### Query Workspace

#### SQL-01 — SQLite-aware accessible editor

**User story:** As a user, I can author SQL efficiently with SQLite syntax, schema completion, and keyboard controls.

**Acceptance criteria:**

- Given a ready database, when the editor is used, then CodeMirror provides SQLite highlighting, undo/redo, selection, accessible Run/Plan shortcuts, and completion from the current normalized catalog.
- Given database replacement or catalog invalidation, then completion switches to the current catalog without retaining stale names.

**Edge/failure cases:** IME input, multiline SQL, screen-reader labels, shortcut conflicts, empty catalogs, quoted names, mobile keyboards, and editor-chunk load failure are covered.

#### SQL-02 — Explicit one-statement execution

**User story:** As a user, I run exactly the SQL I selected or drafted, never an ambiguous batch.

**Acceptance criteria:**

- Given a non-empty selection, Run submits that selection; otherwise it submits the full draft.
- Given SQLite's prepare/tail handling finds exactly one non-empty parameter-free statement, it may execute; given a second statement, parameters, or comment/whitespace-only input, it returns actionable guidance without executing anything.

**Edge/failure cases:** Semicolons in strings/comments, leading/trailing comments, named/positional parameters, multiple comment-only tails, and selection boundary changes are covered without a custom SQL parser.

#### SQL-03 — Serialized, race-safe commands

**User story:** As a user, rapid Run and Plan actions produce one coherent current outcome.

**Acceptance criteria:**

- Given one database command is active, when Run or Plan is invoked again, then the UI prevents concurrent statement execution and explains the active state.
- Given the database, query snapshot, or worker epoch changes, then late results, plans, errors, and success-history updates from the old request are ignored.

**Edge/failure cases:** Double-click Run, Run then Plan, Plan then replace, cancel-at-completion, and duplicate worker responses are covered.

#### SQL-04 — Clear recoverable errors

**User story:** As a user, I understand syntax, policy, limit, timeout, crash, and readiness failures and can continue working.

**Acceptance criteria:**

- Given a recoverable query error, then the UI shows a normalized code/message without raw stack or HTML execution, retains the draft, preserves the prior valid result unless cancellation safety requires clearing it, and permits the next `SELECT 1`.
- Given an unrecoverable worker/open error, then one explicit Reopen action is offered without automatic retry loops.

**Edge/failure cases:** Syntax position, hostile SQLite error text, not-ready actions, schema errors, OOM, crash, and cleanup errors are covered.

#### RES-01 — Exact positional SQLite values

**User story:** As a user, query output preserves SQLite values instead of silently coercing them.

**Acceptance criteria:**

- Given duplicate result labels, then every value remains accessible in positional rows and both headings remain visible.
- Given signed 64-bit integers, `NULL`, empty string, zero, text `"NULL"`, BLOBs, and dynamically typed columns, then each remains distinct and exact or is represented by explicit typed preview metadata.

**Edge/failure cases:** Minimum/maximum 64-bit integers, NaN-like text, invalid UTF-8 handling, zero-length BLOB, mixed runtime kinds, and zero-row column metadata are covered.

#### RES-02 — Multi-dimensional result bounds

**User story:** As a user, a wide or large result is useful without exhausting memory.

**Acceptance criteria:**

- Given row, column, cell, serialized-byte, text-preview, or BLOB-preview limits, then the worker stops before crossing the relevant cap, finalizes the statement, and returns the precise truncation or rejection reason.
- Given a result at a boundary, then elapsed time, returned rows, columns, and truncation metadata are accurate.

**Edge/failure cases:** A single huge first cell, 250+ columns, 1,001 rows, cell/byte limit preceding row limit, large BLOB, and allocation failure are covered.

#### RES-03 — Accessible bounded result grid

**User story:** As a user, I can inspect, page, sort, and read a bounded result efficiently.

**Acceptance criteria:**

- Given a result, then a semantic table shows at most one configured 50-row page with sticky headers, numeric alignment, contained horizontal scroll, current page, row count, timing, and truncation state.
- Given client sorting, then it reorders only the bounded returned rows and labels that scope; it does not imply database `ORDER BY`.
- Given keyboard or screen-reader use, then headings, cells, page controls, sort state, `NULL`, BLOB, and truncated values are understandable without color alone.

**Edge/failure cases:** Zero rows, zero columns, duplicate headings, max-width pages, long content, focus after paging/sort, and responsive overflow are covered.

#### PLAN-01 — Safe query-plan inspection

**User story:** As a user, I can inspect SQLite's query plan for the exact permitted statement I am working on.

**Acceptance criteria:**

- Given a supported single read-only parameter-free statement, when Plan is requested, then the same policy/limits validate it before `EXPLAIN QUERY PLAN` and an accessible parent/child tree or list is shown.
- Given the SQL or database changes, then the plan is cleared or visibly stale; a late old plan cannot replace the current one.
- Given unsupported, syntax, or policy input, then the previous query result remains intact and no plan execution bypasses read-only enforcement.

**Edge/failure cases:** CTEs, already-explained SQL, unstable SQLite detail prose, orphan parent IDs, empty plans, and hostile plan text are covered.

#### CANCEL-01 — Immediate cancel with deterministic recovery

**User story:** As a user, I can stop a long query and continue using the same file.

**Acceptance criteria:**

- Given a running query, when Cancel is activated, then the active worker is terminated and UI state changes within 250 ms; the request is marked cancelled exactly once and no partial/late result or plan can publish.
- Given the retained `File`, then a new epoch rehydrates the database, restores the catalog, preserves editor/history/selection/diagram UI state, clears unsafe in-flight output, and permits the next small query.

**Edge/failure cases:** Double cancel, cancel at completion, replacement during cancel, rehydrate failure, stale response, worker/listener leakage, and large-file reopen timing are covered.

#### CANCEL-02 — Automatic query deadline

**User story:** As a user, forgotten expensive work stops automatically with a distinct timeout outcome.

**Acceptance criteria:**

- Given execution exceeds the configured deadline, when the worker-local SQLite progress handler observes it, then SQLite interrupts the statement, finalizes resources, reports timeout rather than user cancellation, and leaves the draft recoverable.
- Given a query completes within the deadline, then the progress handler does not alter its result.

**Edge/failure cases:** Deadline boundary, clock resolution, progress-handler setup/teardown, timeout during recursive CTE, and subsequent query health are covered.

#### HIST-01 — Bounded metadata-only history

**User story:** As a user, I can recover recent SQL without persisting my database or results.

**Acceptance criteria:**

- Given completed, failed, timed-out, or cancelled queries, then history stores at most 100 versioned entries under a total byte cap containing bounded SQL, timestamp, duration, status, and optional opaque database affinity only.
- Given entry 101 or an oversized draft, then documented eviction/truncation applies without storing result rows, schema definitions, bytes, BLOB previews, raw filenames/paths, stacks, or worker diagnostics.

**Edge/failure cases:** Huge SQL, sensitive literals, affinity collision, schema version change, corrupt old versions, and exact byte boundaries are covered.

#### HIST-02 — Usable and failure-tolerant history

**User story:** As a user, I can reopen, delete, and clear history even when persistent storage is unavailable.

**Acceptance criteria:**

- Given valid persisted history, when the app reloads, then entries can be reopened for editing/rerun, deleted individually, or cleared entirely.
- Given storage is disabled, corrupt, or quota-full, then history falls back to session memory with a non-blocking notice and database/query use continues.
- Given Clear all, then both persisted and current-session entries are removed.

**Edge/failure cases:** JSON parse failure, write exception, storage event races, private mode, reload after clear, and duplicate entries are covered.

### ER Understanding

#### ER-01 — Declared-relationship truthfulness

**User story:** As a user, I see only relationships declared by SQLite, never guesses presented as facts.

**Acceptance criteria:**

- Given normalized foreign-key metadata, when the ER model is derived, then one edge represents each declared FK constraint with ordered child/parent column pairs and update/delete/match rules.
- Given name-like columns without constraints, then no inferred edge appears; given no declared FKs, then an empty state explains this boundary.

**Edge/failure cases:** Composite FKs are one relationship, not one edge per column; DDL parsing and naming inference are excluded.

#### ER-02 — Complete complex relationship model

**User story:** As a user, unusual but valid SQLite relationship shapes remain understandable.

**Acceptance criteria:**

- Given self references, cycles, parallel FKs, implicit parent-PK references, quoted identifiers, and missing parent objects, then the model preserves each declaration without crashing or inventing data.
- Given unresolved references, then they remain visible with a warning and their known ordered child-side metadata.

**Edge/failure cases:** Composite order, duplicate constraints, missing target columns, `WITHOUT ROWID`, Unicode, and case-sensitive exact IDs are covered by graph golden tests.

#### ER-03 — Bounded interactive diagram

**User story:** As a pointer or keyboard user, I can search and navigate relationships without a large schema freezing the tab.

**Acceptance criteria:**

- Given a schema at or below the measured threshold, then the lazy-loaded React Flow canvas supports search, selection, pan, zoom, fit, and one ELK Arrange action.
- Given a larger schema, then the app starts in search/subgraph mode and lays out a selected connected component under the node cap instead of auto-rendering everything.
- Given layout failure or replacement, then the database worker and relationship list remain usable and stale layout results do not publish.

**Edge/failure cases:** 0/1/25/75/150/500 nodes, disconnected components, cycles, self edges, reduced motion, worker crash, rapid arrange, and responsive canvas bounds are covered.

#### ER-04 — Equivalent structured relationship list

**User story:** As a keyboard or assistive-technology user, I can perform the relationship workflow without the canvas.

**Acceptance criteria:**

- Given any ER model, then an always-available structured list derived from the same edges exposes the identical relationship count, ordered column pairs, rules, resolution status, table grouping, and actions.
- Given keyboard-only use, then the user can find a table, inspect a relationship, and reach its join action without dragging or color-dependent meaning.

**Edge/failure cases:** Canvas unavailable, layout failure, no FKs, composite/self/cyclic edges, focus restoration, and screen-reader announcements are covered.

#### ER-05 — Safe relationship-to-query bridge

**User story:** As a user, I can turn a declared relationship into correctly quoted join SQL without losing work.

**Acceptance criteria:**

- Given a resolved relationship, when Generate join is used, then SQL contains every ordered column pair with centralized SQLite identifier quoting.
- Given an empty editor, SQL may be inserted; given a dirty draft, explicit confirmation is required before replacement; given an unresolved relationship, generation is disabled with an explanation.

**Edge/failure cases:** Composite keys, self joins with deterministic aliases, parallel edges, embedded quotes, keyword names, and cancellation of confirmation are covered.

### Takeaway and Offline Shell

#### EXP-01 — Honest bounded export scope

**User story:** As a user, I export exactly the displayed bounded result and understand whether it is incomplete.

**Acceptance criteria:**

- Given a current result, when Export is opened, then the UI states displayed row/column counts and every active truncation reason before download.
- Given export, then it consumes the held result model without rerunning SQL and retains the result after success or failure.
- Given no current result, then export is disabled with an explanation.

**Edge/failure cases:** Zero rows, stale result after database replacement, truncated cells, failed Blob creation, repeated clicks, and object-URL cleanup are covered.

#### EXP-02 — Deterministic hardened CSV

**User story:** As a user, I can download a parseable CSV with disclosed spreadsheet-risk handling.

**Acceptance criteria:**

- Given any bounded result, CSV uses RFC 4180 field quoting and CRLF, defined header and `NULL` behavior, UTF-8, and one tested/disclosed formula-like-cell transformation.
- Given values beginning with spreadsheet formula starters, then the transformation is applied consistently, the UI avoids universal safety claims, and exact-data users are directed to JSON.
- Given zero rows, then CSV contains headers.

**Edge/failure cases:** Commas, double quotes, CR/LF, Unicode, duplicate labels, empty values, formula starters after whitespace/control characters, BigInt, BLOB/truncated metadata, and filename sanitization are covered with independent parsing.

#### EXP-03 — Positional tagged JSON

**User story:** As a user, I can export a loss-aware machine-readable representation of the displayed result.

**Acceptance criteria:**

- Given any bounded result, JSON has positional `{ columns, rows, metadata }`, preserves duplicate names and order, and tags out-of-safe-range integers, BLOBs, and truncated text explicitly.
- Given zero rows, then columns and an empty row list remain present; given truncation, then machine-readable metadata identifies it.

**Edge/failure cases:** BigInt serialization, embedded control characters, Unicode, BLOB previews, non-finite runtime values, duplicate names, and deterministic output are covered with an independent parser.

#### OFF-01 — Installable repeat-offline shell

**User story:** As a returning user, I can load SeeQLite offline and choose a new local database after one successful online visit.

**Acceptance criteria:**

- Given the manifest and one complete online load, when the browser later reloads offline, then the shell, CSS, fonts, icons, database/layout workers, SQLite WASM, and lazy feature chunks required by documented offline workflows are available.
- Given a first-ever visit offline, then the browser/app shows an honest unavailable state; SeeQLite does not claim a previously selected database will reopen automatically.

**Edge/failure cases:** Install prompts are optional, PWA identity/icon validation, offline direct navigation, lazy editor/graph use, and service-worker storage denial are covered.

#### OFF-02 — Atomic, scoped service-worker updates

**User story:** As a TinyCrafts user, SeeQLite updates do not break its last working offline copy or another tool.

**Acceptance criteria:**

- Given the built artifact, then the precache list is generated from actual output and a missing required asset fails the new install before it replaces the previous complete cache.
- Given activation/update/reset, then only older `seeqlite-*` caches are deleted; a seeded `dataduck-*` and unrelated cache survive unchanged.
- Given requests outside the app scope or user-generated object URLs/data, then the service worker does not cache or intercept them.

**Edge/failure cases:** Missing worker/WASM, stale HTML, interrupted install, two open tabs, opaque/error/redirect/cross-origin responses, and cache quota failure are covered.

#### OFF-03 — Graceful online fallback

**User story:** As a user, service-worker or manifest failure does not prevent normal online database use.

**Acceptance criteria:**

- Given registration, Cache Storage, manifest, or update failure while online, then the app reports a non-blocking offline limitation and open/inspect/query/export remain usable.
- Given an older complete worker controls the page, then a broken newer update does not force an unrecoverable mixed-version worker/WASM state.

**Edge/failure cases:** Registration rejection, security error, quota error, incompatible cached worker/WASM pair, and unregister/reset are covered.

### Security, Performance, Accessibility, and Release

#### SEC-01 — Production content and execution hardening

**User story:** As a user, hostile database content cannot execute code or expand SeeQLite's browser privileges.

**Acceptance criteria:**

- Given malicious filenames, identifiers, definitions, error text, plan detail, and cell values, when rendered, then they remain inert text with bounded display and no raw-HTML sink.
- Given the production artifact, then CSP permits only required same-origin app assets/workers and necessary WASM capability, blocks object embedding and unsafe network destinations, and extension loading remains disabled.
- Given Pages cannot set a required response header, then release copy does not claim that protection and the limitation is recorded.

**Edge/failure cases:** HTML/script payloads, event attributes, CSS-like strings, bidi/zero-width controls, very long values, `javascript:`-like text, CSP violation, iframe embedding limits, and self-hosted fonts are covered.

#### SEC-02 — End-to-end privacy and dependency audit

**User story:** As a user, SeeQLite's no-upload/read-only claims are backed by production evidence.

**Acceptance criteria:**

- Given unique markers across database-derived inputs, when every primary workflow runs, then the markers occur only in allowed current UI/session fields, bounded SQL history where applicable, and explicit user downloads—not in network, URL, logs, Cache Storage, service-worker keys, or unrelated persistent storage.
- Given the release dependency inventory, then every runtime dependency has a documented purpose/license, no remote runtime service, and no unresolved Critical/High advisory without an accepted mitigation.

**Edge/failure cases:** Error paths, cancellation, export failure, offline update, development logs disabled in production, source maps, and dependency-generated requests are covered.

#### PERF-01 — Measured browser budgets and safe degradation

**User story:** As a user, supported workloads remain responsive and over-budget work fails predictably.

**Acceptance criteria:**

- Given the recorded reference environment, when release benchmarks run, then shell/worker/WASM readiness, 25/50 MiB open-to-catalog, 1,000×20 query-to-first-paint, page sort/export, 25/75/150/500-node graph behavior, cancel acknowledgement, and rehydration are measured against ratcheted budgets.
- Given supported maximum fixtures, then no full database clone remains on the main thread, no result crosses configured cell/byte limits, no full large BLOB transfers, no unbounded graph auto-render occurs, and no more than one result page is in the DOM.
- Given a budget is exceeded, then the operation warns, limits, enters subset mode, or fails safely rather than freezing/retrying.

**Edge/failure cases:** Cold/warm runs, light/dark, reduced motion, three browser engines, memory-constrained failure, bundle/chunk sizes, and threshold changes requiring an ADR/regression evidence are covered.

#### A11Y-01 — Complete accessible primary workflow

**User story:** As a keyboard, zoom, reduced-motion, or assistive-technology user, I can complete SeeQLite's primary workflow.

**Acceptance criteria:**

- Given keyboard-only use, 200% zoom, and representative screen readers, then a user can open, inspect, search, query, read results, inspect plan, cancel, use the relationship list, generate a join, and export with logical focus and visible status.
- Given automated axe checks in both themes at 375, 768, 1024, and wide widths, then there are no serious/critical violations and controls have names, roles, states, targets, and non-color meaning.
- Given responsive-mode changes, dialogs, errors, paging, sorting, layout, and worker recovery, then focus moves predictably and status messages are announced.

**Edge/failure cases:** Canvas unavailable, horizontal result scrolling, mobile drawer/tabs, high contrast, reduced motion, theme contrast, IME, and NVDA/VoiceOver smoke paths are covered.

#### REL-01 — Complete automated and negative regression suite

**User story:** As the product owner, I can release based on evidence from the real engine and production artifact.

**Acceptance criteria:**

- Given release CI, then typecheck, lint, unit, real-WASM browser integration, three-engine production E2E, negative/security, accessibility, performance, bundle, service-worker update, export-parser, and Pages artifact checks pass.
- Given a defect is fixed, then the smallest permanent regression test is added at the lowest layer that would have caught it; critical binary fixtures are never replaced with mocks for speed.
- Given a SQLite, Vite, React, editor, graph, worker, or service-worker dependency upgrade, then the affected real-engine, policy, cancellation, CSP/URL, keyboard, offline-update, and production-bundle suites rerun.

**Edge/failure cases:** Test retries masking races, dev-only success, missing artifacts, skipped browser engines, mock-only engine assertions, and flaky performance evidence fail the release gate.

#### REL-02 — TinyCrafts production release integration

**User story:** As a TinyCrafts visitor, I can discover and reliably launch the finished SeeQLite utility without regressions to sibling tools.

**Acceptance criteria:**

- Given the repository Pages build, when it runs on Node 24, then SeeQLite is emitted at `/seeqlite/`, required and forbidden assets are verified, and DataDuck plus the existing TinyCrafts landing build/tests remain green.
- Given the TinyCrafts catalogue, then SeeQLite has a design-consistent entry with accurate local-only/read-only/offline limitations and no unproven security or compatibility claim.
- Given Playwright WebKit passes, then a manual current Safari smoke record also covers open, inspect, query, cancel, ER list, export, and repeat offline use before release.

**Edge/failure cases:** Direct launch, refresh, stale service worker, missing MIME, root-path leakage, landing-card responsive/theme states, license notices, rollback, and release-note limitations are covered.

## Scope Exclusions

The following are explicitly outside v1 and are not implied by any requirement:

- Mutation, schema editing, migrations, save-back, or write transactions.
- Multiple open databases, attached databases, cross-database queries, remote URLs, sync, accounts, sharing, or collaboration.
- SQLCipher/decryption, arbitrary/native extensions, plugin systems, AI SQL generation, telemetry, or crash collection.
- Inferred relationships, relationship editing, diagram annotations, group documents, or shared diagrams.
- OPFS persistence of database files, automatic reopening of the previous database, full-file fingerprinting, or eager integrity scans.
- Multi-statement batches, parameter binding UI, stored query collections, or a custom JavaScript SQL parser.
- Unbounded result loading/export, server-side export, full-table browsing without a query, or a virtualization dependency before measured need.
- SharedArrayBuffer/pthreads for cancellation, a worker pool, multiple SQLite connections, or a general RPC framework.
- Tailwind, component kits, a global state library, router, backend, service-worker framework, or broad browser polyfills without a proven requirement.

## Complete Testing Strategy

### Unit

- Table-driven authorizer decisions, including every exposed action and unknown-action default deny.
- Statement-tail handling, parameter detection, identifier quoting, normalized errors, request IDs, and epoch reducers.
- Catalog normalization for ordinary, `STRICT`, `WITHOUT ROWID`, virtual/shadow, generated/hidden, expression/partial index, composite/implicit FK, self/cycle/parallel/missing parent, quoted name, and broken-object fixtures.
- Typed value DTOs, exact `BigInt`, `NULL`, BLOB/text previews, all truncation dimensions, plan-tree normalization, graph derivation, connected-subgraph limits, and join SQL.
- History entry/byte limits, corrupt/quota fallback, CSV/JSON golden encoders, object-URL lifecycle seams, cache-name filtering, and generated precache logic.

### Browser Integration

- Use the pinned official SQLite WASM inside the actual application module worker; mocks cannot prove import ownership, authorizer, limits, statement lifetime, progress timeout, value stepping, plan, or replacement.
- Cover file transfer and repeated open/close/cancel/reopen cycles with cleanup evidence.
- Run the full SQL allow/deny matrix, exact-value fixtures, worker failure/race cases, and real download parsing.

### End to End

- Serve the built artifact at `/seeqlite/` in Chromium, Firefox, and WebKit.
- Cover open, replace, inspect, search, completion, query, result paging/sort, plan, cancel, timeout, history, ER canvas/list, join generation, export, theme, responsive modes, install, update, and repeat offline use.
- Capture console output, failed requests, content types, worker/service-worker scope, CSP violations, and network privacy markers on failure.

### Negative and Security

- Files: zero-byte, wrong-header, valid unusual-extension, corrupt, encrypted-looking, truncated, WAL-mode, pending-WAL, sidecar, soft/hard limit, read failure, and OOM.
- Content: HTML/script, quotes, CR/LF, bidi/zero-width, long strings, duplicate labels, formula starters, hostile errors/plans, and filenames.
- Runtime: denied SQL classes, unknown authorizer action, worker crash, stale epoch, cancel races, missing assets/features, CSP denial, storage/cache failure, and sibling-cache isolation.
- Privacy: unique markers checked across network, URLs, console, localStorage, Cache Storage, service-worker keys, and downloads.

### Regression

- Every defect adds the smallest permanent test at the lowest responsible layer.
- Critical binary fixtures remain committed with human-readable generation notes and real-WASM coverage.
- Dependency upgrades rerun all affected production-shaped and cross-engine checks.
- No release approval may rely only on mocks, snapshots, a dev server, or one browser engine.

## Definition of Done

SeeQLite v1 is done only when all of the following are true:

1. Every requirement in this document is implemented and has linked automated or recorded manual evidence.
2. All six phase exit criteria in `ROADMAP.md` pass; no Critical/High risk lacks a prevention and recovery test.
3. The complete test strategy passes against the production artifact, including real SQLite WASM and Chromium/Firefox/WebKit; the manual current Safari smoke is recorded.
4. The source file remains byte-for-byte unchanged and database-derived data is absent from network, logs, URLs, caches, and unauthorized persistence.
5. Read-only policy is enforced by SQLite layers for every user statement and fails closed for unknown actions.
6. Measured performance, memory, catalog, result, graph, cancellation, and bundle budgets pass or the documented safe-degradation behavior activates.
7. Keyboard, screen-reader, zoom, reduced-motion, responsive, light-theme, and dark-theme checks pass for every primary workflow.
8. CSV/JSON exports are independently parsed and disclose truncation and hardening; offline install/update preserves the last complete SeeQLite shell and sibling caches.
9. The TinyCrafts Pages build emits and verifies `/seeqlite/`, the landing entry is accurate, DataDuck regression checks pass, and release limitations/licenses are published.
10. No out-of-scope feature or extra architectural dependency has been introduced without an explicit requirement/decision update.

## Traceability

| Requirement | Phase | Status |
|---|---:|---|
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 1 | Pending |
| PLAT-04 | Phase 1 | Pending |
| UX-01 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| FILE-01 | Phase 2 | Pending |
| FILE-02 | Phase 2 | Pending |
| FILE-03 | Phase 2 | Pending |
| FILE-04 | Phase 2 | Pending |
| FILE-05 | Phase 2 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 2 | Pending |
| SAFE-03 | Phase 2 | Pending |
| CAT-01 | Phase 2 | Pending |
| CAT-02 | Phase 2 | Pending |
| CAT-03 | Phase 2 | Pending |
| CAT-04 | Phase 2 | Pending |
| CAT-05 | Phase 2 | Pending |
| SQL-01 | Phase 3 | Pending |
| SQL-02 | Phase 3 | Pending |
| SQL-03 | Phase 3 | Pending |
| SQL-04 | Phase 3 | Pending |
| RES-01 | Phase 3 | Pending |
| RES-02 | Phase 3 | Pending |
| RES-03 | Phase 3 | Pending |
| PLAN-01 | Phase 3 | Pending |
| CANCEL-01 | Phase 3 | Pending |
| CANCEL-02 | Phase 3 | Pending |
| HIST-01 | Phase 3 | Pending |
| HIST-02 | Phase 3 | Pending |
| ER-01 | Phase 4 | Pending |
| ER-02 | Phase 4 | Pending |
| ER-03 | Phase 4 | Pending |
| ER-04 | Phase 4 | Pending |
| ER-05 | Phase 4 | Pending |
| EXP-01 | Phase 5 | Pending |
| EXP-02 | Phase 5 | Pending |
| EXP-03 | Phase 5 | Pending |
| OFF-01 | Phase 5 | Pending |
| OFF-02 | Phase 5 | Pending |
| OFF-03 | Phase 5 | Pending |
| SEC-01 | Phase 6 | Pending |
| SEC-02 | Phase 6 | Pending |
| PERF-01 | Phase 6 | Pending |
| A11Y-01 | Phase 6 | Pending |
| REL-01 | Phase 6 | Pending |
| REL-02 | Phase 6 | Pending |

**Coverage:** 48/48 v1 requirements mapped exactly once; no orphaned or duplicated phase assignments.

---
*Requirements created: 2026-07-15 after project research synthesis*
