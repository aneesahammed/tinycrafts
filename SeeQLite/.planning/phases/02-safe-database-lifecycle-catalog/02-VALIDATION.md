# Phase 2 Validation — Safe Database Lifecycle and Catalog

**Status:** implementation-ready after Phase 1 D-08 exit
**Plans:** 02-01 → 02-04 → 02-02 → 02-03 → 02-05 → 02-06
**Why sequential:** file/import, lifecycle, policy, extraction, explorer and copy actions extend shared contracts while every plan stays below 15 modified files.

## Multi-Source Coverage Audit

| Source | ID/item | Plan/task | Status |
|---|---|---|---|
| GOAL | repeatedly open/replace/inspect/close/recover one safe local DB and complete searchable catalog | 02-01/T1,T2; 02-04/T1,T2; 02-02/T1,T2,T3; 02-03/T1,T2; 02-05/T1,T2; 02-06/T1,T2 | COVERED |
| REQ | FILE-01 | 02-04/T1,T2 | COVERED |
| REQ | FILE-02 | 02-01/T1,T2 | COVERED |
| REQ | FILE-03 | 02-01/T1,T2 | COVERED |
| REQ | FILE-04 | 02-01/T1,T2 | COVERED |
| REQ | FILE-05 | 02-04/T1,T2 | COVERED |
| REQ | SAFE-01 | 02-02/T1,T3 | COVERED |
| REQ | SAFE-02 | 02-02/T2,T3 | COVERED |
| REQ | SAFE-03 | 02-02/T1,T2,T3 | COVERED |
| REQ | CAT-01 | 02-03/T1,T2; 02-05/T2 | COVERED |
| REQ | CAT-02 | 02-03/T1,T2; 02-05/T2 | COVERED |
| REQ | CAT-03 | 02-03/T1,T2 | COVERED |
| REQ | CAT-04 | 02-05/T1,T2 | COVERED |
| REQ | CAT-05 | 02-06/T1,T2 | COVERED |
| CONTEXT | D-09 picker/drop; extension hint; size/header/open/schema outcomes | 02-01/T1,T2; 02-04/T2 | COVERED |
| CONTEXT | D-10 256 MiB warning / >512 MiB block | 02-01/T1; 02-04/T2 | COVERED |
| CONTEXT | D-11 sidecar rejection; WAL-main cautious attempt | 02-01/T1,T2 | COVERED |
| CONTEXT | D-12 retained File; atomic epoch invalidation | 02-04/T1,T2 | COVERED |
| CONTEXT | D-13 layered SQLite read-only controls | 02-02/T1,T2,T3 | COVERED |
| CONTEXT | D-14 unknown deny; trusted typed catalog commands | 02-02/T1,T3; 02-03/T1,T2 | COVERED |
| CONTEXT | D-15 cleanup every lifecycle path | 02-01/T2; 02-04/T1; 02-02/T1,T2,T3 | COVERED |
| CONTEXT | D-16 named positional catalog fields | 02-03/T1,T2 | COVERED |
| CONTEXT | D-17 SQLite object/key/index/FK/trigger edge cases | 02-03/T1,T2; 02-05/T2; 02-06/T1,T2 | COVERED |
| CONTEXT | D-18 eager summary/lazy details/search/limited mode/100-option paging | 02-05/T1,T2 | COVERED |
| RESEARCH | PF-01 layered policy | 02-02/T1,T3 | COVERED |
| RESEARCH | PF-03 multidimensional bounds | 02-01/T1,T2; 02-02/T2,T3; 02-03/T2; 02-05/T1 | COVERED |
| RESEARCH | PF-04 cautious file/WAL classification | 02-01/T1,T2 | COVERED |
| RESEARCH | PF-05 hostile names/text | 02-03/T1,T2; 02-05/T2; 02-06/T1,T2 | COVERED |
| RESEARCH | PF-06 complete catalog | 02-03/T1,T2; 02-05/T2 | COVERED |
| RESEARCH | import/binding spike | 02-01/T2; 02-02/T1,T2,T3 | COVERED |

