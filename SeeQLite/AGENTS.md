# SeeQLite Engineering Contract

## Product boundary

- Build one browser-only, local-first, read-only SQLite explorer. No backend, accounts, analytics, AI, mutation, OPFS database persistence, relationship inference, or multi-database support in v1.
- Database bytes, schema, result rows, BLOB previews, file names/paths, and database-derived identifiers must never be sent over the network or written to persistent browser storage. The only persistent database-workflow exception is the bounded, versioned query-history record defined by HIST-01/HIST-02: SQL text plus status, timestamp, and duration, with no database affinity/fingerprint or derived metadata.
- The source `File` is immutable. Every open, query, plan, cancellation, and failure path must preserve its bytes.

## Architecture invariants

- Use the exact-pinned official `@sqlite.org/sqlite-wasm` package in an application-owned module worker. Do not use deprecated Worker1/Promiser APIs or move SQLite to the main thread.
- Keep SQLite handles, statements, raw buffers, authorization, limits, deadlines, and catalog extraction inside the database worker.
- Main-thread state contains serializable DTOs only. Every worker request and response carries a request ID and worker epoch; stale generations cannot publish state.
- Use one normalized catalog for the explorer, completion, ER model, relationship list, and join generation.
- Use positional result rows with typed values. Never convert SQLite rows to objects keyed by column name.
- Enforce read-only behavior through SQLite controls. Regex or keyword checks may improve messages but are never authorization.
- Bound files, statements, catalog work, rows, columns, cells, transferred bytes, cell previews, history, graphs, exports, and caches.

## Implementation style

- Prefer small focused TypeScript modules, React reducer/context, browser primitives, and plain CSS custom properties.
- CodeMirror, React Flow, ELK, and accessible resizable panels are the approved complex-behavior dependencies. Any other runtime dependency needs an explicit measured justification.
- Reuse TinyCrafts paper/ink/rule/blue tokens, Inter and JetBrains Mono, compact radii, and the 36px grid texture. Light and dark themes have equal acceptance criteria.
- Keep all assets same-origin and compatible with a relative Vite base at `/seeqlite/`.
- Use `.venv` for any Python script and never install Python packages globally. Python is not expected for v1.

## Quality rules

- Every implementation task begins with the smallest failing unit, integration, or E2E test that proves its acceptance criterion when practical.
- Engine guarantees require real SQLite WASM and the real module worker. Mocks are acceptable only for pure adapters and UI state seams.
- Every defect adds a permanent regression test at the lowest layer that would have caught it.
- Run typecheck, unit/component tests, real-browser integration, production-artifact E2E, and targeted negative tests for the files changed.
- Do not relax a safety or performance limit without an ADR, measured evidence, and a regression test.
- Do not commit database fixtures containing real or sensitive data.

## Planning sources

- Product scope: `.planning/PROJECT.md`
- Atomic requirements: `.planning/REQUIREMENTS.md`
- Phase order and exits: `.planning/ROADMAP.md`
- Canonical research decisions: `.planning/research/SUMMARY.md`
- Detailed risks: `.planning/research/PITFALLS.md`
- Phase-specific locked decisions: `.planning/phases/*/*-CONTEXT.md`
- Phase-specific UI contracts: `.planning/phases/*/*-UI-SPEC.md`
