---
phase: 5
slug: takeaway-offline-shell
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for deterministic held-result export and an atomic, SeeQLite-scoped repeat-offline shell.

## Test Infrastructure

| Property | Value |
|---|---|
| **Frameworks** | Vitest 4 + Testing Library for pure/component behavior; Playwright 1.61 for downloads, service workers, Cache Storage, and production-artifact behavior |
| **Config files** | `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts` established in Phase 1 |
| **Quick run command** | `npm run test -- src/features/export src/pwa` |
| **Focused browser command** | `npm run test:e2e -- tests/e2e/export.spec.ts tests/e2e/offline.spec.ts --project=chromium` |
| **Full phase command** | `npm run typecheck && npm run test && npm run build && npm run test:e2e -- tests/e2e/export.spec.ts tests/e2e/offline.spec.ts tests/e2e/offline-update.spec.ts` |
| **Feedback target** | Pure/task-focused checks under 60 seconds; production three-engine/offline matrix at plan and phase boundaries |

## Sampling Rate

- **After every behavior task:** run the task's focused Vitest or Playwright command.
- **After Wave 1:** run `npm run typecheck && npm run test -- src/features/export src/pwa && npm run build`.
- **After Wave 2:** run export UI and service-worker client/runtime component suites.
- **After Wave 3:** run the full phase command in Chromium, Firefox, and WebKit.
- **Before `$gsd-verify-work 5`:** the full phase command, artifact inspection, marker privacy audit, and sibling-cache matrix must be green.
- **Maximum feedback latency:** 60 seconds for a focused check; long cross-engine/update runs are explicit plan-boundary gates and may not replace focused checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test type | Automated command | File exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 05-01-01 | 05-01 | 1 | EXP-02, EXP-03 | T-05-01-01, T-05-01-02 | Formula-like text is disclosed/transformed only in CSV; JSON preserves tagged positional values | unit/golden | `npm run test -- src/features/export/encode-csv.test.ts src/features/export/encode-json.test.ts src/features/export/export-filename.test.ts` | planned in task | ⬜ pending |
| 05-01-02 | 05-01 | 1 | EXP-02, EXP-03 | T-05-01-03, T-05-01-04 | Filename and one-URL lifecycle are deterministic and cleaned | unit | `npm run test -- src/features/export/export-filename.test.ts src/features/export/download-result.test.ts` | planned in task | ⬜ pending |
| 05-05-01 | 05-05 | 2 | EXP-01, EXP-02, EXP-03 | T-05-05-01/02 | Disclosure consumes held result only and preserves it across outcomes | component | `npm run test -- src/features/export/ExportDisclosure.test.tsx` | planned in task | ⬜ pending |
| 05-05-02 | 05-05 | 2 | EXP-01, EXP-02, EXP-03 | T-05-05-02/03 | Downloads parse independently; no worker/query rerun or URL leak | production E2E | `npm run test:e2e -- tests/e2e/export.spec.ts` | planned in task | ⬜ pending |
| 05-02-01 | 05-02 | 1 | OFF-01, OFF-02 | T-05-02-01 | Every emitted runtime asset is in a content-addressed, build-derived precache or the build fails | unit/build | `npm run test -- scripts/build-service-worker.test.ts && npm run build` | planned in task | ⬜ pending |
| 05-02-02 | 05-02 | 1 | OFF-01, OFF-02 | T-05-02-01/02/03 | Body size+SHA-256 verified install and exact current/previous member fetch | unit/integration | `npm run test -- src/pwa/cache-policy.test.ts src/pwa/service-worker-contract.test.ts` | planned in task | ⬜ pending |
| 05-04-01 | 05-04 | 2 | OFF-01, OFF-02, OFF-03 | T-05-04-01/02 | Complete-build-aware client and explicit activation | unit | `npm run test -- src/pwa/service-worker-client.test.ts` | planned in task | ⬜ pending |
| 05-04-02 | 05-04 | 2 | OFF-01, OFF-02, OFF-03 | T-05-04-02/03 | Truthful accessible runtime/update/fallback UI | component | `npm run test -- src/features/offline/RuntimeStatus.test.tsx` | planned in task | ⬜ pending |
| 05-03-01 | 05-03 | 3 | OFF-01, OFF-03 | T-05-03-01 | Complete online visit supports offline reload/new DB; fresh offline is honest | production E2E | `npm run test:e2e -- tests/e2e/offline.spec.ts --project=chromium` | planned in task | ⬜ pending |
| 05-03-02 | 05-03 | 3 | OFF-02, OFF-03 | T-05-03-02/03 | Missing/interrupted/quota/stale-200 fail; old-tab previous lazy chunk works | contract/E2E | `npm run test -- src/pwa/service-worker-contract.test.ts && npm run test:e2e -- tests/e2e/offline-update.spec.ts --project=chromium` | planned in task | ⬜ pending |
| 05-03-03 | 05-03 | 3 | OFF-01, OFF-02, OFF-03 | T-05-03-03/04 | Two-tab update/reset preserves sibling/user state | three-engine E2E | `npm run test:e2e -- tests/e2e/offline-update.spec.ts tests/e2e/offline-privacy.spec.ts` | planned in task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

