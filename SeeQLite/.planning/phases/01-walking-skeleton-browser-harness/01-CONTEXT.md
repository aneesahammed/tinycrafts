# Phase 1: Walking Skeleton and Browser Harness - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning
**Source:** Approved recommended setup plus project research

<domain>
## Phase Boundary

Prove the exact production-shaped path from `/seeqlite/` to a TinyCrafts shell, capability gate, local fixture selection, official SQLite WASM module worker, and one bounded `SELECT`. This phase establishes the toolchain, worker protocol, theme foundation, privacy harness, and cross-engine production-artifact tests. It does not implement the complete file lifecycle, catalog, editor, grid, ER diagram, export, or PWA.
</domain>

<decisions>
## Implementation Decisions

### Runtime and topology
- [D-01] Use React, strict TypeScript, Vite with `base: './'`, Node 24 LTS, and npm; preserve DataDuck compatibility in the shared Pages workflow.
- [D-02] Initialize the exact-pinned official SQLite WASM package inside an app-owned module worker and prove it with `crossOriginIsolated === false` under a Pages-like subpath.
- [D-03] Main-thread/worker messages use a narrow discriminated protocol with request IDs and worker epochs; the skeleton includes explicit terminate-and-recreate behavior.

### Product shell
- [D-04] The first screen is a focused file-opening workbench, not a marketing page or generic dashboard.
- [D-05] Light and dark themes reuse TinyCrafts tokens and are available from the first slice; preference is local UI metadata only.
- [D-06] Required capabilities are Worker, WebAssembly, module workers, BigInt, File/FileReader or `arrayBuffer`, and structured cloning; optional storage/service-worker failures do not block the slice.

### Verification
- [D-07] Production-artifact tests run Chromium, Firefox, and WebKit at `/seeqlite/`, fail on console/CSP/root-asset errors, and use unique privacy markers.
- [D-08] The Pages/worker spike is release blocking. Failure requires an ADR comparing a vendored official build, `sql.js`, or hosting change; main-thread SQLite is forbidden.

### the agent's Discretion
- Exact component/file names within the boundaries above, the smallest fixture schema, skeleton status copy, and the initial measured bundle budgets.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — PLAT-01..04, UX-01, TEST-01 and Definition of Done.
- `.planning/ROADMAP.md` — Phase 1 goal, spikes, plan outline, and exit criteria.
- `.planning/research/SUMMARY.md` — locked stack, architecture, and release-blocking spike.
- `../dataduck/vite.config.js` and `../scripts/build-pages.mjs` — local static build patterns to preserve or extend.
- `../index.htm` — canonical TinyCrafts visual tokens and landing-page character.
</canonical_refs>

<specifics>
## Specific Ideas

- The empty state should say that the database stays in the browser and offer “Open SQLite database” plus a committed sample.
- Display engine readiness and file/result truncation in plain language; never claim the browser is secure merely because the app is local.
- Record shell, worker/WASM readiness, request count, and long-task baselines without production telemetry.
</specifics>

<deferred>
## Deferred Ideas

Complete lifecycle/catalog work belongs to Phase 2; editor/results/cancel/history to Phase 3; ER to Phase 4; export/offline to Phase 5; final audits and landing integration to Phase 6.
</deferred>
