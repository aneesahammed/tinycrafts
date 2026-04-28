# DataDuck Redesign — Design Spec

**Date:** 2026-04-27
**Status:** Approved (visual rounds), pending spec review
**Owner:** Anees Ahammed
**Visual mockups:** `.superpowers/brainstorm/29682-1777300943/content/`
- `directions.html` — three direction options (A Pro, B Tahoe, C Editorial — chose C)
- `working-state-v1.html` — high-fi loaded state, light theme
- `multi-file-empty-and-rail.html` — empty hero + multi-file rail close-up
- `dark-mode-and-cmd-k.html` — dark theme + command palette overlay

## 1. Why redesign

The current DataDuck is a working Codex-generated PWA — DuckDB-WASM under the hood, single Parquet file at a time, six floating cards on a warm-beige background. It works, but visually it does not earn its quality bar:

- **No hierarchy.** Six cards (file, schema, query, results, metadata, row groups) all share identical chrome and weight. The eye has nowhere to land.
- **Empty states everywhere on first load.** "No file", "—", "No row group details" greet a brand-new user. The app reads as broken before they have done anything.
- **Mixed visual signals.** Warm beige + green accent + amber + red error tones with pill-shaped buttons feel toy-like for a developer tool.
- **Single-file ceiling.** Only one Parquet file may be opened at a time, even though DuckDB-WASM trivially supports many. Cross-file SQL (joins, unions) is impossible.
- **Plain `<textarea>` for SQL.** No syntax highlighting, no keyboard contract surfaced.

The redesign keeps the engine (DuckDB-WASM 1.30, Vite, PWA shell) and rewrites the chrome around it.

## 2. Design language — Editorial Minimal × DuckDB rail

The chosen direction blends two references:

- **Editorial Minimal** (Linear / Apple HIG / Notion) — restrained monochrome, content-first, calm. Single accent. Typography does the hierarchy work, not chrome.
- **DuckDB UI's column rail** — the inline distinct-count + cardinality bar per column is the single best idea in their UI. It is essentially free to compute on Parquet via `SUMMARIZE`, and it gives the rail a real job (data profiling) instead of being a navigation tax.

The result: a dev-tool that feels first-party Apple, with a rail that earns its width.

### 2.1 Tokens (light theme)

| Token             | Value     | Use                                              |
| ----------------- | --------- | ------------------------------------------------ |
| `--bg`            | `#fafaf9` | App background                                   |
| `--surface`       | `#ffffff` | Editor, results, palette                         |
| `--surface-2`     | `#f4f3f0` | Result table header strip                        |
| `--line`          | `#ececea` | Hairline borders                                 |
| `--line-strong`   | `#d8d6d2` | Stronger separators (input borders, kbd)         |
| `--ink`           | `#111111` | Primary text, primary button                     |
| `--ink-2`         | `#555350` | Secondary text                                   |
| `--ink-3`         | `#8e8b87` | Tertiary text, labels                            |
| `--ink-4`         | `#b8b5b0` | Quaternary, line numbers                         |
| `--accent`        | `#1a4d44` | SQL keywords, active file, column distribution bar |
| `--accent-soft`   | `#e8efed` | Active row backgrounds, file card                |

### 2.2 Tokens (dark theme)

| Token           | Value     |
| --------------- | --------- |
| `--bg`          | `#0d0e0f` |
| `--surface`     | `#16181a` |
| `--surface-2`   | `#1c1f22` |
| `--line`        | `#24272a` |
| `--line-strong` | `#2f3337` |
| `--ink`         | `#e8e6e3` |
| `--ink-2`       | `#9ea29f` |
| `--ink-3`       | `#6b6e6c` |
| `--ink-4`       | `#4a4d4b` |
| `--accent`      | `#6dc4b4` |
| `--accent-soft` | `rgba(109, 196, 180, 0.12)` |

Implemented via `[data-theme="dark"]` attribute on `<html>` (already in place — token values change).

### 2.3 Type stack

```
--serif: ui-serif, "New York", "Charter", "Iowan Old Style", Georgia, serif;
--sans:  -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
--mono:  ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
```

**Italics are not used anywhere — not in CSS, not in HTML (`<em>` / `<i>` are forbidden), not in glyph design (no italic serif type-icons).** Emphasis comes from weight, color, or accent.

Serif appears in exactly two places: the brand wordmark in the header and the empty-state hero headline. Everywhere else is sans for chrome and mono for data.

### 2.4 Density

Linear/Notion-tight. Header 44px, rail 256px wide, table rows 9px vertical padding, mono body text 12px, sans labels 10–11px. Compact but not cramped.

