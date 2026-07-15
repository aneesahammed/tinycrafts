# Phase 1 Validation — Walking Skeleton and Browser Harness

**Status:** implementation-ready
**Plans:** 01-01 through 01-06
**Waves:** 01-01 → {01-02 worker, 01-04 shell} → 01-05 readiness → 01-03 artifact → 01-06 release harness
**Hard stop:** D-08 applies if official transient SQLite WASM cannot pass the exact three-engine `/seeqlite/` artifact without COOP/COEP.

## Goal and Requirement Coverage

| Source | ID | Required outcome | Plan/task | Status |
|---|---|---|---|---|
| GOAL | — | TinyCrafts `/seeqlite/` capability check → local fixture → bounded real SELECT with no derived traffic | 01-01/T1; 01-02/T1,T2; 01-04/T1,T2; 01-05/T1,T2; 01-03/T1,T2; 01-06/T1,T2,T3 | COVERED |
| REQ | PLAT-01 | Local-only processing and no byte/row persistence | 01-02/T2; 01-05/T1,T2; 01-06/T1 | COVERED |
| REQ | PLAT-02 | Relative production subpath, worker/WASM/manifest assets, no COOP/COEP | 01-01/T1; 01-03/T1,T2; 01-06/T1 | COVERED |
| REQ | PLAT-03 | App-owned typed worker; responsive UI; no main-thread handle | 01-02/T1,T2; 01-05/T1,T2; 01-06/T1 | COVERED |
| REQ | PLAT-04 | Required capability gate; optional degradation | 01-04/T2; 01-06/T1 | COVERED |
| REQ | UX-01 | Approved TinyCrafts shell plus executable complete visual/accessibility matrix | 01-04/T1,T2; 01-06/T2 | COVERED |
| REQ | TEST-01 | Reproducible harness, real production WASM in three engines and DataDuck regression | 01-01/T1,T2; 01-02/T1,T2; 01-03/T1,T2; 01-05/T1,T2; 01-06/T1,T2,T3 | COVERED |
| CONTEXT | D-01 | React/TS/Vite/base/npm/Node24/DataDuck | 01-01/T1,T2; 01-03/T1,T2; 01-06/T3 | COVERED |
| CONTEXT | D-02 | Official package in app module worker, headerless proof | 01-02/T1,T2; 01-03/T1; 01-06/T1 | COVERED |
| CONTEXT | D-03 | IDs, epochs, terminate/recreate | 01-02/T1,T2; 01-05/T2 | COVERED |
| CONTEXT | D-04 | File-opening workbench | 01-04/T1,T2; 01-05/T1,T2 | COVERED |
| CONTEXT | D-05 | Equal light/dark; UI metadata only | 01-04/T1; 01-06/T2 | COVERED |
| CONTEXT | D-06 | Required vs optional classification through emitted same-origin probe worker | 01-04/T2; 01-06/T1 | COVERED |
| CONTEXT | D-07 | Exact artifact, three engines, console/CSP/root/privacy/UX failure capture | 01-03/T1,T2; 01-06/T1,T2,T3 | COVERED |
| CONTEXT | D-08 | Release-blocking spike, conditional ADR-001, no fallback | 01-02/T2; 01-06/T1 | COVERED |
| RESEARCH | PF-05 | Database-derived content inert/bounded | 01-02/T1,T2; 01-05/T1; 01-06/T1 | COVERED |
| RESEARCH | PF-12 | Exact artifact, MIME/CSP/path/capability | 01-03/T1,T2; 01-04/T2; 01-06/T1 | COVERED |
| RESEARCH | PF-14 | Real worker/WASM rather than mocks | 01-02/T1,T2; 01-05/T1,T2; 01-06/T1 | COVERED |
| RESEARCH | toolchain/package spike | Strict type-only imports for CodeMirror/React Flow/ELK/panels outside runtime bundle | 01-01/T2; 01-06/T3 | COVERED |
| RESEARCH | numeric baselines | Record environment, chunks, readiness, requests and long tasks | 01-06/T3 | COVERED |

No deferred idea is planned. No source item is missing.

## Acceptance Evidence Matrix

