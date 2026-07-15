# Technology Stack

**Project:** SeeQLite
**Researched:** 2026-07-15
**Mode:** Ecosystem, technical stack only
**Overall confidence:** HIGH, with one MEDIUM-confidence deployment spike called out below

## Executive Recommendation

Build SeeQLite as a static React 19 + TypeScript application with Vite 8. Run the official `@sqlite.org/sqlite-wasm` module inside an application-owned module worker and expose a small, typed request/response protocol to the UI. Use the upstream OO1 API for ordinary statement work and the bound C API only where it gives materially stronger guarantees: database deserialization, authorization, runtime limits, statement read-only checks, and progress timeouts.

Use CodeMirror 6 for SQLite-aware editing, React Flow 12 for the interactive ER canvas, and ELK only for automatic layered layout. Lazy-load the editor and graph chunks. Use `react-resizable-panels` for keyboard-accessible workspace splits rather than writing pointer and ARIA separator behavior from scratch. Keep application state in React reducers and context; no application-wide state library, router, backend, or persistence framework is warranted.

The deployment baseline must move from Node 20.19 to Node 24 LTS. The latest official SQLite WASM npm package declares Node `>=22`, Vite 8 supports Node `^20.19 || >=22.12`, jsdom 29 requires Node `^20.19 || ^22.13 || >=24`, and Node 20 is EOL as of 2026-07-15. Node 24 is the simplest common supported build runtime. This CI change must rebuild and test DataDuck as a regression gate.

The first implementation phase must prove that an in-memory SQLite module worker runs from the real `tinycrafts.ai/seeqlite/`-shaped static artifact without COOP/COEP headers. Upstream requires those headers for its OPFS-oriented worker example, while SeeQLite intentionally does not use OPFS. The expected result is that transient SQLite works and OPFS is unavailable. Do not build the full application until that exact production topology passes Chromium, Firefox, and WebKit smoke tests.

## Recommended Stack

### Build Runtime and Core Framework

| Technology | Recommended version | Pinning | Purpose | Why |
|---|---:|---|---|---|
| Node.js | 24 LTS (`24.x`) | CI major line | Build and test runtime | Node 24 is an active LTS line and satisfies current SQLite WASM, Vite, Vitest, and jsdom requirements. Node 20 in the current Pages workflow is EOL. |
| npm | Version bundled with Node 24 | CI runtime | Dependency installation and lockfile | Matches the existing repository workflow. Do not introduce a second package manager. |
| React | `19.2.7` | Exact with `react-dom` | Workspace UI | Matches DataDuck's React 19 direction, is compatible with React Flow and resizable panels, and suits the editor/diagram/result state transitions. |
| React DOM | `19.2.7` | Exact with React | Browser renderer | Must stay on the same patch as React to avoid peer mismatch. |
| TypeScript | `7.0.2` | Exact initially | Typed worker protocol and domain models | The worker boundary, SQLite value types, catalog model, and graph model benefit directly from compile-time contracts. TypeScript 7 is a fresh major, so pin and treat dependency type failures as a phase-one spike. |
| Vite | `8.1.4` | Exact initially | Dev server, module worker, WASM/static build | First-party React integration, explicit module-worker support, static output, and subpath-aware asset handling align with the existing DataDuck build. |
| `@vitejs/plugin-react` | `6.0.3` | Exact initially | React Fast Refresh and JSX integration | Official Vite React plugin compatible with Vite 8. |

### SQLite Runtime

