# Feature Landscape: SeeQLite

**Domain:** Browser-only, local-first SQLite explorer and query workbench
**Researched:** 2026-07-15
**Mode:** Ecosystem feature analysis from completed SeeQLite stack, architecture, and pitfall research
**Overall confidence:** HIGH for v1 scope and ordering; MEDIUM for final numeric browser budgets until the walking-skeleton benchmarks are recorded

## Product Position

SeeQLite should do one job exceptionally well: let a user open one local SQLite database and safely understand its structure, relationships, and data without installing software or uploading the file.

The winning product is not a browser copy of a desktop database administration suite. It is a trustworthy inspection workspace with four tightly connected surfaces:

1. **Open** a local database and understand any limitations.
2. **Inspect** its catalog and declared relationships.
3. **Query** it through a read-only SQLite-native workflow.
4. **Take away** a bounded result as CSV or JSON.

Every v1 feature must reinforce that loop. Features that introduce mutation, remote data, durable database storage, collaboration, or generalized diagram editing dilute the privacy and simplicity advantages and are anti-features for this milestone.

## V1 Feature Contract

### Table Stakes

Missing any item in this table makes SeeQLite feel incomplete or breaks an explicit product promise.

| Capability | Why users expect it | Complexity | User-visible completion signal |
|---|---|---:|---|
| Open one local SQLite file | There is no product without a dependable entry path | High | A valid local file reaches a ready catalog without an upload or page reload |
| Honest validation and recovery | Real databases are empty, corrupt, encrypted, WAL-dependent, oddly named, or too large | High | Every rejected file gets a cautious, actionable message and the next valid open succeeds |
| Catalog explorer | Users need a quick map before writing SQL | High | Tables, views, columns, keys, indexes, types, and definitions are searchable and inspectable |
| Read-only SQL editor | Querying is the core action, and a plain textarea is below the required UX bar | High | SQLite syntax, selection-aware Run, shortcuts, completion, and precise errors work by keyboard |
| Bounded results grid | Users need useful output without freezing the tab | High | Columns and rows appear in a semantic, paginated grid with exact type and truncation states |
| Query cancellation and timeout | A browser tool must recover from accidental expensive queries | High | Cancel reacts immediately, reopens the database, preserves the draft, and permits the next query |
| Query plan | Developers inspecting performance expect SQLite's plan view | Medium | A permitted statement produces a clear `EXPLAIN QUERY PLAN` tree/list tied to the exact SQL |
| Declared-FK ER view | ER understanding is a defining SeeQLite requirement | High | Declared relationships render as a navigable graph and an equivalent structured list |
| Query history | Iteration without recovery of recent SQL is unnecessarily frustrating | Medium | Recent local queries can be reopened and cleared even after reload when storage is available |
| CSV and JSON export | Users need to move the result into another workflow | Medium | The displayed bounded result downloads in a documented, independently parseable format |
| Responsive light and dark workspace | The app must belong to TinyCrafts and remain usable across common viewports | Medium | Both themes and desktop/tablet/mobile modes support every primary workflow |
| Accessible non-canvas paths | The graph and dense workspace cannot exclude keyboard or assistive-technology users | High | Open, inspect, relate, query, plan, and export are operable without precision pointer input |
| Offline repeat use | A local-first installable utility should continue after its shell has loaded once | High | After one successful online visit, the app shell, worker, and WASM reopen offline |
| Static subpath deployment | TinyCrafts publishes tools beneath one shared origin | Medium | The production artifact works at `/seeqlite/` and does not affect sibling TinyCrafts apps |

### Product Differentiators

These are valuable because they make the table-stakes workflow unusually trustworthy or coherent. They are not invitations to broaden scope.

