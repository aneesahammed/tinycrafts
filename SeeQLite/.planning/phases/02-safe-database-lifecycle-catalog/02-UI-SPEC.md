---
phase: 2
slug: safe-database-lifecycle-catalog
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-15
---

# Phase 2 — UI Design Contract

> Extension contract for safe one-file lifecycle and the SQLite catalog explorer. It inherits Phase 1's global shell, tokens, typography, spacing, breakpoints, focus, motion, and registry policy without redefining them. Independently re-verified after the catalog paging and related-trigger extension.

## Inheritance and Design System

| Property | Contract |
|---|---|
| Parent contract | `../01-walking-skeleton-browser-harness/01-UI-SPEC.md` |
| Tool | The same manual CSS custom-property system |
| Component library | None; semantic HTML and project-owned React components |
| Icon library | The same project-owned inline SVG set |
| Tokens | Use Phase 1 token names and exact values unchanged |
| Typography | Use Phase 1's named typography roles and family assignments only |
| Spacing | Use Phase 1's named spacing tokens only; no local spacing scale |
| Focus | Use Phase 1's global focus rule and clipped-container inset equivalent |
| Actions | Use Phase 1's Inter typography and verb+noun action-copy rule |
| New dependencies | None for this UI phase |

Phase 2 adds catalog density and file-state complexity, not a second visual language. It must not introduce a new card system, status palette, radius, shadow, font size, or breakpoint.

## Color Application

No new tokens are introduced.

| Role | Inherited token | Phase 2 use |
|---|---|---|
| Dominant 60% | `--paper` | Workspace and detail background |
| Secondary 30% | `--paper-2`, `--paper-3` | Catalog rail, toolbar, details surface, dialog |
| Accent 10% | `--accent`, `--accent-soft`, `--accent-deep`, `--focus-ring` | Selected object, primary Open action, focus, bounded progress, accessible accent text |
| Accessible boundary | `--boundary` | Every meaningful control, drop zone, dialog, table, and state edge |
| Destructive/error | `--danger`, `--danger-soft`, `--on-danger` | Invalid file, import failure, close-session treatment only when confirmation becomes necessary |
| Caution | `--warning`, `--warning-soft`, `--on-warning` | Large-file and WAL/checkpoint caution |
| Success | `--success`, `--success-soft`, `--on-success` | Successful file/catalog outcome when a persistent semantic surface is necessary |

Type/status badges use text, `--boundary`, and icon/abbreviation; kind must never be encoded by hue alone. Caution uses the inherited warning token family and a visible `Caution` label. All visible metadata uses `--ink-2`; `--ink-3` remains decoration-only. Visible accent text/icons use `--accent-deep`, especially in light mode.

## Phase 2 Layout

### No database open

Reuse Phase 1 `FileOpenWorkbench` as the main content. Add Phase 2 validation and failure states inside the same stable panel; do not navigate to a separate error page.

### Database open

| Range | Contract |
|---|---|
| `<768px` | 48px app header, 44px database bar, then two mode tabs: `Objects` and `Details`. One mode is visible at a time. Selecting an object switches to Details and focuses its heading; Back returns to the prior active object in Objects. |
| `768–1023px` | 56px header, 48px database bar. Catalog is a modal left drawer, width `min(360px, 88vw)`, opened by `Objects · {visible count}`. Details remain full width behind an inert scrim. |
| `>=1024px` | 56px header, 48px database bar, then a two-pane workbench. Catalog rail defaults to 288px, resizable from 240–360px; detail pane has `min-width: 0`. |
| `>=1440px` | Same two panes; detail content caps readable prose/SQL at 960px while tables may fill the pane. Do not widen the catalog past 360px. |