| Technology | Recommended version | Pinning | Purpose | Why |
|---|---:|---|---|---|
| `@sqlite.org/sqlite-wasm` | `3.53.0-build1` | **Exact** | SQLite engine in WebAssembly | It is the official SQLite npm subproject, uses SQLite semantics, ships TypeScript declarations, exposes OO1 and C-style bindings, and is browser-focused. Exact pinning prevents silent engine/binding changes. |
| Application-owned module worker | Browser primitive | N/A | Keep all SQLite work off the UI thread | Upstream explicitly encourages loading the module as a library in a worker. It avoids the deprecated Worker1/Promiser APIs and keeps synchronous SQLite internals private. |
| OO1 `DB` and `Stmt` APIs | From SQLite package | Package-pinned | Normal prepare, bind, step, finalize, and column access | The higher-level API reduces pointer management for routine statement execution while still interoperating with C bindings when needed. |
| Bound SQLite C API | From SQLite package | Package-pinned | Import and safety controls | Use only for `sqlite3_deserialize`, `sqlite3_set_authorizer`, `sqlite3_stmt_readonly`, `sqlite3_limit`, `sqlite3_progress_handler`, and byte-aware BLOB handling. Do not wrap the full C API. |

#### Required SQLite integration rules

1. Import the selected file by transferring its `ArrayBuffer` to the database worker, allocating a fixed WASM buffer with `sqlite3.wasm.allocFromTypedArray()`, and calling `sqlite3_deserialize()` with `SQLITE_DESERIALIZE_READONLY`.
2. Do not use `SQLITE_DESERIALIZE_RESIZEABLE`. Upstream documents allocator caveats, and v1 has no write path that needs growth.
3. Prefer explicit pointer cleanup on database close. Do not assume `SQLITE_DESERIALIZE_FREEONCLOSE` is safe across arbitrary custom builds; canonical builds currently share an allocator, but explicit ownership is easier to audit.
4. Install the authorizer before compiling user SQL. Deny data/schema writes, `ATTACH`, `DETACH`, extension loading, and writable PRAGMAs. Allow only the catalog reads and read-only statement operations SeeQLite documents.
5. Also check `sqlite3_stmt_readonly()` after prepare. It is defense in depth, not a replacement for the authorizer because SQLite documents that it still returns true for transaction controls and `ATTACH`/`DETACH`.
6. Apply connection-local `sqlite3_limit()` values for SQL length, column count, expression depth, compound selects, and function arguments. Use SQLite limits plus application row/cell/file caps rather than regex heuristics.
7. Use a progress handler for a preconfigured wall-clock timeout. A normal `postMessage` cancel request cannot run while synchronous SQLite occupies the worker event loop, so the user Cancel action must terminate the worker and rehydrate the retained `File` into a new worker.
8. Prepare one statement and inspect the unconsumed SQL tail to reject ambiguous multi-statement input. Do not add a JavaScript SQL parser solely for statement splitting.
9. A database whose header indicates WAL mode needs special handling. `sqlite3_deserialize()` does not directly accept WAL-mode content. Phase one must test a copied-buffer header normalization path, never mutate the source file, and display that `.wal` sidecar changes are not included. If correctness cannot be demonstrated, reject WAL-mode inputs with checkpoint instructions.

### Editor and Workspace

| Library | Recommended version | Purpose | When to use |
|---|---:|---|---|
| `codemirror` | `6.0.2` | Editor basic setup | Editor state, selection, keyboard commands, accessibility, undo/redo, and extension composition. |
| `@codemirror/lang-sql` | `6.10.0` | SQLite syntax and catalog completion | Configure with the exported `SQLite` dialect and a schema object derived from the current catalog. The former GitHub repository was archived because the source moved to the maintainer's own host, not because the package was abandoned. |
| `react-resizable-panels` | `4.12.2` | Explorer/workspace and editor/results splits | Use its semantic `Separator` components, keyboard resize behavior, minimum sizes, collapse behavior, and locally persisted layout. |
| `lucide-react` | `1.24.0` | Interface icons | Use named imports only. Every icon-only control still needs an accessible label. |
| `@fontsource-variable/inter` | `5.2.8` | TinyCrafts UI typography | Self-host the font, avoid runtime requests to Google Fonts. |
| `@fontsource-variable/jetbrains-mono` | `5.2.8` | SQL, schema, and value typography | Self-host and subset to the characters/weights actually used if the bundle audit warrants it. |

### ER Diagram

