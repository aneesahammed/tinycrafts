# Phase 6 release evidence — automated checkpoint

Recorded: 2026-07-16

This checkpoint covers the incremental ER discoverability and safe-copy work completed after the original Phase 6 hardening pass. It intentionally does not close the phase: current Safari/VoiceOver, NVDA, forced-colors/200% zoom, and deployed response-header evidence remain manual gates.

## Product acceptance criteria

| ID | Acceptance criterion | Evidence | Status |
|---|---|---|---|
| CAT-05 | A selected table exposes a quoted identifier and a bounded `SELECT * ... LIMIT 100` action; clipboard denial leaves a visible recovery message. | `src/App.tsx` (`TableDetails`, `copyWithSelection`); `tests/e2e/app.spec.ts` relationship test | PASS |
| ER-04 | Declared foreign keys are available in a keyboard-readable list independent of the SVG canvas, with direction, many-to-one semantics, source/target columns, and table navigation. | `src/App.tsx` (`RelationshipList`); `src/styles/app.css`; `tests/e2e/app.spec.ts` relationship test | PARTIAL — full ER-04 still requires ordered rules/resolution status and a join action |
| A11Y-01 | New relationship and copy controls preserve serious/critical axe cleanliness in light/dark themes and all three browser engines. | `npm run test:e2e` (48/48; axe test in Chromium/Firefox/WebKit) | PASS |
| REL-01 | The new surface does not regress type safety, production bundle budgets, worker behavior, exports, history, cancellation, or hostile-query paths. | Commands below | PASS |
| REL-02 | Pages artifact and sibling DataDuck build/test/bundle contracts remain green. | Commands below | PASS |

## Automated commands

```text
SeeQLite: npm test                         PASS (1 test)
SeeQLite: npm run typecheck                 PASS
SeeQLite: npm run build                     PASS
SeeQLite: npm run check:bundle              PASS (24 emitted assets)
SeeQLite: npm run test:e2e                  PASS (48 tests; Chromium, Firefox, WebKit)
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
- Continue the broader requirement gaps already called out in `REQUIREMENTS.md` (sidecar rejection, complete SQLite limit enforcement, lazy catalog details, prepare/tail statement validation, dedicated plan tree, offline/update proof, measured performance budgets, and full negative fixture coverage).
