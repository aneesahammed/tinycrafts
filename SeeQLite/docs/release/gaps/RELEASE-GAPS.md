# SeeQLite release gaps

This report is release-blocking until the current release gate and required human/public checks pass. The automated gate regenerates it from sanitized state.

| ID | Gap | Owner | Required evidence |
|---|---|---|---|
| RUN-01 | Current complete `.release-evidence/test-results.json` has not been produced by the full release gate. | Release engineering | `scripts/release-gate.mjs` |
| A11Y-01 | Released Safari + VoiceOver and Windows NVDA evidence remains an incomplete template. | Accessibility owner | `docs/release/accessibility-safari.md` |
| REL-02 | Authorized public deployment headers/MIME/service-worker scope evidence is not attached. | Release engineering | `scripts/check-deployed-seeqlite.mjs` output |
| REL-02 | Production-shaped rollback rehearsal is not recorded. | Release engineering | `ROLLBACK.md` and `.release-evidence/rollback.json` |
| PERF-01 | Constrained-host memory pressure and portable worker-transfer/long-task evidence remain open. | Performance owner | `docs/release/gaps/PERFORMANCE-GAPS.md` |

No gap is closed by a local WebKit substitute, a stale artifact, a retry-masked test, or a prose waiver.
