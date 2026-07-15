# SeeQLite Pitfalls and Failure Modes

**Project:** SeeQLite
**Domain:** Browser-only, local-first, read-only SQLite exploration
**Researched:** 2026-07-15
**Overall confidence:** HIGH for SQLite and browser constraints; MEDIUM for exact production budgets until the first vertical slice is measured

## Executive Verdict

SeeQLite is feasible as a static browser application, but its trust promise depends on several controls working together. Opening a copied file in WebAssembly does protect the original OS file, yet that alone does not make user SQL read-only, bound memory, stop a synchronous query, preserve 64-bit values, or prevent a service worker from disrupting another TinyCrafts app.

The highest-risk implementation mistakes are:

1. Treating `PRAGMA query_only` or SQL keyword matching as a complete read-only sandbox.
2. Sending a cancel message to a worker that cannot process it while SQLite is blocked in synchronous execution.
3. Limiting rows while allowing a single huge BLOB, generated value, SQL statement, or wide result to exhaust memory.
4. Treating a filename extension or valid header as proof that a database is complete, unencrypted, and uncorrupted.
5. Converting results to objects, which loses duplicate column names and complicates exact JSON export.
6. Rendering every table and relationship in a large schema or every cell in a wide result.
7. Copying DataDuck's service-worker cache cleanup literally. Cache Storage is origin-wide, so deleting every cache except SeeQLite's current cache could delete DataDuck or another TinyCrafts product's offline cache.
8. Claiming stronger privacy, clickjacking, offline, or CSV safety guarantees than the deployed artifact actually proves.

The simplest safe design is one dedicated SQLite worker, one open database, a small typed request queue, SQLite's own authorizer and parser, hard runtime and presentation limits, worker termination for user cancellation, and bounded paginated HTML results. Do not add a backend, worker pool, SQL parser, shared-memory cancellation, OPFS database persistence, or a virtualized grid until measured evidence requires one.

## Risk Scale

| Severity | Meaning |
|---|---|
| Critical | Breaks the core no-upload or read-only promise, corrupts another TinyCrafts app, or can repeatedly crash/freeze the tab |
| High | Makes a primary workflow incorrect, inaccessible, or unrecoverable |
| Medium | Causes misleading output or degraded UX with a practical workaround |
| Low | Cosmetic or rare interoperability defect that does not alter data or claims |

| Likelihood | Meaning |
|---|---|
| High | Expected in normal developer databases or ordinary use |
| Medium | Common in real projects, but not every database |
| Low | Requires a deliberately hostile, unusually large, or uncommon input |

## Prioritized Risk Register

| ID | Pitfall | Severity | Likelihood | Primary phase |
|---|---|---:|---:|---|
| PF-01 | Read-only policy is bypassed by DML, DDL, `PRAGMA`, `ATTACH`, or extension loading | Critical | High | Safe database and catalog |
| PF-02 | Cancel is queued behind the query and never executes | Critical | High | Query workspace |
| PF-03 | File, statement, cell, BLOB, or result width exhausts browser/WASM memory | Critical | Medium | Safe database and query workspace |
| PF-04 | WAL-dependent, corrupt, truncated, encrypted, or non-SQLite input is misclassified | High | High | Safe database and catalog |
| PF-05 | Malicious schema names or values reach an HTML/script sink | Critical | Medium | Walking skeleton and release hardening |
| PF-06 | Catalog or ER model silently omits SQLite schema features | High | High | Safe database and ER diagram |
| PF-07 | Duplicate result names, `BigInt`, BLOBs, `NULL`, or dynamic types are changed or lost | High | High | Query workspace and export |
| PF-08 | Large schema/layout or wide result blocks the main thread | High | Medium | ER diagram and query workspace |
| PF-09 | CSV formula injection or misleading/truncated export harms downstream users | High | Medium | Export and offline |
| PF-10 | History or logging persists database-derived secrets | High | Medium | Query workspace and release hardening |
| PF-11 | Service-worker update, scope, or cache cleanup breaks SeeQLite or another TinyCrafts app | Critical | Medium | Export and offline |
| PF-12 | CSP, worker, WASM, or static subpath behavior differs in production | High | Medium | Walking skeleton and release hardening |
| PF-13 | Canvas-first ER interaction excludes keyboard or screen-reader users | High | High | ER diagram |
| PF-14 | Mock-heavy tests pass while actual SQLite WASM/browser behavior fails | High | High | Every phase |

## Detailed Pitfalls

### PF-01: Read-only is a layered policy, not a query prefix

**Failure mode**

- A filter allows strings starting with `SELECT` but misses comments, multiple statements, writable `PRAGMA`s, `ATTACH`, `VACUUM`, DML with `RETURNING`, or future SQLite syntax.
- `PRAGMA query_only=ON` is treated as complete. SQLite documents that it prevents common data changes but does not make the connection truly read-only and still permits operations such as checkpointing and `COMMIT`.
- A read-only-looking view or virtual table invokes functionality that was not intended to be exposed.
- An authorizer is installed only for prepare and removed before step. SQLite may reprepare a statement during `sqlite3_step()`, so the policy must remain installed for the connection lifetime.
- Internal catalog code interpolates a hostile identifier into a `PRAGMA` or SQL string.

**Prevention**

1. Open the imported snapshot with SQLite read-only flags where the WASM VFS permits them. The source `File` is never writable, but the transient VFS copy should still be opened read-only to keep application state honest.
2. Install one connection-lifetime `sqlite3_set_authorizer()` policy that defaults to deny. Allow reads, `SELECT`, functions on an explicit policy, and the minimum operations SQLite needs for read execution. Deny all DML and DDL actions, transaction control not required by v1, `ATTACH`/`DETACH`, schema writes, writable `PRAGMA`s, and extension loading.
3. Enable `SQLITE_DBCONFIG_DEFENSIVE`, disable trusted schema where compatible, keep load-extension APIs disabled, and set `PRAGMA query_only=ON` as defense in depth rather than the policy boundary.
4. Use table-valued PRAGMA functions with bound parameters for catalog reads when available. If a direct `PRAGMA` is required, use a fixed allowlist and a tested identifier-quoting helper.
5. Prepare exactly one statement and inspect SQLite's unconsumed tail. Reject a second non-comment statement. Do not split on semicolons, which can occur in strings and comments.
6. Keep application/catalog statements separate from user statements in the worker protocol so policy exceptions cannot accidentally apply to user SQL.

**Detection**

- Unit-test the complete authorizer action-code decision table with unknown codes denied.
- Integration-test blocked statements against the real SQLite WASM build, not a keyword mock.
- Hash the input fixture before and after a hostile-query suite and verify the browser-held source bytes are unchanged.
- Expose a typed `READ_ONLY_VIOLATION` error and assert that denied SQL never produces history or result state.

