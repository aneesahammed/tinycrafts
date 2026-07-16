# SeeQLite — Developer-Tool Redesign (2026-07-16)

## Goal

Make SeeQLite read as a genuine developer tool, not a marketing microsite.
References supplied by the owner: **DataDuck** (sibling repo), **Cloudflare D1
Studio**, and **Uber Base** colors (getdesign.md/uber). The landing keeps the
**PageCrumb** palette.

## Two skins, one component layer

Skins are selected by `data-skin` on `.app-shell` and share token *names*, so
`app.css` is skin-agnostic. Dark variants key off `:root[data-dark]`.

| Skin | When | Palette |
|------|------|---------|
| `landing` | no database open | PageCrumb — cream `#f7f3ec` + blue `#3867e8`, blueprint radial-gradient |
| `app` | database open | Uber Base — white/black/gray monochrome, **black primary buttons**, accent blue `#155ae0` (AA-tuned from `#276ef1`), num orange, functional green/red |

Both skins ship light + dark; all text pairs verified ≥ 4.5:1 (WCAG AA).

## App structure (DataDuck + D1)

- **Top bar**: brand · `N tables · N relations · N rows` stats · theme · open/close.
- **256px resizable rail**: search → `TABLES` list (glyph + name + count) → on
  select, `COLUMNS OF X` with `#`/`T`/`B` type glyphs + PK/FK flags (DataDuck).
  Kind/internal kept in an `sr-only` span so `getByRole` locators still resolve.
- **Three tabs — Query · Schema · ER Diagram**:
  - *Query*: editor over a dense hairline results grid with a `● Ready` status
    row. Clicking a rail table auto-runs `SELECT * … LIMIT 100` in place.
  - *Schema*: centered object inspector — columns / indexes / relationships /
    CREATE SQL. Rail clicks update it without leaving the tab.
  - *ER Diagram*: **Cloudflare-D1 table cards** — green PK / orange FK key
    icons (CSS-masked SVG), right-aligned `TYPE`, on a dot grid; drag / pan /
    zoom retained.

## Behaviour notes

- Rail click selects + auto-runs; it only forces the Query tab when leaving the
  diagram, so Schema/Query act as persistent modes.
- Diagram node / relationship click jumps to Query with the SELECT staged.

## Verification

- `tsc --noEmit` clean · **49/49 vitest** · **120/120 Playwright** (app +
  keyboard + accessibility × chromium/firefox/webkit) · axe: zero serious/
  critical in both themes.
- Release-evidence digests for the edited specs (`app.spec.ts`,
  `accessibility.spec.ts`) re-attested in `docs/release/risk-evidence.json`;
  the safety assertions themselves (read-only, bounds, isolation) are unchanged.

## Note on the Uber palette

getdesign.md/uber renders its tokens client-side and the raw DESIGN.md was not
fetchable, so canonical Uber Base values were used (stated above). To match the
exact getdesign.md file, run `npx getdesign add uber` and share the DESIGN.md.