### 2.5 No-italics rule (operational)

This is a hard preference for the user across all tinycrafts UI work. Any contribution to this codebase or its successors must:

- Not use `font-style: italic` in CSS.
- Not use `<em>` or `<i>` in HTML — substitute `<strong>`, `<b>`, weight, color, or accent.
- Not use italic serif glyphs as iconography.

## 3. Layout structure

```
┌──────────────────────────────────────────────────────────────────┐
│  P  DataDuck   events · 78,231 rows · 12 cols · 1.2 MB           │
│                                  [Search ⌘K]  [◐]   Run ⌘↩       │  44px
├──────────────┬───────────────────────────────────────────────────┤
│ search…      │ Query  Schema  Sample                             │
│              │                                          SELECT   │  32px
│ FILES   3 +  ├───────────────────────────────────────────────────┤
│ ● events 78K │ 1  SELECT event, COUNT(*) AS count                │
│ ○ orders 412K│ 2  FROM events                                    │
│ ○ users   5K │ 3  GROUP BY event;                                │  ~33%
│              │                                                   │
│ COLUMNS · 12 ├───────────────────────────────────────────────────┤
│ # id     78K │ ●  Ready          ⌘↩ run  ⌘/ comment  ⌥⇧F format  │  28px
│ ⏱ ts    all │
│ T usr    13K ├───────────────────────────────────────────────────┤
│ T evt     5  │ #   event       count    pct    last_seen         │
│ # amt    9K  │ 1   view        48,210   62.1   2024-04-26 15:24  │
│ T cur     3  │ 2   click       21,884   28.2   2024-04-26 15:24  │  ~67%
│ …            │ 3   signup       7,503    9.7   2024-04-26 15:23  │
│              │ 4   purchase       562    0.7   2024-04-26 15:23  │
│ METADATA     │                                                   │
│ Snappy       │                                                   │
│ 4 groups     │                            ● 5 rows · 184 ms · ⤓ │
└──────────────┴───────────────────────────────────────────────────┘
```

- **Header (44px, sticky, blurred bg):** brand wordmark + active-file crumb (left), search hint + theme toggle + Run (right). Run is the only ink-black control on screen.
- **Rail (256px fixed, scrollable):** search → Files → Columns of [active] → Metadata of [active]. Always visible at viewport ≥ 980px; collapses to a top drawer below 980px.
- **Work area (fluid):** editor (top, ~33% of stage height) + result table (bottom, ~67%). Both grow/shrink together with viewport.
- **Floating status pill (bottom-right of work area):** rows · ms · CSV. Ink-black on light, ink-white on dark. Only appears after a successful query.

## 4. Multi-file architecture

This is the only behavioral change beyond aesthetics. The current app holds one file in a single global `registeredFile` object; the new app holds many.

### 4.1 State shape

```js
const state = {
  files: new Map(),       // tableName -> { handle, originalName, size, rows, columns, metadata, rowGroups, summary }
  activeTable: null,      // string — the table name currently driving Columns/Metadata in the rail
  recents: [],            // [{ name, size, openedAt }] — IndexedDB-persisted, names only (no contents)
};
```

### 4.2 Filename → table-name sanitization

```
events.parquet            → events
ORDERS_2024.parquet       → orders_2024
user data.parquet         → user_data
2024.parquet              → t_2024            (digit-prefixed → t_ prefix)
weird-name!.parquet       → weird_name
events.parquet (2nd open) → events_1
events.parquet (3rd open) → events_2
```

**Rules:**
1. Drop the `.parquet` / `.parq` extension.
2. Lowercase everything.
3. Replace any character not matching `[a-z0-9_]` with `_`.
4. Collapse runs of `_` to a single `_`.
5. If the result starts with a digit, prefix with `t_`.
6. If the result is already a registered table name, append `_1`, `_2`, … until unique.

### 4.3 DuckDB-WASM registration

For each opened file:

```js
await db.registerFileBuffer(originalName, uint8Array);
await conn.query(`CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM '${originalName}';`);
```

The original filename is registered as a virtual file; the sanitized table name is a SQL view over it. This keeps the SQL interface purely identifier-based.

### 4.4 Back-compat: the `parquet_file` alias

The legacy alias `parquet_file` is kept and rebound on every active-file change:

```js
await conn.query(`CREATE OR REPLACE VIEW parquet_file AS SELECT * FROM "${activeTable}";`);
```

