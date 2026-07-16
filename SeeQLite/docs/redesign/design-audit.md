# SeeQLite Design Audit

Date: 2026-07-16 · Scope: full app (landing + workspace, light + dark) · Method: gstack /design-review checklist (10 categories), live inspection at localhost:5175, source verification with file:line evidence, user-supplied screenshots (Chinook, california_schools, reference mockup).

References calibrated against: DataDuck (sibling repo), Cloudflare D1 Studio, and the user's reference mockup (screenshot #4) as the north star for "approachable developer product". (The earlier Uber Base direction was retired by owner decision on 2026-07-16; the app skin is now database-tool neutrals: cool near-black ink on white/gray surfaces with one restrained blue for the primary action, selection, and links.)

**Status update, same day:** Phase 1 plus quick wins were implemented after this audit was written. Resolved: HIER-1 (single command bar with database pill menu), HIER-3 (Open/Close/readiness folded into the pill), HIER-4 (plain tab labels), ACT-1 (readiness out of the action bar), ACT-2 (Explain), ACT-3 (kbd chips in buttons), BRAND-1 (favicon SVG is now the header mark), COLOR-1 partial (quiet buttons neutral, rail names ink), COLOR-2 (per-state arrowheads), EDITOR-1 (line-numbered gutter visible), EDITOR-2 (editor chrome stripped, clipped-outline artifact gone), TYPE partial (9px floor raised). Still open: HIER-2, ER-1..4, RAIL-1..5, GRID-1..2, TYPE-1 full pass, BRAND-2..4, ACT-4..5, STATE-1, HIER-5.

---

## First impression

The app communicates competence and restraint. It does not communicate a product.

The first three things the eye lands on: the black **Run query** button (good, that is the right anchor), the column of blue table names in the rail (wrong, they read as links), and the READ ONLY chip (why is a passive badge in the top three?).

One word: **utilitarian**. It works like a tool and looks like an internal admin panel. The bones are right. The voice is missing.

## Scores

| | Grade | Note |
|---|---|---|
| **Design Score** | **B-** | Solid system, weak hierarchy and personality |
| **AI Slop Score** | **B** | No slop patterns (no gradients, no 3-col icon grids, no bubbly radii). But "no slop" is not the same as "distinctive" |

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | C | HIER-1, HIER-2 |
| Typography | C+ | TYPE-1, TYPE-2 |
| Color & contrast | B- | COLOR-1 (contrast itself passes AA everywhere, verified) |
| Spacing & layout | B | Consistent hairline system |
| Interaction states | B- | STATE-1, kbd hint |
| Responsive | B | Stacks sensibly at 900px |
| Motion | C | Almost none; nothing communicates state change |
| Content & microcopy | C+ | ACT-1 jargon, cryptic counts |
| AI slop | B+ | Clean, but generic |
| Performance feel | A- | Local WASM, instant |

---

## Findings

Severity: **High** = hurts first impression or comprehension · **Med** = felt subconsciously, reduces polish · **Low** = good-to-great gap.

### A. Brand and identity

**BRAND-1 · Med · Favicon and header mark are two different logos** (user-reported)
Evidence: `index.html` loads `public/seeqlite-icon.svg` (blue rounded square, three white bars). The header renders a `◫` text glyph in a bordered box (`App.tsx` brand-mark). Two marks, one product.
Resolution: the user likes the favicon, so make it canon. Inline the SVG as the header brand mark (swap `fill` to `currentColor` so both skins/themes tint it), sized 24px. Delete the `◫` glyph. Same shape in tab, header, and empty states.

**BRAND-2 · High · No product personality** (user-reported)
Evidence: apart from the logo, every surface is neutral chrome. Empty states are a `⌁` glyph and one flat sentence. No consistent icon language (mix of unicode glyphs: ◫ ▤ ▦ ◇ ⌕ ⌁). The reference mockup feels like a product because it commits to one icon set, a db-pill identity element, and human microcopy.
Resolution:
- One icon language: small inline SVG set (database, table, view, key, play, download, search) at one stroke weight. Retire the unicode grab-bag.
- Database identity pill in the header (icon + name + chevron) as the app's anchor object.
- Empty states with an action: "Pick a table on the left, or press ⌘↵ to run." plus the brand mark, not `⌁`.
- Microcopy voice: short, concrete, second person. "Done in 6 ms · 100 rows" beats "Query plan ready in 6 ms."

**BRAND-3 · Low · `theme-color` meta frozen to landing cream**
`index.html` sets `#f7f3ec` once. Wrong for the app skin and for dark mode (browser UI tint mismatches).
Resolution: update `meta[name=theme-color]` on skin/theme change from App.tsx.