- App header remains fixed at the top of the app shell. Database bar is immediately below it and stays visible while catalog/details regions scroll independently.
- Desktop has no body scroll under normal zoom; the rail and detail pane own vertical scrolling. At 200% zoom, allow document reflow rather than clipping controls.
- Desktop pane separator has a 1px `--boundary` line inside a 16px hit zone and exposes the Phase 1 `--focus-ring` when keyboard focused. Use the approved resizable-panel dependency only when implementation reaches this plan; native layout remains the visual contract.
- Database bar order: object-drawer control when applicable, bounded filename/status, caution badge when applicable, flexible spacer, `Open another database`, overflow menu containing `Close database`.
- Filename is bounded to 80 displayed characters, uses `dir="auto"`, and never occupies more than 40% of the desktop bar. Accessible text is also bounded; offer `Copy filename` for the full local value if needed.

## Component Inventory and Contracts

### FileIntake

- Primary action remains `Open SQLite database`; when a database is active, label is `Open another database`.
- Native input is single-file. `accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3"` is advisory only and must not replace content validation.
- The whole empty workbench accepts drag/drop. With a database open, a drag activates a non-opaque workspace overlay with border and copy `Drop one database to replace {current}`; underlying filename remains visible.
- Multiple items/directories do not change the current generation. Announce `Open one file at a time. Your current database was not changed.`
- Picker cancellation is silent and leaves every state/focus target unchanged.
- Replacement validation is staged. Keep the last valid database visible and usable until the candidate has passed the memory/ownership path when measured evidence permits. If memory policy requires early disposal, show an explicit `No database open` state; never present the old catalog beneath a new filename.

### ValidationProgress

- One determinate step list is unnecessary because byte-level progress is unavailable and would be fictional. Show one status line with spinner and the current truthful phase:
  - `Checking {filename}…`
  - `Reading {filename} into browser memory…`
  - `Opening SQLite…`
  - `Reading the catalog…`
- File actions are disabled only while ownership would make a second open unsafe. `Stop opening database` is shown only if the implementation can deterministically settle and clean up the current attempt; do not add a cosmetic stop action.
- Use a polite live region. Do not announce each spinner frame or repeat filename with every state.

### LargeFileDialog

- Opens before `arrayBuffer()` for files at or above 256 MiB and at or below 512 MiB.
- Heading: `Large database`.
- Body: `{filename} is {size}. Opening it may use considerably more memory and could make this tab unresponsive.`
- Secondary/default-focus action on initial intake: `Choose another file`.
- Secondary/default-focus action during replacement: `Keep current database`.
- Primary action in both contexts: `Open large database`.
- Escape and backdrop click invoke the context-specific secondary action. Return focus to the initiating Open control. Dialog uses Phase 1 `--scrim`, `--paper-3`, `--boundary`, radius, focus, and typography contracts, with a maximum width of 480px and no animated scale.
- A file above 512 MiB never opens this dialog; it is blocked before allocation with the hard-limit state below.

### DatabaseBar

- Status text is one of: `Opening`, `Ready`, `Catalog limited`, `Reopening`, `Unavailable` and always includes a textual label, not only an icon.
- `Open another database` is a secondary button. `Close database` is a menu item with a database-close icon.
- Closing in Phase 2 requires no confirmation because it cannot change the source and there is no query draft yet. It terminates the generation, clears catalog/details, returns to the opener, focuses `Open SQLite database`, and announces `Database closed.`
- WAL-main caution is a persistent button/badge labelled `Checkpoint caution`; activating it opens non-modal explanatory content in the database bar region. It is not a red error.

### CatalogRail

Structure, top to bottom:

1. Region heading `Database objects` plus total visible count.
2. Search input labelled `Search database objects`, with clear button only when non-empty.
3. Filter chips/buttons: `All`, `Tables`, `Views`, `Indexes`; each includes a count in its accessible name. Do not add a generic filter builder.
4. Toggle `Show SQLite internals`, off by default.
5. Catalog outcome region: list, loading, empty, no matches, scoped error, or limited state.