So `SELECT * FROM parquet_file LIMIT 500;` continues to work and follows whichever file the user has focused. This lets existing bookmarked queries and the README examples keep working.

### 4.5 Default SQL on open

When a file is opened and there are no other files registered, the editor auto-fills with a query against the new file's sanitized table name (not `parquet_file`). For example, opening `events.parquet` produces:

```sql
SELECT *
FROM events
LIMIT 500;
```

Opening `2024.parquet` would produce `SELECT * FROM t_2024 LIMIT 500;` instead, since `2024` is digit-prefixed and sanitization adds the `t_` prefix. When additional files are opened, the editor is left alone — the user is presumably mid-query. The Sample button always inserts queries against the active table.

### 4.6 Active file switching

Clicking a file in the rail makes it active:

1. Visual: dot fills with accent, name turns accent-strong, `Columns of …` and `Metadata of …` headings update, column rail recomputes.
2. State: `state.activeTable = tableName`.
3. SQL: `parquet_file` view is repointed.
4. Crumb in header updates.
5. ⌘K palette's "Run SUMMARIZE active file" template updates its preview.

Switching is instant; no cached schema/summary is recomputed unless invalidated.

## 5. Component specs

### 5.1 Header

- Height 44px, full-width, sticky-top, `position: sticky; top: 0; z-index: 30`.
- Background: `color-mix(in srgb, var(--bg) 78%, transparent)` + `backdrop-filter: blur(14px)`.
- Bottom border: 1px `var(--line)`.
- Left: brand mark (18px ink square with serif "P" reversed) + serif "DataDuck" wordmark + crumb (active table · row/col/size).
- Right: ⌘K search-hint kbd (22px tall, 5px radius), theme icon-button (26px square, 6px radius), Run button (26px tall, ink fill, white text, ⌘↩ shown in right-side opacity-60 mono).

### 5.2 Rail

- Width 256px, fixed at desktop. Collapses to a top drawer at < 980px.
- Background `var(--bg)`, right border 1px `var(--line)`.
- **Search:** 28px input, full-width, search-icon prefix. Searches across columns, file names, sample queries, and ⌘K commands. Typing here also opens the ⌘K palette inline (search input proxies to palette).
- **Files section:**
  - Section label "Files" with right-aligned count and a `+` icon-button that triggers the file picker.
  - Each row: 12px focus dot (filled = active, hollow = registered) + monospace table name + monospace row-count abbreviation (78K, 412K, 5.1K) + hover-revealed × close.
  - Hovering a non-active file shows a tooltip with the original filename and full row count.
  - Rows are draggable to reorder (primarily cosmetic — order does not affect SQL).
- **Columns section:**
  - Label "Columns of [active-name]" — active-name in `--accent`.
  - Each column row: 14px type-icon + monospace column name + 56px right cluster (28px cardinality bar + monospace stat).
  - Type icons (all upright mono, no italic):
    - `T` — TEXT / VARCHAR / BLOB
    - `#` — any numeric (INTEGER, BIGINT, DOUBLE, DECIMAL) — colored amber `#b85c00` light / `#d18a4a` dark
    - `⏱` — temporal (DATE, TIME, TIMESTAMP, INTERVAL) — colored accent
    - `B` — BOOLEAN
    - `{}` — STRUCT
    - `[]` — LIST
    - `?` — UNKNOWN / mixed
  - Stat: distinct count if computed, else "—". For high-cardinality columns (> 80% distinct of row count), shows "all".
  - Bar fill width: `distinct / row_count`, capped at 100%. Selected row uses accent fill.
  - Click a column to insert `SELECT [col] FROM [active] LIMIT 500;` template into the editor.
- **Metadata section:**
  - Label "Metadata of [active-name]".
  - Rows: Compression, Row groups, Created by, Size. All right-aligned monospace values.

### 5.3 Editor

