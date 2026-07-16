# SeeQLite release limitations

These are product boundaries, not implied guarantees.

| Area | Truthful v1 behavior |
|---|---|
| Processing | The selected SQLite file is processed in this browser tab. No backend, account, analytics, or remote runtime service is used. |
| File ownership | SeeQLite opens one transient copied database generation. It does not write back, persist the database in OPFS, or reopen it automatically after a new session. |
| SQL | User SQL is read-only and limited to one parameter-free statement. DML, DDL, writable/unknown PRAGMAs, ATTACH/DETACH, extensions, and multi-statement batches are rejected. |
| Relationships | The ER view shows declared SQLite foreign keys only. It does not infer relationships or repair missing parents. |
| WAL/sidecars | A `.wal`, `.shm`, or journal sidecar is not a standalone input. A WAL-mode main file may omit uncheckpointed sibling changes; close/checkpoint the source application first. |
| Limits | Browser safety caps apply to file size, SQL length, rows, columns, cells, serialized result bytes, previews, catalog objects/columns, graph size, and query time. Over-budget work enters a bounded mode or fails with recovery guidance. |
| Results | Results are positional and bounded. Large text/BLOB values are previewed or marked truncated; SeeQLite does not promise full unbounded table browsing. |
| CSV | Formula-like cells receive a leading apostrophe before CSV download to reduce spreadsheet formula injection risk. JSON preserves positional columns and declares truncation. |
| Offline | Offline support covers the application shell and its generated assets, not user database bytes, result rows, downloads, or object URLs. |
| Browsers | Release evidence targets current evergreen Chromium, Firefox, and Safari/WebKit with module Workers, WebAssembly, BigInt, and transferable ArrayBuffers. Released Safari + VoiceOver and Windows NVDA require separate human records. |
| Headers | If the host cannot provide CSP, COOP, COEP, or Service-Worker-Allowed response headers, SeeQLite does not claim those header protections. The deployed checker records their actual presence/absence. |

The release gate remains blocked until the current artifact, manual AT record, public deployment evidence, and rollback rehearsal are attached.