| Library | Recommended version | Purpose | When to use |
|---|---:|---|---|
| `@xyflow/react` | `12.11.2` | Interactive schema canvas | Pan, zoom, fit, minimap, focusable nodes/edges, selection, custom table nodes, and viewport management. Keep nodes non-destructive; SeeQLite is a viewer. |
| `elkjs` | `0.11.1` | Layered automatic layout and edge routing | Lazy-load only when the ER view opens or the user requests Arrange. Use one constrained layered configuration, not an exposed layout-engine settings panel. |

React Flow already provides keyboard focus and screen-reader hooks, but the canvas is not the only accessible representation. The implementation must also render the same declared foreign keys as a structured relationship list. ELK is justified over Dagre because SQLite schemas can contain cycles, self-references, composite relations, multiple handles, and non-tree components. Its complexity must be isolated behind one `layoutSchemaGraph()` adapter.

Do not add an ER-specific global state store. React Flow may use Zustand internally as a transitive dependency, but SeeQLite application state should remain in React reducer/context boundaries.

### Styling and Design System

| Choice | Recommendation | Rationale |
|---|---|---|
| Styling | Plain CSS files with custom properties and component classes | TinyCrafts already has a small, specific visual language. A CSS framework would add a second design vocabulary and bundle/runtime cost. |
| Theme | `data-theme="light|dark"` on the root, initialized from saved preference then `prefers-color-scheme` | Matches the TinyCrafts pattern and gives equal light/dark support without duplicating components. |
| Tokens | Reuse TinyCrafts paper/ink/rule/blue tokens, 36px grid texture, compact radii, Inter/JetBrains Mono | Makes SeeQLite belong to the catalogue while allowing a denser developer workspace. |
| Icons | Lucide, named imports | Consistent and tree-shakeable. Do not use emoji or mixed icon sets. |
| Motion | CSS transitions with `prefers-reduced-motion` overrides | No animation library is needed. Diagram fit/layout changes should avoid long or non-dismissible motion. |

### Persistence, Export, and Offline Support

| Capability | Recommended primitive | Why |
|---|---|---|
| Database input | Native `<input type="file">` plus drag/drop | Portable across evergreen Chromium, Firefox, and Safari. File System Access is optional enhancement only. |
| Database lifetime | Retained `File` in memory plus transferred buffers per worker generation | Enables cancel-by-termination and rehydration without storing database bytes. |
| Query history | `localStorage` with a versioned, bounded JSON record | History is small and synchronous. Store SQL, timestamp, duration/status, and a non-reversible local database fingerprint only. Never store rows, schema dumps, or file bytes. Fall back to session memory on quota/privacy errors. |
| Diagram/workspace preferences | `localStorage`, versioned keys | Only small UI preferences are persistent. No IndexedDB wrapper is needed. |
| CSV/JSON export | Browser `Blob`, `URL.createObjectURL`, and small in-house encoders | Exports are limited to the displayed result. A CSV library is unnecessary if RFC 4180 quoting, line endings, nulls, BLOBs, and spreadsheet formula-prefix mitigation are thoroughly tested. |
| PWA | Hand-written `manifest.webmanifest` and small service worker, following DataDuck's root-asset pattern | Cache the versioned app shell, worker, fonts, and WASM. Never cache opened databases, query results, or generated exports. Workbox or a PWA plugin is not justified for this small static precache. |

### Testing and Quality Tooling

| Tool | Recommended version | Scope | Notes |
|---|---:|---|---|
| Vitest | `4.1.10` | Pure domain, worker-controller, catalog-to-graph, serialization, and React component tests | Compatible with Vite 8. Do not pretend jsdom can validate the real SQLite worker/WASM path. |
| jsdom | `29.1.1` | DOM environment for focused component tests | Requires a supported Node line; Node 24 satisfies it. |
| React Testing Library | `16.3.2` | User-observable component behavior | Prefer roles, names, focus, and visible state over component internals. |
| `@testing-library/user-event` | `14.6.1` | Keyboard and pointer interaction | Use for editor-shell controls, split panes, dialogs, and history interactions. |
| Playwright Test | `1.61.1` | Real worker, WASM, file upload, PWA, and cross-engine E2E | Run Chromium, Firefox, and WebKit projects. WebKit is CI coverage, not a substitute for a final manual Safari smoke test. |
| `@axe-core/playwright` | `4.12.1` | Automated accessibility regressions | Supplement, not replace, keyboard and screen-reader-oriented assertions. |
| `@vitest/coverage-v8` | Match Vitest `4.1.10` | Unit/integration coverage | Enforce meaningful module thresholds, not a single vanity repository percentage. |

