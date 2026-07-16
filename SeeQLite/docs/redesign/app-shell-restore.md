# SeeQLite — App-Shell Restoration (2026-07-16)

## Problem

Codex shipped a **marketing landing-page layout**, not the database-IDE the
`.planning/phases/*/UI-SPEC.md` files already specify. A permanent
`"See what's inside."` hero occupies the entire left half of the viewport even
while working; the table list, editor, results and history are crammed into one
narrow scrolling right column; the ER "diagram" is a static SVG grid.

The engine layer (SQLite worker, catalog extraction, query client, DTOs) is
sound and is **kept unchanged**. This is a re-layout of the shell, not a rewrite.

## Target layout (restores 02/03/04-UI-SPEC intent)

```
┌ app-header (56px): brand · LOCAL ONLY · theme toggle ───────────────┐
├ database-bar (44px): filename · status · Open/Sample · Close/Reopen ─┤
├ catalog-rail ─┬ work-main ───────────────────────────────────────────┤
│ (≈288px,      │ mode-tabs:  [ Editor ]  [ ER Diagram ]                │
│  resizable)   │ ┌ Editor tab ──────────────────────────────────────┐ │
│ search        │ │ SQL editor (CodeMirror)     — resizable height     │
│ [All|T|V|Idx] │ │ Run · Plan · Stop   ⌘↵                             │
│ ▸ users       │ │ [schema of selected table]                         │
│ ▸ notes       │ │ Results grid (paginated, sticky header, scrolls)   │
│ …             │ │ Query plan · Export · History                      │
│               │ └────────────────────────────────────────────────────┘
│               │  OR  ER Diagram tab: interactive canvas 68% │ rels 32%
└───────────────┴──────────────────────────────────────────────────────┘
```

No database open → the `work-main` area shows the welcome state (the hero,
privacy note, open/sample buttons, drop zone). Once open, the shell fills the
viewport and the rail lists every table/view.

## Component map (reuse existing logic)

| Region        | Source                                                        |
|---------------|---------------------------------------------------------------|
| catalog-rail  | table-list + search + internal toggle, moved out of `work-main` |
| Editor tab    | existing `SqlEditor`, `ResultTable`, `PlanTree`, `QueryHistory`, export, `TableDetails` |
| ER Diagram    | **new** `ErCanvas.tsx` (pan/zoom/drag, no new deps) + existing `RelationshipList` |
| welcome state | existing hero markup, shown only when no catalog               |

## New behaviour (user request beyond spec)

Clicking a table in the rail **auto-runs** `SELECT * FROM <t> LIMIT 100` into the
results grid *and* shows its schema — "columns and rows, paginated" in one click.

## ER canvas (lightweight custom — chosen over React Flow + ELK)

- HTML node cards absolutely positioned inside a `translate(pan) scale(zoom)`
  wrapper; SVG edge layer beneath for FK lines.
- Pan = drag background; drag a node to move it; wheel / ± buttons to zoom;
  `Fit` and `Arrange` (deterministic grid) actions. Reduced-motion respected.
- Node / relationship click → opens the table in the Editor tab (existing flow).
- Keeps the 75-table / catalog-limit empty states.

## Behavioural contracts preserved (so E2E stays green)

Accessible names/classes the tests depend on and that must NOT change:
`.skip-link` → `#workspace`, `.file-status` (status text), `input[type=file]`,
`.result-panel`, `.history-list`, buttons `Open SQLite database` /
`Try sample database` / `Run query` / `Run readiness check` / `Show query plan` /
`Download CSV` / `Generate join from … to …`, regions `Declared relationships` /
`<table> details`, heading `See what's inside.` (welcome state), theme toggle.

Only intentional change: mode tabs rename **Query → Editor**, **Diagram → ER
Diagram** (regex `/Diagram/` still matches). One assertion updated in
`keyboard-workflows.spec.ts`.

## Out of scope this pass

React Flow / ELK, resizable output/plan tabs, cell-detail dialog, history side
sheet, filter-chip counts. Playwright visual-snapshot regeneration for the app
(none exist today; landing snapshots are unaffected).
```
