# Phase 6 release evidence — automated checkpoint

Recorded: 2026-07-16

This checkpoint covers the incremental ER discoverability, safe-copy, query-plan, and internal-object catalog work completed after the original Phase 6 hardening pass. It intentionally does not close the phase: current Safari/VoiceOver, NVDA, forced-colors/200% zoom, and deployed response-header evidence remain manual gates.

## Product acceptance criteria

| ID | Acceptance criterion | Evidence | Status |
|---|---|---|---|
| CAT-05 | A selected table exposes a quoted identifier and a bounded `SELECT * ... LIMIT 100` action; clipboard denial leaves a visible recovery message. | `src/App.tsx` (`TableDetails`, `copyWithSelection`); `tests/e2e/app.spec.ts` relationship test | PASS |
| CAT-01 | The opened catalog can be searched by object or column name with bounded filtered counts and an explicit no-match state; SQLite internals are hidden by default and revealed by an explicit toggle. | `src/App.tsx` (`catalogSearch`, `filteredTables`, `showInternalObjects`); `src/engine/sqlite.worker.ts` (`PRAGMA table_list`); `tests/e2e/app.spec.ts` internal-object test | PASS for search/toggle/runtime object discovery |
| CAT-02 | Selected objects expose bounded column/index details, nullable CREATE SQL, explicit STRICT/rowid metadata, generated/hidden flags, ordered expression columns, uniqueness, origin, partial status, and bounded predicate text without inventing definitions. | `src/engine/protocol.ts` (`CatalogDetails`, `CatalogIndexColumn`); `src/engine/sqlite.worker.ts` (`readCatalogDetails`, `readIndexColumns`, `indexPredicate`); `src/App.tsx` (`TableDetails`); cross-engine internal-object, malformed-object, and virtual/shadow fixture tests | PASS for ordinary, STRICT/WITHOUT ROWID, broken-view, and FTS5 virtual/shadow metadata; exotic virtual modules remain future fixture coverage |
| CAT-04 | Normal catalog summaries stay eager while selected-object index details load lazily, deduplicate, remain bounded, isolate malformed metadata, degrade to searchable limited mode, cap the catalog DOM at 100 rows, and cannot overwrite a newer database generation. | `src/engine/database-client.ts` (`details`); `src/App.tsx` (`selectTable`, catalog paging/limit/diagram guards); `src/engine/sqlite.worker.ts` (`readCatalog`, 5,000-object/50,000-column/5,000-index bounds); cross-engine malformed/5,001-object timing tests | PASS for the approved catalog boundary and 100-row DOM budget; broader 25/50 MiB and low-memory matrices remain open |
| FILE-04 | Obvious SQLite `-wal`, `-shm`, and `-journal` sidecars are rejected before bytes reach the worker. | `src/App.tsx` (`isSQLiteSidecarName`); `tests/e2e/app.spec.ts` sidecar test | PASS |
| ER-04 | Declared foreign keys are available in a keyboard-readable list independent of the SVG canvas, with direction, many-to-one semantics, source/target columns, and table navigation. | `src/App.tsx` (`RelationshipList`, unresolved preservation); `src/styles/app.css`; cross-engine relationship fixture test | PASS for ordered pairs, ON UPDATE/DELETE/MATCH rules, resolution status, missing parents, parallel/self links, and table actions; manual AT remains |
| SAFE-02 | SQLite-level query-length/column/compound/expression/function/attach/trigger/worker limits are applied, with catalog-specific bounds retained and explicit limited-mode degradation in the worker. | `src/engine/sqlite.worker.ts` (`configureReadOnly`, `readCatalog`); 5,001-object limited fixture and cross-engine bounded-mode test | PASS for the approved 5,000-object/50,000-column catalog contract; broader low-memory stress remains open |
| SQL-02 | SQLite’s prepare/tail API rejects trailing statements and bound parameters before execution; no custom JavaScript statement scanner remains. | `src/engine/sqlite.worker.ts` (`assertSingleStatement`); `tests/e2e/app.spec.ts` trailing/native-policy tests | PASS for the implemented single-statement/parameter boundary |
| ER-05 | A resolved relationship generates centrally quoted read-only join SQL, supports composite/implicit parent keys, and asks before replacing a non-empty draft; cancel leaves the draft intact. | `src/App.tsx` (`buildJoinSql`, `generateJoin`); cross-engine relationship fixture and generated-join tests | PASS for composite implicit keys, self joins, unresolved disablement, and dirty-draft confirmation; broader identifier fuzzing remains |
| PLAN-01 | Query plans are presented as an accessible bounded list with parent indentation, already-explained SQL is not nested, and a new query cannot leave a stale plan visible. | `src/App.tsx` (`PlanTree`, `runPlan`, invalidation); cross-engine plan, hostile-detail, and stale-plan tests | PASS for implemented tree/list, already-explained, hostile inert text, and stale invalidation; empty-plan remains a SQLite-runtime edge |
| A11Y-01 | New relationship, copy, metadata, toggle, paging, and forced-colors controls preserve serious/critical axe cleanliness in light/dark themes and all three browser engines. | `npm run test:e2e` (93/93; axe plus forced-colors/zoom/reduced-motion paths in Chromium/Firefox/WebKit) | PASS for automated gates; manual Safari/VoiceOver/NVDA remains |
| REL-01 | The new surface does not regress type safety, production bundle budgets, worker behavior, exports, history, cancellation, or hostile-query paths. | Commands below | PASS |
| OFF-01/OFF-02 | Complete built-artifact precache supports repeat shell reload, excludes database/sidecar paths, and preserves sibling caches through scoped activation. | `scripts/build-service-worker.mjs`, generated `dist/sw.js`, `tests/e2e/app.spec.ts` offline cache test, `scripts/check-seeqlite-bundle.mjs` | PASS for Chromium/Firefox offline reload and WebKit cached-document contract; manual Safari reload/update remains |
| OFF-03 | Service-worker registration failure is visible without blocking the core workflow. | `src/main.tsx`, `src/App.tsx` offline-unavailable status event | PASS for registration/unsupported fallback path |
| REL-02 | Pages artifact and sibling DataDuck build/test/bundle contracts remain green. | Commands below | PASS |