- Search is case-insensitive for discovery but displays exact original identifiers. Match safe rendered name and kind; do not render `<mark>` through raw HTML.
- Filtering and search are immediate for the bounded in-memory summary. Preserve query/filter while selecting objects and while lazy detail fails.
- Use a single-tab-stop `role="listbox"` labelled `Database objects`. Each row is an `option` with exact name, kind, and state in its accessible name. Up/Down moves, Home/End jumps, type-ahead remains native-style, Enter selects and moves focus to the detail heading. Pointer click has the same selection result.
- Search input `ArrowDown` moves focus to the first result. `Escape` clears a non-empty search; otherwise it closes the tablet drawer. Do not claim `/` or Cmd/Ctrl+K shortcuts in v1.
- Object row: 40px minimum height, `--space-4` horizontal inset, `--space-2` gap, kind glyph, ellipsized name in Mono, compact status badge(s). Selected row uses `--accent-soft`, a 2px `--accent` inset border, semibold name, and `--accent-deep` for any accent-colored text. Hover alone must not change selection.
- Group headings may visually separate Tables/Views/Indexes but are not selectable and do not add extra tab stops. Virtual/shadow state belongs to the row badge, not a separate hidden group.
- Internal objects are excluded from count and results until the toggle is enabled. Toggling off while an internal object is selected returns selection to the first visible object or the catalog empty state and announces the change.

#### Catalog result windows

- The searched/filtered summary is rendered as one replaceable window of at most 100 `option` elements. This is explicit paging, not append-only infinite scroll: after every action, the listbox DOM contains only the active window and never all 5,000 bounded summaries.
- Immediately after the listbox, render a non-live status paragraph with exact copy `Showing {start}–{end} of {total} objects.` Use `Showing 0 objects.` when there are no matches. Then render a `nav` labelled `Catalog result pages` containing `Show previous 100` when a prior window exists and `Load next {remaining-or-100}` when a later window exists; for example, 101 matches on the first window uses `Load next 1`.
- Paging controls are buttons outside `role="listbox"`; they are never options and never nested inside an option. Hide an inapplicable direction rather than leaving a disabled focus stop. Do not add page-number buttons, infinite scroll, observer-driven loading, or a virtualization dependency in v1.
- Activating either paging button replaces the options, keeps DOM focus on the listbox, sets `aria-activedescendant` to the first option of the new window, and announces once through the catalog polite status region: `Showing {start}–{end} of {total} objects.` The active option is not selected until Enter/pointer activation; existing object details remain visible until a new selection. Keyboard smoke tests assert that focus remains on the listbox after both paging directions.
- Changing search, kind filter, or the internal-object toggle resets the window to the first 100. If focus is in the search/filter control, keep it there and announce the new range; `ArrowDown` then moves to the first option. Empty/no-match states omit the paging navigation.
- At 375px the status occupies its own line and the two actions wrap without page overflow; at 768px drawer focus containment includes the paging controls; at desktop widths controls align at the rail end without reducing a catalog row below 40px. At 200% zoom they stack in DOM order.

### CatalogBadge

Allowed visible labels: `Table`, `View`, `Index`, `Virtual`, `Shadow`, `Strict`, `Without rowid`, `Auto`, `Partial`, `Expression`, `Generated`, `Hidden`, `PK {order}`, `FK`, `Unique`, `Unresolved`.

- Phase 1 Data/meta typography, inherited compact badge radius, 1px `--boundary` border, `--paper-3` or `--accent-soft` only for selected/informational emphasis.
- Badge text is never hidden behind an icon tooltip. A compact mobile row may show one primary kind badge plus `+{n}`; the detail summary must expose all labels.

### ObjectDetails