**BRAND-4 · Low · Two theme conventions in one document**
`index.html` ships `data-theme="light"` (dead, nothing reads it); the runtime toggles `data-dark`. One attribute should exist.
Resolution: standardize on `data-theme="light|dark"` and migrate `tokens.css` selectors.

### B. Layout and hierarchy

**HIER-1 · High · Everything at the top competes at equal weight** (user-reported)
Evidence: two stacked full-width bars (54px app-header + 44px database-bar) hold brand, stats, LOCAL ONLY, theme, db icon, DATABASE label, filename, status sentence, READ ONLY, and two large buttons. Ten elements, no ranking. After opening a database, nothing says "now write a query".
Resolution: collapse to one command bar, ranked left to right: brand mark · **database pill** (name + chevron menu containing Open another / Reopen / Close) · stats (`24 tables · 11 relations`) · spacer · LOCAL ONLY + READ ONLY as one badge group · theme toggle. The workspace below then has exactly one black button (Run query). This is the reference mockup's exact topology and it frees ~44px of vertical space.

**HIER-2 · High · Query feedback appears in the database bar, far from the query**
Evidence: screenshot #1 shows "Query plan ready in 6 ms." rendered next to the filename, a full viewport away from the plan it describes. `App.tsx` routes all `setStatus()` strings to the db bar.
Resolution: split the status channel. Database lifecycle messages (opened, closed, WAL warning) stay in the bar. Execution feedback (running, done-in-ms, row counts, errors) renders in the result panel header: `● Done in 6 ms · 100 rows`. The green/amber dot already exists there; give it the words too.

**HIER-3 · Med · "Open another database" + "Close database" are permanent heavyweight buttons**
Two of the largest controls on screen serve actions used once per session.
Resolution: fold both into the database pill's dropdown (HIER-1). Rare actions should cost a click, not pixels.

**HIER-4 · Med · Tab label carries data: "ER Diagram · 1 relation"**
The count widens the tab, duplicates the diagram toolbar's own count, and makes tabs unequal widths across databases.
Resolution: tabs say Query / Schema / ER Diagram. Counts live in the diagram toolbar (already there).

**HIER-5 · Low · Canvas hint chip is permanent**
"Drag a table to move it · drag the canvas to pan…" overlays the canvas forever.
Resolution: fade it out after the first successful drag or pan (localStorage flag).

### C. Typography (user-reported: "difficult to scan")

**TYPE-1 · High · Micro-label fog**
Evidence: eleven distinct 9-10px letter-spaced uppercase mono labels per screen (TABLES, DATABASE, COLUMNS OF X, RESULT, EXPORT RESULT, DIAGRAM, RELATIONSHIPS, FOREIGN KEY · MANY → ONE, OBJECT DETAILS, LOCAL ONLY, READ ONLY). Uppercase mono is the loudest quiet style there is; using it everywhere means nothing is quiet.
Resolution: assign type roles and enforce them.
- Sans (Inter) for all UI: section titles 12px/600 sentence case, body 13px, secondary 12px.
- Mono (JetBrains) only for data: identifiers, SQL, values, counts, kbd.
- Keep at most ONE uppercase eyebrow per panel; everything else becomes sentence-case sans.

**TYPE-2 · Med · No scale**
Sizes in use: 8, 9, 10, 11, 12, 13, 14, 15px (`er-node-kind` is 8px). Ad hoc.
Resolution: lock a 5-step scale (11 / 12 / 13 / 15 / 18) with two weights (400/600). Delete every 8-9-10px declaration; 11px is the floor.

**TYPE-3 · Low · Numbers don't align**
Result grid and counts lack `font-variant-numeric: tabular-nums`, so digit columns wobble.
Resolution: apply tabular-nums to `td`, counts, stats, zoom %.

### D. Color (user-reported: "blue everywhere, it's weird")

**COLOR-1 · High · Accent blue means four different things**
Evidence: blue is simultaneously (1) interactive controls (quiet buttons, links), (2) selection state (rail, tabs, nodes), (3) data emphasis (rail table names, BLOB values, history counts), (4) SQL syntax (keywords). When one hue encodes control, state, data, and syntax, none of them reads. This is why the UI feels "weird": your eye is told everything blue is clickable, and half of it is not.
Resolution: color roles, enforced in `app.css`:
- Blue = interactive + selected. Nothing else.
- Identifiers/data = ink (`--ink` / `--ink-2`). Rail table names become ink; the active row alone goes blue.
- BLOB/NULL = neutral bordered badges, not colored text.
- SQL syntax keeps its own palette inside the editor only (keywords can stay blue there; the editor is a distinct surface with a gutter boundary).
- Quiet buttons (Arrange, Fit, Download CSV/JSON, Show internal objects) become neutral ghost buttons: ink text, border on hover. Underlined-blue-link style is retired outside prose.

