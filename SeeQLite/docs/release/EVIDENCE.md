# SeeQLite release evidence

The authoritative current-run artifact is generated only by:

```text
node scripts/release-gate.mjs
```

It writes `.release-evidence/test-results.json` atomically and, when incomplete, regenerates `docs/release/gaps/RELEASE-GAPS.md`. The artifact contains the checked commit SHA, command results, source/output digests, requirement links, PF result records, manual/deployed/rollback states, and sanitized blocking reasons. Raw SQL, database values, filenames, and command output are never persisted in the evidence record.

The current repository state has protocol evidence for:

- PF-01…PF-14 risk mapping and mutation checks;
- SeeQLite runtime dependency/license/notice/advisory inventory;
- manual Safari/VoiceOver/NVDA schema validation;
- shared Pages artifact and local deployed-shape verification.

The latest local release run produced an incomplete artifact for the checked commit: all 20 automated command outcomes passed with zero retries or skips, but the artifact remains incomplete until the human accessibility, authorized public deployment, and rollback gates are executed. The generated artifact is deliberately not committed because its embedded commit SHA must match the source commit under test; regenerate it for the exact release candidate with the command above.

## Required evidence inputs

1. A fresh current-commit `.release-evidence/test-results.json` from the release gate.
2. A complete signed `docs/release/accessibility-safari.md` record, validated without `--allow-incomplete-template`.
3. Public `/seeqlite/` output from `node ../scripts/check-deployed-seeqlite.mjs https://tinycrafts.ai/seeqlite/ <path>`.
4. A production-shaped rollback record at `.release-evidence/rollback.json`.

Only the complete set can satisfy REL-01, REL-02, and the Definition of Done.