No deferred item is planned. Revised CAT-05 covers quoted Copy identifier/SELECT/SQL and clipboard fallback in 02-06. Dirty-editor replacement confirmation is owned exclusively by ER-05 when Phase 4 inserts a generated join into the Phase 3 editor.

## Requirement-to-Assertion Matrix

| Requirements | Lowest-layer proof | Real-browser proof | Recovery proof |
|---|---|---|---|
| FILE-01..04 | table-driven file policy/threshold/header/sidecar tests | file-outcome fixture matrix | later valid open; current preserved where required |
| FILE-05 | FileController epoch/race tests | replace/close/reopen/crash E2E | stale ignored; resources baseline; retained File reread |
| SAFE-01 | exhaustive action/function/PRAGMA/statement tests | hostile SQL real-WASM matrix, 3 engines | same connection or explicit reopen then SELECT 1 |
| SAFE-02 | exact/one-over limit tests | hostile schema/SQL/value outcomes | normalized error; DB remains usable |
| SAFE-03 | cleanup registry and once-settlement tests | repeated success/failure/close/crash stress | counters return to baseline |
| CAT-01..03 | semantic catalog goldens | real WASM extraction + explorer | broken object scoped; schema/epoch invalidates |
| CAT-04 | dedupe/stale/budget/search tests | huge/broken catalog limited-mode E2E | retry one detail; search stays usable |
| CAT-05 | identifier quoting unit tests | hostile copy SQL re-prepares as one read-only statement | clipboard fallback; no editor mutation |

## Exact Verification Commands

Phase 2 preflight first: `01-06-SUMMARY.md` must contain exact line `topology: PASS`, name Chromium/Firefox/WebKit evidence, and ADR-001 must be absent. Otherwise Phase 2 is blocked; no fallback is implemented.

1. `cd SeeQLite && npm run typecheck && npm run test`
2. `cd SeeQLite && npm run test:e2e -- --project=chromium --grep "file|read-only|catalog"`
3. `cd SeeQLite && npm run test:e2e -- --project=firefox --grep "read-only policy matrix|catalog"`
4. `cd SeeQLite && npm run test:e2e -- --project=webkit --grep "file import ownership|read-only policy matrix|catalog"`
5. `cd SeeQLite && npm run build && npm run check:bundle`
6. `node scripts/build-pages.mjs && node scripts/verify-pages-build.mjs`

All commands must have zero hidden skips/retries. Engine guarantees require the real pinned WASM/module worker.

## Complete Negative and Edge Matrix

### Intake/lifecycle

- Picker cancel; zero/multiple/directory drop; duplicate event; keyboard Open; zero/undersized/wrong-header/unusual-extension; Unicode/HTML/bidi/long filename; browser slice/full-read error; size mismatch; exact 256/512/one-over; allocation/OOM/transfer failure.
- `.wal`, `.shm`, journal by name and recognizable bytes; checkpointed WAL-main; pending-WAL known row; corrupt schema/page; encrypted-looking random bytes; virtual-module unavailable.
- A→B valid, A→invalid, same filename/different bytes, replace during open/policy command/close, double close, terminate during init, worker crash, restoration failure, stale/duplicate/unknown response.

### Read-only/limits/cleanup

- All DML/DDL; transactions/savepoints; `ATTACH`/`DETACH`; `VACUUM`/`ANALYZE`/`REINDEX`; writable/read-only/unknown PRAGMAs; extension functions; mixed case/comments; CTE; RETURNING; multiple statements; semicolons in literal/comment; parameters; automatic reprepare; unknown authorizer action.
- SQL/value/column/expression/compound/pattern/function/variable/attached limits at boundary and one over; integer overflow; cleanup disposer exception; duplicate settlement; OOM/crash.
- Authorizer table covers every exposed action and unknown sentinel; exact database/table/column/source constraints; closed PolicyContext/statement IDs; exact PRAGMA argument classes; and the frozen `pragma_function_list` policy, including built-in overload eligibility, explicit denied names, direct-only/unknown flags, application-defined/shadowed/unknown functions and stable policy hashes. Real-WASM traces cover empty-column reads, rowid, sqlite_schema and automatic reprepare. SAFE-03 covers lifecycle/open/catalog cleanup only; active-query cancellation and progress-timeout cleanup remain CANCEL-01/02.