Existing Phase 1 test/build infrastructure covers all Phase 5 work. Each task creates its focused test before production behavior, so no package, framework, or global fixture installation is required.

Required preconditions from completed phases:

- `src/domain/query-result.ts` exports the canonical positional held-result/value DTOs from Phase 3.
- `src/features/results/ResultToolbar.tsx` exposes the current immutable held result without a worker/query callback.
- `tests/e2e/fixtures/` contains committed, non-sensitive SQLite fixtures and a production-artifact server helper.
- `vite.config.ts` emits a Vite build manifest, separate worker/WASM/font/lazy assets, and relative URLs.

If an implementation summary gives a different symbol name for the same contract, update the import only; do not create a second result model.

## Layered Testing Strategy

### Unit and golden

- Table-drive RFC 4180 quoting, CRLF, duplicate headers, zero rows, `NULL`/empty loss, Unicode/control characters, BigInt, BLOB/text preview tags, all truncation dimensions, deterministic metadata, and filename sanitization.
- Parse CSV with an independent test parser and JSON with native `JSON.parse`; encoder tests may not validate by calling the encoder's own decoder/helper.
- Exercise formula-like text at the first code point and after a leading run of ASCII spaces/controls; distinguish text DTOs from numeric DTOs so numeric values are not text-mutated.
- Model Cache Storage with deterministic fakes for partial put, quota/security exceptions, redirect/opaque/error responses, prefix filtering, current/previous cache retention, reset, and install-event rejection.

### Component and integration

- Use the real held result reducer contract. Assert `Export displayed rows` never calls the database client or worker port.
- Cover selected format, typed-data JSON default, exact scope and disclosure, zero rows, repeated activation, preparation failure, focus, live regions, result invalidation, object-URL creation/revocation, theme, and 375/768/1024/wide reflow.
- Exercise service-worker client state with mocked browser registration events only at the browser seam; state reducers and UI copy remain real.

### Production E2E

- Serve the built app at `/seeqlite/`, intercept downloads, parse bytes independently, and capture worker/database messages to prove no export rerun.
- Install the exact generated service worker, go offline, reload shell/fonts/SQLite worker/WASM/editor/ER lazy chunks, choose a new fixture, and complete open/query/export.
- Test current→waiting→activated updates, two tabs, interrupted/missing-asset installs, explicit reset, direct navigation, refresh, and stale controlled tabs. A named B asset returning HTTP 200 with A/stale bytes must fail SHA-256 verification and preserve A.
- Keep an A tab that has never loaded an A lazy editor/ER chunk; after B activates and the origin goes offline, triggering that route in A must be served only because B's active worker finds the exact path in A's retained complete manifest/cache. An arbitrary/non-member path must miss.
- Run release-representative flows in Chromium, Firefox, and WebKit; browser-specific skips require a linked upstream limitation and an equivalent lower-level test, otherwise the phase fails.

### Negative, security, and privacy

