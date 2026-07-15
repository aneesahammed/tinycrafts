---
phase: 6
slug: security-performance-accessibility-release
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-15
---

# Phase 6 — Validation Strategy

> Release validation for the exact `/seeqlite/` Pages artifact and its public privacy, read-only, performance, accessibility, browser, offline, and TinyCrafts claims.

## Test Infrastructure

| Property | Value |
|---|---|
| **Frameworks** | Vitest/Testing Library; Playwright Chromium/Firefox/WebKit; axe; Node artifact/security/license/bundle checkers; recorded released Safari, VoiceOver, and NVDA protocols |
| **Configs** | `vitest.config.ts`, `playwright.config.ts`, `tests/performance/budgets.json`, `.github/workflows/pages.yml` |
| **Quick command** | `npm run typecheck && npm run test -- src/features/privacy tests/security` |
| **Production gate** | `node ../scripts/release-gate.mjs` from `SeeQLite/` after `node ../scripts/build-pages.mjs` |
| **Feedback target** | Focused checks under 60 seconds; full cross-engine/performance/manual gates only at plan/phase boundaries |

## Sampling Rate

- After every task, run its exact focused command; no three tasks may rely only on end-of-phase evidence.
- After Wave 1, run security/privacy, performance/bundle, axe/keyboard, build, and Phase 5 export/offline regressions.
- After Wave 2, run PF manifest/checker mutation fixtures, dependency gates, real Safari/AT validation, and the TinyCrafts landing regression. Wave 2 does not require or synthesize a current full-suite result artifact.
- During Wave 3 release, run the full production matrix with retry masking disabled, atomically archive a current-commit/per-test-digest result artifact, and only then invoke the PF evidence checker against that artifact.
- Any Critical/High finding blocks release until both prevention and recovery tests pass (D-46).
- Any audit finding outside declared files is written to the owning gap artifact and requires an explicit gap-closure plan; audits do not opportunistically repair production.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Test type | Automated command | Manual | Status |
|---|---:|---:|---|---|---|---|---|---|
| 06-01-01 | 06-01 | 1 | SEC-01 | T-06-01-01/02 | component/security E2E | `npm run test -- src/features/privacy/PrivacyAndLimitsDialog.test.tsx tests/security/hostile-rendering.test.ts && npm run test:e2e -- tests/e2e/security/hostile-content.spec.ts --project=chromium` | — | ⬜ |
| 06-01-02 | 06-01 | 1 | SEC-02 | T-06-01-03/04 | production privacy/engine | `npm run test:e2e -- tests/e2e/security/privacy-readonly.spec.ts --project=chromium` | — | ⬜ |
| 06-02-01 | 06-02 | 1 | PERF-01 | T-06-02-01 | performance/bundle | `npm run test:performance -- --project=chromium --project=firefox --project=webkit && npm run check:bundle` | Trace review | ⬜ |
| 06-02-02 | 06-02 | 1 | A11Y-01, REL-01 | T-06-02-02 | axe/keyboard/visual | `npm run test:e2e -- tests/e2e/accessibility.spec.ts tests/e2e/visual.spec.ts` | — | ⬜ |
| 06-04-01 | 06-04 | 2 | SEC-01/02, REL-01 | T-06-04-01/02 | PF manifest/checker fixtures | `npm run test -- tests/release/risk-evidence.test.ts` | — | ⬜ |
| 06-04-02 | 06-04 | 2 | SEC-02, REL-01 | T-06-04-SC | dependency/artifact | `node scripts/audit-release-dependencies.mjs --check && npm audit --omit=dev --audit-level=high` | Review license/advisory dispositions | ⬜ |
| 06-05-01 | 06-05 | 2 | A11Y-01, REL-02 | T-06-05-01/02 | manual-evidence schema | `npm run test -- tests/release/manual-evidence.test.ts` | — | ⬜ |
| 06-05-02 | 06-05 | 2 | A11Y-01, REL-02 | T-06-05-01/02 | real AT evidence | `node scripts/validate-release-evidence.mjs docs/release/accessibility-safari.md` | Released Safari+VoiceOver and NVDA full paths | ⬜ |
| 06-06-01 | 06-06 | 2 | REL-02 | T-06-06-01/02 | failing-first landing contract | `npm run test:e2e -- tests/e2e/tinycrafts-landing.spec.ts --project=chromium` | Full-page expected-diff review | ⬜ |
| 06-06-02 | 06-06 | 2 | REL-02 | T-06-06-01/02 | landing E2E/visual | `npm run test:e2e -- tests/e2e/tinycrafts-landing.spec.ts --project=chromium` | Full-page before/after review | ⬜ |
| 06-03-01 | 06-03 | 3 | REL-01, REL-02 | T-06-03-01/02 | build/CI/regression | `node ../scripts/build-pages.mjs && node ../scripts/verify-pages-build.mjs && npm --prefix ../dataduck test && npm --prefix ../dataduck run check:bundle` | — | ⬜ |
| 06-03-02 | 06-03 | 3 | SEC-02, REL-01, REL-02 | T-06-03-03 | complete suite → artifact → PF gate → release/rollback | `node scripts/release-gate.mjs` | Deployed headers, Safari record, rollback rehearsal | ⬜ |