| Differentiator | User value | Complexity | V1 treatment |
|---|---|---:|---|
| Verifiable no-upload workflow | Users can inspect sensitive local files without trusting a server | Medium | State this plainly, use no analytics/runtime CDN, and prove no data-derived requests in E2E |
| Engine-enforced read-only mode | The app cannot accidentally become a destructive admin tool | High | Enforce inside SQLite with read-only import/open, authorizer, defensive settings, limits, and statement checks |
| Catalog-to-query continuity | Schema understanding becomes executable rather than a separate diagram exercise | Medium | Object actions quote identifiers correctly; relationship actions can generate a join draft without silently replacing existing SQL |
| Relationship truthfulness | Users can distinguish declared facts from guesses | Medium | Render declared foreign keys only; show unresolved declarations explicitly; never infer by naming convention in v1 |
| Graceful disposable-worker recovery | A stuck query does not become a stuck application | High | Cancel terminates the occupied worker, rejects the old epoch, and rehydrates from the retained `File` |
| Exact SQLite value handling | Large integers, duplicate column names, NULL, BLOBs, and empty strings remain trustworthy | High | Use positional rows and explicit typed representations from worker through grid and export |
| Honest boundedness | The app communicates what it did not load or export | Medium | Every row/cell/byte/schema threshold has visible metadata and an actionable refinement path |
| Two equivalent ER representations | The visual experience remains useful without making the canvas the sole source of truth | High | Graph and relationship list derive from the same normalized model and expose the same relationship details/actions |
| TinyCrafts workshop character | SeeQLite feels crafted rather than like a generic dashboard | Medium | Carry forward warm paper/ink/rule/blue tokens, grid texture, compact radii, Inter/JetBrains Mono, direct copy, and equal dark-theme care |
| Isolation on a shared static origin | Installing SeeQLite cannot damage DataDuck or another tool's offline state | High | Scope service worker and cache cleanup to `seeqlite-*` only and prove a seeded sibling cache survives |

## User-Visible Acceptance Signals by Capability

These signals describe feature completion from the user's perspective. Detailed engine and test invariants remain in `ARCHITECTURE.md` and `PITFALLS.md`.

### 1. Open and Replace a Database

**In v1**

- Accept one file through a standard picker and drag/drop. `.sqlite`, `.sqlite3`, and `.db` are picker hints, not proof of validity.
- Validate the file size and `SQLite format 3\0` header before starting expensive work, then let SQLite open and read the schema as the authoritative check.
- Keep the source `File` local and unchanged. Transfer bytes to the database worker; do not persist database bytes.
- Warn before the initial 256 MiB soft threshold and block before the initial 512 MiB hard threshold. These are product policies, not promises that every smaller file fits every browser.
- Explain empty input, wrong header, unreadable/corrupt/encrypted-looking input, unsupported sidecars, memory failure, and browser capability failure separately where the distinction is reliable.
- Reject `.wal`, `.shm`, and journal sidecars with guidance to open a checkpointed main database. A WAL-mode main file receives a non-blocking warning, not an unsupported-encryption claim.
- Opening a replacement creates exactly one active database generation and cannot publish catalog/results from the old generation.

**Acceptance signals**

- A normal database reaches `ready` and shows filename-safe metadata, counts, and any WAL/size warning.
- A valid SQLite database with an unusual extension can proceed after an advisory warning.
- A file with a valid extension but invalid bytes is rejected before a misleading catalog appears.
- Cancelling the picker changes nothing; failed open leaves an actionable Open control and does not require reload.
- After any failed open, a valid fixture opens and queries successfully.
- Network inspection shows no database bytes, filename, schema, query, or result-derived request.

### 2. Inspect the SQLite Catalog

**In v1**

- Search and browse main-schema tables, views, virtual/shadow objects, explicit indexes, and autoindexes; hide SQLite internals by default behind a clear toggle.
- Show exact object names and safely rendered SQL definitions.
- Show ordered columns with declared type, nullability, default, PK order, FK, uniqueness, generated/hidden state, and relevant object badges.
- Distinguish `STRICT`, `WITHOUT ROWID`, table, view, virtual, shadow, partial/expression index, and missing-definition cases.
- Load the useful catalog summary eagerly and expensive/per-object detail lazily.
- Keep the rest of the catalog usable when one object's detail cannot be read.
- Enter limited explorer mode when catalog budgets are exceeded; do not attempt an unbounded ER layout.

**Acceptance signals**

