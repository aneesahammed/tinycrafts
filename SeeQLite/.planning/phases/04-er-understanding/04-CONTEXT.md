# Phase 4: ER Understanding - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Transform declared foreign keys from the shared catalog into an accurate graph model, structured relationship list, bounded interactive canvas, layout worker, and safe join-SQL handoff. It visualizes; it does not edit schema or infer links.
</domain>

<decisions>
## Implementation Decisions

### Truth model
- [D-28] One ordered relationship represents each declared FK constraint, including composite columns, update/delete rules, self/cycle/parallel edges, implicit parent keys, and unresolved/missing parents.
- [D-29] Canvas, list, join generation, counts, and accessibility labels derive from the same pure graph model; React Flow and ELK are adapters only.
- [D-30] No name-based inference or DDL guessing appears in v1.

### Layout and scale
- [D-31] Lazy-load React Flow and a dedicated ELK layout worker. Initial whole-graph threshold is 75 nodes; larger schemas start with table selection or a connected component.
- [D-32] Layout runs only when schema/subset changes or Arrange is requested, carries a generation token, and falls back to the relationship list on failure.
- [D-33] Provide search, pan, zoom, fit, arrange, selection, minimap only if measured useful, reduced motion, and persisted small layout preferences without database identifiers when avoidable.

### Accessible action path
- [D-34] The structured list is a guaranteed keyboard/screen-reader equivalent, not a secondary read-only summary.
- [D-35] Join SQL uses the shared identifier quoter and deterministic aliases; unresolved relations cannot generate a join, and a dirty editor requires confirmation before replacement.

### the agent's Discretion
- Exact node dimensions, routing style, minimap inclusion after measurement, and deterministic alias strings within round-trip tests.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — ER-01..05.
- `.planning/ROADMAP.md` — Phase 4 graph/list/accessibility exits.
- `.planning/research/ARCHITECTURE.md` — GraphModel and layout-client boundaries.
- `.planning/research/PITFALLS.md` — PF-05, PF-06, PF-08, PF-13.
- `02-safe-database-lifecycle-catalog/02-CONTEXT.md` — canonical catalog semantics.
- `03-query-workspace/03-CONTEXT.md` — editor dirty-state and generated SQL handoff.
</canonical_refs>

<specifics>
## Specific Ideas

- Table cards show name, type, PK/FK/unique/generated/hidden badges, and a compact column preview with an expand path.
- Selecting an edge focuses the matching relationship-list item and vice versa.
- Empty schema, no-FK schema, unresolved relationships, layout timeout, and over-threshold schema each have explicit next-step copy.
</specifics>

<deferred>
## Deferred Ideas

No relationship editing, annotations, grouping documents, image export, custom layout algorithms/settings, inferred links, or schema mutation.
</deferred>