**COLOR-2 · Med · Arrowheads ignore edge state**
Evidence: `app.css` `.er-edges marker path { fill: var(--boundary) }` — one gray marker shared by all edges, while the active edge stroke is accent blue and unresolved is amber.
Resolution: three `<marker>` defs (default / active / unresolved) selected per edge, or use `context-stroke` fill.

**COLOR-3 · Low · Selection double-encoded in rail**
Active row gets background + left bar + blue text + weight change. Two signals are enough; the recolor adds to COLOR-1's noise.
Resolution: keep background + left bar; text stays ink.

### E. Actions and controls

**ACT-1 · High · "Run readiness check" is jargon and competes with the primary action** (user-reported)
It sits beside Run query at equal size, and no user can predict what it does (it runs `SELECT 1`). It exists to prove the engine is alive, which the sample query already proves.
Resolution: remove it from the action bar. If diagnostics are worth keeping, it becomes "Test connection" inside the database pill menu. The bar then reads: **Run query ⌘↵** (black) · Explain (ghost). Two actions, one obvious winner.

**ACT-2 · Med · "Show query plan" should be "Explain"**
Industry term, half the width, and it pairs with the existing ⌘⇧↵ binding that is currently undiscoverable.
Resolution: rename to Explain, show `⌘⇧↵` kbd chip on it.