- Empty databases and databases with no declared foreign keys show informative empty states rather than errors.
- Quoted, Unicode, keyword, HTML-like, bidi-control, and very long identifiers remain inert and distinguishable.
- Generated/hidden columns and composite PK/FK order are not silently lost.
- Selecting a table supplies editor completion and object actions using its exact quoted name.
- One broken view/index produces a scoped warning while other objects remain navigable.
- Large schemas remain searchable while details and diagram subsets are loaded.

### 3. Explore Declared Relationships

**In v1**

- Build graph nodes and edges from normalized catalog data, not from parsing DDL or guessing column names.
- Treat one composite FK as one relationship with ordered column pairs.
- Support self-references, cycles, parallel relationships, implicit parent-PK references, and missing/unresolved parents.
- Offer pan, zoom, fit, table search, selection, minimap where measured useful, and one opinionated auto-layout action.
- Auto-layout the whole graph only below the measured threshold. The research baseline is 75 table-like nodes; larger schemas start with search plus a selected connected subset.
- Provide an always-available structured relationship list grouped by table.
- Generate correctly quoted join SQL from a relationship. Insert into an empty editor; otherwise confirm before replacing a dirty draft.
- Persist only small layout preferences/positions associated with a local affinity key and schema version.

**Acceptance signals**

- The graph and relationship list show the same count and the same ordered column pairs.
- Composite, cyclic, self-referencing, parallel, and missing-parent fixtures neither crash nor invent links.
- A database with no FKs explains that SeeQLite shows declared relationships only.
- Keyboard users can search a table, inspect a relation, and generate join SQL without dragging.
- PK/FK/unique/generated/hidden meaning survives removal of color and both themes meet contrast requirements.
- Layout failure leaves the complete relationship list and join action usable.

### 4. Author and Execute Read-Only SQL

**In v1**

- Use CodeMirror with SQLite syntax, accessible shortcuts, selection, undo/redo, and completion from the current catalog.
- Run the non-empty selection; otherwise submit the full draft.
- Let SQLite determine statement boundaries. Permit exactly one non-empty, parameter-free statement and reject ambiguous multi-statement input with guidance to select one statement.
- Enforce safety in the worker, not through editor keyword checks. Permit documented read-only SQLite statements and catalog operations; deny mutation, DDL, transaction controls, `ATTACH`/`DETACH`, writable/unknown PRAGMAs, and extension loading.
- Allow a single in-flight database command. Rapid Run/Plan actions cannot create concurrent statements.
- Normalize syntax, policy, limit, timeout, crash, and not-ready failures without exposing hostile HTML or internal stack traces.

**Acceptance signals**

- `SELECT`, read-only CTEs, and supported `EXPLAIN` statements work with leading comments, mixed case, and semicolons in strings/comments.
- DML/DDL, writable PRAGMAs, `ATTACH`, and extension loading return a clear read-only denial while the database stays usable.
- Empty/comment-only, parameterized, and multiple-statement submissions produce precise actions the user can take.
- Editor focus, selection, draft, and undo history behave predictably after success, error, cancel, and database replacement.
- The next `SELECT 1` succeeds after every recoverable query error.

### 5. Inspect Bounded Results

**In v1**

- Return column metadata plus positional row arrays so duplicate column labels survive.
- Preserve signed 64-bit integers exactly; distinguish `NULL`, empty string, zero, and text `"NULL"`; represent BLOB and oversized text with explicit byte length/preview/truncation metadata.
- Start with central limits of 1,000 rows, 250 columns, 50,000 total cells, 8 MiB serialized result data, 64 KiB text preview, and 256-byte BLOB preview. Phase benchmarks may tighten these values; increases require a recorded decision and regression evidence.
- Show at most one 50-row semantic table page at a time with sticky headers, numeric alignment, contained horizontal scroll, cell detail, and keyboard navigation.
- Sort only the bounded returned rows and label the scope. Do not imply a database-level `ORDER BY`.
- Preserve column headers for zero-row results and finalize statements on every exit path.

**Acceptance signals**

- The user sees elapsed time, returned row count, current page, and exact truncation reason.
- Duplicate headings retain both values; min/max 64-bit integers display without precision loss.
- A large text/BLOB value does not transfer or render in full and does not prevent later queries.
- A max-width result never renders more than the configured page's cells at once.
- Sorting and paging keep the original bounded result available and remain responsive in supported engines.
- A zero-row query still displays columns and can be exported.

