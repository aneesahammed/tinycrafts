# Merge DataDuck and SeeQLite into one data tool

This plan replaces the earlier homepage-only grouping plan. The intended result is **one product and one application experience** for CSV, Parquet, and SQLite files. The DuckDB and SQLite engines remain separate internally because they solve different problems and have different safety rules.

## Product decision and working assumptions

- Use **DataDuck** as the working product name and **/dataduck/** as the canonical launch URL. This preserves the existing DataDuck installation and link path. The name can be changed before implementation without changing the architecture.
- Show **one data-tool card** on the TinyCrafts homepage. Its copy lists CSV, Parquet, and SQLite, and it links to the canonical application. Remove the separate SeeQLite card only at launch.
- Present one brand, header, theme control, file-opening flow, PWA manifest, and service worker. Users should not feel that two websites were placed next to each other.
- Keep two engine-specific workspaces behind that shell: a DuckDB workspace for CSV/Parquet and a SQLite workspace for databases. Do not emulate SQLite in DuckDB or run SQLite files through a DuckDB extension.
- Keep the current /seeqlite/ URL as a compatibility entry point after launch. It must explain the move and link to /dataduck/?mode=sqlite, which preselects the SQLite workspace without attempting to persist or transfer a file. A user's locally stored query history must remain available.

## What exists today

| Area | DataDuck | SeeQLite |
| --- | --- | --- |
| Source | dataduck/; mostly JavaScript DOM modules with a React assistant | SeeQLite/; React and TypeScript |
| Engine | DuckDB-WASM worker, multiple CSV/Parquet files, SQL, schema and profiling | Official SQLite WASM in an application-owned worker; one database, catalog, relationships, read-only SQL and query plans |
| Extra workflows | Charts, query snapshots, CSV recovery, export, optional Claude/Groq analyst | ER diagram, detailed schema, bounded query history, CSV/JSON export |
| Persistence | IndexedDB recents, snapshots, assistant settings/threads and encrypted optional keys; localStorage for UI settings | Bounded SQL history under seeqlite.query-history.v1; no persisted database bytes |
| Privacy | Optional outbound AI and GoatCounter page views | No analytics or AI; current page CSP only permits same-origin connections |
| Delivery | Vite PWA at /dataduck/ with its own manifest and service worker | Vite PWA at /seeqlite/ with its own manifest and service worker |

The existing SeeQLite project brief says it should be a separate app. The user's product decision supersedes that point. Its read-only, file immutability, privacy, limit, and real-worker requirements still apply to SQLite mode.

## User experience contract

1. The first screen says **Open a data file** and accepts .csv, .parquet, .parq, .sqlite, .sqlite3, and .db. Drag and drop and file picker use the same routing function. Give users a small, explicit format guide and sample files for both modes.
2. File selection detects the format before either engine starts. CSV/Parquet opens the existing DataDuck workspace. SQLite opens the SQLite workspace. An unsupported or mismatched file gets a specific error; SQLite WAL, SHM, and journal sidecars are rejected. A mixed CSV/Parquet plus SQLite drop is rejected with an explanation, so no file is silently skipped or opened in the wrong engine.
3. The global shell keeps the same brand, theme toggle, Open file control, help/privacy link, and clear indication of the active format. The workspace below it changes to the relevant tools. SQLite keeps its catalog, inspector, ER diagram, query plan, bounded results, and read-only messaging. CSV/Parquet keeps its multi-file rail, profiling, charts, snapshots, export, and CSV recovery.
4. Label the SQL dialect and engine in each workspace. SQLite SQL and DuckDB SQL are not interchangeable. Keep query history and saved queries separated by engine; do not offer a query in the wrong workspace without an explicit conversion step.
5. Permit several CSV/Parquet files in the DuckDB workspace, as today. Permit one active SQLite database, as today. Opening a file for the other engine switches workspaces and releases the inactive engine and file bytes. Preserve unsaved query drafts in memory during the session or warn before discarding them; do not persist SQLite database contents or result rows. Cross-engine joins are a separate future feature, not part of this merge.
6. The optional AI analyst remains available for CSV/Parquet only. It is absent or disabled in SQLite mode. No SQLite schema, filename, query, rows, or derived metadata may be passed to an AI provider. Do not infer that the combined product makes AI safe for SQLite.
7. Light and dark themes are first-class in the landing view and both workspaces. The unified design should use one set of TinyCrafts tokens and interaction patterns, while allowing dense engine-specific panels.

## Architecture

### One application, two isolated adapters

- Use dataduck/ as the integration host because it already handles multi-file intake, optional AI, and the canonical route. Add the official SQLite WASM package, TypeScript tooling, and SeeQLite's required UI dependencies to one reviewed package lock. Standardize the build on Node 24, which the Pages workflow already uses.
- Introduce a format router with a discriminated file type: CSV, Parquet, or SQLite. Validate extension plus available file signature before routing: SQLite header, Parquet magic, and CSV extension/parse checks. Do not read the entire file merely to classify it. Apply each engine's size and resource limits before loading bytes.
- Keep a DuckDB adapter and a SQLite adapter with separate workers, request lifecycles, cancellation, result types, and error handling. The shared shell asks the active adapter to open, close, query, and export, but mode-specific features remain behind that adapter. Do not create a thin generic SQL API that hides read-only policy or different SQL dialects.
- Move SeeQLite's worker, protocol, catalog, query-plan, ER, and workspace components into a dedicated SQLite module under dataduck/src/sqlite/. Refactor its top-level App so it can mount as a React workspace controlled by the shared shell. Reuse its real SQLite worker and authorization controls; do not rewrite them while changing the shell. DataDuck already mounts a React assistant, so a React workspace can coexist with its current DOM code during migration.
- Make the global header and file intake single owners. Remove duplicate SeeQLite header, picker, theme switch, and service-worker registration from the embedded workspace. Scope CSS so SeeQLite's root tokens and selectors cannot restyle DataDuck. Then consolidate the visual tokens and controls. The result should behave as one application, even if its internal workspaces use different rendering code initially.
- Stop DataDuck's eager DuckDB warm-up on the empty screen. Load only the selected engine and its UI chunk. Switching away must terminate the SQLite worker or release DuckDB resources and prevent stale responses from painting the new workspace.

### Privacy and storage gates

- Keep SQLite's read-only authorizer, immutable source-file handling, 512 MB file cap, bounded catalog/results/exports, and worker epoch checks. Regression tests must exercise the real worker and SQLite WASM.
- A merged top-level page cannot retain SeeQLite's current same-origin-only CSP while DataDuck's optional AI calls and analytics are enabled in that page. Treat this as an explicit security review gate, not a cosmetic copy change. Recommended default: remove page analytics from the combined application and allow outbound AI requests only after a user action in the CSV/Parquet workspace. Preserve a narrow, validated AI request builder that cannot read SQLite state. Document the remaining CSP difference honestly. If the stricter network boundary is mandatory, the architecture needs a separately isolated document for the AI feature; resolve that before launch.
- Keep existing storage namespaces. Because both routes share tinycrafts.ai, the merged app can read the SeeQLite localStorage history key from /dataduck/. Import or continue reading that bounded history in SQLite mode without silently deleting it. Keep DataDuck snapshots, recents, AI threads, and keys separate from SQLite history. Never load SQLite SQL into DuckDB snapshots automatically.
- Audit all privacy copy against actual request payloads before release. The combined privacy page must explain which actions stay local, when optional AI is contacted, and whether any page analytics remain.

### PWA and delivery

- Publish one manifest and one service worker under /dataduck/. Merge offline asset coverage so both engine bundles, workers, fonts, and the sample files needed for an offline demo are available after a complete install. Never cache user-selected files, SQL results, database sidecars, or secret values.
- Fix DataDuck's current service-worker cleanup before merging: it deletes every cache whose name differs from dataduck-shell-v5, including sibling TinyCrafts caches. New cleanup must be restricted to a DataDuck-owned prefix. Use versioned, fail-safe updates so an incomplete SQLite WASM download does not replace a working offline installation.
- Keep /seeqlite/ operational during the transition. After parity is proven, replace it with a lightweight migration page and update its old service worker to retire only SeeQLite-owned caches. Provide a clear Open in DataDuck link; a static GitHub Pages host cannot issue a true HTTP 301 redirect. Installed SeeQLite PWAs and offline users need an explicit handoff path. Do not delete the old route or stored history abruptly.
- Update scripts/build-pages.mjs, scripts/verify-pages-build.mjs, and the Pages workflow once the combined app is ready: build one product artifact, verify CSV/Parquet and SQLite assets and the legacy handoff page, and remove the second application build only after its tests have moved. Update the homepage, sitemap, manifest metadata, privacy page, README, and any SeeQLite planning/AGENTS documents that still say it is permanently separate.

## Implementation sequence and exit gates

### Phase 0: Freeze the contract

Inventory both feature sets, storage keys, network calls, service-worker scopes, current tests, bundle sizes, and supported browsers. Record the decision to merge in an architecture note. Agree on the working name/URL, analytics policy, and exact meaning of legacy-route support. Exit when each existing user workflow has an owner in the combined app and privacy claims are written down.

### Phase 1: Shared shell and file routing

Create the common brand/header/theme/open flow and route files by format. Keep existing DataDuck behavior intact. Add focused routing tests for extensions, signatures, sidecars, mixed drops, unsupported types, and oversized SQLite files. Exit when a CSV or Parquet file still opens as before and SQLite selection reaches a stub workspace without loading DuckDB.

### Phase 2: SQLite workspace integration

Port the SeeQLite worker and workspace behind the SQLite adapter. Preserve its catalog, inspector, relationship list and ER diagram, read-only SQL, query plans, bounded export, cancellation, and query history. Use the current fixtures and real-worker tests. Exit when the combined app completes SeeQLite's core E2E flows and leaves the source database unchanged.

### Phase 3: One coherent experience

Unify header actions, file picker, keyboard shortcuts, theme behavior, empty states, error language, and responsive layouts. Resolve shortcut collisions by active workspace. Make mode switching release inactive resources and ignore stale worker responses. Keep AI and analytics controls out of SQLite mode. Exit after keyboard, accessibility, and light/dark review at desktop, tablet, and mobile widths.

### Phase 4: Offline, privacy, and migration

Replace the two PWA registrations with the combined service worker, fix cache scoping, and test complete and interrupted updates. Preserve old storage data and the /seeqlite/ handoff. Update CSP, privacy copy, homepage, sitemap, build scripts, CI, README, and superseded project instructions. Exit when a fresh install and an upgrade from each old route work online and offline.

### Phase 5: Release

Run the consolidated typecheck, unit, real-worker, browser E2E, accessibility, performance, bundle, and Pages-artifact checks. Verify both engine modes in Chromium, Firefox, and Safari/WebKit at supported widths and in both themes. Review network requests for SQLite mode, AI-disabled CSV/Parquet mode, and explicit AI use. Publish only after all gates pass. Verify /dataduck/ and the /seeqlite/ handoff on the live site.

## Specific regression cases

- CSV and Parquet: multi-file switching, schema/profile, SQL, chart, export, CSV recovery, snapshots, and optional AI consent still work.
- SQLite: header detection; malformed and WAL-sidecar rejection; large-file limits; read-only denial of UPDATE, PRAGMA mutations, ATTACH, and other native mutation paths; cancellation; source-byte immutability; catalog/ER/query-plan; bounded rows and exports.
- Cross-mode: opening a SQLite file never invokes DuckDB; opening CSV/Parquet never invokes SQLite; a late response from a closed worker cannot alter the active workspace; SQL/history do not cross dialects; drag/drop and keyboard shortcuts route correctly.
- Privacy: no database bytes, schema, SQL, results, or identifiers leave SQLite mode; AI calls occur only after explicit action in CSV/Parquet mode; no unexpected analytics request occurs under the chosen policy.
- Delivery: both modes open after a fresh online load and after a complete offline install; an interrupted update keeps the previous working shell; cache cleanup preserves MarkV, Pagecrumb, and the legacy SeeQLite cache until its own scoped retirement; old bookmarks and installed-PWA entry points give a usable handoff.

## Rollout and rollback

Develop on a branch and leave the published applications untouched until the combined artifact passes the gates. Stage the new DataDuck app with the old SeeQLite route still available, then switch the homepage to one card and publish the compatibility handoff. Keep the pre-merge source and build configuration recoverable for at least one release. Use non-destructive storage migration so a rollback does not erase query history or AI settings. If launch checks fail, restore the prior build and homepage links while keeping the /seeqlite/ route reachable.

## Done means

- TinyCrafts advertises one data product, and one installable app opens CSV, Parquet, and SQLite through one entry point.
- The format determines the correct engine-specific workspace without a second website or duplicate global controls.
- Existing DataDuck and SeeQLite core workflows pass their adapted tests; SQLite remains read-only and local.
- Optional AI is visibly limited to CSV/Parquet, with truthful network and privacy copy.
- White and dark themes, accessibility, performance, offline behavior, old URLs, and local history migration pass the release gates.