**ACT-3 · Med · Shortcut hint is a 10px orphan** (user-reported, screenshot #3)
`.shortcut` renders `⌘ ↵` at 10px mono, floated to the far right of the action bar, disconnected from the button it describes.
Resolution: move the shortcut into the button as a bordered kbd chip: `Run query  [⌘↵]`, 11px, using the button's own contrast colors (the reference mockup does exactly this). Delete the floating span.

**ACT-4 · Med · Export controls are underlined links outside the panel they act on**
"EXPORT RESULT Download CSV Download JSON" appears below the result panel, in link style, only after a result exists, then shifts layout.
Resolution: a download icon-button in the result panel header (menu: CSV / JSON). Fixed position, always discoverable, no layout shift.

**ACT-5 · Low · Query history is a bare `<details>` disclosure**
Plain summary text with a number; the only disclosure widget in the app.
Resolution: style it as a panel header row (title + count chip + chevron) matching the result panel, or move history into a right-side sheet per the original phase-3 spec.

**STATE-1 · Med · Running a query disables the whole rail**
Every `.table-list-item` gets `disabled={busy}`, so each auto-run click flashes the entire sidebar into disabled gray.
Resolution: scope `busy` to the run controls. The rail stays interactive; a click during a run just supersedes (the operation counter in App.tsx already handles stale results).

### F. ER diagram

**ER-1 · High · Edges don't reliably touch node borders** (user-reported, screenshot #1)
Evidence: the blue frpm→schools edge lands on the border; the gray satscores→schools edge floats short. Two mechanisms in `ErCanvas.tsx`:
1. `nodeHeight()` estimates height from constants (52 + rows × 26 + 8) while real rendered height differs with fonts and padding, so the geometric model drifts from the DOM.
2. `edgeEndpoints()` anchors at side midpoints chosen by dominant axis. For diagonal pairs, the line between two side-midpoints doesn't pass through the visual centers, so the arrow appears detached even when the math is "correct".
Resolution: measure, don't estimate. Keep a `Map<name, DOMRect>` of node refs updated by a single ResizeObserver, and anchor each edge at the intersection of the center-to-center segment with each measured rectangle. Arrowheads then terminate exactly on the border at any angle, any zoom, any content height. (Bonus: delete `nodeHeight()` and its magic numbers.)

**ER-2 · Med · Rail selection and canvas selection disagree**
Evidence: screenshot #1 shows `satscores` active in the rail while `frpm` is the blue node in the canvas. `ErCanvas` keeps a private `selected` state, independent of App's `selectedTable`.
Resolution: make selection controlled. Pass `selectedName` into `ErCanvas`; canvas clicks call up to App. One selection, three views (rail, canvas, relationships list) — they can never disagree again.

**ER-3 · Low · Edge layer is a fixed 4000×4000 SVG**
Nodes dragged past 4000 world-units silently lose their edges.
Resolution: size the SVG from computed world bounds (or `overflow: visible` + dynamic viewBox).

**ER-4 · Low · Long table names truncate with no recovery**
`er-node-name` ellipsizes without a `title` attribute.
Resolution: add `title={table.name}`; same for rail rows.

### G. Query workspace

**EDITOR-1 · Med · Line numbers exist but are hidden**
Evidence: `SqlEditor.tsx:75` configures `lineNumbers()`; `SqlEditor.tsx:23` then sets `.cm-gutters { display: none }`. Meanwhile `app.css` styles `.cm-gutters` expecting them visible. The reference mockup has a numbered gutter; it is one deleted line away.
Resolution: remove the `display: none`, keep the app.css gutter styling, add `highlightActiveLineGutter()`.

**EDITOR-2 · Med · Editor carries pre-redesign chrome inside the new pane**
Evidence: `SqlEditor.tsx:19-29` editorTheme still sets its own `border: 1px solid var(--boundary)`, `borderRadius: 6px`, `minHeight: 180px`, `padding: 20px`, and a focus `outline` with 4px offset. The pane (`.editor-pane`) also has a border and `overflow: hidden`, which clips that outline into the stray blue bar visible in screenshot #3. Double chrome, clipped focus.
Resolution: strip border/radius/minHeight/outline from editorTheme (the pane owns chrome); indicate focus with `.editor-pane:focus-within { border-color: var(--accent) }`. Align padding and font-size to the app scale via CSS vars.

**GRID-1 · Med · Result grid is missing row numbers and timing**
Header currently says only "3 columns". The reference shows an ordinal column and "Done in 7 ms · 100 rows".
Resolution: prepend a muted ordinal column; merge HIER-2's status line into this header. Sorting and pagination already exist and are good.

**GRID-2 · Low · Empty state glyph `⌁` is a mystery character**
Resolution: brand mark or table icon + actionable copy (see BRAND-2).

### H. Sidebar rail

**RAIL-1 · Med · Tables and views interleave alphabetically**
Evidence: user's Chinook screenshot: `Album, Artist, catalog_mix…, Customer, customer_lifetime_value…` — real tables and computed views shuffle together, distinguished only by a small glyph. The reference mockup groups TABLES (24) and VIEWS (11) with counts.
Resolution: two sections with counts in the section header. Internal objects become a third collapsed group when the toggle is on.

**RAIL-2 · Med · The bare right-aligned number reads as row count**
It is column count. Every user will guess wrong once.
Resolution: `title="3 columns"` at minimum; better, show counts only in section headers and reveal per-table counts on hover (reference behavior).

**RAIL-3 · Low · "Show internal objects" floats mid-rail as an underlined link**
Resolution: move to the rail footer as a small toggle, or a filter icon inside the search field.

**RAIL-4 · Low · "2 · 1 hidden" header is cryptic**
Resolution: with RAIL-1's grouped headers this disappears; hidden count moves to the internal-objects group label.

**RAIL-5 · Low · COLUMNS OF panel mixes value types in one slot**
Right column shows PK for `id` but TEXT for `body` — one slot, two meanings.
Resolution: type always occupies the right slot; PK/FK become the same small key badges used by the diagram nodes, next to the name. One visual language for keys everywhere.

---

## Quick wins (under 30 minutes each)

1. EDITOR-1: delete `display: none` on gutters — instant "real editor" feel.
2. ACT-1: remove "Run readiness check" from the bar.
3. ACT-3: kbd chip inside Run query; delete the floating `⌘ ↵`.
4. HIER-4: strip the count from the ER Diagram tab label.
5. BRAND-1: inline the favicon SVG as the header mark.
6. COLOR-2: per-state arrowhead markers.

## Suggested implementation order

| Phase | Findings | Theme |
|---|---|---|
| 1 | HIER-1..4, ACT-1..4 | One command bar, one primary action |
| 2 | COLOR-1..3, TYPE-1..3 | Color roles + type scale (single CSS pass) |
| 3 | ER-1..4 | Measured edge geometry + unified selection |
| 4 | RAIL-1..5, EDITOR-1..2, GRID-1..2, STATE-1 | Workspace polish |
| 5 | BRAND-1..4, ACT-5, HIER-5 | Personality pass |

Each phase is independently shippable and E2E-verifiable. Phases 1-2 are where the "generic admin panel" feeling dies; phase 3 fixes the geometry bugs; phase 5 is what makes it feel like the reference mockup.

## What the reference mockup gets right (north star notes)

- Database pill as the identity anchor (name + health dot + chevron).
- One black button; every other control is quiet.
- Explain / Format / Clear as ghost buttons beside Run — verbs, not sentences.
- Results/Messages tabs inside the result panel; timing chip on the right.
- Grouped TABLES/VIEWS with counts; collapsible Explorer.
- Right-side object-details panel (columns, indexes, relationships, preview) — worth considering as a phase 6 instead of the Schema tab, but the current Schema tab is a legitimate simpler pattern.

Not adopted from the mockup: the gear/settings and multi-db dropdown imply features SeeQLite intentionally does not have (v1 is one database, no settings). Personality should come from craft, not chrome.
