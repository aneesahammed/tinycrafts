# Phase 6 release evidence — automated checkpoint

Recorded: 2026-07-16

This checkpoint covers the incremental ER discoverability and safe-copy work completed after the original Phase 6 hardening pass. It intentionally does not close the phase: current Safari/VoiceOver, NVDA, forced-colors/200% zoom, and deployed response-header evidence remain manual gates.

## Product acceptance criteria

| ID | Acceptance criterion | Evidence | Status |
|---|---|---|---|
| CAT-05 | A selected table exposes a quoted identifier and a bounded `SELECT * ... LIMIT 100` action; clipboard denial leaves a visible recovery message. | `src/App.tsx` (`TableDetails`, `copyWithSelection`); `tests/e2e/app.spec.ts` relationship test | PASS |
| CAT-01 | The opened catalog can be searched by object or column name with bounded filtered counts and an explicit no-match state. | `src/App.tsx` (`catalogSearch`, `filteredTables`); `tests/e2e/app.spec.ts` search test | PARTIAL — internal-object toggle and complete object metadata remain open |
| FILE-04 | Obvious SQLite `-wal`, `-shm`, and `-journal` sidecars are rejected before bytes reach the worker. | `src/App.tsx` (`isSQLiteSidecarName`); `tests/e2e/app.spec.ts` sidecar test | PASS |
| ER-04 | Declared foreign keys are available in a keyboard-readable list independent of the SVG canvas, with direction, many-to-one semantics, source/target columns, and table navigation. | `src/App.tsx` (`RelationshipList`); `src/styles/app.css`; `tests/e2e/app.spec.ts` relationship test | PARTIAL — full ER-04 still requires ordered rules, resolution status, and complete table-grouping semantics |
| SAFE-02 | SQLite-level query-length/column/compound/expression/function/attach/trigger/worker limits are applied, with catalog-specific bounds retained in the worker. | `src/engine/sqlite.worker.ts` (`configureReadOnly` limits) | PARTIAL — catalog metadata limits still need the full 50,000-column contract |
| SQL-02 | SQLite’s prepare/tail API rejects trailing statements and bound parameters before execution; no custom JavaScript statement scanner remains. | `src/engine/sqlite.worker.ts` (`assertSingleStatement`); `tests/e2e/app.spec.ts` trailing/native-policy tests | PASS for the implemented single-statement/parameter boundary |
| ER-05 | A resolved relationship generates centrally quoted read-only join SQL, supports composite/implicit parent keys, and asks before replacing a non-empty draft; cancel leaves the draft intact. | `src/App.tsx` (`buildJoinSql`, `generateJoin`); `tests/e2e/app.spec.ts` generated-join tests | PARTIAL — broader unresolved/self/parallel fixture and join-model coverage remains |
| A11Y-01 | New relationship and copy controls preserve serious/critical axe cleanliness in light/dark themes and all three browser engines. | `npm run test:e2e` (60/60; axe test in Chromium/Firefox/WebKit) | PASS |
| REL-01 | The new surface does not regress type safety, production bundle budgets, worker behavior, exports, history, cancellation, or hostile-query paths. | Commands below | PASS |
| REL-02 | Pages artifact and sibling DataDuck build/test/bundle contracts remain green. | Commands below | PASS |

## Automated commands

```text
SeeQLite: npm test                         PASS (1 test)
SeeQLite: npm run typecheck                 PASS
SeeQLite: npm run build                     PASS
SeeQLite: npm run check:bundle              PASS (24 emitted assets)
SeeQLite: npm run test:e2e                  PASS (60 tests; Chromium, Firefox, WebKit)
SeeQLite: focused negative E2E                 PASS (9 tests; trailing SQL, native policy, sidecars)
Pages:    node scripts/build-pages.mjs      PASS
Pages:    node scripts/verify-pages-build.mjs PASS
DataDuck: npm --prefix dataduck test        PASS (195 tests / 54 files)
DataDuck: npm --prefix dataduck run build   PASS (existing >500 kB chunk warnings)
DataDuck: npm --prefix dataduck run check:bundle PASS
```

## Remaining release gates

- Record current released Safari + VoiceOver and Windows NVDA workflow evidence, including forced colors, 200% zoom, reduced motion, IME, result containment, and ER-list parity.
- Capture deployed Pages response headers/MIME/service-worker scope and rehearse rollback; retain the documented meta-CSP limitation when host headers are unavailable.
- Keep the DataDuck advisory inventory visible: its existing `npm audit` reports upstream moderate/high/critical advisories even though its test/build/bundle gates pass.
- Continue the broader requirement gaps already called out in `REQUIREMENTS.md` (complete catalog limit enforcement, lazy catalog details, dedicated plan tree, offline/update proof, measured performance budgets, and full negative fixture coverage).
