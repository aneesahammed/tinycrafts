# Phase 2: Safe Database Lifecycle and Catalog - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Turn the skeleton into a trustworthy one-database lifecycle and SQLite-specific catalog explorer. This phase owns validation, replacement, close/reopen, read-only policy, limits, import/WAL mechanics, normalized catalog DTOs, lazy object details, search, and recoverable file/catalog errors. It does not build the full query workspace or ER canvas.
</domain>

<decisions>
## Implementation Decisions

### File lifecycle
- [D-09] Portable picker and drag/drop are required; extensions are hints, while size, magic header, SQLite open, and schema read establish outcomes.
- [D-10] Warn above 256 MiB and block above 512 MiB before `arrayBuffer()`; exact release limits may only move after measured evidence and an ADR.
- [D-11] Reject sidecars with checkpoint guidance; WAL-mode main files are attempted with a caution that uncheckpointed sidecar changes may be absent.
- [D-12] Retain the browser `File`, not a duplicate byte array, for recovery. Opening a new generation atomically invalidates all prior requests/details.

### Read-only trust boundary
- [D-13] Combine read-only deserialization/open semantics, query-only/defensive settings where available, a connection-lifetime deny-by-default authorizer, PRAGMA/function allowlists, statement tail/read-only checks, and SQLite limits.
- [D-14] Unknown authorization actions fail closed; internal catalog commands use explicit trusted command types rather than bypassing the policy through arbitrary SQL.
- [D-15] Cleanup is explicit for connection, statements, allocations, requests, listeners, and worker generations on every success/failure/replacement path.

### Catalog
- [D-16] Normalize `sqlite_schema` and named table-valued PRAGMA fields into stable positional DTOs; tolerate future extra PRAGMA columns.
- [D-17] Preserve tables, views, virtual/shadow objects, hidden/generated columns, STRICT, WITHOUT ROWID, composite/implicit FKs, index expression/partial/autoindex state, unresolved parents, and safe SQL definitions.
- [D-18] Bootstrap summary is eager, details are lazy and failure-isolated, search stays available, and oversized catalogs enter explicit limited mode.

### the agent's Discretion
- Exact internal DTO property names, safe object-label truncation copy, and calibrated catalog request chunk sizes.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — FILE-01..05, SAFE-01..03, CAT-01..05.
- `.planning/ROADMAP.md` — Phase 2 plan outline, spikes, and exit criteria.
- `.planning/research/ARCHITECTURE.md` — lifecycle, policy, catalog, and failure-isolation contracts.
- `.planning/research/PITFALLS.md` — PF-01, PF-03, PF-04, PF-05, PF-06.
- `01-walking-skeleton-browser-harness/01-CONTEXT.md` — inherited worker/topology/theme decisions.
</canonical_refs>

<specifics>
## Specific Ideas

- Keep the last valid database usable until replacement validation passes where memory evidence permits; otherwise clearly preserve only the draft/workspace and say no database is open.
- Never label unreadable content definitively as encrypted or corrupt; use “may be encrypted, incomplete, or corrupt.”
- Explorer rows expose type/status badges without relying on color and provide copied, correctly quoted identifiers.
</specifics>

<deferred>
## Deferred Ideas

No schema editing, save-back, integrity scan by default, sidecar upload, multi-database support, DDL parsing, or relationship inference.
</deferred>
