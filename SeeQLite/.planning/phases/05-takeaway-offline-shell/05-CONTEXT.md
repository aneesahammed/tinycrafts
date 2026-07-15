# Phase 5: Takeaway and Offline Shell - Context

**Gathered:** 2026-07-15
**Status:** Ready for UI specification and planning

<domain>
## Phase Boundary

Export exactly the held bounded result to disclosed CSV/JSON forms and make the stable application shell installable and repeat-offline. The service worker handles only versioned SeeQLite assets, never user databases, results, or generated downloads.
</domain>

<decisions>
## Implementation Decisions

### Export
- [D-36] Export never reruns SQL and always states displayed row count and truncation causes before download.
- [D-37] CSV is deterministic RFC 4180 with CRLF, explicit NULL policy, disclosed spreadsheet-formula hardening, sanitized filename, and independently parsed golden tests.
- [D-38] JSON uses `{columns, rows, metadata}` with positional rows and tagged BigInt/BLOB/truncated values so duplicate labels survive.
- [D-39] Blob URL creation/revocation is single-use and observable; export failure preserves the result and re-enables actions.

### Offline shell
- [D-40] Use a manifest and small custom service worker with a build-derived asset list; no Workbox/PWA framework.
- [D-41] Precache shell, worker, WASM, fonts, icons, and lazy chunks as one version-matched set. Failed install/update preserves the last complete shell.
- [D-42] Scope and cleanup are `/seeqlite/` and `seeqlite-*` only. Database bytes/results/exports never enter Cache Storage; DataDuck/unrelated caches are immutable.
- [D-43] Offline means the app shell can reload after one complete online visit and open a newly selected local file; first-ever offline use and non-persisted databases are described honestly.

### the agent's Discretion
- Exact install prompt placement, chosen documented CSV prefix/escaping transformation, and cache version string format.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — EXP-01..03 and OFF-01..03.
- `.planning/ROADMAP.md` — Phase 5 export/offline exits.
- `.planning/research/PITFALLS.md` — PF-09 and PF-11.
- `03-query-workspace/03-CONTEXT.md` — canonical held-result/value/truncation model.
- `../dataduck/public/sw.js` and `../dataduck/scripts/` — patterns to inspect without copying unsafe cache behavior.
</canonical_refs>

<specifics>
## Specific Ideas

- Present “Export displayed rows” rather than “Export query” and show when exact typed JSON is preferable to spreadsheet-hardened CSV.
- Offline/update state should be durable inline status, not a noisy install modal.
- Test an interrupted update, missing lazy chunk, quota failure, service-worker rejection, and seeded sibling caches on the built artifact.
</specifics>

<deferred>
## Deferred Ideas

No full-result export, SQL/DDL export, database persistence, background sync, sharing, cloud storage, Workbox, or origin-wide cache management.
</deferred>