## Wave 0 Requirements

Phase 1 established TypeScript/Vitest/Playwright/axe/build infrastructure; Phases 2–5 established real-WASM, fixture, performance-baseline, visual, export, and offline harnesses. No test framework or runtime package is added here. Each task extends the existing harness and fails if an unexpected dependency/lockfile change appears.

## Complete Release Testing Strategy

### Unit/component

- Hostile text, bidi/control isolation, action labels, limitation copy, CSP/source scanners, dependency inventory, evidence schema, budget parser/ratchet rules, cache prefix, export codecs, history bounds, reducer epochs, and every defect regression.
- UI checks use roles/names/focus/state, not component internals or snapshots alone.

### Real-browser integration

- Pinned SQLite WASM inside the real module worker proves source immutability, deny-by-default SQL, limits, exact values, cancellation/rehydration, plan, catalog, and error recovery.
- No mock may satisfy an engine, CSP, privacy, worker, download, or service-worker requirement.

### Production E2E

- Built `/seeqlite/` runs open/replace/inspect/search/query/result/plan/cancel/timeout/history/ER list+canvas/join/export/offline/update/theme/responsive in Chromium, Firefox, and WebKit.
- Failure artifacts include console, requests, response MIME, CSP, worker/SW URL+scope, cache names, screenshots, trace, active generation, and safe error codes.
- Hidden skips, dev-server-only success, and automatic retries masking races fail REL-01.

### Negative/security/privacy

- Cover every file/catalog/SQL/runtime/result/history/export/ER/offline/browser/deployment row in `PITFALLS.md`'s failure matrix.
- Hostile HTML/script/event/CSS/URL/bidi/zero-width/long markers remain inert; no raw HTML sink or data/cross-origin worker.
- Unique filename/schema/SQL/value/error/export markers are absent from network, URL, console, caches, SW metadata, source maps, and unauthorized persistence; source hash is unchanged.
- Critical/High findings require a named prevention test and a recovery test ending in a successful valid open/query.
- `risk-evidence.json` contains exactly PF-01..PF-14 once each, with exact named prevention and recovery test references. In Wave 2, deterministic fixtures prove the checker fails missing/duplicate/unknown risk IDs; missing/renamed tests; fail/skip/fixme/todo/conditional exclusion; retry-masked pass; unresolved status; stale release commit, timestamp, or test-file SHA-256; and missing runner result. In Wave 3, the release gate first runs the complete suite and emits the real artifact, then applies that checker contract.

### Performance/scalability

- Record environment and cold/warm samples for shell/worker/WASM readiness, 25/50 MiB open-to-catalog, exact 64/128/256 MiB import→close/reopen→second reimport, 1,000×20 query-to-paint, page sort/export, 25/75/150/500-node graph, cancel acknowledgement, rehydration, chunk/bundle size, DOM rows, transfer counts, and cache growth in Chromium, Firefox, and WebKit.
- Budgets are keyed by engine, OS, CPU/memory class, headless/headed mode, CI image, samples, and statistic; cancel remains ≤250 ms. When a timing metric/API is not stable/available for a qualified environment, that one metric records the limitation while hard no-freeze/crash, explicit safe-degradation, bounded transfer/DOM/cache, cancel/recovery, and `SELECT 1` assertions remain release-blocking in that engine. No engine becomes informational.
- Never raise a limit to pass; optimize through an explicit owning gap-closure plan, enter limited/subgraph mode, or record a separately approved ADR with evidence/regression.
- Assert no main-thread full-file clone, over-cap result payload, full BLOB transfer, unbounded graph render, second result page in DOM, or automatic retry loop.