- Main heading is the exact object name, rendered as text in 18px Sans semibold with `dir="auto"`; adjacent type/status badges are outside the heading text.
- Action bar: `Copy identifier`, `Copy SELECT`, and an overflow only if more actions become requirement-backed. Do not show `Edit`, `Drop`, `Delete`, or `Save`.
- `Copy identifier` uses centralized double-quote escaping. `Copy SELECT` copies a bounded `SELECT * FROM {quoted identifier} LIMIT 100;` statement; it does not execute it and does not imply a complete table browse.
- Clipboard success is a polite inline status next to the action for 3 seconds, then visually clears without removing accessible context. Failure copy is `Couldn’t copy. Select the text and copy it manually.` and the generated text becomes selectable.
- Summary definition list contains kind, column count, key count, index count, relationship count when known, flags, and exact schema generation. Unknown values say `Unavailable`, not `0`.
- Tabs are `Columns`, `Indexes`, `Foreign keys`, and `SQL`. Hide a tab only when structurally inapplicable (for example no index metadata contract for a view); show zero-count tabs for applicable empty collections so users understand absence.
- Tabs use a manual activation pattern: Left/Right changes focus, Enter/Space activates, Home/End supported. On narrow screens tabs are horizontally scrollable inside their own region; page does not scroll horizontally.

### Columns view

- Desktop/tablet: semantic table with sticky header. Columns: `Name`, `Type`, `Nullable`, `Default`, `Key`, `Flags`.
- Narrow: preserve semantic table in a contained horizontal scroller; do not transform it into unlabeled cards. First column is sticky only if it does not obscure focus.
- `NULL`, empty default, and unavailable metadata are distinct: `NULL`, `Empty string`, and `Unavailable`.
- Composite key order is textual (`PK 1`, `PK 2`). Generated/hidden status uses labels, not icons alone.
- Long definitions wrap only in the detail cell or open a labelled detail disclosure; row height may grow. Never place full hostile SQL in a `title` attribute.

### Indexes and foreign keys views

- Index rows expose exact name or `SQLite autoindex`, origin, unique/non-unique, partial/expression, and ordered fields/expressions. Missing SQL is `Definition not stored by SQLite`.
- Foreign-key rows expose parent object, ordered child → parent pairs, update/delete/match rules, and `Unresolved` when parent metadata is missing. Phase 2 does not draw edges.
- Composite relationships render as one bordered group containing all ordered pairs, not separate relationship cards.

### SQL definition view

- `<pre><code>` surface using Phase 1 Body size in Mono, `--paper-3`, `--boundary`, `--space-4` inset, soft wrap off by default, contained horizontal scroll.
- Database text is inserted with `textContent`/React escaping only. Provide `Wrap lines` toggle and `Copy SQL`.
- Missing definition copy: `SQLite does not store a SQL definition for this object.`
- Display preview is bounded. If truncated, show `Definition preview truncated at {limit}.` and do not imply the full value was copied unless the worker returned it under the allowed bound.

### Related triggers

- Placement is fixed: for tables and views, render this section after the tablist's active panel and before the end of `Object details`; indexes do not show it. The H3 is `Related triggers · {count}`. Show `No related triggers for this object.` for an applicable zero count so absence is not confused with unavailable metadata.
- When one or more records exist, use a semantic list labelled by the H3. Each list item has the exact bounded trigger name as its heading with `dir="auto"`, followed by an exact `Owner` value, a bounded SQL definition surface, and only the applicable textual statuses `Metadata incomplete` and `Owner unresolved`. An unresolved owner displays `Owner unavailable`. Do not infer or display timing, event, target, or behavior by parsing trigger SQL.
- A null SQL value displays `SQLite does not store a SQL definition for this trigger.` An available bounded definition uses the same escaped `<pre><code>` treatment and containment as the object SQL view. Truncation copy is `Trigger definition preview truncated at {limit}.`
- `Copy trigger SQL` appears only when the worker returned a complete bounded definition. Success copy is `Trigger SQL copied.` Failure copy is `Couldn’t copy. Select the trigger SQL and copy it manually.` and exposes the same bounded text as selectable React text. Copy never executes SQL and never creates a SELECT target for a trigger.
- Trigger records are related metadata: they are not catalog options, tabs, disclosure-only tooltips, or query targets. Database-provided name, owner and SQL are rendered as React text and cannot contribute raw HTML, an accessible label beyond the bounded DTO, or a `title` attribute.
- Detail selection never moves focus directly into this section. When triggers exist, provide `Skip to related triggers` after the object action bar; activating it focuses the H3 (`tabindex="-1"`). Copy keeps focus on its button and reports through the shared polite copy status. On narrow Back-to-objects flow, focus restoration still targets the selected catalog option, not a trigger action.
- At 375px trigger name/status/actions wrap, while the SQL surface scrolls inside the detail pane; at 768px it remains inside the inert-aware details region; at 1024px and 1440px it follows the 960px readable-content cap. No trigger value may cause body-level horizontal scroll at 100% or 200% zoom.

