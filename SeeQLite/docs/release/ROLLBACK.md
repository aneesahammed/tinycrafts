# SeeQLite rollback procedure

Rollback restores a previously verified complete Pages artifact. It is not a database recovery operation.

## Preconditions

- Identify the last complete release SHA and its Pages artifact directory.
- Confirm the previous SeeQLite service-worker cache prefix/version and the sibling DataDuck route.
- Stop the release if the previous artifact is incomplete, mixed-version, or missing required worker/WASM assets.

## Procedure

1. Preserve the current failed artifact and its `.release-evidence/` diagnostics.
2. Restore the previous complete Pages artifact through the authorized Pages deployment path.
3. Do not delete origin-wide Cache Storage entries. The restored worker may remove only older `seeqlite-*` caches after its own complete precache succeeds.
4. Verify `/`, `/seeqlite/`, `/dataduck/`, Pagecrumb, direct refresh, relative assets, MIME types, worker/WASM loading, service-worker scope, and sibling cache survival.
5. Verify an offline shell reload from the restored SeeQLite cache and a fresh `SELECT 1` after opening the bundled sample.
6. Record the previous SHA, artifact digest, cache keys, checks, timestamps, and operator signature in `.release-evidence/rollback.json` with `outcome: "passed"`.

## Abort criteria

Abort and keep the last known complete artifact if any of these occur: missing WASM/worker, mixed service-worker/cache version, DataDuck or landing regression, root-relative asset failure, wrong MIME, sibling-cache deletion, offline shell failure, or an unexplained public header/runtime change.

Rollback evidence never includes user database content or raw command output.
