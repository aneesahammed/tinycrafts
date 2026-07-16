# SeeQLite release checklist

The checklist is deliberately ordered. A later step cannot convert an earlier incomplete artifact into a pass.

## 1. Source and artifact

- [ ] Worktree is clean and the checked commit is the intended release SHA.
- [ ] `npm ci` has been run from `SeeQLite/` and `dataduck/` using the committed lockfiles.
- [ ] `node ../scripts/build-pages.mjs` passes.
- [ ] `node ../scripts/verify-pages-build.mjs` passes.
- [ ] No source, test, lockfile, database, or sibling cache files leak into `.pages-build/`.

## 2. Automated gate

- [ ] `node scripts/release-gate.mjs` completes without failed, skipped, fixme, conditional, retried, stale, or digest-mismatched evidence.
- [ ] `.release-evidence/test-results.json` has the current commit SHA and status `complete`.
- [ ] `node scripts/check-risk-evidence.mjs docs/release/risk-evidence.json .release-evidence/test-results.json --commit <sha>` passes.
- [ ] `node scripts/audit-release-dependencies.mjs --check` and production `npm audit --omit=dev --audit-level=high` pass.

## 3. Human and public gates

- [ ] Released Safari + VoiceOver record is complete, signed, current, sanitized, and includes light/dark, reduced motion, forced colors, 200% zoom, IME, ER-list, cancellation, export, update, and offline paths.
- [ ] Windows NVDA record is complete with a supported browser and the same primary workflow.
- [ ] `node ../scripts/check-deployed-seeqlite.mjs https://tinycrafts.ai/seeqlite/ <deployed-evidence.json>` is attached; absent headers are documented as limitations.

## 4. Rollback

- [ ] Previous complete Pages artifact and service-worker version are identified.
- [ ] Rollback is rehearsed in a production-shaped copy without origin-wide cache deletion.
- [ ] SeeQLite, DataDuck, landing, direct refresh, offline shell, sibling cache, MIME, and worker/WASM checks pass after rehearsal.
- [ ] Abort criteria and ownership are recorded in `ROLLBACK.md` and `.release-evidence/rollback.json`.

Any unchecked item blocks release. Do not waive a Critical/High risk, missing manual record, absent public evidence, or failed rollback through prose.
