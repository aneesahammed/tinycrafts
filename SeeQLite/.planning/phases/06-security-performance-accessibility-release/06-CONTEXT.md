# Phase 6: Security Performance Accessibility and Release - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Audit, ratchet, and release the complete product against the exact Pages artifact. Cross-cutting controls should already exist with their owning features; this phase closes evidence gaps, fixes regressions, integrates the TinyCrafts catalogue/build, and publishes truthful limitations.
</domain>

<decisions>
## Implementation Decisions

### Security and privacy
- [D-44] Production CSP allows only necessary same-origin scripts, worker, assets, and WASM capability; do not claim header-only protections that GitHub Pages does not serve.
- [D-45] Unique hostile/privacy markers are checked across DOM, network, console, URLs, localStorage, Cache Storage, service-worker metadata, downloads, and source-byte hashes.
- [D-46] Every Critical/High risk requires a passing prevention and recovery test or the release blocks.

### Performance and accessibility
- [D-47] Ratchet measured shell/import/query/result/graph/cancel/rehydration/bundle budgets; never raise provisional limits merely to make a test pass.
- [D-48] Automated axe/visual checks cover light/dark and 375/768/1024/wide layouts; keyboard, VoiceOver/NVDA, zoom, focus, reduced motion, and released Safari require recorded manual evidence.
- [D-49] Safe limited modes are acceptable; freezes, unbounded transfers/renders, inaccessible canvas-only flows, and silent retries are not.

### Release integration
- [D-50] Add a design-consistent TinyCrafts catalogue entry and `/seeqlite/` build/verification without regressing the landing page, DataDuck, sibling caches, or existing routes.
- [D-51] Node 24 CI runs typecheck/lint/unit/integration/three-engine E2E/security/accessibility/performance/bundle/export/offline/artifact checks with explicit skip visibility.
- [D-52] Release notes disclose read-only, transient, one-file, declared-FK-only, WAL-sidecar, cap, offline-shell, CSV-hardening, browser, and header limitations.

### the agent's Discretion
- Exact budget values after measurements, catalogue ordinal if the live list changes, and evidence-document filenames.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — SEC-01..02, PERF-01, A11Y-01, REL-01..02 and complete Definition of Done.
- `.planning/ROADMAP.md` — Phase 6 release gates.
- `.planning/research/PITFALLS.md` — complete risk and negative-test matrix.
- `.planning/research/SUMMARY.md` — canonical security/performance/release invariants.
- `../index.htm`, `../scripts/build-pages.mjs`, `../scripts/verify-pages-build.mjs`, and `../.github/workflows/pages.yml` — shared production integration surfaces.
</canonical_refs>

<specifics>
## Specific Ideas

- Public copy should say “Your database stays in this tab” only after privacy tests prove the marker boundary; avoid absolute browser-security claims.
- Capture console, request, content-type, CSP, worker scope, service-worker scope, cache names, and sibling route results on test failure.
- Release evidence should be reproducible from documented commands and contain environment/browser versions without user data.
</specifics>

<deferred>
## Deferred Ideas

No new product feature category enters during hardening. Findings that require backend, mutation, persistence, AI, inference, or broad infrastructure become a future milestone rather than scope creep.
</deferred>