| Evidence | Command | Pass condition |
|---|---|---|
| Install/type/unit/build | `cd SeeQLite && npm ci && npm run typecheck && npm run test && npm run build` | zero exit; no hidden skips |
| Bundle | `cd SeeQLite && npm run check:bundle` | separate shell/worker/WASM report; editor/graph/ELK absent from shell |
| Browsers | `cd SeeQLite && npm run test:e2e` | Chromium, Firefox, WebKit all pass built `/seeqlite/` |
| Pages | `node scripts/build-pages.mjs && node scripts/verify-pages-build.mjs` | exact SeeQLite assets and all sibling tools verified |
| DataDuck | `cd dataduck && npm test && npm run build && npm run check:bundle` | passes under Node 24 |
| Privacy | `privacy.spec.ts` | unique filename/schema/SQL/value markers absent from network, URL/title, console, localStorage, Cache Storage, SW keys |
| Accessibility | component + Playwright axe/keyboard | no serious/critical issues; open → readiness → reset works without pointer in both themes |
| Visual | approved viewport/theme captures | 375/768/1024/1440, 200% zoom, forced colors, reduced motion satisfy UI-SPEC |

`visual-accessibility.spec.ts` must execute 2 themes × 4 viewports × initial/readiness screenshots, plus separate 200% zoom at 375/1024 in both themes, forced-colors, reduced-motion, keyboard-only skip→sample/open→readiness→reset, target/focus/overflow/contrast assertions, and axe for initial/required-missing/readiness in every theme/viewport. Chromium owns pixel baselines; Firefox/WebKit run semantic/accessibility assertions without skips.

## Negative and Failure Coverage

- Required primitives independently absent: Worker, WebAssembly, module worker, BigInt, File/arrayBuffer, transfer, structured clone.
- Optional storage/service-worker absent or throwing: core readiness still works.
- Picker cancel, empty drop, multiple/directory drop, sample fetch failure, File read failure, worker init/prepare/step/close/crash, reset during open/run.
- Unknown/duplicate request ID, old epoch response, late success after termination, double dispose.
- Missing/wrong-MIME worker or WASM, root-relative request, CSP denial, cross-origin/data worker, direct navigation/refresh.
- Module capability probe must be `src/platform/module-probe.worker.ts` emitted by Vite and constructed by same-origin `new URL`; Blob/data probes are forbidden and source/bundle-scanned.
- Hostile/long/HTML-like filename rendered inert and bounded; no marker in diagnostics.

## Security and Privacy Gate

- SQLite import appears only in worker-owned modules; source and runtime inspection find no main-thread handle.
- File buffer is transferred, not cloned or retained; the browser `File` remains in ephemeral controller state.
- React/textContent paths only; no raw HTML, remote runtime asset, analytics, crash collector, URL-derived state, OPFS, or database cache.
- Meta CSP is the narrow measured capability; deployed documentation does not claim `frame-ancestors` or isolation headers that Pages does not serve.
- Package legitimacy: STACK.md exact declaration and HIGH-confidence official/registry Source Assessment cover every installed package. Any unresolved declaration package must have official npm ownership/repository checked and exact-pinned before lockfile creation; mismatch blocks execution.

## Performance and Scalability Gate

Phase 1 records, rather than invents, release baselines: raw/gzip shell, worker, WASM and fonts; shell ready; SQLite ready; fixed-query duration; request count; main-thread long tasks. It asserts one database worker, one connection, one bounded one-cell response, no duplicate retained database buffer, and no editor/graph/layout code in the initial graph. Later limit changes require measured evidence, ADR, and regression coverage.

## Pre-Mortem

| Likely failure | Early detector | Mitigation |
|---|---|---|
| WASM works in dev but not Pages/WebKit | 01-02 real production integration and 01-03 all-engine run | D-08 hard stop; compare only documented alternatives through ADR |
| Privacy proof leaks through diagnostics | unique-marker scan includes attachments/log/storage/cache | metadata-only diagnostics and bounded display |
| Node upgrade breaks DataDuck | shared CI and local regression command | block Phase 1 exit until DataDuck is green |
| Theme/CSP conflict causes flash or blocked script | first-paint and CSP production tests | same-origin prepaint bootstrap; narrow measured policy |
| Stale worker publishes after reset | epoch/request race tests | invalidate epoch before terminate and ignore all stale responses |

## Phase Exit Checklist

- [ ] All six requirement rows have passing evidence linked from summaries.
- [ ] Real official WASM succeeds at `/seeqlite/` in all three engines with `crossOriginIsolated === false`.
- [ ] Privacy/CSP/root-path/MIME/console gates pass and source file bytes remain unchanged.
- [ ] Both themes and approved responsive/accessibility states pass.
- [ ] DataDuck stays green on Node 24.
- [ ] `01-06-SUMMARY.md` records `topology: PASS` and ADR-001 is absent. Any topology failure creates Proposed ADR-001, marks the phase BLOCKED, and prevents Phase 2 preflight.
- [ ] No prohibition or deferred feature appears.