**Recovery**

- A denied statement leaves the existing database, editor, previous result, and catalog usable.
- If SQLite reports an unexpected connection state after a denied operation, terminate the worker and rehydrate from the retained `File`; do not retry the statement.

**Acceptance criteria**

- `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `CREATE`, `ALTER`, `DROP`, `VACUUM`, `REINDEX`, writable `PRAGMA`s, `ATTACH`, `DETACH`, and `load_extension()` are denied by the engine policy.
- Leading comments, unusual whitespace, mixed case, CTEs, DML with `RETURNING`, and multi-statement input do not bypass the policy.
- Semicolons inside string literals or comments do not cause a valid single statement to be rejected.
- The authorizer remains active during prepare, step, query-plan generation, and any automatic reprepare.
- Unknown authorizer actions fail closed and produce a user-facing read-only error.
- Read-only catalog PRAGMA functions continue to work under the policy.

**Required tests**

- Unit: authorizer matrix, statement-tail detection, identifier/literal quoting.
- Browser integration: real WASM executions for every denied class and allowed `SELECT`, `WITH ... SELECT`, `EXPLAIN`, and `EXPLAIN QUERY PLAN`.
- Negative: comment-obfuscated SQL, `PRAGMA writable_schema`, `PRAGMA journal_mode`, `SELECT load_extension(...)`, multiple statements, and parameter-like tokens.

### PF-02: A worker message cannot cancel synchronous work already occupying that worker

**Failure mode**

SQLite's synchronous `prepare`/`step` loop occupies the worker event loop. A normal `postMessage({type: 'cancel'})` waits behind the query, so it cannot call `sqlite3_interrupt()` until the work has already finished. Upstream's deprecated Worker1 documentation explicitly identifies queued-message limitations. `sqlite3_interrupt()` is safe from another native thread, but the main browser thread does not own or safely access the worker's database pointer.

**Prevention**

1. Implement user cancellation by terminating the dedicated worker immediately.
2. Retain the original browser `File` in main-thread session state, start a fresh worker, reopen the database, and restore catalog state. Preserve editor text and prior history, but clear the in-flight result.
3. Give every worker instance an epoch and every request an ID. Ignore all responses from an old epoch, including late errors and progress events.
4. Implement an automatic wall-clock timeout inside SQLite's progress handler. The progress callback can compare `performance.now()` against a deadline and return non-zero, which SQLite documents as interrupting the operation. This handles runaway queries without a main-thread message.
5. Keep one in-flight database operation. Disable or explicitly queue Run and Plan while a request is active.

**Detection**

- Run an intentionally expensive recursive CTE or large cross join against real WASM.
- Measure button-to-worker-termination separately from database rehydration.
- Assert that old-epoch messages cannot replace a newer result.

**Recovery**

- The UI enters `cancelling`, then `reopening`, then `ready` or `reopen_failed`.
- A failed reopen keeps the SQL text and gives a single explicit Reopen action. It must not loop automatically.
- Cancellation does not add a successful history entry or leave Run permanently disabled.

**Acceptance criteria**

- Clicking Cancel changes the UI state and terminates the active worker within 250 ms on the supported test browsers.
- The query cannot later publish rows, a plan, or a success toast after cancellation.
- A 25 MiB reference fixture is usable again within the measured rehydration budget established by the first vertical-slice benchmark; larger files show progress and are not held to the small-fixture budget.
- Automatic timeout returns a distinct `QUERY_TIMEOUT` error without requiring a queued cancel message.
- Editor contents, theme, catalog selection, and query history survive worker replacement.
- Repeated cancel/reopen cycles do not grow active worker count or event listeners.

**Required tests**

- Integration: progress-handler deadline returns `SQLITE_INTERRUPT`.
- E2E: cancel an expensive query in Chromium, Firefox, and WebKit, then immediately run `SELECT 1`.
- Race: cancel at completion, double cancel, open a new file during cancellation, and receive a stale response from an old worker epoch.

**Implementation spike**

Confirm the exact official WASM C-API bindings for `sqlite3_progress_handler()` and connection teardown in the selected package version before Phase 3 planning. Do not adopt SharedArrayBuffer or pthread cancellation unless this bounded approach fails measured tests.

### PF-03: Row caps do not bound memory

**Failure mode**

- A 512 MiB file is copied into a WASM VFS while another buffer copy and SQLite page cache are live.
- `LIMIT 1000` still returns 1000 very large text/BLOB cells or 2000 columns.
- A query creates a huge value, such as `randomblob(...)`, before the result layer can truncate it.
- A very long statement, deep expression, pathological `LIKE`, or huge compound `SELECT` consumes parser/VM resources.
- Converting each row to an object duplicates column names and data, then structured cloning duplicates them again across the worker boundary.
- A single 1000 by 200 result creates 200,000 values and, if rendered at once, 200,000 table cells.

**Prevention**

1. Enforce a soft file warning at 256 MiB and a hard v1 block at 512 MiB before `arrayBuffer()` or worker transfer. These are product limits, not claims about SQLite's theoretical capacity.
2. Transfer the import `ArrayBuffer` to the worker instead of cloning it. Retain the `File`, not a second main-thread byte array, for cancellation recovery.
3. Lower per-connection SQLite runtime limits with `sqlite3_limit()` after a Phase 2 spike. Initial targets should cover useful inspection while rejecting abuse: SQL text, value/BLOB length, output columns, expression depth, compound terms, pattern length, host parameter number, and attached database count.
4. Read result rows positionally. Check `sqlite3_column_bytes()` before copying text/BLOB data. Represent oversized BLOBs and cells with typed metadata rather than copying the payload.
5. Bound all of: rows, columns, total cells, per-cell display bytes, total serialized result bytes, and elapsed time. A practical initial policy is 1000 rows, 200 columns, 50,000 total cells, and a small per-cell preview. Exact byte caps must be fixed by the vertical-slice benchmark.
6. Render one page, initially 50 rows, in a semantic HTML table. Sorting applies only to the bounded in-memory result.
7. Finalize statements on success, error, truncation, timeout, and cancellation.

**Detection**

- Instrument worker request duration, returned row/column/cell counts, and truncation reason locally in dev only. Do not log values.
- Run heap and responsiveness checks with large text, BLOB, wide-table, and recursive-query fixtures.
- Add a bundle check and a deterministic performance suite, then ratchet budgets from a measured baseline rather than inventing them.

**Recovery**

- File above the hard cap is rejected before allocation, with guidance to create a smaller copy.
- Result-limit and value-limit errors leave the worker usable.
- WASM out-of-memory or worker crash triggers the same one-time rehydrate path as cancellation and reports the cause without automatic retry loops.

**Acceptance criteria**

- A synthetic file above 512 MiB is rejected before `arrayBuffer()`, WASM initialization, or worker creation for that file.
- A file above 256 MiB requires explicit confirmation and explains browser memory risk.
- No response exceeds configured row, column, total-cell, per-cell, or total-result-byte caps.
- A large BLOB is represented by type, byte length, and truncation state without transferring the full BLOB to the main thread.
- A 200-column result never renders more than the configured page's cells at once.
- A deliberately oversized SQL statement, expression tree, `LIKE` pattern, or generated value fails with a specific limit error and the next small query succeeds.
- All prepared statements are finalized in automated success and failure-path tests.

### PF-04: A database file is more than its extension and first 16 bytes

**Failure mode**

- An arbitrary file has a `.db` extension.
- A file begins with `SQLite format 3\0` but is truncated or has corrupt pages.
- A zero-byte newly created database is described as corrupt even though it is better explained as having no readable schema.
- A SQLCipher or other encrypted file is mislabeled as corrupt, or a corrupt file is confidently mislabeled as encrypted.
- A WAL-mode main file is opened without committed frames that exist only in `-wal`, so the displayed state is stale or incomplete.
- The app blocks every database whose header reports WAL mode even though a clean, fully checkpointed WAL-mode main file is readable by itself.

SQLite documents that a hot journal or WAL is part of database state and cannot be ignored. It also documents that an active WAL database is normally represented by the main file, `-wal`, and `-shm`. Header version 2 only indicates WAL journaling mode; it does not prove that uncheckpointed frames are currently missing.

**Prevention**

1. Treat extension as a picker hint. Validate size and the SQLite 3 magic header, then let SQLite open and minimally query the schema.
2. Distinguish errors the app can know: empty file, wrong header, too large, SQLite open error, schema-read error, and unsupported sidecar. Use cautious copy such as "not a readable SQLite 3 database; it may be encrypted, incomplete, or corrupt."
3. Do not run `integrity_check` or `quick_check` automatically. They can scan large databases and are unnecessary for the core open workflow.
4. If the header reports WAL mode, show a non-blocking notice: current data may require a checkpointed copy if the source application still has a `-wal` file. Do not claim that data is missing when the app cannot observe sibling files.
5. Reject dropped `.db-wal`, `.wal`, `.shm`, and journal files in v1 with instructions to close/checkpoint the source application and open the main database file.
6. Close and dispose the prior database only after the new file passes initial validation and the user confirms replacement, or preserve a clear fallback state if product design intentionally closes first.

**Detection**

- Fixture matrix: normal rollback-mode DB, clean WAL-mode DB, pending-WAL DB with known newer row, zero-byte file, header-only/truncated file, corrupt schema page, random/encrypted-looking bytes, wrong extension with valid header, and sidecar files.
- Verify all failures release the transferred buffer, statement, DB handle, and worker state.

**Recovery**

- A failed open returns to an actionable file picker and does not poison the next open.
- If the prior database is retained until validation, it remains usable after failure. If not retained for memory reasons, editor text remains and the UI is explicit that no database is open.

**Acceptance criteria**

- Valid SQLite content with an unusual extension can be opened after a warning; a `.db` with an invalid header is rejected.
- Zero-byte input gets an explicit empty-file message.
- Header-valid corrupt input fails cleanly during schema access and can be followed by a successful open without page reload.
- The UI never claims certainty that an unreadable file is encrypted versus corrupt.
- A WAL-mode main file is not blocked solely because header bytes 18/19 are `2`.
- WAL/shm/journal sidecars are rejected with checkpoint/export guidance.
- Opening a pending-WAL fixture documents and tests the v1 limitation that only checkpointed main-file content is supported.

### PF-05: Names, SQL definitions, errors, and cell values are untrusted UI data

**Failure mode**

- A table is named `<img src=x onerror=...>`, a cell contains HTML, or a SQL error echoes hostile text into `innerHTML`.
- A graph library label, tooltip, copied join query, ARIA label, download filename, or toast bypasses the normal React escaping path.
- Bidirectional control characters, newlines, zero-width characters, or enormous names make the UI misleading or unusable.
- A dependency creates a worker from a `data:` or cross-origin URL that is not compatible with the intended CSP.

**Prevention**

1. Render untrusted values as React text or DOM `textContent`. Do not use `dangerouslySetInnerHTML` for schema, SQL, errors, or results.
2. Centralize identifier quoting for generated SQL. UI escaping and SQL quoting are separate operations.
3. Bound visible label and error length, preserve the full value only in a controlled detail view, and visibly escape control characters where ambiguity matters.
4. Use same-origin built worker and WASM URLs. Set CSP with `script-src 'self' 'wasm-unsafe-eval'` only if the production build requires it, `worker-src 'self'`, `connect-src 'self'`, `object-src 'none'`, and restrictive base/form directives. Do not use the broader `'unsafe-eval'` merely to make WASM work.
5. Self-host fonts and icons. No third-party analytics or runtime assets.

**Detection**

- Maintain a malicious-schema fixture containing HTML-like identifiers, quotes, bidi controls, very long names, NUL-like display cases, and formula-like values.
- Run DOM-XSS tests that fail on executable nodes/attributes, not just string snapshots.
- Inspect the production asset graph and network log for cross-origin scripts, workers, fonts, and requests.

**Recovery**

- A single unrenderable label becomes a safely escaped/truncated label; it must not prevent the rest of the catalog or result from rendering.
- A CSP failure shows a runtime compatibility error rather than a blank screen.

**Acceptance criteria**

- Malicious identifiers and cells appear as inert text in the explorer, ER nodes, table headers, results, tooltips, errors, copy actions, and exports.
- Generated SQL correctly round-trips identifiers containing quotes, spaces, keywords, Unicode, and newlines.
- No production code path uses raw HTML for database-derived values.
- Production CSP permits the built SQLite WASM and module worker but blocks `data:` workers and unapproved cross-origin scripts.
- Runtime network inspection after the initial app load shows no database-, schema-, SQL-, or result-derived requests.

### PF-06: SQLite catalogs contain features a simple `sqlite_schema` query misses

**Failure mode**

- `PRAGMA table_info` omits generated and hidden virtual-table columns. SQLite documents that `table_xinfo` includes them.
- The UI treats virtual or shadow tables as ordinary tables, misses STRICT or WITHOUT ROWID, or assumes every table has `rowid`.
- Composite PK/FK membership and sequence are flattened into unrelated single-column links.
- A foreign key omits parent column names because it references the parent primary key implicitly.
- Views reference missing objects; `sqlite_schema.sql` is `NULL`; autoindexes have no ordinary SQL definition; malformed legacy schemas contain surprising metadata.
- Self-references, cycles, multiple edges between the same tables, or referenced-but-missing tables break ER layout.
- Index expressions and partial indexes are represented as simple column lists.

**Prevention**

1. Build the catalog from `sqlite_schema` plus table-valued `pragma_table_list`, `pragma_table_xinfo`, `pragma_foreign_key_list`, `pragma_index_list`, and `pragma_index_xinfo` where supported.
2. Treat returned PRAGMA columns as a versioned input. Upstream documents that future versions may add columns. Select named fields and ignore unknown fields.
3. Model identifiers and result columns positionally, not as object keys.
4. Preserve foreign-key `id` and `seq` so one composite constraint becomes one ordered relationship.
5. Resolve implicit parent columns against the parent PK only when SQLite metadata supports a defensible mapping. Otherwise show an unresolved declared relationship rather than inventing a column.
6. Model table/view/virtual/shadow, generated/hidden, STRICT, WITHOUT ROWID, composite PK, unique indexes, index expressions, and partial status explicitly.
7. Make catalog summary eager and per-object detail lazy. A broken view or index detail must not discard a usable table list.

**Detection**

- Commit golden catalog-model fixtures for ordinary, STRICT, WITHOUT ROWID, FTS/virtual/shadow, generated/hidden, expression/partial index, composite PK/FK, implicit-parent-key, self-link, cycle, missing-parent, quoted-name, empty-type, and broken-view cases.
- Compare normalized models, not fragile SQL text or screenshots.

**Recovery**

- Per-object introspection failure shows an object-level warning and keeps the rest of the catalog navigable.
- Unsupported future metadata is ignored safely and reported in development diagnostics without logging database content.

**Acceptance criteria**

- Generated and hidden columns appear with correct badges and are not silently omitted.
- STRICT, WITHOUT ROWID, virtual, shadow, view, table, explicit index, and autoindex cases are distinguishable.
- Composite foreign keys render as one ordered relationship and produce correctly ordered join predicates.
- Self-references and cycles do not crash layout.
- An unresolved or missing parent is shown as unresolved, never silently dropped or inferred by name.
- One malformed view or index does not prevent other catalog objects from loading.

### PF-07: SQLite values do not fit a convenient JavaScript object model

**Failure mode**

- `SELECT a AS x, b AS x` is converted to `{x: ...}` and one value overwrites the other.
- A 64-bit integer is coerced to `Number` and loses precision.
- `JSON.stringify()` throws on `BigInt`.
- `NULL`, empty string, zero, and the text `"NULL"` look identical.
- BLOBs become accidental comma-separated byte arrays, huge base64 strings, or invalid JSON.
- SQLite's dynamic typing is replaced by unreliable declared-type date coercion.
- Query-plan rows or zero-row results lose column metadata.

**Prevention**

1. Worker results use `columns: [{name, declaredType?, runtimeType?}]` plus positional row arrays.
2. Keep 64-bit integers as `bigint` internally when supported. Display exact decimal text.
3. Define export types explicitly. JSON should use a top-level `{columns, rows, metadata}` positional format so duplicate names survive. Encode out-of-safe-range integers as tagged decimal strings and BLOB previews as tagged objects with byte length and truncation state.
4. Render `NULL` with a distinct visual and accessible label. Do not infer dates from declared types in v1.
5. Return column metadata even for zero rows.

**Detection**

- Value fixture includes min/max signed 64-bit integers, safe and unsafe JS integer ranges, `NaN`-producing expressions if representable, infinities if produced, empty text, literal `NULL`, actual `NULL`, invalid-looking dates, Unicode, embedded newlines/NUL, small BLOB, and oversized BLOB.
- Round-trip export tests parse the JSON representation and RFC 4180 CSV parser output.

**Recovery**

- Unsupported display values fall back to an explicit typed placeholder, not an exception that removes the whole grid.
- Export encoding failure reports the exact unsupported type and keeps the result available.

**Acceptance criteria**

- Duplicate result column names retain every positional value in the grid and JSON export.
- All signed 64-bit integer values display exactly, with no `Number` precision loss.
- JSON export never passes raw `BigInt` to `JSON.stringify()`.
- `NULL`, empty string, zero, and `"NULL"` are visually and programmatically distinguishable.
- Large BLOBs never cross the worker boundary in full when above the cell cap.
- A zero-row query still displays its column headers and exports column metadata.

### PF-08: Large graphs and wide results can freeze an otherwise worker-based app

**Failure mode**

- SQLite stays off the main thread, but graph layout, React reconciliation, sorting, JSON serialization, or CSV generation blocks it.
- Opening a schema with hundreds of tables immediately renders every node and edge.
- The app attempts a minimap, animated edges, auto-fit, and repeated layout on every selection.
- A 1000-row result renders every row and all columns at once.

**Prevention**

1. Keep an initial graph threshold. For schemas above it, open a searchable table list and ask the user to render selected tables or a connected component. An initial benchmark target is 75 tables/150 edges, to be adjusted from evidence.
2. Run automatic layout once per schema/subset change, not on pan, selection, theme change, or result change.
3. Disable edge animation and respect `prefers-reduced-motion`.
4. Paginate bounded results at 50 rows. Do not add row virtualization until performance measurements show pagination is insufficient.
5. Export from the already bounded result and yield before Blob construction if measurement shows a long task.
6. Track long tasks in development/performance tests, not production telemetry.

**Detection**

- Synthetic schema fixtures at 25, 75, 150, and 500 tables with sparse/dense edges.
- Result fixtures at narrow/tall, wide/short, max total cells, and long text.
- Automated or manual performance traces record open-to-catalog, layout, first grid paint, sort, export, and input responsiveness.

**Recovery**

- If layout fails or exceeds its budget, show the structured relationship list and allow a smaller subset.
- If sorting/export fails, retain the original bounded result.

**Acceptance criteria**

- A schema over the graph threshold does not auto-layout the full graph.
- The table list remains searchable while layout is pending or unavailable.
- The first vertical slice establishes and records reference-device budgets; Phase 6 ratchets, rather than relaxes, those budgets without an explicit decision record.
- No normal theme, selection, or panel-resize action recomputes layout unnecessarily.
- Result pagination prevents creation of more than one page of `<tr>` elements.
- Keyboard and pointer input remain responsive during maximum supported result and graph tests.

### PF-09: CSV and JSON export can be unsafe, lossy, or misleading

**Failure mode**

- A cell beginning with `=`, `+`, `-`, `@`, tab, carriage return, line feed, or locale-specific full-width variants is opened as a spreadsheet formula.
- A mitigation is advertised as universally safe even though OWASP notes that spreadsheet programs can remove escapes and that no universal strategy works for every spreadsheet and downstream consumer.
- Hardening changes data without disclosure.
- The export implies a complete query result even though SeeQLite only holds the displayed cap.
- CSV quoting mishandles commas, quotes, CRLF, newlines, or empty/NULL values.
- JSON object rows lose duplicate column names or fail on `BigInt`.
- Object URLs are never revoked or a repeated export retains large Blobs.

**Prevention**

1. Export only the bounded displayed result. State the row count and truncation before download and include structured truncation metadata in JSON.
2. Implement RFC 4180 quoting for every field that needs it, with deterministic CRLF output and explicit `NULL` policy.
3. Ship one clearly named spreadsheet-hardened CSV behavior in v1. Neutralize formula-like leading content according to the chosen documented strategy, disclose that fields are transformed, and recommend JSON when exact typed preservation matters. Do not label it universally safe.
4. JSON uses positional columns/rows and explicit tagged encodings from PF-07.
5. Construct and revoke one object URL per export. Disable repeat clicks while the Blob is being built.

**Detection**

- Golden byte tests for commas, quotes, CR/LF, Unicode, empty strings, `NULL`, duplicate headings, formula starters, whitespace before starters, full-width starters, `BigInt`, and BLOB metadata.
- E2E intercepts the browser download and parses it independently.

**Recovery**

- Export failure leaves the result intact and re-enables the action.
- The user can choose JSON when CSV hardening would alter exact content.

**Acceptance criteria**

- Export copy says exactly how many displayed rows are exported and whether the query was truncated.
- Formula-like CSV cells are transformed by the documented spreadsheet-hardening policy, including delimiter/quote edge cases.
- The UI does not claim universal spreadsheet safety.
- JSON preserves duplicate names, exact large integers, `NULL`, and BLOB metadata without throwing.
- Zero-row CSV contains headers; zero-row JSON contains columns and an empty row list.
- Repeated exports do not accumulate unreleased object URLs.

### PF-10: Local-only history can still leak secrets

**Failure mode**

- SQL history stores passwords, tokens, personal data literals, database filenames, or full result rows indefinitely.
- A full-file hash blocks the worker or causes an extra pass over a large database.
- localStorage/IndexedDB quota, private mode, serialization, or permission failures break query execution.
- Console logs, error reporting, source-map tools, or analytics receive SQL, schema, filenames, or values.

**Prevention**

1. History stores only bounded SQL and non-sensitive execution metadata. Never store results, database bytes, schema definitions, or cell samples.
2. Cap at 100 entries and a total serialized byte budget. Provide per-entry delete and Clear all.
3. If database association is needed, use a cheap local opaque fingerprint derived from bounded metadata, not a full-file hash. Do not persist the raw filename.
4. Treat persistence as optional. Storage failure falls back to session memory and displays a non-blocking notice.
5. No production analytics or remote error collector. Sanitize console logging and never log SQL/results outside explicit local development diagnostics.

**Detection**

- Unit tests inject quota/security/serialization failures and inspect persisted keys.
- Privacy E2E opens a uniquely marked database and SQL string, then asserts that runtime requests, URLs, Cache Storage, service-worker cache keys, and unrelated localStorage values do not contain the marker.
- Console-spy tests assert no user value is logged during expected errors.

**Recovery**

- Corrupt or over-quota history storage is reset or ignored without blocking database/query use.
- The UI reports memory-only history for the session and continues.

**Acceptance criteria**

- At most 100 history entries and the configured byte cap persist.
- No result rows, schema SQL, database bytes, or raw database filename are persisted.
- Storage denial and quota exhaustion do not prevent queries.
- Clear all removes persisted and in-memory history.
- A unique sensitive marker never appears in a network request or service-worker cache entry.

### PF-11: Service workers share an origin even when app scopes differ

**Failure mode**

- SeeQLite copies DataDuck's activation cleanup, `caches.keys().filter(key !== CACHE_NAME)`, and deletes caches belonging to DataDuck, MarkV, or another TinyCrafts app. Cache Storage is a master directory of named caches available at the origin; service-worker fetch scope does not create a separate Cache Storage namespace.
- Install catches a precache failure, activates anyway, deletes the previous cache, and leaves the user without a working offline version.
- A hand-maintained app-shell list misses hashed JS, worker, or WASM assets.
- The service worker uses an absolute root URL or broad scope, breaking `/seeqlite/` or controlling unrelated paths.
- Local Vite development remains controlled by a stale production worker.
- Redirected, opaque, error, or cross-origin responses are cached.

**Prevention**

1. Prefix every cache with `seeqlite-`. Activation deletes only older caches with that prefix.
2. Generate the precache asset list from the production build manifest so hashed JS/CSS/worker/WASM assets cannot be forgotten.
3. Fail installation if required shell assets cannot be cached. Keep the previously active worker/cache rather than activating an incomplete shell.
4. Register `./sw.js` with `scope: './'` and `updateViaCache: 'none'`. Use Vite `base: './'`.
5. Cache only same-origin GET responses that are successful, non-redirected, and non-opaque. Never cache local database bytes, Blob URLs, downloads, or user-generated content.
6. In development, unregister SeeQLite-scoped registrations safely. Do not unregister all origin registrations.

**Detection**

- Unit-test cache-name filtering with SeeQLite, DataDuck, and unrelated cache names.
- Build verification asserts manifest, worker, WASM, icons, and hashed assets exist at the published subpath.
- Production-preview E2E installs, reloads offline, updates cache version, simulates failed install, and verifies DataDuck cache survival.

**Recovery**

- Failed update continues serving the last complete version.
- A reset-offline-data action removes only SeeQLite caches/registration/history and reloads online.

**Acceptance criteria**

- Activation never deletes a cache whose name does not start with `seeqlite-`.
- An intentionally seeded `dataduck-*` cache survives SeeQLite install, activate, update, and reset.
- Offline repeat load includes HTML, JS, CSS, worker, WASM, manifest, and icons after one successful online visit.
- A missing required asset prevents the new service worker from replacing the prior working version.
- Development does not register or remain controlled by the production SeeQLite worker.
- The worker controls only the `/seeqlite/` path in the deployed artifact.

### PF-12: Static-host security and asset behavior must be proved on the artifact

**Failure mode**

- Dev works but production worker/WASM URLs resolve against the domain root rather than the app subpath.
- GitHub Pages serves a wrong MIME type, missing asset, stale redirect, or case-mismatched path.
- CSP omits `'wasm-unsafe-eval'` and blocks WebAssembly, or adds the broader `'unsafe-eval'` unnecessarily.
- A meta CSP is claimed to prevent framing. The `frame-ancestors` directive is not supported in a `<meta>` element, so it requires an HTTP response header.
- The app assumes cross-origin isolation, SharedArrayBuffer, OPFS, File System Access, or another capability not available in the deployment/browser baseline.
- An unsupported browser gets a blank screen instead of an actionable message.

**Prevention**

1. Test the exact `.pages-build/seeqlite/` artifact through an HTTP server and, before release, on the deployed TinyCrafts URL.
2. Add artifact verification for root files, hashed chunks, module worker, `.wasm`, manifest icon targets, relative references, forbidden source files, and service-worker registration.
3. Feature-detect WebAssembly, module Worker, `BigInt`, `File`, transferable buffers, Blob downloads, and required storage/service-worker features. File input is the baseline; advanced file-picker APIs are optional.
4. Use the narrow CSP required by the built artifact. Treat clickjacking protection as a deployment-header decision. A JavaScript frame guard may be defense in depth but must not be documented as equivalent to `frame-ancestors`.
5. Avoid SharedArrayBuffer/cross-origin isolation and OPFS in v1.

**Detection**

- Playwright production-preview suite in Chromium, Firefox, and WebKit.
- Deployment smoke test checks status, content type for WASM/JS/manifest, console, failed network requests, service-worker scope, and offline repeat load.
- Negative feature tests stub each required capability absent.

**Recovery**

- Missing required capability produces a named unsupported-browser screen with basic guidance.
- WASM/worker asset failure offers Retry after connectivity/build is restored; it does not discard editor/history state.

**Acceptance criteria**

- The app works at `/seeqlite/` with no root-path asset requests.
- Production CSP executes SQLite WASM without `'unsafe-eval'` and rejects an injected `data:` worker test.
- Documentation does not claim `frame-ancestors` protection unless the deployed response contains the header.
- Chromium, Firefox, and WebKit complete the core open, inspect, query, plan, cancel, and export flow.
- Every unsupported required feature maps to a readable UI state rather than an uncaught exception.

### PF-13: A visual ER diagram is not an accessible schema representation

**Failure mode**

- Only pointer users can pan, zoom, select, fit, or inspect relationships.
- Focus disappears into a canvas/SVG graph or is lost after auto-layout.
- PK/FK meaning relies only on color or line style.
- Screen readers receive hundreds of graph internals with no useful reading order.
- Mobile users cannot reach tables or results because the desktop rail/canvas layout is merely squeezed.

**Prevention**

1. Provide an equivalent structured relationship list grouped by table, with child columns, parent columns, and unresolved state. This is a first-class view, not hidden fallback copy.
2. Every graph action has a keyboard-accessible button or list action. W3C WCAG guidance requires pointer actions to have keyboard equivalents unless the underlying function is path-dependent.
3. Preserve focus after layout, filtering, edge selection, and generated-query confirmation.
4. Use text badges/icons plus color for PK, FK, unique, generated, hidden, view, and virtual state.
5. On narrow screens, use explicit Query, Results, Schema, and Diagram modes/drawers rather than requiring simultaneous panes. Keep result horizontal scroll contained.
6. Respect reduced motion, minimum target size, zoom up to 200%, forced colors where practical, and light/dark contrast.

**Detection**

- Keyboard-only scripted flow and manual screen-reader checks for open, schema navigation, relationship inspection, join generation, query execution, and export.
- Automated axe checks plus targeted tests for focus order, accessible names, live regions, table semantics, and contrast in both themes.
- Responsive tests at 375, 768, 1024, and wide desktop widths.

**Recovery**

- If the graph library or layout fails, the relationship list remains complete and join generation remains available.

**Acceptance criteria**

- Every declared relationship is available in the structured list even when the graph is disabled.
- A keyboard user can select a table/relationship and generate join SQL without dragging or precision pointer movement.
- Auto-layout and mode changes preserve a logical focus target.
- PK/FK/unique state remains understandable with color removed.
- Core flows pass automated accessibility checks and documented manual NVDA/VoiceOver smoke tests.
- Light and dark themes meet WCAG AA contrast for normal text and essential UI boundaries.

### PF-14: Mocked engine tests create false confidence

**Failure mode**

- jsdom tests mock the SQLite worker, so they miss WASM load paths, transfer semantics, authorizer behavior, C-API lifetime, browser storage, downloads, and service-worker scope.
- Snapshot tests assert CSS strings or markup while the user flow is broken.
- Only Chromium is tested; WebKit storage/worker behavior fails.
- Binary fixtures are generated differently per environment or depend on an unpinned global `sqlite3` executable.
- A security regression lacks a permanent fixture/test.

**Prevention**

Use a testing pyramid with an unusually strong browser-integration layer:

1. **Unit:** pure statement-tail logic, authorizer decisions, quoting, catalog normalization, ER graph model, worker protocol reducer, value formatting, CSV/JSON encoding, history limits, and cache-name filtering.
2. **Component/integration:** actual official SQLite WASM running in a real browser worker against committed fixtures. Mock only OS/browser failure seams.
3. **E2E:** production build through HTTP in Chromium, Firefox, and WebKit for the complete core flow.
4. **Negative/security:** hostile SQL, malicious schema/value fixtures, corrupt/encrypted-looking/WAL inputs, storage failure, worker crash, missing WASM, CSP, offline/update failure, and privacy network assertions.
5. **Performance:** fixed reference fixtures and thresholds established in Phase 1, measured again in release hardening.
6. **Regression:** every fixed defect adds the smallest permanent unit or browser test that would have caught it.

Commit small binary fixtures plus human-readable generation SQL/notes. The test suite consumes committed bytes and does not require a global SQLite tool in CI. If a generator is added, pin it as a development tool and verify the generated schema semantically rather than relying on byte-for-byte database equality.

**Acceptance criteria**

- At least one browser test uses the real production SQLite WASM and worker for each engine-facing requirement.
- CI tests the production build and subpath, not only the Vite dev server.
- The fixture matrix covers normal, weird-schema, hostile-value, corrupt, pending-WAL, large-schema, wide-result, and large-BLOB cases.
- Security tests assert outcomes at the engine and DOM/network layers.
- Browser failures include console and failed-request evidence.
- No release is approved from mocked engine tests alone.

## Complete Failure-Mode Test Matrix

| Area | Required cases | Expected outcome |
|---|---|---|
| File intake | Cancel picker, zero bytes, wrong header, valid unusual extension, truncated, corrupt page, encrypted-looking, `.wal`/`.shm`, soft limit, hard limit | No crash; specific cautious error; next valid open succeeds |
| File replacement | New valid file, new invalid file, replacement during query/cancel, same filename different bytes | One active DB; no stale catalog/results; retained editor rules are consistent |
| Catalog | Empty DB, views, broken view, autoindex, expression/partial index, generated/hidden, STRICT, WITHOUT ROWID, virtual/shadow, huge schema | Accurate normalized model or per-object warning |
| Relationships | Composite, implicit parent PK, self, cycle, parallel edges, missing parent, quoted identifiers, no FKs | No inference; accurate declared model and relationship list |
| SQL selection | No selection, selection, semicolon in string/comment, empty/comment-only, two statements, bound-parameter syntax | Exactly one statement or actionable rejection |
| Authorization | All DML/DDL, transactions, attach/detach, writable/read-only PRAGMAs, load extension, `RETURNING`, CTEs | Default deny for writes and unsafe operations; allowed reads work |
| Runtime | Syntax error, constraint/schema error, timeout, cancel, worker crash, stale reply, WASM OOM, rapid Run clicks | State machine recovers; no stale publication or stuck controls |
| Results | Zero rows, duplicate names, 0/empty/NULL/"NULL", 64-bit limits, long text, BLOB, many columns, max cells | Exact positional values, bounded rendering, explicit truncation |
| Query plan | Supported SELECT/CTE, syntax error, denied statement, query changes during plan | Plan corresponds to captured SQL; old plan is cleared or labeled |
| History | 101 entries, byte cap, quota denied, corrupt storage, clear, sensitive literal | Bounded metadata only; fallback memory; no blocked query |
| Export | Zero rows, duplicate headers, commas/quotes/CRLF, Unicode, formulas, BigInt, BLOB, truncated result, repeat clicks | Parseable bounded file, disclosed transformation/truncation, no leaks |
| ER UX | No relationships, threshold, failed layout, keyboard, zoom, reduced motion, light/dark, mobile | Relationship list always works; graph remains optional enhancement |
| Offline | First visit offline, repeat offline, missing precache asset, update, stale cache, other-app cache | Honest first-visit failure; repeat works; failed update preserves old app |
| Privacy | Unique marker in filename/schema/SQL/value; inspect network, logs, URL, storage, caches | Marker remains only in allowed local UI/history fields |
| Browser | Missing Worker/WASM/BigInt/storage/SW, private storage failure, three engines | Actionable support state or graceful degraded local history |
| Deployment | Relative base, MIME, missing worker/WASM, source files excluded, CSP, service-worker scope | Artifact verification and smoke tests fail release on defect |

## Phase Mapping and Release Gates

These names are suggestions for the roadmap. The dependencies matter more than the labels.

### Phase 1: Walking skeleton and browser harness

Address PF-05, PF-12, and PF-14 first.

- Prove Vite subpath assets, official WASM in an app-owned worker, real file input, one real `SELECT`, and a bounded result.
- Establish production-preview Playwright in all three engines before building feature breadth.
- Establish baseline performance numbers and unsupported-browser states.

**Exit gate:** A committed valid fixture opens and runs through real WASM on the production build at `/seeqlite/`; no database-derived network request occurs.

### Phase 2: Safe database lifecycle and complete catalog

Address PF-01, PF-03, PF-04, and PF-06.

- Authorizer, defensive settings, SQLite runtime limits, file validation, cautious errors, worker lifecycle, catalog normalization, and fixture matrix.
- Run implementation spikes for exact official WASM bindings and chosen VFS read-only behavior.

**Exit gate:** Hostile SQL is denied by real SQLite, weird-schema fixtures normalize correctly, all failed opens recover, and hard file/result limits are enforced before dangerous allocation.

### Phase 3: Query workspace

Address PF-02, PF-03, PF-07, PF-10, and PF-14.

- One-statement execution, CodeMirror selection semantics, positional values, bounded paginated grid, timeout, terminate-and-rehydrate cancel, plan, and bounded local history.

**Exit gate:** Cancel/timeout races pass in three engines; exact 64-bit/duplicate-column fixtures pass; history failure cannot block query use.

### Phase 4: ER diagram

Address PF-06, PF-08, and PF-13.

- Declared-FK graph, threshold/subset behavior, structured relationship list, accessible join generation, deterministic normalized layout inputs.

**Exit gate:** Composite/self/cyclic/missing-parent fixtures work, the threshold prevents full large-schema layout, and keyboard users have feature-equivalent relationship access.

### Phase 5: Export and offline shell

Address PF-09 and PF-11.

- Spreadsheet-hardened bounded CSV, positional tagged JSON, generated precache list, prefix-safe cache cleanup, offline repeat use.

**Exit gate:** Independent parsers validate exports, truncation/hardening are disclosed, SeeQLite updates cannot delete a seeded DataDuck cache, and failed install preserves the prior app.

### Phase 6: Security, performance, accessibility, and release

Recheck every PF item.

- Production CSP, malicious fixtures, privacy network audit, browser matrix, responsive themes, WCAG manual checks, measured budgets, final Pages build verification.

**Release gate:** Every requirement has real-browser evidence; Critical/High risks have passing prevention and recovery tests; all residual limitations appear in product copy and release notes.

## Testing Strategy by Layer

### Unit tests

- No DOM or SQLite mocks are needed for pure policies and encoders.
- Table-driven tests cover every branch, including unknown future enum values.
- Favor semantic assertions over snapshots.

### Browser integration tests

- Run actual SQLite WASM in the actual module worker.
- Exercise C-API lifetime, authorizer, progress handler, transfer, result encoding, and worker replacement.
- Use committed fixtures and deterministic expected normalized models.

### End-to-end tests

- Serve the production artifact with the real subpath and service worker.
- Chromium, Firefox, and WebKit cover open, inspect, ER/list, query, plan, cancel, history, export, reload offline, and theme.
- Each failure captures console and failed requests.

### Negative and security tests

- Hostile SQL and catalog/value content are first-class suites.
- Assert no execution/XSS, no write authorization, no network leakage, bounded allocations, and recovery to a valid subsequent query/open.
- Test service-worker cache isolation against another TinyCrafts cache name.

### Performance tests

- Phase 1 records reference-device/environment details and baselines.
- Track: initial transferred bytes, worker/WASM ready, 25/50 MiB open-to-catalog, 1000-by-20 query-to-first-paint, max supported grid sort/export, 75-table layout, cancel response, and rehydrate.
- Treat budgets as release checks after baselining. Do not promise desktop numbers for 512 MiB files or mobile devices without evidence.

### Accessibility tests

- Automated checks run in both themes and responsive modes.
- Manual keyboard and screen-reader scripts are versioned alongside E2E flows.
- The structured relationship list is tested independently of the graph library.

### Regression policy

- Every production or UAT defect adds a test at the lowest layer that reproduces it.
- Critical fixture cases are never replaced by mocks for speed.
- Dependency upgrades rerun the real WASM, CSP, worker URL, graph keyboard, and production bundle suites.

## Explicit YAGNI Boundaries

Do not solve these v1 risks with larger systems:

- **No custom SQL parser.** Use SQLite prepare/tail handling and the authorizer.
- **No SharedArrayBuffer or pthread setup for Cancel.** Terminate and rehydrate one dedicated worker.
- **No worker pool or multiple connections.** One DB and one serialized worker queue match the product.
- **No eager integrity scan.** Validate header/open/catalog and report query-level corruption honestly.
- **No OPFS database persistence.** Keep the DB transient; persist only bounded preferences/history.
- **No full-file fingerprint.** It adds I/O and memory pressure without core value.
- **No relationship inference.** Show only declared FKs and unresolved declarations.
- **No full-schema graph for arbitrarily large databases.** Use selection and connected subsets.
- **No virtualized data-grid dependency until pagination fails measured tests.** Fifty semantic rows per page is simpler and more accessible.
- **No unbounded/full-result export.** Export exactly the bounded displayed result.
- **No backend, upload, accounts, analytics, crash collector, or remote fonts.** They directly weaken the product promise.
- **No service-worker framework unless generated custom precaching proves unmaintainable.** Keep cache behavior small and auditable.
- **No broad browser polyfill layer.** Feature-detect required primitives and show a support message.

## Research Flags and Implementation Spikes

The following details must be settled with the selected package version and production artifact, not guessed during implementation:

1. **SQLite WASM C bindings:** Verify `sqlite3_set_authorizer`, `sqlite3_limit`, `sqlite3_progress_handler`, `sqlite3_db_config`, open flags, statement tail, `sqlite3_column_bytes`, and cleanup APIs in the exact official npm build.
2. **VFS import path:** Measure peak memory and confirm read-only opening semantics for the chosen transient VFS. Do not add OPFS to solve this.
3. **Runtime limits:** Start with conservative values, run the fixture/performance suite, and record final values in an architecture decision. Do not silently relax limits after tests fail.
4. **Graph threshold:** Baseline ELK/React Flow on the supported browsers and lock the full-graph threshold before Phase 4 exits.
5. **CSP and response headers:** Inspect the deployed GitHub Pages response. Do not claim `frame-ancestors` unless an HTTP header is actually present.
6. **Service-worker generation:** Prove that the build-derived precache includes the module worker and WASM and that failed install retains the old cache.
7. **CSV hardening copy:** Choose and document one transformation based on product intent. Test it, disclose it, and direct exact-data users to JSON.

## Local Evidence from DataDuck

Useful patterns observed locally:

- `dataduck/src/duckdb/files.js` cleans up registered files/views on open failure. SeeQLite needs the equivalent DB/statement/worker cleanup on every validation path.
- `dataduck/tests/files.test.js` tests unsupported input before registration, large-file deferred work, and cleanup after profiling failure. SeeQLite should extend that mindset to corrupt/encrypted/WAL fixtures.
- `dataduck/src/util/dom.js` and `tests/dom-security.test.js` centralize same-origin worker URL validation and hostile DOM cases. React text rendering should reduce SeeQLite's sink count, but worker/CSP checks still apply.
- `dataduck/sw.js` filters non-GET, cross-origin, redirect, error, and opaque responses. Those checks are reusable.
- **Do not reuse its activation deletion literally:** `caches.keys().filter((key) => key !== CACHE_NAME)` can delete other TinyCrafts caches on the shared origin. SeeQLite must delete only its own prefix.
- `dataduck/src/state/query-snapshots.js` and tests demonstrate bounded metadata-only persistence and memory fallback when storage fails.
- `dataduck/src/ui/result.js` sorts the full in-memory row set and renders object-shaped rows. SeeQLite must first cap rows/cells and retain positional rows because SQLite permits duplicate result column names.
- `scripts/build-pages.mjs` and `scripts/verify-pages-build.mjs` establish the repository's separate production artifact and explicit required/forbidden asset checks. SeeQLite needs equivalent worker/WASM/manifest/service-worker checks.

## Sources

Primary and authoritative sources used for the findings above:

- SQLite, [Compile-Time Authorization Callbacks](https://sqlite.org/c3ref/set_authorizer.html)
- SQLite, [Query Progress Callbacks](https://sqlite.org/c3ref/progress_handler.html)
- SQLite, [Interrupt A Long-Running Query](https://sqlite.org/c3ref/interrupt.html)
- SQLite WASM, [Workers and Promises, Worker1 and Promiser](https://sqlite.org/wasm/doc/trunk/api-worker1.md), marked deprecated by upstream on 2026-04-15
- SQLite, [PRAGMA statements](https://sqlite.org/pragma.html), including `query_only`, `table_list`, and `table_xinfo`
- SQLite, [Run-Time Limit Categories](https://sqlite.org/limits.html)
- SQLite, [Database Connection Configuration Options](https://sqlite.org/c3ref/c_dbconfig_defensive.html), including DEFENSIVE and TRUSTED_SCHEMA
- SQLite, [Database File Format](https://sqlite.org/fileformat.html)
- SQLite, [WAL-mode File Format](https://sqlite.org/walformat.html)
- SQLite, [Foreign Key Support](https://sqlite.org/foreignkeys.html)
- OWASP, [CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)
- MDN, [Content-Security-Policy: `script-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- MDN, [Content-Security-Policy: `frame-ancestors`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
- MDN, [Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- MDN, [CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage)
- MDN, [`JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)
- W3C WAI, [Understanding WCAG 2.2 Success Criterion 2.1.1: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)

## Confidence and Remaining Gaps

| Area | Confidence | Notes |
|---|---|---|
| SQLite read-only controls | HIGH | Direct upstream C API and PRAGMA documentation |
| Cancellation limitation | HIGH | Direct upstream worker queue, progress, and interrupt documentation; package binding details still need a spike |
| File/WAL behavior | HIGH | Direct upstream file and WAL format documentation |
| Catalog edge cases | HIGH | Direct upstream PRAGMA and foreign-key documentation |
| CSV/JSON hazards | HIGH | OWASP and MDN; exact product transformation remains a deliberate implementation choice |
| Service worker and CSP | HIGH | MDN plus local DataDuck artifact; deployed response headers still need verification |
| Exact file/result/layout budgets | MEDIUM | Must be based on the first production vertical slice and supported browser measurements |
| Accessibility approach | HIGH | WCAG requirement is clear; library-specific graph behavior requires implementation testing |

The research intentionally leaves performance numbers and exact WASM binding calls as phase spikes. Freezing either without the chosen build would create false precision, not an implementation-ready safeguard.