## File Outcome Copy Contract

| Outcome | Heading/status | Body and action |
|---|---|---|
| Zero-byte | `This file is empty` | `Choose a SQLite database that contains data.` Action: `Choose another file` |
| Invalid header/open | `This file is not a readable SQLite database` | `It may be encrypted, incomplete, or corrupt. Choose a different file.` |
| Unusual extension, valid bytes | `Opened despite the unusual file name` | `The contents are readable SQLite. File extensions are only a hint.` Non-blocking advisory. |
| Sidecar | `Open the main database instead` | `SeeQLite cannot combine WAL, SHM, or journal sidecar files. Checkpoint the database in SQLite, then open the main .db file.` |
| WAL-mode main | `Checkpoint caution` | `This main database opened, but changes held only in a separate WAL file are not included. For a complete snapshot, checkpoint it before opening.` |
| Soft size threshold, initial intake | `Large database` | `{filename} is {size}. Opening it may use considerably more memory and could make this tab unresponsive.` Actions: `Choose another file`, `Open large database` |
| Soft size threshold, replacement | `Large database` | `{filename} is {size}. Opening it may use considerably more memory and could make this tab unresponsive.` Actions: `Keep current database`, `Open large database` |
| Hard size threshold | `This database is too large to open here` | `Files over 512 MiB are blocked before reading to protect this tab.` Action: `Choose a smaller file` |
| Browser read failure | `The browser could not read this file` | `Check that the file is still available, then try again.` |
| Allocation/OOM | `This database could not fit in browser memory` | `Close other tabs or choose a smaller checkpointed database.` |
| Catalog bootstrap failure | `The database opened, but its catalog could not be read` | `It may be incomplete or corrupt. Choose another file or try this file again.` |
| Multiple/directory drop | `Open one file at a time` | `Your current database was not changed.` |
| Candidate replacement failed | `Couldn’t replace {current}` | `{candidate} was not opened. Your current database is still available.` |
| Reopen after worker failure | `Reopening {filename}…` | `SeeQLite is rebuilding the local database session.` |
| Reopen failed | `The database could not be reopened` | `Choose the file again to continue.` Action: `Open database` |

Never state that a file is definitely encrypted unless SQLite provides a reliable dedicated outcome; this phase always uses `may be encrypted, incomplete, or corrupt`.

## Catalog State Contract

