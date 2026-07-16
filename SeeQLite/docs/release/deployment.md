# SeeQLite deployment evidence

The release process has two distinct checks:

1. `node scripts/build-pages.mjs && node scripts/verify-pages-build.mjs` validates the exact shared Pages artifact before upload. It checks the `/seeqlite/` relative HTML, workers, WASM, fonts, manifest, icons, sample database, generated service-worker precache, scoped cache prefix, and forbidden source/test/package leaks.
2. `node scripts/check-deployed-seeqlite.mjs https://tinycrafts.ai/seeqlite/` fetches the authorized public URL and records status, MIME, CSP, service-worker, COOP/COEP, and cache-scope evidence. Passes do not imply that an absent response header exists; absent protections are emitted as limitations.

## Local artifact evidence

On 2026-07-16, the exact `.pages-build/seeqlite/` artifact was served by a local static server and checked successfully:

- entry, manifest, service worker, icons, HTML, CSS, fonts, JS workers, and WASM returned HTTP 200;
- all asset paths remained under `/seeqlite/` and used relative references;
- the generated `PRECACHE` list resolved to existing assets and contained no database or sidecar path;
- no remote script or stylesheet reference was present;
- no CSP, COOP, COEP, or `Service-Worker-Allowed` response headers were present on the local static server, so no header protection is claimed.

The public-host command is intentionally not marked complete until it is run against the authorized deployment and its JSON output is attached to the release evidence. No deployment or rollback mutation is performed by the checker.