Required package scripts should be small and explicit:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "build": "npm run typecheck && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "check:bundle": "node scripts/check-seeqlite-bundle.mjs"
  }
}
```

No lint stack is pinned in this report. TypeScript 7 is new enough that the implementation phase should verify the then-current ESLint and TypeScript-ESLint compatibility before adding them. This is a bounded phase-one tooling spike, not permission to ship without static analysis. Do not pin guessed versions.

## Vite and Deployment Configuration

The production configuration should begin with these constraints:

```ts
export default defineConfig({
  base: './',
  plugins: [react(), copyRootPwaAssets(), preserveRootPwaLinks()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
    sourcemap: true,
  },
})
```

- Construct the database worker with `new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })`; do not hard-code worker filenames.
- Preserve SQLite WASM as a separate asset. The Pages verification script must assert that built JS, CSS, worker, WASM, manifest, service worker, and icons exist under `seeqlite/`.
- Keep `base: './'` because the root build copies `SeeQLite/dist` to `.pages-build/seeqlite` and TinyCrafts deploys under a custom-domain subpath.
- Extend `.github/workflows/pages.yml` to use Node 24, cache both lockfiles, run `npm ci` in both `dataduck/` and `SeeQLite/`, build both apps, then run the combined Pages artifact verifier.
- The Node change affects an existing product. Acceptance requires DataDuck's build, tests, and bundle check to pass on Node 24 before SeeQLite is merged.
- Keep all runtime assets same-origin. Do not load fonts, editor workers, diagram code, SQLite WASM, or analytics from CDNs.

## Browser and Hosting Constraints

| Constraint | Design response | Verification |
|---|---|---|
| GitHub Pages cannot be relied on for custom COOP/COEP response headers | No OPFS, shared memory, or `SharedArrayBuffer` dependency in v1. Use transient deserialization in the app-owned worker. | Phase-one deploy-shaped smoke fixture on a headerless static server and the final Pages artifact. |
| Upstream's npm README warns that its OPFS worker example needs COOP/COEP and cannot run on GitHub Pages | Treat in-memory module-worker compatibility as a release-blocking spike. Expected fallback is to revisit hosting or SQLite packaging, not to move database work onto the main thread silently. | Open a fixture, run `SELECT sqlite_version()`, close, reopen, cancel a long query, and rehydrate in Chromium, Firefox, and WebKit. |
| Service workers require a secure context | Production uses HTTPS; local development uses localhost. The app still works online if service-worker registration fails. | Negative E2E with registration rejected and normal app workflow still available. |
| Browser memory limits vary, especially on mobile/WebKit | One database only, transfer buffers, 256 MiB warning, 512 MiB hard v1 cap, 1,000-row and column/cell caps, explicit statement finalization, worker termination on cancel. | Real 64/128/256 MiB fixtures plus synthetic cap tests; do not put a 512 MiB file in the repository. |
| WASM execution may require CSP allowance | Start with `script-src 'self' 'wasm-unsafe-eval'`; verify whether each target needs the directive. Keep `worker-src 'self'`. Libraries that position/render dynamically may require constrained inline style allowance. | Production-artifact E2E under the exact CSP meta tag; fail on console CSP violations. |
| A meta CSP cannot enforce all header-only protections | Do not claim header-level clickjacking or cross-origin isolation guarantees on GitHub Pages. Document the limitation. | Inspect the deployed response headers and rendered meta CSP during release verification. |
| Safari is not identical to Playwright WebKit | WebKit remains CI coverage; release checklist includes current stable Safari on macOS and one iOS/iPadOS smoke path when practical. | Manual release evidence. |

## Dependency Loading Strategy

Keep the app shell small and load costly capabilities only after they are useful:

1. Initial chunk: React shell, file drop/open flow, theme, compact status UI.
2. Database worker + SQLite WASM: initialize after a file is selected or during idle time after explicit user intent. Do not download it merely to show the landing state on constrained connections.
3. CodeMirror: load when the Query workspace first opens.
4. React Flow: load when the ER workspace first opens.
5. ELK: load only for automatic Arrange. Preserve manual positions and cached layout so tab switches do not recompute.

The bundle check should report gzip and raw sizes separately for the initial JS, editor chunk, graph chunk, ELK chunk, worker, and WASM. Establish budgets from the first measured implementation rather than inventing a single aggregate threshold that hides WASM or ELK growth. Any dependency that moves into the initial chunk requires an explicit review.

## Application State Recommendation

Use one top-level reducer with narrow contexts, plus feature-local state:

- `database`: generation, lifecycle status, safe file metadata, catalog summary, fatal/recoverable error.
- `workspace`: active mode, selected object, split layout, responsive drawers.
- `query`: editor text, selection, execution status, bounded result metadata, query plan.
- `diagram`: active table subset, positions, filters, selected node/edge.
- `history`: bounded local records and storage availability.

Keep database handles, statements, raw file buffers, and SQLite objects inside the worker. Do not place non-serializable engine values in React context. The main thread only receives stable domain DTOs and capped result batches.

## Alternatives Considered

| Category | Recommended | Alternative | Why not for v1 |
|---|---|---|---|
| SQLite engine | Official `@sqlite.org/sqlite-wasm` | `sql.js` | Mature and simpler in some cases, but not the official SQLite WASM subproject and would give up direct alignment with upstream's current JS/C bindings and deprecation guidance. Keep as contingency only if the Pages worker spike fails. |
| SQLite engine | Official SQLite WASM | `wa-sqlite` | Valuable VFS ecosystem, but adds adapter and implementation choices SeeQLite does not need for transient, single-file, read-only use. |
| Query engine | SQLite WASM | DuckDB-WASM | DuckDB is excellent for analytics but is the wrong source of truth for SQLite catalog semantics, PRAGMAs, query plans, affinities, and virtual tables. |
| Worker API | App-owned typed worker | SQLite Worker1/Promiser | Explicitly deprecated and actively discouraged upstream for non-toy software as of 2026-04-15. |
| Threading | Dedicated module worker | Main-thread SQLite | Simpler wiring but violates the responsiveness requirement and makes cancellation/recovery worse. |
| Persistence | Transient deserialize | OPFS VFS/SAH pool | Durable database persistence is out of scope, adds concurrency/storage cleanup behavior, and the primary OPFS VFS needs headers unavailable on TinyCrafts Pages. |
| UI framework | React 19 | Vanilla DOM | DataDuck demonstrates vanilla patterns, but CodeMirror, graph canvas, resizable workspace, responsive modes, and coordinated async state justify a component model. |
| UI framework | React 19 | Vue/Svelte | Capable, but introduces another framework into TinyCrafts with no product benefit. React is already used by DataDuck and required by React Flow. |
| Editor | CodeMirror 6 | Textarea | A textarea repeats DataDuck's weakest editor trade-off and lacks syntax trees, completion, accessible commands, selection-aware execution, and extension composition. |
| Editor | CodeMirror 6 | Monaco | Larger and oriented around a VS Code-style language-service architecture SeeQLite does not need. CodeMirror exposes SQLite dialect and schema completion directly. |
| ER canvas | React Flow | Hand-rolled SVG/canvas | Pan/zoom/focus/selection/minimap/edge interaction and accessibility are non-trivial and not product differentiation. |
| ER layout | ELK | Dagre | Dagre is simpler, but ER graphs are not necessarily trees and need cycles, variable node sizes, multiple relation ports, and better routing. Isolate ELK to contain its complexity. |
| Result grid | Semantic HTML table | TanStack Table/AG Grid | Results are deliberately capped. Native table semantics plus sticky CSS and a small sort layer are sufficient; enterprise grid behavior is out of scope. |
| App state | React reducer/context | Redux/Zustand | State volume and ownership do not justify another application dependency. React Flow's internal Zustand is an implementation detail, not an app architecture. |
| Runtime validation | Small handwritten worker guards | Zod | The protocol is private, same-origin, discriminated, and versioned. A schema library adds bundle weight without replacing the need for SQLite result validation. Revisit only if the protocol becomes public or persisted. |
| PWA | Small custom service worker | Workbox / Vite PWA plugin | SeeQLite has one static shell and no background sync or runtime caching policy. DataDuck already supplies a simpler local precedent. |
| Styling | Plain CSS + TinyCrafts tokens | Tailwind/component kit | Would duplicate the existing visual system and encourage generic dashboard styling. |
| CSV | Small tested encoder | Papa Parse | v1 exports an already materialized bounded grid and does not parse CSV. A dedicated dependency is unnecessary. |
| SQL parsing | SQLite prepare/tail | JavaScript SQL parser | SQLite itself is the authoritative parser; an additional parser risks dialect disagreement and is not needed for v1. |

## YAGNI Guardrails

Do not add these unless a later validated requirement changes the product boundary:

- Backend, API server, authentication, telemetry, sync, share links, or cloud storage.
- OPFS database persistence, multi-tab database coordination, or File System Access as a requirement.
- Multiple open databases, cross-database joins, `ATTACH`, or mutable SQL.
- AI SQL generation, relationship inference, plugin/extension loading, or SQLCipher.
- Virtualized/enterprise data grid before measured capped-result rendering demonstrates a problem.
- Router, global store, command bus, repository layer, dependency-injection container, or general RPC framework.
- Diagram editing, freeform notes, collaboration, arbitrary graph layout settings, or image export.
- Full unbounded export or background export worker.
- Generic design-system package. Keep tokens and primitives local until a second TinyCrafts React tool proves reuse.

## Implementation Spikes and Exit Criteria

### Spike 1: Headerless Pages-compatible SQLite worker, release blocking

Build the smallest static Vite artifact that imports `@sqlite.org/sqlite-wasm` inside an app-owned module worker, deserializes a tiny database, runs `SELECT sqlite_version()`, and returns rows.

**Exit criteria:**

- Works under a static server without COOP/COEP in Playwright Chromium, Firefox, and WebKit.
- Built output uses relative URLs under `/seeqlite/` and loads the worker and WASM with no 404, MIME, CORS, or CSP error.
- `crossOriginIsolated === false` is recorded and the transient query still succeeds.
- OPFS is not initialized or required.
- If it fails in any engine, stop. Compare a vendored official vanilla SQLite WASM build and `sql.js`, or change hosting. Do not move production queries to the UI thread as an undocumented fallback.

### Spike 2: Read-only deserialization and ownership

Prove `allocFromTypedArray` + `sqlite3_deserialize(SQLITE_DESERIALIZE_READONLY)` + explicit cleanup with valid, corrupt, zero-byte, WAL-header, and oversized fixtures.

**Exit criteria:**

- Repeated open/close cycles do not leave open statements or show monotonic worker-memory growth beyond measurement noise.
- DDL/DML, writable PRAGMA, `ATTACH`, and `DETACH` fail through SQLite authorization with a SeeQLite-safe error.
- Source file bytes are unchanged.
- WAL behavior is documented by a fixture and either safely normalized in the copied buffer with a warning or rejected with checkpoint guidance.

### Spike 3: TypeScript 7 and package declarations

Compile a minimal import of SQLite OO1/C APIs, CodeMirror SQLite config, React Flow custom nodes/edges, ELK, and resizable panels under the proposed strict TypeScript configuration.

**Exit criteria:**

- `tsc --noEmit` passes without application-wide `skipLibCheck` being used to conceal local type errors.
- Any unavoidable upstream declaration workaround is isolated in one adapter or `.d.ts` file with an upstream issue link.
- ESLint/TypeScript-ESLint versions are selected from current official compatibility guidance at implementation time.

### Spike 4: Bundle and graph threshold

Build a representative 100-table/150-relation fixture and measure editor, graph, ELK, worker, and WASM chunks.

**Exit criteria:**

- Editor, React Flow, and ELK are absent from the initial file-open chunk.
- Automatic layout does not block primary UI input for more than 100 ms on the reference desktop. If it does, move ELK behind a dedicated layout worker.
- The 100-table diagram can pan, zoom, fit, select, and switch to its relationship list without an unresponsive-page warning.

## Version and Dependency Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite WASM package changes frequently with SQLite releases | Medium | High | Exact pin, committed lockfile, worker contract tests, manual upgrade PRs, and a database fixture corpus. |
| SQLite Worker1 examples remain easy to copy despite deprecation | Medium | High | Ban Worker1/Promiser imports in code review and add a source scan to the bundle/build check. |
| GitHub Pages header limitations conflict with an upstream worker example | Medium | High | Complete Spike 1 before feature work; keep OPFS out of v1. |
| Current Pages CI uses EOL Node 20.19 | Certain | High | Move to Node 24 LTS and regression-build DataDuck. |
| TypeScript 7 is a fresh major | Medium | Medium | Exact pin, strict typecheck, adapter-local workarounds, verified lint compatibility. |
| `elkjs` is a comparatively large, complex dependency | Medium | Medium | Lazy-load, one adapter/configuration, measured threshold, optional separate worker only if needed. |
| React Flow or CodeMirror styles conflict with TinyCrafts/CSP | Medium | Medium | Theme through documented extension APIs, avoid global overrides, test exact CSP and both themes. |
| WebKit memory behavior differs from Chromium | Medium | High | Conservative file/result caps, transfer buffers, worker recovery, WebKit E2E, manual Safari release test. |
| Service-worker updates leave stale worker/WASM pairs | Medium | High | Versioned asset precache, atomic cache rollover, no cache-first HTML forever, update/reload E2E. |
| Transitive dependency license/notice obligations are missed | Low | Medium | Generate a release dependency/license inventory; retain MIT/Apache/EPL notices as required. |

## Proposed Dependency Declaration

The following is the target declaration for implementation, not a command executed during research. Exact versions should land with one reviewed lockfile.

```json
{
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "@fontsource-variable/inter": "5.2.8",
    "@fontsource-variable/jetbrains-mono": "5.2.8",
    "@sqlite.org/sqlite-wasm": "3.53.0-build1",
    "@xyflow/react": "12.11.2",
    "@codemirror/lang-sql": "6.10.0",
    "codemirror": "6.0.2",
    "elkjs": "0.11.1",
    "lucide-react": "1.24.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-resizable-panels": "4.12.2"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.12.1",
    "@playwright/test": "1.61.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@vitejs/plugin-react": "6.0.3",
    "@vitest/coverage-v8": "4.1.10",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  }
}
```

Add the React and Node type packages using versions verified against React 19 and TypeScript 7 during Spike 3. They are intentionally not guessed here.

## Source Assessment

| Source | What it establishes | Confidence |
|---|---|---|
| [SQLite WASM npm documentation](https://sqlite.org/wasm/doc/trunk/npm.md) | `@sqlite.org/sqlite-wasm` is an official SQLite subproject and browser-only package. | HIGH |
| [SQLite Worker1/Promiser documentation](https://sqlite.org/wasm/doc/trunk/api-worker1.md) | Worker1 and Promiser are deprecated and actively discouraged as of 2026-04-15; upstream recommends loading the module as a library. | HIGH |
| [SQLite OO1 documentation](https://sqlite.org/wasm/doc/trunk/api-oo1.md) | OO1 can be used in a worker and interoperates with C bindings; read-only open flags and statement APIs are available. | HIGH |
| [SQLite C-style WASM documentation](https://sqlite.org/wasm/doc/trunk/api-c-style.md#sqlite3_deserialize) | Deserialization allocator ownership and fixed-buffer caveats. | HIGH |
| [SQLite deserialize C API](https://sqlite.org/c3ref/deserialize.html) | Read-only flags, buffer lifetime, and WAL-mode limitation. | HIGH |
| [SQLite authorizer C API](https://sqlite.org/c3ref/set_authorizer.html) | Authorizer is intended for controlling untrusted SQL but should be paired with limits. | HIGH |
| [SQLite runtime limits](https://sqlite.org/c3ref/limit.html) | Per-connection limits are intended for untrusted databases/SQL. | HIGH |
| [SQLite statement read-only API](https://sqlite.org/c3ref/stmt_readonly.html) | Read-only checks have documented exceptions including transaction control and `ATTACH`/`DETACH`. | HIGH |
| [SQLite progress handler](https://sqlite.org/c3ref/progress_handler.html) | Progress callbacks can interrupt work and enforce timeouts. | HIGH |
| [Official SQLite WASM npm repository](https://github.com/sqlite/sqlite-wasm) | Current package usage, Vite exclusion, worker example, header warning, and release model. | HIGH |
| [npm registry: SQLite WASM](https://registry.npmjs.org/%40sqlite.org%2Fsqlite-wasm/latest) | Current `3.53.0-build1`, package exports, and Node `>=22` declaration. | HIGH |
| [Vite features](https://vite.dev/guide/features.html#web-workers) | Module worker construction, TypeScript behavior, WASM/assets, and production build behavior. | HIGH |
| [Vite static deployment](https://vite.dev/guide/static-deploy.html#github-pages) | Vite's static Pages deployment and base-path requirements. | HIGH |
| [Node release schedule](https://nodejs.org/en/about/previous-releases) | Node 24 and 22 are LTS, Node 20 is EOL at research time. | HIGH |
| [CodeMirror SQL package](https://github.com/codemirror/lang-sql) | SQLite dialect and schema-driven completion; repository move notice. | HIGH |
| [CodeMirror completion docs](https://codemirror.net/examples/autocompletion/) | Accessible completion extension and custom/schema sources. | HIGH |
| [React Flow layout guide](https://reactflow.dev/learn/layouting/layouting) | ELK handles dynamic sizes, subflows, and edge routing but carries more complexity. | HIGH |
| [React Flow accessibility guide](https://reactflow.dev/learn/advanced-use/accessibility) | Built-in focus, keyboard, ARIA, and live-region behavior. | HIGH |
| [npm registry latest endpoints](https://registry.npmjs.org/) | Exact package versions recorded above on 2026-07-15. | HIGH for registry metadata |
| Local `dataduck/package.json`, `dataduck/vite.config.js`, `scripts/build-pages.mjs`, and `.github/workflows/pages.yml` | Existing TinyCrafts React/Vite conventions, relative asset strategy, Pages assembly, and current Node 20.19 CI. | HIGH |

## Known Gaps

- The exact headerless behavior of `@sqlite.org/sqlite-wasm` in an application-owned transient worker on the final TinyCrafts Pages artifact has not been executed in this research task. Spike 1 is mandatory and release blocking.
- The exact React/Node type package versions and ESLint/TypeScript-ESLint compatibility for TypeScript 7 were not resolved before this report was finalized. Spike 3 must use current official compatibility guidance.
- Bundle sizes and practical memory ceilings cannot be inferred reliably from registry unpacked sizes. Measure the real production chunks and database fixtures before locking budgets.
- Playwright WebKit does not prove every Safari behavior. Keep a manual Safari release smoke test.

## Bottom Line

The recommended stack is intentionally small: one framework, one official database engine, one editor, one graph renderer, one layout engine, one accessible split-pane utility, browser-native storage/export/PWA primitives, and one unit plus one real-browser test stack. The architecture should remain a local static application. The only pre-feature decision gate is proving the official SQLite module worker under TinyCrafts' headerless GitHub Pages topology.