- Seed formula cells, hostile filenames, bidi controls, HTML-like values, large BLOB/text previews, and every truncation reason; downloads remain inert data with disclosed transformation.
- Inspect network, URL, console, localStorage, Cache Storage keys/responses, service-worker messages, and retained object URLs for unique database/query/result markers.
- Seed `dataduck-*`, another TinyCrafts prefix, and an unrelated cache; take before/after key/content hashes around install, activation, update, reset, failure, and two-tab flows.
- Reject cross-origin, redirected, opaque, non-200, non-GET, out-of-scope, blob, data, database, result, and export requests from runtime caching.

### Performance and scalability

- Export time and peak payload are measured only for the already bounded result; no streaming/general export framework is introduced.
- Assert one held-result snapshot and one Blob/object URL at a time; repeat export returns URL/Blob references to baseline.
- Record service-worker install/update asset count and total byte size from the emitted manifest. No runtime cache growth occurs after normal database/query/export use.

### Accessibility and visual regression

- Axe and interaction checks cover export/offline states in both themes at 375, 768, 1024, and wide widths, 200% zoom, keyboard-only control, reduced motion, status roles, warning lists, native radio/dialog semantics, and 44px narrow targets.
- Deterministic screenshots cover complete/truncated/zero/failed exports and online/ready/offline/update/failure states. Dynamic timestamps may be masked; disclosure, focus, and cache/update truth may not.

### Regression policy

- Every discovered defect adds the smallest permanent test at the lowest responsible layer.
- A service-worker defect adds both a pure policy/contract test and a production update-path test when browser lifecycle is involved.
- No engine, download, offline, or cache-isolation claim may be released from snapshots, jsdom, or one browser alone.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Instructions |
|---|---|---|---|
| Browser-provided install affordance | OFF-01 | Install prompt availability and chrome are browser/OS policy, not reliably automatable | On one current Chromium installation, confirm the prompt appears only after browser eligibility, dismissing does not nag, accepting does not claim readiness until the complete cache exists, and installed launch still asks for a database. This supplements—not replaces—the automated offline shell test. |

## Source Coverage Audit

| Source | ID | Feature/constraint | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Exact bounded CSV/JSON takeaway plus atomic repeat-offline shell | 05-01..05 | COVERED | Held result and stable asset manifest are the two source contracts |
| REQ | EXP-01 | Honest held-result scope, no rerun, failure retention | 05-05 | COVERED | Component + worker-spy E2E |
| REQ | EXP-02 | Deterministic disclosed hardened CSV | 05-01, 05-05 | COVERED | Independent parser and hostile cells |
| REQ | EXP-03 | Positional tagged JSON | 05-01, 05-05 | COVERED | Duplicate labels/BigInt/BLOB/truncation |
| REQ | OFF-01 | Installable repeat-offline shell | 05-02, 05-04, 05-03 | COVERED | Digest assets, client/UI, production reload |
| REQ | OFF-02 | Atomic scoped updates | 05-02, 05-04, 05-03 | COVERED | Byte verification, explicit activation, old-tab/sibling tests |
| REQ | OFF-03 | Graceful online fallback | 05-04, 05-03 | COVERED | Client error state plus E2E |
| RESEARCH | PF-09 | Lossy/misleading/formula/export URL hazards | 05-01, 05-05 | COVERED | Disclosure, tags, parser, cleanup |
| RESEARCH | PF-11 | Origin-wide cache damage/incomplete update | 05-02, 05-03 | COVERED | Content-addressed complete caches and sibling survival |
| CONTEXT | D-36..D-39 | Export decisions | 05-01, 05-05 | COVERED | Each decision cited in task actions |
| CONTEXT | D-40..D-43 | Offline decisions | 05-02, 05-04, 05-03 | COVERED | Each decision cited in task actions |
| UI | UI5-AC01..10 | Export/offline copy, state, focus, responsive/privacy matrix | 05-05, 05-04, 05-03 | COVERED | Automated and one supplemental install check |

## Validation Sign-Off

- [x] Every task has a focused `<automated>` verification.
- [x] No three consecutive tasks lack an automated behavior check.
- [x] Existing Wave 0 infrastructure covers all commands; tasks create their own test artifacts first.
- [x] No watch-mode flags or mock-only engine/offline claims.
- [x] Formula transformation, object-URL cleanup, cache atomicity, sibling isolation, and privacy have negative/recovery checks.
- [x] `nyquist_compliant: true` is set.

**Approval:** pending execution evidence