- Tabs (32px tall): Query (with optional badge `1` for current tab number when multiple are open in v2), Schema (read-only `DESCRIBE [active]` view), Sample (random 100 rows from active).
- SQL editor: gutter for line numbers (22px wide, ink-4) + code area (mono 12.5px, line-height 1.65, 18px right padding for caret comfort).
- Syntax highlighting: DuckDB SQL dialect. Keywords in `--accent`, function calls in purple (`#7a4cb3` light / `#c79bff` dark), numbers in amber, identifiers in `--ink`. Use a small custom highlighter — no full editor framework. (Lightweight, ~3KB regex-based covering DuckDB's keyword set; Monaco/CodeMirror would balloon the bundle and are overkill for read-mostly query authoring.)
- Footer (28px): status dot + status text on the left, keyboard-shortcut pills on the right (⌘↩ run, ⌘/ comment, ⌥⇧F format).
- Keyboard:
  - `⌘↩` / `Ctrl↩` — run query
  - `⌘/` / `Ctrl/` — toggle line comment
  - `⌥⇧F` — format SQL (use `sql-formatter` lib, ~30KB; acceptable)
  - `⌘K` — open command palette
  - `⌘1`/`⌘2`/`⌘3` — switch to file by position
  - `⌘D` — toggle theme
  - `⌘E` — export current result as CSV
  - `Esc` — close palette / clear focused state

### 5.4 Result table

- Sticky header row in `--surface-2`.
- Row-number column (38px, mono `--ink-4`) on the far left.
- Numeric columns: right-aligned, `font-variant-numeric: tabular-nums`.
- Hover row highlight: `--surface-2` (light) / `--surface-2` (dark).
- Cell max-width: 24rem with ellipsis. Click a truncated cell to expand inline (popover).
- Pagination: keep current model (50/100/250/500 page size), but move controls into the floating status pill (`◀ 1 of 4 ▶`) instead of a separate footer bar.

### 5.5 Floating status pill

- Position: `position: absolute; right: 14px; bottom: 14px;` of the work area.
- Ink fill (`--ink`), reverse text, 999px radius, mono 11px.
- Contents: green dot · `N rows` · separator · `Mms` · separator · `⤓ CSV` button.
- Fades to opacity 0.4 when the result table is scrolled, returns to opacity 1 on idle/hover.
- For paginated results, includes `◀ page Y of Z ▶` between rows and time.
- Hidden entirely when no result is loaded.

### 5.6 ⌘K command palette

- Trigger: `⌘K` / `Ctrl-K`, or click the search hint in the header.
- Modal: 540px wide, centered, 90px from top. Backdrop `rgba(0,0,0,0.55)` + 6px blur.
- Search input (no border, large 14px) with a `⌘K` badge on the right.
- Grouped results — order matters:
  1. **Queries** (templated SQL with active file injected): `SUMMARIZE active`, `SUMMARIZE all files`, `DESCRIBE active`, `SELECT * FROM active LIMIT 100`, recent queries.
  2. **Files** (registered files): `Switch to <name>` rows, with `⌘1`/`⌘2`/`⌘3` shortcuts; `Open file…` action.
  3. **Columns** (when a file is active): `Inspect <column>` — opens a column detail popover with min, max, null %, and distinct count. (Histogram render deferred to v2 — see section 9.)
  4. **Actions**: Run query (⌘↩), Export CSV (⌘E), Format SQL (⌥⇧F), Toggle theme (⌘D), Clear all files.
- Each result row: 22px icon-square + title (sans 13px) + subtitle (mono 11px) + right-aligned keyboard chord.
- Selected row uses `--accent-soft` background; arrow keys move selection; ↩ executes; Esc closes.
- Footer: `↑↓ navigate`, `↩ select`, `esc close`, right-aligned result count.

## 6. Empty state

When `state.files.size === 0`:

- Rail shows search input (functional but no targets) + a 1.5px-dashed `--line-strong` placeholder card with "No files yet · Drop a Parquet file here — or anywhere in the window."
- Work area replaced by a centered hero (max-width 460px):
  1. Serif headline: `Open a .parquet file` (no italics — `.parquet` rendered upright in the same serif weight, distinguished by being inline rather than emphasized).
  2. Sans subtitle: `Files stay in your browser. Nothing is uploaded — DuckDB-WASM does the work locally.`
  3. Drop zone (1.5px-dashed `--line-strong`, 14px radius, hover state to `--accent` border + `--accent-soft` fill): icon + label `Drop files here, or click to browse` + hint `Multiple files supported · paste path with ⌘V`.
  4. Recent list (if available, otherwise hidden): up to 5 recent file names with size and relative time. Names only — file contents are NOT persisted; clicking a recent does not magically reopen, it just shows a toast hint that the file must be re-selected.
  5. Footnote: shield icon + `Local-first · works offline · install as a PWA`.
- Soft radial accent gradient behind the hero (`radial-gradient(circle at 50% 30%, rgba(26,77,68,0.06), transparent 60%)`) to lift the centered content.
- Whole window is a drop target, not just the visible drop zone.

## 7. File structure changes

The current source layout in `dataduck/`:

```
app.js          26.9 KB    — single file, all logic
index.html       7.3 KB
styles.css      12.8 KB
sw.js            1.7 KB
manifest.json
icon.svg / icon-192.png / icon-512.png
vite.config.js
package.json
```

After redesign, `app.js` is split into focused modules. ES modules, Vite handles bundling:

```
dataduck/
  index.html
  styles.css                — tokens + base + layout (no italics anywhere)
  src/
    main.js                 — entry; wires up modules
    duckdb/
      engine.js             — DuckDB-WASM init, file registration, view creation
      sanitize.js           — table-name sanitization rules + tests
      summarize.js          — column SUMMARIZE + cardinality computation
    state/
      store.js              — files Map, activeTable, recents (no framework — small reactive object + listeners)
      recents.js            — IndexedDB persistence for recent file names
    ui/
      header.js
      rail.js               — files, columns, metadata sections
      editor.js             — textarea + custom regex highlighter + keyboard
      result.js             — virtual-scroll table, pagination
      status.js             — floating pill
      palette.js            — ⌘K command palette
      empty.js              — empty-state hero
      toast.js
      theme.js              — light/dark toggle, system-pref sync
    sql/
      highlight.js          — small regex-based DuckDB SQL highlighter
      format.js             — wrapper over sql-formatter (lazy-loaded)
      templates.js          — SUMMARIZE, DESCRIBE, sample query builders
  sw.js
  manifest.json
  icon.svg / icon-192.png / icon-512.png
  vite.config.js
  package.json
```

Each `ui/` module exports `mount(element, store)` and subscribes to store changes — no framework required.

## 8. PWA / install / offline

Unchanged behavior. Service worker continues to cache the shell + DuckDB-WASM assets. Recent-files names live in IndexedDB. Install button stays where it is in the header overflow (when `beforeinstallprompt` fires).

## 9. Out of scope (v1)

The following are NOT in this redesign and will be tracked as follow-ups:

- **Multiple query tabs.** The Query tab shows a number badge (`1`) reserving the affordance, but only one query session exists in v1.
- **Saved queries / query history persistence.** Recent files persist; queries do not. v2.
- **Column detail popover with histogram.** ⌘K mentions "Inspect <column>" — in v1 this opens a small min/max/null% card; the actual histogram render is v2.
- **CSV / JSON / Arrow import.** v1 stays Parquet-only. The empty-state copy says "Parquet" specifically.
- **Schema editing or write operations.** Read-only viewer, always.
- **Authentication, sharing, or any cloud surface.** Local-first remains the bedrock; do not add network calls beyond the existing analytics ping.
- **Mobile-optimized layout below 680px.** The current breakpoints adapt the desktop layout but do not redesign for touch. v2.

## 10. Success criteria

The redesign is done when:

1. Light and dark themes render the working state, empty state, and ⌘K palette per the visual mockups (allowing for engineering tolerances).
2. Two or more Parquet files can be opened, the rail lists them with active-file focus, and `SELECT … FROM events JOIN orders USING (id)` runs successfully.
3. The legacy `parquet_file` alias still resolves to the active file's view.
4. Filename sanitization covers all the cases in section 4.2 (validated by unit tests).
5. The column rail computes and displays cardinality bars within 200ms of file open on a 100MB Parquet file (DuckDB row-group statistics make this trivial).
6. ⌘K opens, navigates with arrow keys, executes selected commands, and dismisses with Esc.
7. No `font-style: italic`, `<em>`, `<i>`, or italic-serif glyphs appear in any source file (grep enforced in CI / pre-commit).
8. Bundle size does not regress more than 30KB over current (the SQL formatter is lazy-loaded; everything else is hand-rolled).
9. Lighthouse scores: ≥ 95 Performance, 100 Accessibility, ≥ 95 Best Practices on the loaded state with a small file.

## 11. Open questions for review

1. **Empty-state recents:** Should clicking a recent name auto-open the OS file picker pre-filtered, or just show a toast? (Browsers do not let us re-open files by path without a user gesture + File System Access API; FSA is Chromium-only. Default proposal: toast hint, with FSA opt-in for capable browsers.)
2. **Column-click insert behavior:** Insert `SELECT col FROM …` (proposal), or just copy column name to clipboard, or open a column popover? Proposal is the most useful for analysts.
3. **Run-button semantics with multiple files:** Always runs editor contents as written. The "active" file only affects the column rail and the `parquet_file` alias — it does not constrain `Run`. Confirming this is correct.
4. **Colored type-icon `#`:** Proposal uses amber for the numeric type icon. If you want pure monochrome rail, we can drop it and use `--ink-2` for all type icons. Trades discoverability for purity.
