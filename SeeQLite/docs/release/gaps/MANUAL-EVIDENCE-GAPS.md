# Manual accessibility evidence gaps

Recorded 2026-07-16. The validator and template are complete; the human execution is not.

| Gap | Required evidence | Owner | Status |
|---|---|---|---|
| Released Safari + VoiceOver workflow | Current macOS/Safari/VoiceOver versions, all eight workflow steps, actual focus/announcements, sanitized artifacts, signature, and passing reruns | Accessibility/release engineering | Open; WebKit is not a substitute |
| Windows NVDA workflow | Current Windows/NVDA with Firefox or Chrome, all eight workflow steps, actual focus/announcements, sanitized artifacts, signature, and passing reruns | Accessibility/release engineering | Open |

Run `node scripts/validate-release-evidence.mjs docs/release/accessibility-safari.md` only after replacing the template with real records. The release gate must not use `--allow-incomplete-template`.
