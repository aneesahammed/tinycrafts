# Phase 6 release evidence — automated checkpoint

Recorded: 2026-07-16

This checkpoint covers the incremental ER discoverability, safe-copy, query-plan, and internal-object catalog work completed after the original Phase 6 hardening pass. It intentionally does not close the phase: current Safari/VoiceOver, NVDA, forced-colors/200% zoom, and deployed response-header evidence remain manual gates.

## Product acceptance criteria

| ID | Acceptance criterion | Evidence | Status |
|---|---|---|---|
| CAT-05 | A selected table exposes a quoted identifier and a bounded `SELECT * ... LIMIT 100` action; clipboard denial leaves a visible recovery message. | `src/App.tsx` (`TableDetails`, `copyWithSelection`); `tests/e2e/app.spec.ts` relationship test | PASS |
| CAT-01 | The opened catalog can be searched by object or column name with bounded filtered counts and an explicit no-match state; SQLite internals are hidden by default and revealed by an explicit toggle. | `src/App.tsx` (`catalogSearch`, `filteredTables`, `showInternalObjects`); `src/engine/sqlite.worker.ts` (`PRAGMA table_list`); `tests/e2e/app.spec.ts` internal-object test | PASS for search/toggle/runtime object discovery |
| CAT-02 | Selected objects expose bounded column/index details, nullable CREATE SQL, explicit STRICT/rowid metadata, generated/hidden flags, ordered expression columns, uniqueness, origin, partial status, and bounded predicate text without inventing definitions. | `src/engine/protocol.ts` (`CatalogDetails`, `CatalogIndexColumn`); `src/engine/sqlite.worker.ts` (`readCatalogDetails`, `readIndexColumns`, `indexPredicate`); `src/App.tsx` (`TableDetails`); cross-engine internal-object, malformed-object, virtual/shadow, and exotic virtual fixture tests | PASS for ordinary, STRICT/WITHOUT ROWID, broken-view, FTS5, FTS4, and RTree metadata; module-specific unavailable columns remain explicit and inert; `points_archive` remains visible |
| CAT-04 | Normal catalog summaries stay eager while selected-object index details load lazily, deduplicate, remain bounded, isolate malformed metadata, degrade to searchable limited mode, cap the catalog DOM at 100 rows, and cannot overwrite a newer database generation. | `src/engine/database-client.ts` (`details`); `src/App.tsx` (`selectTable`, catalog paging/limit/diagram guards); `src/engine/sqlite.worker.ts` (`readCatalog`, virtual-prefix shadow normalization, 5,000-object/50,000-column/5,000-index bounds); cross-engine malformed/exotic/5,001-object and exact 25/50 MiB catalog matrix | PASS for the approved catalog boundary, virtual-prefix shadow classification, 100-row DOM budget, and exact 25/50 MiB safe-mode matrix; constrained-host memory pressure remains open |
| FILE-04 | Obvious SQLite `-wal`, `-shm`, and `-journal` sidecars are rejected before bytes reach the worker. | `src/App.tsx` (`isSQLiteSidecarName`); `tests/e2e/app.spec.ts` sidecar test | PASS |
| ER-04 | Declared foreign keys are available in a keyboard-readable list independent of the SVG canvas, with direction, many-to-one semantics, source/target columns, and table navigation. | `src/App.tsx` (`RelationshipList`, unresolved preservation); `src/styles/app.css`; cross-engine relationship fixture test | PASS for ordered pairs, ON UPDATE/DELETE/MATCH rules, resolution status, missing parents, parallel/self links, and table actions; manual AT remains |
| SAFE-02 | SQLite-level query-length/column/compound/expression/function/attach/trigger/worker limits are applied, with catalog-specific bounds retained and explicit limited-mode degradation in the worker. | `src/engine/sqlite.worker.ts` (`configureReadOnly`, `readCatalog`); 5,001-object limited fixture and cross-engine bounded-mode test | PASS for the approved 5,000-object/50,000-column catalog contract; broader low-memory stress remains open |
| SQL-02 | SQLite’s prepare/tail API rejects trailing statements and bound parameters before execution; no custom JavaScript statement scanner remains. | `src/engine/sqlite.worker.ts` (`assertSingleStatement`); `tests/e2e/app.spec.ts` trailing/native-policy tests | PASS for the implemented single-statement/parameter boundary |
| ER-05 | A resolved relationship generates centrally quoted read-only join SQL, supports composite/implicit parent keys, and asks before replacing a non-empty draft; cancel leaves the draft intact. | `src/App.tsx` (`buildJoinSql`, `generateJoin`); cross-engine relationship and unusual-identifier fixtures | PASS for composite implicit keys, self joins, unresolved disablement, dirty-draft confirmation, and keyword/quote/dot/Unicode identifiers |
| PLAN-01 | Query plans are presented as an accessible bounded list with parent indentation, already-explained SQL is not nested, and a new query cannot leave a stale plan visible. | `src/plan.ts`, `src/plan.test.ts`, `src/App.tsx` (`PlanTree`, `runPlan`, invalidation); cross-engine plan/hostile/stale tests | PASS for empty, orphan, cyclic, already-explained, hostile inert text, and stale invalidation paths |
| A11Y-01 | New relationship, copy, metadata, toggle, paging, and forced-colors controls preserve serious/critical axe cleanliness in light/dark themes and all three browser engines. | `src/components/SqlEditor.tsx`/`src/styles/app.css` theme-following token classes; `tests/e2e/accessibility.spec.ts` (4 widths plus both themes), `tests/e2e/keyboard-workflows.spec.ts`, and `npm run test:e2e` (144/144; no retries/skips; axe, keyboard, forced-colors/zoom/reduced-motion paths in Chromium/Firefox/WebKit) | PASS for automated gates; manual Safari/VoiceOver/NVDA remains |
| REL-01 | The new surface does not regress type safety, production bundle budgets, worker behavior, exports, history, cancellation, or hostile-query paths. | Commands below | PASS |
| OFF-01/OFF-02 | Complete built-artifact precache supports repeat shell reload, excludes database/sidecar paths, and preserves sibling caches through scoped activation. | `scripts/build-service-worker.mjs`, generated `dist/sw.js`, `tests/e2e/app.spec.ts` offline cache test, `scripts/check-seeqlite-bundle.mjs` | PASS for Chromium/Firefox offline reload and WebKit cached-document contract; manual Safari reload/update remains |
| OFF-03 | Service-worker registration failure is visible without blocking the core workflow. | `src/main.tsx`, `src/App.tsx` offline-unavailable status event | PASS for registration/unsupported fallback path |
| REL-02 | Pages artifact and sibling DataDuck build/test/bundle contracts remain green. | Commands below | PASS |
| PERF-01 | Exact 64/128/256 MiB imports, query recovery, cancel acknowledgement, reopen, reimport, and bounded catalog/result DOM meet qualified per-engine budgets without changing safety caps. | `tests/performance/release-benchmarks.spec.ts`, `tests/performance/scalability.spec.ts`, `tests/performance/budgets.json`, `docs/release/performance.md`; 15/15 across Chromium, Firefox, WebKit | PASS for the declared local macOS arm64/64 GiB headless profile |
| DEP-01 | The shared Pages artifact has complete relative SeeQLite assets and a deployed checker that records actual status/MIME/header/service-worker evidence without inventing absent protections. | `scripts/verify-pages-build.mjs`, `scripts/check-deployed-seeqlite.mjs`, `docs/release/deployment.md`; local exact-artifact check PASS | PASS for local artifact; public deployment/header capture remains open |
| A11Y-MANUAL | Manual Safari/VoiceOver and NVDA evidence has a strict schema, freshness/signature/sanitization checks, and mutation coverage; the checked-in record is explicitly incomplete until human execution. | `scripts/validate-release-evidence.mjs`, `tests/release/manual-evidence.test.ts`, `docs/release/accessibility-safari.md`, `docs/release/gaps/MANUAL-EVIDENCE-GAPS.md`; 11 tests PASS | PASS for protocol; human platform evidence remains open |
| RISK-PF-01..14 | Every researched PF risk has one exact prevention and recovery reference with source digest, test identity, expected assertion, canonical result key, and fail-closed freshness/skip/retry contract. | `docs/release/risk-evidence.json`, `scripts/check-risk-evidence.mjs`, `tests/release/risk-evidence.test.ts`, `docs/release/gaps/RISK-GAPS.md`; 20 tests PASS | PASS for manifest/checker protocol; current release runner evidence remains open |
| DEP-AUDIT | Every shipped SeeQLite runtime package has exact version/purpose/license/notice/source/asset/request evidence, and unresolved production High/Critical advisories block. | `scripts/audit-release-dependencies.mjs`, `docs/release/dependency-inventory.md`, `../THIRD_PARTY_NOTICES.md`, `tests/release/dependency-audit.test.ts`; 8 tests PASS; `npm audit --omit=dev` clean | PASS for SeeQLite dependency protocol; DataDuck dev-tree advisories remain disclosed |
| RELEASE-GATE | The release transaction has one no-retry command matrix, current-commit/source-output digests, atomic incomplete diagnostics, 48 requirement/10 DoD links, PF handoff, manual/public/rollback inputs, and sanitized gap output. | `scripts/release-gate.mjs`, `tests/release/release-gate.test.ts`, `docs/release/EVIDENCE.md`, `docs/release/LIMITATIONS.md`, `docs/release/RELEASE-CHECKLIST.md`, `docs/release/ROLLBACK.md`, `docs/release/gaps/RELEASE-GAPS.md`; 7 tests PASS | PASS for orchestration and current 20/20 command run; external gates remain open |