| State | Visual, copy, and recovery |
|---|---|
| Bootstrap loading | Rail skeleton limited to 8 rows plus visible status `Reading the catalog…`; skeleton has `aria-hidden="true"`. |
| Empty database | Heading `This database has no user objects`; body `Tables, views, and indexes will appear here when they exist.` Internal toggle remains available. |
| No search matches | `No objects match “{bounded query}”.` Action `Clear search`; database/details remain intact. |
| Lazy detail loading | Detail heading appears immediately, then labelled skeleton/status `Loading object details…`; previous object's details are not left under the new heading. |
| Scoped detail failure | `Details unavailable for {object}`; body `The rest of the catalog is still available.` Action `Try details again`. Search/selection remain usable. |
| Limited catalog | Persistent rail banner `Catalog limit reached`; body `Showing a searchable subset of {shown} objects. Some object details are unavailable.` Include exact reached limit in an expandable `Limit details` region. |
| Stale reply | No visible flash or alert. Ignore it by epoch; keep current selection/loading state. |
| Internal objects shown | Persistent quiet label `SQLite internals shown` next to the enabled toggle; do not tint every internal row red/warning. |
| Broken object metadata | Show object row and scoped `Metadata incomplete` badge; preserve safe known fields and do not block other objects. |

Skeletons use neutral paper-2/rule blocks and at most a 1.2s opacity pulse. Reduced-motion disables the pulse. A spinner without status text is not an accepted loading state.

## Safe Action and Confirmation Rules

- Opening/replacing is user-initiated and staged; no confirmation is required before the picker. The soft-size dialog is the only Phase 2 blocking confirmation.
- Closing does not modify a source file and Phase 2 has no draft, so no confirmation dialog. This must be revisited in Phase 3 when a dirty editor exists.
- Generated/copy SQL always uses centralized SQLite identifier quoting and one statement. Database text is never interpolated into HTML.
- Do not overwrite future editor state in this phase. `Copy SELECT` is the only query bridge rendered until the Phase 3 editor contract exists.
- Never retry file import, catalog bootstrap, lazy detail, or worker recovery in an infinite/automatic loop. Each recovery is an explicit action after the first bounded attempt.

## Keyboard, Focus, and Announcements

- App regions are labelled: `Database controls`, `Database objects`, and `Object details`.
- After a successful open, focus the `Database objects` heading, then make the first visible object active without forcing a selection if the catalog is empty.
- After selection via Enter/pointer, focus the detail H2 on narrow screens; on desktop keep listbox focus so arrow exploration is efficient and announce `{name}, {kind}, details loaded` politely. Provide a visible `Skip to object details` link at the top of the rail.
- Tablet drawer traps focus only while open, closes on Escape, restores focus to `Objects · {count}`, and makes the background inert.
- Narrow `Back to objects` restores focus to the selected listbox option and preserves scroll position/search.
- Large-file dialog follows modal focus rules: initial focus is `Choose another file` on initial intake or `Keep current database` during replacement; Tab is contained; Escape invokes that context-specific action; focus returns to the initiator.
- Search/filter result counts announce after 300ms debounce using the exact active-window copy `Showing {start}–{end} of {total} objects.`; explicit previous/next paging announces immediately once. Do not announce on every keystroke synchronously.
- Copy success uses a polite status. File/import/worker blocking failures use one alert when introduced, then become normal content to avoid repeated announcements.
- Resizable separator uses `role="separator"`, orientation, current/min/max values, Arrow adjustment, and Home/End min/max. Provide a `Reset panel width` action in its accessible context menu only if the library exposes it cleanly.
- All rows/actions remain operable at 200% zoom, in forced colors, and without pointer drag.

## Density and Content Bounds

- Catalog row: minimum 40px; rail toolbar controls 40px; database bar 48px; detail table row minimum 36px.
- Rail shows the bounded summary only. Do not render hidden/generated column details for every object eagerly.
- Long object names use one-line ellipsis in the rail but exact bounded text in details. Bidi controls remain inert; use `unicode-bidi: plaintext`/`dir="auto"` where supported and preserve logical exact text for copy.
- Definition and default previews are bounded before the main thread. UI truncation adds an explicit label, never just an ellipsis.
- Limited mode remains searchable and does not attempt a full catalog list expansion.

## Motion and Reduced Motion

