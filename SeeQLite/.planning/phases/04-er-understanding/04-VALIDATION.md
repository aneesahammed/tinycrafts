---
phase: 4
slug: er-understanding
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-15
---

# Phase 4 — Validation Strategy

## Infrastructure

| Property | Contract |
|---|---|
| Unit/component | Vitest + Testing Library |
| Worker/production | Playwright Chromium/Firefox/WebKit + axe |
| Quick | `cd SeeQLite && npm run test -- src/er` |
| Full | `cd SeeQLite && npm run typecheck && npm run test && npm run build && npm run check:bundle && npm run test:e2e -- tests/integration/layout-worker.spec.ts tests/e2e/er-*.spec.ts tests/performance/er-scale.spec.ts` |

Every task owns or explicitly extends its listed RED-first test and runs typecheck. Unit feedback target <30 seconds, one-engine smoke <60 seconds; full engines/scale run per wave/phase.

## Task/RED Map

| Task | Wave | Requirement | RED owner | Command |
|---|---:|---|---|---|
| 04-01-01 | 1 | ER-01/02 | `build-graph-model.test.ts` | `cd SeeQLite && npm run test -- src/er/build-graph-model.test.ts && npm run typecheck` |
| 04-01-02 | 1 | ER-04 | `RelationshipList.test.tsx` | `cd SeeQLite && npm run test -- src/er/RelationshipList.test.tsx && npm run typecheck` |
| 04-01-03 | 1 | ER-01/04 | `er-relationships.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/er-relationships.spec.ts --project=chromium && npm run typecheck` |
| 04-02-01 | 2 | ER-03 | `connected-subgraph.test.ts` | `cd SeeQLite && npm run test -- src/er/connected-subgraph.test.ts && npm run typecheck` |
| 04-02-02 | 2 | ER-03 | `layout-graph.test.ts` | `cd SeeQLite && npm run test -- src/er/layout/layout-graph.test.ts && npm run typecheck` |
| 04-02-03 | 2 | ER-03 | `layout-worker.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/integration/layout-worker.spec.ts --project=chromium && npm run typecheck` |
| 04-04-01 | 3 | ER-03 | `ErCanvas.test.tsx` | `cd SeeQLite && npm run test -- src/er/ErCanvas.test.tsx && npm run typecheck` |
| 04-04-02 | 3 | ER-03 | `er-view-preference.test.ts` | `cd SeeQLite && npm run test -- src/er/er-view-preference.test.ts && npm run typecheck` |
| 04-04-03 | 3 | ER-03 | `er-layout.spec.ts` | `cd SeeQLite && npm run test:e2e -- tests/e2e/er-layout.spec.ts --project=chromium && npm run typecheck` |
| 04-03-01 | 4 | ER-04 | spatial + `er-accessibility.spec.ts` | `cd SeeQLite && npm run test -- src/er/spatial-navigation.test.ts && npm run test:e2e -- tests/e2e/er-accessibility.spec.ts --project=chromium && npm run typecheck` |
| 04-03-02 | 4 | ER-05 | join/dialog + `er-join.spec.ts` | `cd SeeQLite && npm run test -- src/er/build-join-sql.test.ts src/er/GenerateJoinDialog.test.tsx && npm run test:e2e -- tests/e2e/er-join.spec.ts --project=chromium && npm run typecheck` |
| 04-03-03 | 4 | ER-03/04 | `er-scale.spec.ts` | `cd SeeQLite && npm run build && npm run check:bundle && npm run test:e2e -- tests/performance/er-scale.spec.ts --project=chromium && npm run typecheck` |

## Mandatory Matrices

- Truth: no-FK/name-like, simple, composite, self, cycle, extreme parallel, implicit PK, quoted/Unicode, duplicate, WITHOUT ROWID, missing table/column, exact rules.
- Scale: node 0/1/25/75/76/150/500; edge 600/601; encoded request and response 2 MiB boundaries; projected and actual canvas DOM 4,000 boundaries; dense and parallel schemas. Any breached budget means no React Flow/ELK/partial graph and the exact `node_limit`, `edge_limit`, `layout_payload_limit`, or `dom_limit` copy, actions, live reason, relationship count, and focus behavior from `04-UI-SPEC.md`; scope change rechecks all four budgets.
- Layout: disconnected/cycle/self/parallel/unresolved, rapid Arrange, stale/duplicate, timeout/crash/replacement, worker/subpath/chunk; Query/Relationships unaffected.
- Accessibility: complete list workflow with canvas absent; composite direction/order, stable focus/status, all widths/themes/200%/reduced motion, axe plus VoiceOver/NVDA.
- Join: all complex shapes/identifiers, deterministic aliases, unresolved disabled, empty insert, dirty keep/replace/Escape/focus, subsequent normal read-only execution.
- Preference: exact `{version,view}` only; no database/node/edge/position/viewport/search; corrupt/denied/quota fallback; mobile/over-budget Relationships override.

## Security and Release Gates

- All database-derived graph/list/plan text is bounded escaped text; no inference or raw HTML.
- React Flow nodes≤75, edges≤600, encoded layout request/response≤2 MiB, projected/actual canvas DOM≤4,000; list≤50/page.
- ELK is a dedicated lazy worker and absent main-thread/initial bundle; React Flow is lazy.
- App/CatalogWorkspace→ER and ER→Query join navigation run against production real database worker.
- Three engines run with no hidden retries/skips; privacy markers absent network/URL/log/cache/unauthorized storage.

## Sign-Off

- [x] Every task has RED ownership and typecheck.
- [x] Unit/component/worker/E2E/negative/security/performance/accessibility/regression layers are specified.
- [x] Independent node/edge/payload/DOM budgets and list-only recovery are hard gates.
- [x] `nyquist_compliant: true`.

**Approval:** pending implementation evidence