### 6. Inspect the Query Plan

**In v1**

- Run `EXPLAIN QUERY PLAN` only after the captured SQL passes the same one-statement, parameter, read-only, authorizer, and runtime-limit checks as execution.
- Show SQLite's plan as an accessible tree/list using its IDs and parent relationships.
- Treat detail prose as SQLite-owned and version-unstable; do not build correctness-critical parsing or cost estimates around it.
- Tie the plan to a snapshot of SQL and clear or mark it stale when the draft/database changes.

**Acceptance signals**

- A supported `SELECT`/CTE shows a plan without executing an unsafe second statement.
- Syntax, policy, and unsupported-input errors leave the prior query result intact and tell the user why no plan is available.
- A late plan response from an older database/query generation cannot replace the current plan.
- The plan is understandable by keyboard and screen reader without depending on indentation/color alone.

### 7. Cancel or Time Out Work

**In v1**

- A visible Cancel action appears only while a query is active.
- User cancellation terminates the occupied database worker rather than posting an unprocessable message behind synchronous SQLite work.
- The client rejects the active request, advances the worker epoch, rereads the retained `File`, reopens the database, and restores catalog state.
- A worker-local progress handler enforces the automatic deadline and returns a distinct timeout outcome.
- Preserve editor draft/selection, theme, catalog selection, diagram UI state, and query history. Clear any partial result/plan from the cancelled generation.
- Do not retry crash/OOM/reopen failures indefinitely; offer one explicit Reopen action.

**Acceptance signals**

- Cancel changes UI state and terminates the active worker within 250 ms in the supported browser tests; reopening time is displayed/measured separately.
- No row, plan, success message, or successful-history status can appear after cancellation.
- Repeated Cancel/Reopen cycles do not accumulate workers/listeners and the next small query succeeds.
- Cancel-at-completion, double cancel, new-file-during-cancel, and stale-response races resolve to one coherent current state.
- Timeout and user cancel have distinct copy and both leave the draft recoverable.

### 8. Reuse Local Query History

**In v1**

- Store at most 100 versioned entries and enforce a total serialized byte budget.
- Store bounded SQL plus timestamp, duration, and status; associate optionally with a cheap opaque local affinity value.
- Never store result rows, schema definitions, database bytes, BLOB previews, worker diagnostics, file paths, or raw filenames.
- Allow reopen, individual delete, and Clear all.
- If local storage is disabled, corrupt, or full, fall back to session memory and show a non-blocking notice.

**Acceptance signals**

- A user can rerun or edit a recent query after a normal reload when storage is available.
- Entry 101 evicts according to the documented policy and the byte cap cannot be bypassed by one huge SQL draft.
- Failed/cancelled/timed-out entries are distinguishable from successful ones without persisting result data.
- Storage denial never prevents opening a database or running SQL.
- Clear all removes both persisted and current-session history.

### 9. Export the Displayed Result

**In v1**

- Export exactly the bounded result currently held by the app; never silently rerun an unbounded query.
- Before download, state the displayed row count and whether rows/cells were truncated.
- CSV uses deterministic RFC 4180 quoting/CRLF, explicit NULL behavior, and one documented spreadsheet-hardening transformation for formula-like cells. The UI must disclose transformation and must not claim universal spreadsheet safety.
- JSON uses a top-level positional `{ columns, rows, metadata }` representation so duplicate names survive. Tag out-of-safe-range integers, BLOBs, and truncation states explicitly.
- Give exact-data users JSON when CSV hardening would change leading cell content.
- Revoke object URLs and keep the result available after success or failure.

**Acceptance signals**

- Independent parsers consume CSV and JSON fixtures containing commas, quotes, CR/LF, Unicode, duplicate names, NULL, BigInt, BLOB metadata, and formula-like values.
- Zero-row CSV contains headers; zero-row JSON contains columns and an empty row list.
- Export filename and content cannot execute or inject database-derived HTML.
- Repeat exports do not retain old Blob URLs or duplicate downloads from one click.
- Truncated exports cannot be mistaken for complete query results.

