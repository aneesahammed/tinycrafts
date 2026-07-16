# Phase 6.04 partial execution summary

Recorded: 2026-07-16

This checkpoint closes Task 06-04-01: the PF-01…PF-14 risk-evidence contract. It does not claim a complete release run, dependency audit closure, public deployment, manual assistive-technology sign-off, or rollback rehearsal.

## Risk evidence contract

| Surface | Result |
|---|---|
| Manifest | `docs/release/risk-evidence.json` contains exactly PF-01…PF-14 once each, with severity, resolved status, owner, source citation, and named prevention/recovery references |
| Reference identity | Every reference has a safe repository-relative source file, exact literal test title, command, expected assertion, SHA-256 source digest, and canonical result key |
| Freshness gate | `scripts/check-risk-evidence.mjs` checks explicit release commit, source digests, test-title identity, ISO run/result timestamps, result-window membership, pass outcome, and exact one-attempt evidence |
| Skip/retry gate | `skipped`, `fixme`, `todo`, `conditional`, `excluded`, retry, and multi-attempt records fail closed |
| Gap output | Failure writes deterministic, sanitized `docs/release/gaps/RISK-GAPS.md` content with PF ID, criterion, owner, and named evidence |
| Mutation tests | `tests/release/risk-evidence.test.ts` — 20 tests pass, covering missing/duplicate/unknown PFs, unresolved/missing prevention or recovery, stale digest/title, missing/stale result, failed/skip/fixme/conditional/retry/old-time/unknown-key results, deterministic gaps, and digest fidelity |

Manifest SHA-256: `2f4c3b44274067fc077205d0c738a16933eba89edd4dbb48555ed2b9a448752e`.

## Verification

```text
npm test -- tests/release/risk-evidence.test.ts    PASS (20 tests)
npm run typecheck                                  PASS
CLI malformed/incomplete runner fixture            FAIL CLOSED; deterministic Markdown gap written
```

The checker intentionally accepts no current runner artifact in this slice. A valid release-shaped runner record must be emitted by 06-03 before invoking:

```text
node scripts/check-risk-evidence.mjs \
  docs/release/risk-evidence.json \
  .release-evidence/test-results.json \
  --commit <release-sha> \
  --gaps docs/release/gaps/RISK-GAPS.md
```

## Handoff to 06-03

06-03 must emit one result for every manifest `resultKey`, with the exact file/test/command/assertion/source digest copied from the manifest and these fields: `commitSha`, `outcome: "passed"`, `artifact: "artifacts/..."`, `startedAt`, `completedAt`, `skipped:false`, `fixme:false`, `todo:false`, `conditional:false`, `excluded:false`, `retryCount:0`, `attempts:1`, `retried:false`, and `attempt:1`. It must invoke the checker only after the complete suite has produced the current-run artifact; missing or stale evidence remains release-blocking.

## Explicitly open

- Task 06-04-02 dependency/license/notice/advisory inventory is not implemented in this slice.
- A current complete `.release-evidence/test-results.json` does not exist yet.
- Safari + VoiceOver, Windows + NVDA, public deployed headers, and rollback rehearsal remain human/release gates.