- Inherit Phase 1 timing. Drawer: 160ms opacity/translate no more than 8px. Object selection: 120ms background/border. Detail replacement has no crossfade; content updates immediately after the labelled loading state.
- Do not animate rail resizing, table row insertion, catalog filtering, or filename truncation.
- Reduced motion removes drawer translation, skeleton pulse, spinner rotation, and smooth scrolling; focus and state remain immediate.

## Responsive Acceptance

- 375px: Objects/Details tabs fit without overflow; catalog search and primary actions are full-width as needed; detail tables scroll inside their region; Back returns focus correctly.
- 768px: drawer is no wider than 88vw, background is inert, and a long filename cannot cover `Open another database` or `Close database`.
- 1024px: 288px rail + separator + detail has no body overflow; resizing stops at 240/360px.
- 1440px+: detail prose/code remains readable rather than stretching; wide tables may use the available pane.
- At all widths, current database identity, caution/limited status, `Open another database`, and `Close database` remain discoverable without horizontal page scroll.

## Visual Acceptance Checks

- [ ] Capture no-database, drag-replace, validation, large-file dialog, invalid, sidecar, WAL caution, hard-limit, empty catalog, normal catalog, no matches, detail loading, detail failure, and limited catalog.
- [ ] Capture at 375×812, 768×1024, 1024×768, and 1440×900 in both inherited themes.
- [ ] Compare Phase 2 computed base tokens, font sizes/weights, spacing, radii, and breakpoints with Phase 1; any new value fails review.
- [ ] Selected catalog row is identifiable in monochrome/forced-colors and without its blue background.
- [ ] Rail/detail/browser horizontal scrolling is contained; body does not horizontally scroll at 100% or 200% zoom.
- [ ] Long Unicode, quoted, keyword, newline, bidi-control, and HTML-like names remain inert, bounded, legible, and copyable.
- [ ] Keyboard smoke covers open, both context-specific large-file secondary labels, `Open large database`, search, filter, listbox traversal, `Show previous 100`/`Load next {n}` focus movement, details tabs, `Skip to related triggers`, trigger copy, copy identifier/SELECT, drawer, close, and focus restoration.
- [ ] Inherited contrast assertions pass: metadata uses `--ink-2`, meaningful edges use `--boundary`, light accent text uses `--accent-deep`, and danger/warning/success surfaces use only the Phase 1 semantic token families.
- [ ] Axe has no serious/critical issues in both themes and every state has one non-color label.
- [ ] Reduced-motion capture has no drawer translation, spinner rotation, skeleton pulse, or smooth scroll.
- [ ] Replacement failure visibly preserves the old filename/catalog; successful replacement never flashes old details under the new database identity.
- [ ] Limited mode states exact limits and leaves search usable.
- [ ] Catalog fixtures with 0/99/100/101/5,000 matches show exact range/action copy, never more than 100 listbox options, and preserve the active 100-option window/focus at 375/768/1024/1440, 200% zoom and forced colors.
- [ ] Related-trigger captures cover zero, ordinary, null SQL, truncated SQL, incomplete metadata, unresolved owner and hostile quoted/Unicode/HTML-like name/owner/SQL in both themes; no capture or accessible tree contains an inferred timing/event label.

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | None | Inherited manual-system decision; not initialized — 2026-07-15 |
| Third-party registries | None | No registry code permitted by Phase 1 or Phase 2 — 2026-07-15 |

## Decision Provenance

- Phase 2 context: staged one-file lifecycle, 256/512 MiB thresholds, cautious WAL/sidecar/corrupt copy, retained File recovery, searchable bounded catalog, internal toggle, lazy failure isolation.
- Requirements: FILE-01..05, SAFE-01..03, CAT-01..05, exact negative states and stale-generation behavior.
- Roadmap/research: one normalized catalog, compact explorer, trusted worker boundary, bounded work, no editor or ER canvas yet.
- Phase 1 UI spec: exact TinyCrafts tokens, fonts, spacing, breakpoints, focus, motion, shell anatomy, and manual registry policy.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-15 after targeted recheck