### Catalog/UI

- Empty, internal-only, ordinary, view, broken view/index, autoindex, expression/partial index, STRICT, WITHOUT ROWID, virtual/shadow, generated/hidden, composite PK/FK, implicit parent, self/cycle/parallel/missing parent, null SQL, quoted/keyword/dot/bracket/newline/Unicode/bidi/HTML-like/long name.
- Related trigger metadata: quoted/Unicode/HTML-like trigger/owner, bounded/null SQL, incomplete metadata, unresolved owner and broken schema rows; triggers are related metadata, never query targets, and UI code never parses timing/event from SQL.
- Rapid selection, duplicate detail, stale detail, retry failure, internal toggle invalidating selection, no matches, exact/over object and column budgets, low memory, clipboard denied.
- Catalog DOM budget: searched projection renders one replaceable window of at most 100 options with outside-listbox `Show previous 100` / `Load next {n}` controls; tests cover 0/99/100/101/5,000 matches and assert DOM option count never exceeds 100. No virtualization dependency.
- 375/768/1024/1440, 200% zoom, forced colors, reduced motion, both themes, listbox/drawer/tabs/separator keyboard/focus and axe.

## Threat and Privacy Gate

- Source File hash/bytes unchanged after every open, denial, limit, catalog and recovery case.
- Main thread contains only File reference and serializable bounded DTOs; no raw imported buffer, SQLite handle/statement/allocation.
- User SQL cannot invoke trusted catalog commands; lifetime authorizer default denies unknown actions.
- All database text is escaped React text, bounded before transfer/display, never in raw HTML, URL, console, network, Cache Storage, persistent database/catalog/result storage or unbounded attributes.
- No new package is needed beyond the exact Phase 1 lockfile; resizable panels are the approved existing dependency.

## Performance and Scalability Gate

- Hard file block occurs before `arrayBuffer`, worker creation, or WASM allocation for that candidate.
- One File, one worker, one connection, one serialized command; transferred buffer is not retained.
- Catalog bootstrap halts at 5,000 objects; aggregate detail halts at 50,000 columns; definition/name/error previews use bounded DTOs.
- Only summary is eager, one selected detail loads, duplicate detail requests coalesce, and DOM contains the visible bounded list/detail region.
- Repeated open/close/fail/replace and policy-denial stress returns resource counters to baseline; WebKit memory evidence is recorded. Any limit change needs measurements, ADR, and regression test.

## Pre-Mortem and Mitigations

| Failure | Early detector | Required mitigation |
|---|---|---|
| Read-only gap through unknown action/PRAGMA/reprepare | exhaustive constant table + real hostile matrix | lifetime default deny; uncertain connection is terminated/reopened |
| Peak import memory duplicates file | transfer/detachment and heap/resource instrumentation | retain File only; explicit ownership/free; no retry loop |
| WAL data is shown incompletely without warning | checkpointed/pending fixture comparison | caution or checkpoint rejection; never fabricated completeness |
| Catalog silently loses SQLite-specific metadata | semantic goldens for every PF-06 case | named field decoders; unresolved/incomplete states preserved |
| Stale detail/catalog crosses replacement | rapid race E2E | generation/schema tags at reducer boundary |
| Hostile identifier becomes SQL/DOM injection | quoter round-trip + DOM-XSS assertions | central quote helper and React text only |

## Phase Exit Checklist

- [ ] All 13 requirement rows have linked automated evidence.
- [ ] File matrix and repeated lifecycle recovery pass; source bytes unchanged.
- [ ] Real-WASM allow/deny matrix passes and next `SELECT 1` succeeds after each recoverable case.
- [ ] Catalog goldens cover all listed SQLite features; limited/broken modes remain searchable.
- [ ] No stale generation/detail publishes and resource counters return to baseline.
- [ ] Phase 2 UI matches the inherited light/dark/responsive/accessibility contract.
- [ ] Build/bundle/Pages/DataDuck regression remains green with no prohibited dependency or feature.
