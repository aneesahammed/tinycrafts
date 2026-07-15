# UI Contract Review

**Reviewed:** 2026-07-15
**Scope:** Phase 1–6 UI specifications
**Status:** Verified after two targeted revision passes

```yaml
issues:
  - severity: BLOCK
    phases: [2]
    dimension: copywriting
    finding: Large-file confirmation uses the generic label "Cancel".
    required_fix: Use "Choose another file" on initial intake and "Keep current database" during replacement.
  - severity: BLOCK
    phases: [3, 6]
    dimension: copywriting
    finding: Running and planning states use the generic label "Cancel".
    required_fix: Use "Stop query" and "Stop query plan" with matching shortcuts, announcements, and focus recovery.
  - severity: BLOCK
    phases: [1, 2, 3, 4, 5, 6]
    dimension: color
    finding: ink-3, rule, and light accent pairings fail the contracts' own contrast targets.
    required_fix: Reserve ink-3 for decoration, use ink-2 for visible metadata, use an accessible boundary token for meaningful controls, and use accent-deep for light-theme accent text; add contrast assertions.
  - severity: BLOCK
    phases: [1, 2, 3, 4, 5, 6]
    dimension: color
    finding: Danger, warning, success, soft-surface, and on-color values diverge across phases.
    required_fix: Define the full semantic token set once in Phase 1 for both themes; later specs reference names only.
  - severity: BLOCK
    phases: [1, 2, 3, 4, 5, 6]
    dimension: spacing
    finding: A 12px layout spacing token violates the approved scale and is inconsistently inherited.
    required_fix: Remove 12px layout spacing; map every use to 8px or 16px. Twelve pixels may remain only as a font size.
  - severity: WARNING
    phases: [1, 3, 4, 5, 6]
    dimension: focus
    finding: Focus offset is inconsistent.
    required_fix: Use a 2px outline with 4px offset globally and define a clipped-container inset equivalent.
  - severity: WARNING
    phases: [1, 3, 4, 5, 6]
    dimension: typography
    finding: Control typography alternates between Inter and JetBrains Mono.
    required_fix: Use Inter for prose, headings, and actions; JetBrains Mono for SQL, identifiers, values, counts, timings, and metadata.
  - severity: WARNING
    phases: [1, 3, 4, 5, 6]
    dimension: copywriting
    finding: Several single-word actions lack a noun.
    required_fix: Use "Reset workspace", "Reload SeeQLite", "Run query", "Build query plan", "Arrange diagram", "Fit diagram", "Close export", "Close privacy & limits", and context-specific retry labels.
```

## Revision policy

- Phase 1 owns global tokens, typography, spacing, focus, and action-copy rules.
- Phases 2–6 reference those names and may define component usage, not alternative global values.
- The independent GSD UI checker re-ran after both revisions and reported PASS for all six dimensions in all six phases on 2026-07-15.