## Automated commands

```text
SeeQLite: npm test                         PASS (49 tests)
SeeQLite: npm run typecheck                 PASS
SeeQLite: npm run build                     PASS
SeeQLite: npm run check:bundle              PASS (24 emitted assets)
SeeQLite: npm run test:e2e                  PASS (144 tests; Chromium, Firefox, WebKit; no retries/skips)
SeeQLite: accessibility + keyboard E2E     PASS (21 tests across Chromium, Firefox, WebKit)
SeeQLite: exotic virtual E2E                PASS (FTS4/RTree, 3 tests across Chromium, Firefox, WebKit)
SeeQLite: offline shell E2E                 PASS (Chromium/Firefox reload; WebKit cache contract)
SeeQLite: npm audit --omit=dev --audit-level=high PASS (0 production vulnerabilities)
SeeQLite: focused negative E2E                 PASS (9 tests; trailing SQL, native policy, sidecars)
SeeQLite: catalog boundary E2E                 PASS (virtual/shadow fixture plus 5,001-object limited-mode timing in all three engines)
SeeQLite: npm run test:performance                PASS (21 tests; exact 25/50/64/128/256 MiB fixtures, all three engines)
SeeQLite: performance budget report               PASS (qualified local-darwin-arm64-64g-headless profile; see docs/release/performance.md)
SeeQLite: shared Pages artifact verifier          PASS (SeeQLite/DataDuck artifact; local static deployed checker PASS)
SeeQLite: manual evidence protocol                PASS (11 mutation/schema tests; template intentionally incomplete)
SeeQLite: PF risk evidence protocol                PASS (20 mutation/schema tests; current runner artifact intentionally absent)
SeeQLite: dependency/license/notice protocol       PASS (8 mutation tests; 19 runtime packages; production audit clean)
SeeQLite: release-gate orchestration protocol       PASS (7 contract tests; current 20-command run passed; external gates incomplete)
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
- CAT-02/CAT-04 follow-up: FTS4/RTree virtual-prefix shadow coverage now passes; low-memory/25–50 MiB matrix coverage and additional module families remain before widening release claims.
- Automated accessibility follow-up: current Safari/VoiceOver and Windows NVDA evidence remains manual even though forced-colors/zoom/reduced-motion automation is green.
