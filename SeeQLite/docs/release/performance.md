# SeeQLite performance evidence

Recorded 2026-07-16 from the production Vite artifact with Playwright headless Chromium, Firefox, and WebKit.

## Qualification

| Field | Value |
|---|---|
| Profile | `local-darwin-arm64-64g-headless` |
| OS / architecture | macOS Darwin / arm64 |
| Memory class | 64 GiB |
| Image | local workstation; no CI claim |
| Statistic | one deterministic hard-ceiling run per size and engine |
| Fixture source | `tests/performance/helpers/large-db-fixture.ts`, generated with `sqlite3` CLI |
| Safety limits | unchanged from `src/App.tsx` and `src/engine/sqlite.worker.ts` |

The test generates valid SQLite files whose byte lengths are exactly 64 MiB, 128 MiB, and 256 MiB. It measures file selection through readiness, a recovery query, cancel acknowledgement, cancel→reopen, and a second reimport. It attaches a JSON sample to each Playwright test and prints a `SEEQLITE_PERF` record.

## Samples (milliseconds)

| Engine | Size | Open | Query | Cancel ack | Reopen | Reimport |
|---|---:|---:|---:|---:|---:|---:|
| Chromium | 64 MiB | 132 | 117 | 33 | 109 | 6 |
| Chromium | 128 MiB | 218 | 124 | 35 | 208 | 4 |
| Chromium | 256 MiB | 226 | 120 | 34 | 211 | 5 |
| Firefox | 64 MiB | 239 | 78 | 70 | 282 | 9 |
| Firefox | 128 MiB | 217 | 48 | 51 | 228 | 5 |
| Firefox | 256 MiB | 214 | 62 | 51 | 231 | 5 |
| WebKit | 64 MiB | 171 | 45 | 45 | 108 | 6 |
| WebKit | 128 MiB | 250 | 37 | 32 | 112 | 6 |
| WebKit | 256 MiB | 261 | 48 | 31 | 215 | 4 |

The ratcheted ceilings are stored in `tests/performance/budgets.json`: Chromium 1,000 ms for each measured operation; Firefox and WebKit 1,500 ms for open/reopen and 1,000 ms for reimport/query. Cancel acknowledgement remains a hard 250 ms limit for every engine.

## Structural safety evidence

- The large fixture exposes one catalog table and never renders more than one catalog row.
- The result model remains bounded by the worker’s existing caps; the result table renders at most 50 rows in the DOM.
- The cancellation path terminates the occupied worker, visibly enters `Query stopped. Reopen the database to continue.`, and successfully rehydrates from the retained `File` handle.
- The limited-catalog fixture renders 100 rows, disables the diagram, and keeps `SELECT 1` available.
- No test raises a file, query, result, catalog, graph, or cache cap to satisfy a timing budget.

## Release command

```text
npm run test:performance -- --project=chromium --project=firefox --project=webkit
npm run check:bundle
```

Both commands are release gates for the qualified profile. An unknown host must add a separately qualified profile; it must not reuse this profile silently.

## Not measurable in this portable gate

Playwright does not provide a stable cross-engine assertion for peak WASM heap, worker transfer internals, available system memory, or long-task traces. These are not represented as invented values. The bounded file size, DOM count, successful recovery query, and hard cancel acknowledgement remain enforced. Follow-up work is recorded in [PERFORMANCE-GAPS.md](./gaps/PERFORMANCE-GAPS.md).