### 10. Install and Reopen Offline

**In v1**

- Provide a manifest and a small scoped service worker that precaches only the built app shell: HTML, hashed JS/CSS, fonts, icons, database/layout workers, and SQLite WASM.
- Generate the required asset list from the production artifact and fail an incomplete new service-worker install rather than replacing the prior working shell.
- Use `seeqlite-*` cache names and delete only older caches with that prefix.
- Keep database files, result rows, query-derived requests, object URLs, and exports out of Cache Storage.
- Continue online if service-worker registration/storage fails. Offline means repeat app-shell use after a successful visit; it does not mean a previously selected database reopens automatically.

**Acceptance signals**

- A first visit without network explains that the app has not been cached; one successful online visit enables a complete offline shell reload.
- Offline reload reaches the file picker and can open a newly selected local database.
- A seeded `dataduck-*` cache survives SeeQLite install, activation, update, and reset.
- A missing worker/WASM asset prevents a broken update from replacing the previous offline-capable version.
- Service-worker control and asset requests stay under `/seeqlite/` with no root-path 404s.

## Anti-Features and Explicit Non-Goals

| Anti-feature | Why it is harmful in v1 | What SeeQLite does instead | Revisit only if |
|---|---|---|---|
| Database mutation or save-back | Adds corruption, conflict, recovery, transaction, and permission risk | Read-only engine policy and disposable snapshot | A separate validated editing product is requested |
| Multiple open databases or `ATTACH` | Multiplies memory/state ambiguity and weakens authorization | One database and one serialized worker queue | Cross-database comparison becomes a proven core job |
| Remote URL/database connection | Breaks local-only trust and requires CORS/auth/backend semantics | Local picker/drop only | A distinct connected product is justified |
| Accounts, sync, share links, collaboration | Adds backend, privacy, moderation, and identity scope | Local preferences/history only | Multi-user work becomes the product rather than an add-on |
| OPFS database persistence | Adds isolation headers, locking, quota, stale-copy, and cleanup concerns | Retain the `File` only for the current session | Repeated reopen is measured as the dominant pain after v1 |
| File System Access as a requirement | Excludes Firefox/Safari baselines and implies write permission | Portable file input/drop; optional enhancement later | Cross-engine support and a read-only handle flow are proven |
| SQLCipher/decryption | Official SQLite WASM is not a SQLCipher product and key handling is security-sensitive | Cautious unsupported/unreadable guidance | A vetted, separately scoped encrypted engine exists |
| Native/arbitrary extension loading | Incompatible with browser safety and expands code execution | Use compiled-in SQLite capabilities only | A reviewed static extension is essential to a validated use case |
| Relationship inference | Guesses can be mistaken for schema truth | Declared FKs plus explicit unresolved relationships | Inference is separately labeled, opt-in, and evidence-backed |
| Editable ER diagrams, notes, or image documents | Turns a database viewer into a diagram authoring platform | Read-only canvas, list, layout, and join generation | Diagram creation becomes a standalone TinyCrafts tool |
| AI SQL generation/explanation | Adds network/privacy, correctness, and product-scope risk | Catalog completion, examples, and transparent SQLite errors | A local/private solution proves material user value |
| Multi-statement scripts or parameter sessions | Adds transaction/state/output ambiguity | Execute exactly one selected or full statement; reject parameters | A script runner becomes a validated primary workflow |
| Full/unbounded result loading or export | Can exhaust the tab and makes cancel/recovery harder | Bounded result with honest truncation and displayed-result export | Streaming is needed and can remain bounded end-to-end |
| Enterprise/virtualized grid | Large dependency and interaction complexity are unnecessary under the cap | Semantic table with 50-row pages | Measured supported results cannot remain responsive |
| General SQL parser as security layer | Risks dialect disagreement and duplicated SQLite behavior | SQLite prepare/tail, authorizer, read-only checks, and limits | A non-security editor feature truly needs a parser |
| Shared-memory/pthread cancellation | Requires headers/complexity unavailable on TinyCrafts Pages | Terminate and rehydrate the one database worker | Measured reopen cost makes the simple strategy unusable |
| General worker pool/RPC framework | More concurrency and abstraction than one database needs | One typed protocol and one serialized database worker | Multiple independent engine workloads become necessary |
| Analytics or remote crash reporting | Can leak query/schema/file-derived secrets and weakens the no-upload story | Local development diagnostics without values | A privacy-reviewed telemetry design is explicitly approved |
| Runtime CDNs or remote fonts | Introduces network dependency, privacy leakage, and CSP expansion | Bundle/self-host all runtime assets | Never for the v1 local-first promise |
| Customizable layout-engine settings | UI complexity without improving the core job | One good Arrange action plus manual positions | Research shows a concrete schema class the default cannot serve |

