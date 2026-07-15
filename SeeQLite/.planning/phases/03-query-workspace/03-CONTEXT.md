# Phase 3: Query Workspace - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Deliver the primary query-authoring loop on top of the proven policy and catalog: lazy CodeMirror, one-statement execution, exact bounded positional results, plan view, timeout, terminate-and-rehydrate cancellation, and bounded metadata-only history. Export remains Phase 5.
</domain>

<decisions>
## Implementation Decisions

### SQL execution
- [D-19] Run the non-empty selection when present, otherwise the full draft. SQLite prepare/tail detection owns statement boundaries; parameterized or multiple statements are rejected in v1.
- [D-20] Serialize database commands. Run and Plan capture immutable SQL and database generation; stale results cannot replace newer state.
- [D-21] CodeMirror uses the SQLite dialect and the normalized catalog for completion; no JavaScript SQL parser or formatter is required.

### Results and plan
- [D-22] Results contain ordered column metadata and positional row arrays with exact BigInt, distinct NULL, typed BLOB/text preview, duplicate names, zero-row columns, and explicit truncation reasons.
- [D-23] Initial independent caps are 1,000 rows, 250 columns, 50,000 cells, 8 MiB serialized response, 64 KiB text preview, 256-byte BLOB preview, and 50-row semantic pages.
- [D-24] Sorting is client-side over the held bounded result only. Query plans use `EXPLAIN QUERY PLAN` and never imply runtime cost estimates SQLite did not provide.

### Cancel, timeout, and history
- [D-25] User Cancel terminates the occupied worker and changes UI state within 250 ms; rehydration timing is separate and preserves the draft.
- [D-26] Automatic timeout uses a worker-local progress handler with a provisional 30-second deadline and a distinct timeout result.
- [D-27] History stores at most 100 byte-bounded, versioned SQL/status/timestamp/duration records. It stores no database affinity or fingerprint, rows, schema, file bytes, BLOB previews, raw file names/paths, stacks, or worker diagnostics, and falls back to session memory on unavailable, corrupt, quota-full, or denied storage.

### the agent's Discretion
- Editor shortcut labels per platform, exact visible page-size selector (if any), and result cell-detail interaction within the fixed caps.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — SQL-01..04, RES-01..03, PLAN-01, CANCEL-01..02, HIST-01..02.
- `.planning/ROADMAP.md` — Phase 3 goals, spikes, and race-focused exits.
- `.planning/research/PITFALLS.md` — PF-02, PF-03, PF-07, PF-08, PF-10.
- `02-safe-database-lifecycle-catalog/02-CONTEXT.md` — inherited policy, catalog, and generation contracts.
</canonical_refs>

<specifics>
## Specific Ideas

- The primary action is “Run”; `Cmd/Ctrl+Enter` executes and `Esc` cancels only while running.
- Show duration, returned/held row counts, every active truncation cause, and recovery state adjacent to the result rather than in transient toasts.
- Dirty SQL is never lost during cancellation, database replacement failure, responsive mode changes, or history inspection.
</specifics>

<deferred>
## Deferred Ideas

No multi-statement scripts, parameters UI, mutation, full-result streaming/export, enterprise grid, saved notebooks, collaboration, AI, or date inference.
</deferred>
