# Walking Skeleton — SeeQLite

**Phase:** 1
**Generated:** 2026-07-15

## Capability Proven End-to-End

> A supported-browser user can load the production-shaped `/seeqlite/` artifact, open a committed SQLite fixture locally, and run the fixed `SELECT 1 AS ready` check through official SQLite WASM in an application-owned module worker without database-derived network traffic.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React 19, strict TypeScript, Vite 8, Node 24, npm | Matches the repository's React/Vite direction while keeping the worker protocol and domain boundaries strongly typed. |
| Data layer | Exact-pinned official `@sqlite.org/sqlite-wasm` in one application-owned module worker | Preserves SQLite semantics, keeps synchronous database work off the main thread, and avoids the deprecated Worker1/Promiser surface. |
| Database ownership | One transient connection per worker epoch; main thread retains only the browser `File` | Makes replacement and recovery explicit while preventing SQLite handles or duplicate retained buffers from entering UI state. |
| Authorization | No editable SQL in this phase; fixed readiness command only, with the connection prepared for Phase 2's connection-lifetime policy | Proves the runtime topology without implying that a fixed query is a complete read-only boundary. |
| State | React reducer/context plus a typed `DatabaseClient`; no global state library | One database and one serialized worker queue do not justify another state framework. |
| Styling | Plain CSS custom properties using the approved TinyCrafts light/dark contract | Keeps SeeQLite visually native to TinyCrafts and avoids a second design vocabulary. |
| Test boundary | Vitest for pure/component seams; Playwright against the built artifact in Chromium, Firefox, and WebKit | Engine and asset guarantees require real browsers, the real worker, and real WASM. |
| Deployment target | Static GitHub Pages artifact under `/seeqlite/` with `base: './'` | Matches TinyCrafts hosting and proves operation without COOP/COEP or a backend. |
| Auth | None | Accounts and authentication are outside the local, one-job product boundary. |

## Stack Touched in Phase 1

- [ ] Project scaffold: exact-pinned dependencies, lockfile, strict typecheck, unit/component test runner, Playwright, production build.
- [ ] Routing: one static `/seeqlite/` entry; no client router is introduced.
- [ ] Database: one real read from a committed SQLite fixture through official WASM. A database write is intentionally prohibited by the product contract; the Phase 2 policy suite proves attempted writes are denied instead of adding a write path to satisfy a generic skeleton convention.
- [ ] UI: capability gate, file/sample opener, fixed readiness action, bounded semantic result, recovery/reset, matched themes.
- [ ] Deployment: root Pages assembler emits `.pages-build/seeqlite/`; production-artifact tests exercise that exact subpath.

## Directory Layout Contract

```text
SeeQLite/
├── public/                    # same-origin root assets copied by Vite
├── src/
│   ├── components/            # semantic project-owned UI primitives
│   ├── engine/                # typed client, worker, protocol, SQLite-only code
│   ├── features/              # vertical product capabilities
│   ├── platform/              # capability, theme, storage and browser seams
│   ├── state/                 # serializable reducer/context state only
│   ├── styles/                # inherited TinyCrafts tokens and workspace CSS
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── component/
│   ├── e2e/
│   ├── fixtures/
│   └── integration/
└── scripts/                   # bundle/artifact checks local to SeeQLite
```

## Stable Contracts Produced

- `RequestEnvelope` and `ResponseEnvelope` carry `requestId` and `epoch` on every database message.
- `DatabaseClient` owns exactly one worker generation, rejects all pending work once, and ignores stale-epoch replies.
- `CapabilityReport` distinguishes required failures from optional limitations before file intake is rendered.
- `AppState` contains serializable DTOs only; no connection pointer, statement, raw imported buffer, or SQLite object crosses into React.
- `ReadinessResult` is positional and bounded even though it contains only one column and one row.
- Theme state persists UI metadata only and is applied before first paint through a same-origin bootstrap compatible with the production CSP.

## Prohibitions

- No main-thread SQLite import or execution.
- No Worker1/Promiser API, generalized RPC package, worker pool, second database worker, OPFS, SharedArrayBuffer, or cross-origin-isolation requirement.
- No editable SQL, catalog breadth, ER canvas, export, history, service-worker caching, landing-page catalogue entry, backend, analytics, remote font, or runtime CDN in this phase.
- No database-derived value in a URL, console message, persistent storage, Cache Storage, network request, raw HTML sink, or unbounded DOM attribute.
- No silent fallback when the worker/WASM/subpath spike fails; an ADR is required before dependent work continues.

## Out of Scope for This Skeleton

- Phase 2: complete file classification, replacement/reopen policy, read-only authorizer and SQLite limits, normalized catalog, searchable explorer, lazy details.
- Phase 3: editable CodeMirror workspace, general statement execution, exact result grid, plan, deadline, cancellation recovery, history.
- Phase 4: declared-FK graph, layout worker, relationship list, join generation.
- Phase 5: CSV/JSON export and repeat-offline application shell.
- Phase 6: final security/performance/accessibility ratchets, TinyCrafts landing entry, and public release evidence.

## Subsequent Slice Plan

- Phase 2 builds one safe database generation and normalized catalog without altering the worker ownership contract.
- Phase 3 exposes the already-guarded execution contract through the query workspace and completes cancel/rehydrate.
- Phase 4 derives both visual and structured relationships from the normalized catalog.
- Phase 5 consumes the held result for exports and the stable asset graph for offline shell caching.
- Phase 6 validates public claims against the exact deployed artifact and integrates the TinyCrafts catalogue.

## Skeleton Exit Evidence

- `npm run typecheck`, `npm run test`, `npm run build`, and the three Playwright projects pass from `SeeQLite/`.
- Root Pages assembly and verification include SeeQLite while DataDuck build/tests/bundle checks stay green under Node 24.
- Network, console, URL, storage, and cache capture contains no marker from the user-selected privacy fixture.
- `crossOriginIsolated` is recorded as `false`, worker/WASM assets resolve under `/seeqlite/`, and no root-relative request, CSP violation, or wrong MIME type occurs.
- Missing required capabilities prevent file intake with a named message; unavailable optional storage/offline features do not block readiness.