## Feature Dependencies

```text
Production-shaped shell and browser capability gate
  -> app-owned SQLite worker and transferred-file lifecycle
     -> engine-level read-only policy and runtime limits
        -> normalized catalog
           -> catalog explorer
           -> editor completion
           -> declared-FK graph model
              -> relationship list
              -> layout worker and ER canvas
              -> quoted join SQL generation

Worker request IDs and epochs
  -> single-statement query execution
     -> typed bounded result model
        -> paginated result grid
        -> bounded client-side sorting
        -> CSV/JSON export
     -> query-plan command
     -> history status metadata
  -> terminate-and-rehydrate cancellation

Built asset manifest and stable worker/WASM URLs
  -> scoped service-worker precache
     -> offline repeat use
     -> safe update and sibling-cache isolation

All core flows and fixed limits
  -> security/privacy/accessibility/performance browser matrix
     -> TinyCrafts catalogue integration and release
```

### Ordering Rules

1. **Prove the production topology before feature breadth.** The real worker, WASM, relative asset path, CSP, and three-browser smoke path are release-blocking unknowns.
2. **Make file and SQL safety foundational.** Catalog, query, plan, and ER work must consume one safe worker contract rather than each inventing database access.
3. **Normalize SQLite metadata once.** Explorer, completion, ER, and join generation must not interpret raw PRAGMA rows separately.
4. **Define the result type before grid or export.** Positional rows, BigInt, NULL, BLOB, duplicate-name, and truncation semantics are shared product contracts.
5. **Build cancel around worker lifecycle from the start.** It cannot be added later as a normal message without changing the execution model.
6. **Ship the relationship list with the graph model.** Accessibility is not a later canvas patch.
7. **Add offline only after production assets stabilize.** Otherwise the service worker amplifies worker/WASM cache mismatch defects.
8. **Ratchet measured budgets during hardening.** Do not relax safety limits to make tests pass without a decision record.

## MVP Recommendation

Use six vertical phases. Each phase should finish with real-browser evidence and recoverable failure paths, not only component markup.

1. **Walking skeleton and browser harness**
   - TinyCrafts shell in light/dark themes, supported-browser gate, real local fixture, module worker/WASM, one bounded `SELECT`, production `/seeqlite/` smoke tests.
2. **Safe database lifecycle and catalog**
   - File validation/replace/close, read-only policy, limits, cautious errors, complete normalized catalog, explorer, malicious/weird fixtures.
3. **Query workspace**
   - CodeMirror, one-statement execution, positional bounded results, pagination/sort, query plan, cancel/rehydrate, timeout, bounded local history.
4. **ER understanding**
   - Declared-FK graph model, relationship list, layout worker/canvas, large-schema subset behavior, accessible quoted join generation.
5. **Takeaway and offline**
   - Bounded CSV/JSON export, generated shell precache, safe update behavior, sibling cache isolation, installability.
6. **Release hardening and TinyCrafts integration**
   - Security/privacy audit, malicious/negative matrix, performance ratchets, accessibility/manual browser checks, Pages build verification, landing catalogue entry.

### Why this is the minimum credible v1

- Omitting ER removes the product's defining understanding workflow.
- Omitting cancellation makes a browser query tool fragile in ordinary use.
- Omitting plan/history/export makes query iteration feel like a demo rather than a practical workbench.
- Omitting offline and TinyCrafts integration breaks the stated delivery model.
- Adding mutation, persistence, remote features, AI, or multiple databases does not improve the core open-understand-query loop enough to justify its risk.

## Feature Completeness Standard