### Accessibility/visual/manual

- Axe zero serious/critical in both themes at 375/768/1024/1440 plus 200% zoom; contrast 4.5:1 text/3:1 boundaries/focus; keyboard scripts complete every primary workflow.
- Visual states cover every owning phase in both themes with deterministic fixtures and documented masking only for timestamps/antialiasing.
- Manual released Safari+VoiceOver and Windows NVDA paths record OS/browser/AT versions, viewport/theme, each exact action/outcome/focus/announcement, failures, evidence link, tester/date. WebKit is not a Safari substitute.
- Forced colors, reduced motion, IME, horizontal result containment, and canvas-independent ER list are release gates.

### Regression/upgrade

- Each defect adds the lowest-layer permanent test.
- Audit plans may change only declared audit/evidence files; a production defect first creates a deterministic gap artifact and a separate plan declaring the owning files and prevention/recovery regression.
- SQLite/Vite/React/CodeMirror/React Flow/ELK/SW upgrades rerun affected real-engine, policy, cancel, CSP/URL, keyboard, offline update, bundle, and Pages suites.
- Critical binary fixtures stay committed with generation notes; no sensitive data/global Python/global SQLite dependency.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Instructions |
|---|---|---|---|
| Released Safari + VoiceOver | A11Y-01, REL-02 | Playwright WebKit differs from current Safari/VoiceOver | Complete open, inspect/search, query/result/plan, cancel+rehydrate, ER list/join, export, update, repeat offline, privacy dialog in light/dark and 200% zoom; record versions/focus/announcements/screenshots. |
| NVDA on Windows | A11Y-01 | Real screen-reader/browser integration | Repeat the same primary workflow in current NVDA with Firefox or Chrome; record versions/outcomes. |
| Deployed response headers and rollback | SEC-01, REL-02 | Pages headers/deployment state exist only after publish | Capture deployed headers/MIME/scope; confirm copy makes no absent header claim; rehearse rollback to prior artifact and verify SeeQLite/DataDuck/offline caches/routes. |

## Source Coverage Audit

| Source | ID | Item | Plan | Status |
|---|---|---|---|---|
| GOAL | — | Prove all public claims on exact production artifact | 06-01..06 | COVERED |
| REQ | SEC-01 | Content/execution hardening | 06-01 | COVERED |
| REQ | SEC-02 | Privacy/dependency/risk audit | 06-01, 06-03, 06-04 | COVERED |
| REQ | PERF-01 | Measured budgets/degradation | 06-02 | COVERED |
| REQ | A11Y-01 | Complete accessible workflow | 06-02, 06-05 | COVERED |
| REQ | REL-01 | Complete automated/negative suite | 06-01..04 | COVERED |
| REQ | REL-02 | TinyCrafts build/landing/Safari/release | 06-02, 06-03, 06-05, 06-06 | COVERED |
| RESEARCH | PF-01..14 | Machine-checked prevention/recovery risk matrix | 06-04, 06-03 | COVERED |
| CONTEXT | D-44..D-46 | CSP/privacy/high-risk gate | 06-01 | COVERED |
| CONTEXT | D-47..D-49 | Budgets/accessibility/safe limits | 06-02, 06-05 | COVERED |
| CONTEXT | D-50..D-52 | Landing/CI/limitations | 06-03, 06-06 | COVERED |
| UI | UI6-AC01..10 | Release UI/evidence matrix | 06-01..06 | COVERED |

## Validation Sign-Off

- [x] Every task has focused automated verification; required manual evidence is explicit and schema-validated.
- [x] Full unit/integration/E2E/negative/regression/security/performance/accessibility strategy is mapped.
- [x] No watch flags, hidden skips, retry-masked races, or mock-only engine claims.
- [x] Security/privacy, sibling caches, rollback, Safari, and TinyCrafts/DataDuck regressions are release blocking.
- [x] `nyquist_compliant: true` is set.

**Approval:** pending execution and recorded manual evidence
