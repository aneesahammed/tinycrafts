# SeeQLite

## What This Is

SeeQLite is a browser-only SQLite database explorer for developers, analysts, students, and support engineers who need to understand an unfamiliar local database without installing a desktop application or uploading data. A user opens one `.sqlite`, `.sqlite3`, or `.db` file, browses its catalog, follows declared relationships in an interactive ER diagram, runs read-only SQL, inspects query plans, and exports the displayed result set.

SeeQLite is a TinyCrafts product. It must feel like the TinyCrafts catalogue translated into a focused developer workspace: warm paper surfaces, blue accent, a restrained grid, direct copy, excellent light and dark themes, and no unnecessary platform features.

## Core Value

A user can open an unfamiliar SQLite file and safely understand its structure, relationships, and data in seconds without the file leaving the browser.

## Business Context

- **Customer**: Developers and technically curious users inspecting local SQLite databases.
- **Revenue model**: Free TinyCrafts utility; no account, subscription, or server component.
- **Success metric**: A first-time user can open a valid database, identify related tables, and run a useful query without documentation or installation.
- **Strategy notes**: One focused job, local-first privacy, and a high craft bar are more important than feature breadth.

## Requirements

### Validated

- ✓ Browser-only local file analysis is an established TinyCrafts pattern in DataDuck.
- ✓ TinyCrafts already has a light/dark visual language and static GitHub Pages deployment pipeline.

### Active

- [ ] Open one local SQLite database without uploading its contents.
- [ ] Inspect tables, views, columns, keys, indexes, and SQL definitions.
- [ ] Visualize declared foreign-key relationships in an interactive ER diagram.
- [ ] Run one read-only SQLite statement at a time with clear errors, cancellation, and bounded results.
- [ ] Inspect `EXPLAIN QUERY PLAN` output for supported statements.
- [ ] Retain local query history without retaining database contents or result rows.
- [ ] Export the displayed result set to CSV or JSON with honest truncation metadata.
- [ ] Work in supported evergreen Chromium, Firefox, and Safari engines.
- [ ] Match the TinyCrafts landing-page design language in both light and dark themes.
- [ ] Ship as a static, installable, offline-capable browser application under the TinyCrafts Pages build.

### Out of Scope

- Database mutation, schema editing, or writing changes back to the source file — read-only v1 keeps the trust and recovery model simple.
- Multiple simultaneously open databases and cross-database queries — not required to understand one local file.
- Inferred relationships based on column names — v1 shows declared SQLite constraints only and does not present guesses as schema facts.
- SQLCipher or other encrypted database formats — official SQLite WASM does not provide decryption keys or SQLCipher compatibility.
- Loading native or arbitrary SQLite extensions — incompatible with the browser sandbox and an unnecessary execution surface.
- Remote database URLs, cloud synchronization, accounts, sharing, or collaboration — would violate the local, one-job product boundary.
- Durable database persistence in OPFS — deferred until direct-file mode is proven; query history and diagram preferences may persist locally.
- AI-generated SQL or schema explanations — unnecessary for the first release and creates privacy, safety, and product-scope costs.
- Full unbounded query-result export — v1 exports the bounded displayed result and labels truncation explicitly.
- Relationship editing, diagram annotations, or shared diagram documents — SeeQLite visualizes the database rather than becoming a diagramming platform.

## Context

- DataDuck provides reusable architectural lessons: lazy browser engine startup, explicit file lifecycle, a small state boundary, service-worker handling, output encoding, and extensive browser-focused tests.
- DataDuck's DuckDB file/view model, Parquet profiling, AI assistant, and whole-result client-side sorting do not carry over.
- The official SQLite WASM Worker1/Promiser interfaces are deprecated as of 2026-04-15. SeeQLite will load the official module inside an app-owned worker and keep the synchronous SQLite API private behind a narrow typed message contract.
- The target host is the existing TinyCrafts GitHub Pages artifact. The core app cannot depend on response headers that GitHub Pages does not expose.
- The source folder is `SeeQLite/`; the published route is `tinycrafts.ai/seeqlite/`.
- The project uses the repository's existing Node/Vite build conventions. Python is not required; if any Python utility is introduced later it must run through `.venv` and must not install packages globally.

## Constraints

- **Privacy**: Database bytes, query text, results, and schema metadata must never be sent over the network.
- **Safety**: User SQL is read-only in v1; source files are never modified.
- **Runtime**: All database work runs in browser WebAssembly, off the main UI thread.
- **Hosting**: Production must work as static files under a subpath on GitHub Pages.
- **Compatibility**: File input and drag-and-drop are the portable baseline; File System Access APIs are optional and not required.
- **Memory**: Database import and results are bounded to prevent a malicious or very large file from crashing the tab.
- **Design**: Preserve TinyCrafts tokens, grid texture, Inter/JetBrains Mono pairing, compact radii, direct copy, no italics, and matched light/dark themes.
- **Accessibility**: All primary workflows are keyboard-operable; the ER diagram has an equivalent structured relationship list.
- **Maintainability**: Prefer browser and SQLite primitives, React state, and small focused modules. Add libraries only where they replace non-trivial editor or graph behavior.
- **Scope**: Follow YAGNI. No backend, authentication, telemetry, AI, mutation, or plugin system in v1.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build SeeQLite as a separate app rather than a DataDuck mode | SQLite catalog and relationship workflows have different product and engine boundaries | — Pending |
| Use the official `@sqlite.org/sqlite-wasm` browser package | Keeps SQLite semantics and security controls aligned with upstream | — Pending |
| Load SQLite inside an app-owned worker | Protects UI responsiveness while avoiding deprecated Worker1/Promiser APIs | — Pending |
| Keep v1 read-only | Protects source data and removes save/conflict/recovery complexity | — Pending |
| Open one database at a time | Controls memory and keeps navigation unambiguous | — Pending |
| Render only declared foreign keys | Prevents inferred links from being mistaken for schema truth | — Pending |
| Cap interactive query results and exports | Keeps memory, rendering, and downloads predictable | — Pending |
| Use React + TypeScript + Vite, without a global state library | Interactive editor/diagram benefit from component state; extra state tooling is unnecessary | — Pending |
| Use CodeMirror 6 and React Flow with ELK layout | Editing and graph layout are complex, accessibility-sensitive problems not worth reimplementing | — Pending |
| Reuse TinyCrafts visual tokens rather than DataDuck's teal redesign | SeeQLite should belong to the parent studio while remaining a dense tool | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Move requirements proven by tests and user verification to Validated.
2. Move invalidated requirements to Out of Scope with the reason.
3. Add newly discovered requirements only when they preserve the core value.
4. Record decisions that constrain later phases.
5. Recheck that the product remains one browser-only SQLite inspection tool.

**After each milestone**:
1. Review the complete scope against the core value.
2. Recheck privacy and read-only guarantees.
3. Audit deferred features before promoting any of them.
4. Update performance and compatibility evidence.

---
*Last updated: 2026-07-15 after project initialization*