A feature is not complete merely because its happy path renders. Its implementation task must include all of the following applicable signals:

1. **Success:** The primary user action produces the expected visible state.
2. **Failure:** Invalid, unsupported, hostile, over-budget, and unavailable conditions have specific outcomes.
3. **Recovery:** A subsequent valid open/query/action works without a page reload unless the runtime itself is unsupported.
4. **Privacy:** No database-derived data crosses the network or enters an unapproved persistent store/cache/log.
5. **Safety:** SQLite, worker, memory, and export limits are enforced at the owning boundary rather than only hidden in UI controls.
6. **Accessibility:** The action is keyboard-operable with named controls, logical focus, semantic status, and a non-canvas equivalent where required.
7. **Responsive design:** The action works at the agreed narrow, tablet, and desktop layouts in both light and dark themes.
8. **Browser evidence:** Engine-facing behavior runs against the real production SQLite WASM/module worker in Chromium, Firefox, and WebKit.
9. **Regression evidence:** Each fixed failure mode has the smallest permanent test that would have caught it.

## Roadmap Risks That Must Stay Visible

| Feature area | Release-blocking risk | Roadmap response |
|---|---|---|
| Open | Exact transient read-only import and WAL behavior of the pinned official package | Complete the binding/import spike before catalog breadth |
| Query | Authorizer/action mapping and automatic reprepare must fail closed | Real-WASM authorization matrix in the safe-database phase |
| Results | Browser memory is affected by files, values, columns, cells, and cloning—not rows alone | Central budgets plus 64/128/256 MiB and hostile-value fixtures |
| Cancel | Same-worker messages cannot interrupt synchronous SQLite | Terminate/epoch/rehydrate architecture and race suite |
| ER | Large graph layout and DOM rendering can block the main thread | Threshold/subset UX, layout worker, measured 25/75/150/500-table fixtures |
| Export | CSV may transform data and cannot promise universal spreadsheet safety | Disclose hardening, offer typed JSON, parse golden downloads independently |
| Offline | Cache Storage is shared across the TinyCrafts origin | Prefix-only deletion and seeded DataDuck cache survival test |
| Accessibility | React Flow cannot be the only relationship interface | Build the structured list from the same graph model in the same phase |
| Deployment | Dev-server behavior can hide subpath/MIME/CSP/worker defects | Test the exact `.pages-build/seeqlite/` artifact and deployed URL |

## Sources Used

No additional browsing was performed for this feature analysis. It synthesizes the already gathered and source-grounded evidence in:

- `.planning/PROJECT.md` — product boundary, core value, TinyCrafts design and delivery constraints.
- `.planning/research/STACK.md` — official SQLite worker choice, UI dependencies, static deployment, and implementation spikes.
- `.planning/research/ARCHITECTURE.md` — worker/catalog/result/graph boundaries, lifecycle, recovery, and phase implications.
- `.planning/research/PITFALLS.md` — security, memory, SQLite edge cases, accessibility, service-worker isolation, and complete negative-test matrix.
- Local DataDuck and TinyCrafts evidence referenced by those reports.
- Official SQLite, Vite, browser, accessibility, and CSV-safety sources cited in those reports.

## Confidence and Open Decisions

| Area | Confidence | Remaining decision |
|---|---|---|
| V1 feature boundary | HIGH | None; defer any new product category until after v1 evidence |
| Capability dependency order | HIGH | Phase planners may split tasks but should not reverse the safety/data-contract dependencies |
| Open/catalog/query/ER behavior | HIGH | Exact package calls and error mapping require the planned implementation spikes |
| Initial numeric budgets | MEDIUM | Benchmark and record final thresholds; do not remove the boundedness requirements |
| CSV transformation copy | MEDIUM | Choose one tested, disclosed spreadsheet-hardening rule before export implementation |
| Graph auto-layout threshold | MEDIUM | Start at 75 nodes and lock the released value from browser measurements |

The research supports a practical, differentiated v1 without a backend or platform layer. SeeQLite becomes “better” than a generic SQLite viewer through truthful local-only operation, a coherent catalog-to-ER-to-query flow, excellent failure recovery, and TinyCrafts-level interface craft—not through feature count.