## Automated commands

```text
SeeQLite: npm test                         PASS (1 test)
SeeQLite: npm run typecheck                 PASS
SeeQLite: npm run build                     PASS
SeeQLite: npm run check:bundle              PASS (24 emitted assets)
SeeQLite: npm run test:e2e                  PASS (93 tests; Chromium, Firefox, WebKit)
SeeQLite: offline shell E2E                 PASS (Chromium/Firefox reload; WebKit cache contract)
SeeQLite: npm audit --omit=dev --audit-level=high PASS (0 production vulnerabilities)
SeeQLite: focused negative E2E                 PASS (9 tests; trailing SQL, native policy, sidecars)
SeeQLite: catalog boundary E2E                 PASS (virtual/shadow fixture plus 5,001-object limited-mode timing in all three engines)
Pages:    node scripts/build-pages.mjs      PASS
Pages:    node scripts/verify-pages-build.mjs PASS
DataDuck: npm --prefix dataduck test        PASS (195 tests / 54 files)
DataDuck: npm --prefix dataduck run build   PASS (existing >500 kB chunk warnings)
DataDuck: npm --prefix dataduck run check:bundle PASS
DataDuck: npm --prefix dataduck audit --omit=dev --audit-level=high PASS (0 production vulnerabilities; full dev audit reports 9 advisories)
```

## Remaining release gates

- Record current released Safari + VoiceOver and Windows NVDA workflow evidence, including forced colors, 200% zoom, reduced motion, IME, result containment, ER-list parity, and a real offline reload/update.
- Capture deployed Pages response headers/MIME/service-worker scope and rehearse rollback; retain the documented meta-CSP limitation when host headers are unavailable.
- Keep the DataDuck advisory inventory visible: its full development-tree audit reports 9 upstream moderate/high/critical transitive advisories even though its production-only audit and test/build/bundle gates pass; SeeQLite production-only audit is clean.
- Continue the broader requirement gaps already called out in `REQUIREMENTS.md` (25/50 MiB import and low-memory matrices, dedicated empty-plan fixture, and complete exotic virtual-module golden coverage).
- CAT-02/CAT-04 follow-up: add exotic virtual-module and low-memory/25–50 MiB matrix coverage before widening release claims.
- Automated accessibility follow-up: current Safari/VoiceOver and Windows NVDA evidence remains manual even though forced-colors/zoom/reduced-motion automation is green.
