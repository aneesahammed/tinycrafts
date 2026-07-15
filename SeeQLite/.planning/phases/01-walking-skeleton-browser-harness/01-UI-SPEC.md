---
phase: 1
slug: walking-skeleton-browser-harness
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-15
---

# Phase 1 — UI Design Contract

> Canonical visual and interaction contract for the SeeQLite shell and walking skeleton. Generated from `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, research, Phase 1 context, and the TinyCrafts landing page. Independently verified by the GSD UI checker.

## Design System

| Property | Contract |
|---|---|
| Tool | Manual CSS custom-property system; plain CSS modules or co-located feature CSS |
| Preset | Not applicable |
| Component library | None; use semantic HTML and small project-owned React components |
| Icon library | None; project-owned inline SVG using `currentColor`; decorative icons use `aria-hidden="true"` |
| Sans font | Self-hosted Inter, then `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Mono font | Self-hosted JetBrains Mono, then `ui-monospace, SFMono-Regular, Menlo, monospace` |
| Shape | 6px control/panel radius, 7px brand-mark radius, square status tags; no glassmorphism or pill-shaped panels |
| Elevation | Borders and surface contrast first; one restrained modal shadow only |
| Registry | No shadcn and no third-party registry, explicitly required by the project |

The interface is a compact developer workbench, not a dashboard and not a marketing hero. It inherits TinyCrafts' warm paper, ink, rule, blue accent, mono-led labels, direct copy, and 36px grid texture. It must not copy the landing page's oversized 88px display treatment into the tool.

## Global Theme Tokens

These values are the project source of truth. Later phases inherit these names and values without redefining them.

### Light theme

| Token | Value | Use |
|---|---:|---|
| `--paper` | `#f7f3ec` | Dominant page/workspace background |
| `--paper-2` | `#eee8dd` | Secondary rails, quiet bands, disabled fill |
| `--paper-3` | `#ffffff` | Elevated panel, input, dialog, result surface |
| `--ink` | `#191612` | Primary text and strong icon |
| `--ink-2` | `#5d564c` | Body/supporting text |
| `--ink-3` | `#918779` | Decoration only: grid-adjacent marks and non-text ornament |
| `--rule` | `#d8cfc1` | Decorative divider only; never a meaningful control boundary |
| `--rule-strong` | `#1f1b16` | Decorative high-emphasis rule only |
| `--boundary` | `#786f63` | Accessible input, control, panel, and meaningful state boundary |
| `--accent` | `#3867e8` | Primary CTA, focus, active selection, progress |
| `--accent-deep` | `#244cc6` | All light-theme accent text/icons on paper or soft surfaces; hover/pressed text |
| `--accent-soft` | `#edf2ff` | Selected/info background |
| `--accent-border` | `#8ca8ff` | Decorative accent tint; pair meaningful states with `--accent` or `--boundary` |
| `--focus-ring` | `#3867e8` | Global keyboard focus indicator |
| `--danger` | `#a61b12` | Error/destructive icon, text, border, or fill |
| `--danger-soft` | `#fff0ee` | Error background |
| `--warning` | `#6e4a00` | Caution icon, text, border, or fill |
| `--warning-soft` | `#fff4d6` | Caution background |
| `--success` | `#206a3b` | Success icon, text, border, or fill |
| `--success-soft` | `#e9f7ee` | Success background |
| `--on-accent` | `#ffffff` | Text/icon on accent fill |
| `--on-danger` | `#ffffff` | Text/icon on danger fill |
| `--on-warning` | `#ffffff` | Text/icon on warning fill |
| `--on-success` | `#ffffff` | Text/icon on success fill |
| `--scrim` | `rgba(25, 22, 18, 0.62)` | Dialog backdrop only |

### Dark theme

| Token | Value | Use |
|---|---:|---|
| `--paper` | `#171816` | Dominant page/workspace background |
| `--paper-2` | `#20211f` | Secondary rails, quiet bands, disabled fill |
| `--paper-3` | `#242522` | Elevated panel, input, dialog, result surface |
| `--ink` | `#f3eee5` | Primary text and strong icon |
| `--ink-2` | `#c9c0b3` | Body/supporting text |
| `--ink-3` | `#8d8579` | Decoration only: grid-adjacent marks and non-text ornament |
| `--rule` | `#343733` | Decorative divider only; never a meaningful control boundary |
| `--rule-strong` | `#ece5da` | Decorative high-emphasis rule only |
| `--boundary` | `#9f978b` | Accessible input, control, panel, and meaningful state boundary |
| `--accent` | `#86a2ff` | Primary CTA, focus, active selection, progress |
| `--accent-deep` | `#b5c4ff` | Accent text/icons on paper or soft surfaces; hover/pressed text |
| `--accent-soft` | `#222b46` | Selected/info background |
| `--accent-border` | `#4b609b` | Decorative accent tint; pair meaningful states with `--accent` or `--boundary` |
| `--focus-ring` | `#86a2ff` | Global keyboard focus indicator |
| `--danger` | `#ffaaa1` | Error/destructive icon, text, border, or fill |
| `--danger-soft` | `#3a1f1d` | Error background |
| `--warning` | `#f2cf72` | Caution icon, text, border, or fill |
| `--warning-soft` | `#332a13` | Caution background |
| `--success` | `#8bd8a7` | Success icon, text, border, or fill |
| `--success-soft` | `#173222` | Success background |
| `--on-accent` | `#171816` | Text/icon on accent fill |
| `--on-danger` | `#171816` | Text/icon on danger fill |
| `--on-warning` | `#171816` | Text/icon on warning fill |
| `--on-success` | `#171816` | Text/icon on success fill |
| `--scrim` | `rgba(0, 0, 0, 0.72)` | Dialog backdrop only |

### Color usage contract

- Dominant 60%: `--paper` for viewport and workspace.
- Secondary 30%: `--paper-2` for rails/quiet states and `--paper-3` for interactive surfaces.
- Accent 10%: reserve `--accent` for primary fills, keyboard focus, active navigation/selection boundaries, progress, and small TinyCrafts identity marks. In light mode, all visible accent text/icons on paper or soft surfaces use `--accent-deep`, never `--accent` or `--accent-border`. Apply the same `--accent-deep` text rule in dark mode for consistency.
- `--boundary` is mandatory for every meaningful input/control/panel boundary. `--rule`, `--rule-strong`, and `--accent-border` are decorative and cannot be the only visible edge of an interactive control or state.
- `--ink-3` is decoration only. All visible metadata, placeholders, disabled labels, hints, counts, and secondary copy use `--ink-2`.
- Semantic states are global: danger uses `--danger`/`--danger-soft`/`--on-danger`; caution uses `--warning`/`--warning-soft`/`--on-warning`; success uses `--success`/`--success-soft`/`--on-success`. Every semantic state also has a text label and icon; color is never the only signal.
- The background grid is two 1px lines at 36px intervals. In light mode use `rgba(25,22,18,0.026)` horizontal and `rgba(25,22,18,0.018)` vertical. In dark mode use `rgba(243,238,229,0.028)` and `rgba(243,238,229,0.018)`. Keep the grid behind content, never inside inputs or dense data surfaces.
- Text/background and control contrast must meet WCAG 2.2 AA: 4.5:1 for ordinary text and 3:1 for 18px semibold text, focus, and UI boundaries. If a pairing fails, use `--ink`, `--ink-2`, `--boundary`, or the owning semantic token; never substitute a component-local color.

## Spacing Scale

All layout and component spacing uses the 4px base scale.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | `4px` | Tight icon/text gap, badge inset |
| `--space-2` | `8px` | Compact control gap |
| `--space-4` | `16px` | Default component/section inset |
| `--space-6` | `24px` | Panel padding and section gap |
| `--space-8` | `32px` | Major workspace gap |
| `--space-12` | `48px` | Empty-state breathing room |
| `--space-16` | `64px` | Wide-screen outer spacing only |

Exceptions are still multiples of four: 40px compact control height, 44px primary/touch control height, 56px desktop app header, and 72px maximum empty-state icon frame. Twelve pixels is a font size only and must never be used for layout, padding, gap, inset, hit area, or offset. No 6px/10px/12px/14px layout values; 6px is a radius only.

## Typography

Use exactly four sizes and two weights in product UI. Do not use italics.

| Role | Family | Size | Weight | Line height | Usage |
|---|---|---:|---:|---:|---|
| Data/meta | Mono | `12px` | `600` | `1.33` | SQL metadata, identifiers, values, counts, timings, badges, shortcuts |
| Body/action | Sans | `14px` | `400` | `1.5` | Prose, form labels, buttons, tabs, menus, dialog actions, status messages |
| Section heading | Sans | `18px` | `600` | `1.25` | Panel and state headings |
| Page heading | Sans | `24px` | `600` | `1.2` | One H1 per mode |

Weight `600` is reserved for headings, selected data rows, badges, and primary actions. All other copy is `400`. Uppercase is limited to 12px Mono data/meta labels with `0.08em` letter spacing. Inter is mandatory for prose, headings, form labels, buttons, tabs, menus, and dialog actions. JetBrains Mono is mandatory for SQL, identifiers, filenames, values, counts, timings, metadata, capability names, and keyboard shortcuts. Do not set an action label in Mono even when it sits beside data.

## Layout and Density

### Viewport contracts

| Range | Layout |
|---|---|
| `<768px` | Narrow mode: 48px header; one full-width content column; 16px side padding; actions stack only when they cannot fit; no page-level horizontal overflow. |
| `768–1023px` | Tablet mode: 56px header; one content column with 24px side padding; future navigation opens as a modal drawer rather than permanently shrinking the workspace. |
| `>=1024px` | Desktop mode: 56px header; shell can host a 272px navigation rail plus flexible workspace; Phase 1 opener remains centered in the workspace. |
| `>=1440px` | Wide mode: cap readable empty-state content at 720px and app chrome at 1600px; add outer paper margin rather than stretching copy. |

- Use `100dvh` with `100vh` fallback. The page itself must not scroll in the future desktop workbench; designated regions scroll. In Phase 1, content may vertically scroll at 200% zoom.
- Default density is compact: 40px secondary controls, 44px primary/file controls, 36px status rows, 1px rules, 6px radii.
- Empty state is intentionally calmer: maximum 640px text width, 24px panel padding on narrow/tablet and 32px on desktop.
- No floating panels, radial gradients, oversized illustrations, statistics cards, or dashboard widgets.

### Shell anatomy

1. Skip link: first focusable item, copy `Skip to workspace`.
2. App header: SeeQLite identity at left; local-only statement and engine status in the center where space permits; theme toggle at right.
3. Main landmark: capability gate or file-opening workbench.
4. Polite global status region: visually placed after the primary action; never a toast-only outcome.
5. Dialog portal: only for decisions that must block continuation.

At narrow widths the header shows `SeeQLite`, the compact engine-status icon/label, and theme button. The full privacy sentence moves into the opener. Header content must not become a hamburger menu in Phase 1.

## Component Contracts

### AppHeader

- Identity: a 32px square database glyph with 1px `--accent` border, followed by `SeeQLite` in 18px Sans semibold. Optional TinyCrafts backlink label is `TinyCrafts` and must not compete with the open action.
- Privacy line at desktop: `Local-only SQLite workbench` in 12px Mono using `--ink-2`.
- Engine status is a text+icon pair, never a colored dot alone: `Preparing SQLite…`, `SQLite ready`, or `SQLite unavailable`.
- Theme control is a 40px Inter button. Accessible name dynamically says `Switch to dark theme` or `Switch to light theme`; visible label is `Dark theme`/`Light theme` at tablet/desktop and icon-only at narrow widths.
- Theme preference key contains only UI preference metadata. Apply the saved/system theme before first paint; storage failure falls back to system preference without an error dialog.

### CapabilityGate

Render before file intake. Required checks: Worker, WebAssembly, module Worker, BigInt, File/`arrayBuffer`, and structured cloning/transfer.

| State | Visual and behavior |
|---|---|
| Checking | Quiet Data/meta typography with status `Checking browser support…`; file actions are not yet rendered. |
| Ready | Gate collapses to the header status; file actions render. |
| Required capability missing | Centered error panel with capability name, explanation, and no file input in the DOM. Use error icon + heading + body; never auto-retry. |
| Optional feature missing | Non-blocking info strip below opener; core actions remain enabled. The strip can be dismissed for the session. |

Required error copy: heading `This browser is missing {capability}`. Body `SeeQLite needs {capability} to open SQLite files. Update this browser or use a current Chromium, Firefox, or Safari release.`

Optional limitation copy: `{feature} is unavailable. Database inspection still works; {affected feature} will stay off.`

### FileOpenWorkbench

- H1: `Open a SQLite database`.
- Body: `Inspect tables and run read-only queries. Your database stays in this browser.`
- Trust note with lock/database icon: `No upload path. The source file is never modified.` Do not say the browser is inherently secure.
- Primary button: `Open SQLite database`. It activates a visually hidden native single-file input and is keyboard-operable.
- Secondary button: `Try sample database`. It opens the committed same-origin sample and is always visually secondary.
- Hint: `Choose one .sqlite, .sqlite3, or .db file, or drop it here.` Extensions are phrased as hints, not proof of validity.
- Entire panel is a drop target but not a button. Default border is 1px dashed `--boundary`; active drag uses 2px `--accent`, `--accent-soft`, and copy `Drop one SQLite database to open it`.
- Drag leave restores the prior state without animation. Directory/multiple-file detail belongs to Phase 2, but the shell must not crash or replace current content.
- Filename display uses Mono, `dir="auto"`, single-line ellipsis, and a bounded 80-character display string. Do not put unbounded database text into DOM attributes.

### ReadinessSlice

This is a temporary but production-quality vertical slice, not a general query editor.

- After the committed sample or accepted smoke fixture opens, show a compact panel headed `Database ready` and a safe displayed filename.
- The only execution action is `Run readiness check`, bound to fixed `SELECT 1 AS ready` through the real worker protocol. It is not an editable textarea.
- While running, disable repeat activation and show `Running SELECT 1…` in a polite status region.
- Success shows a two-column semantic table labelled `Readiness result`, one heading `ready`, one value `1`, and metadata `1 row · {elapsed} ms · bounded result`.
- Failure preserves the open action and shows `The SQLite check did not finish. Reopen the database or reload the page.` with action `Reopen database` when the retained file is available.
- A `Reset workspace` secondary action returns to the opener, terminates the current worker epoch, and restores focus to `Open SQLite database`.

### StatusNotice

- Inline, persistent until superseded; never rely on transient toast for engine/file/error outcomes.
- `role="status"`/polite for progress and success. Use `role="alert"` only for a newly occurring blocking failure.
- Info: `--accent-soft` background, `--boundary` edge, `--accent-deep` icon/text plus an `Information` label.
- Success: `--success-soft` background, `--success` edge/icon/text plus a `Success` label.
- Caution: `--warning-soft` background, `--warning` edge/icon/text plus a `Caution` label.
- Error: `--danger-soft` background, `--danger` edge/icon/text plus an `Error` label and an adjacent recovery action when one exists.
- Do not continuously announce timers or progress percentages.

### Button and link states

- All button, link-as-action, tab, menu-item, and dialog-action labels use Inter.
- Primary: `--accent` fill, `--on-accent`, accent border; hover uses `--accent-deep`; pressed translates down 1px only.
- Secondary: `--paper-3` fill, `--ink` text, `--boundary` border; hover uses `--paper-2` and preserves `--boundary`.
- Quiet: transparent fill, `--ink-2`; hover `--paper-2`.
- Disabled: `--paper-2` fill, `--ink-2` label, `--boundary` border, `cursor: not-allowed`; expose the disabled reason in adjacent text or description.
- Focus for every interactive element: 2px `--focus-ring` outline with 4px offset. Never remove it through global `outline: none`.
- Inline links have both text decoration and color change on hover/focus; accent link text uses `--accent-deep` in both themes.

### Global action-copy rule

- Primary, secondary, dialog, retry, stop, reset, close, reload, and destructive actions use a specific verb + noun. Approved Phase 1 forms include `Open SQLite database`, `Try sample database`, `Run readiness check`, `Reopen database`, `Reload SeeQLite`, and `Reset workspace`.
- Single-word generic actions such as `Run`, `Plan`, `Stop`, `Cancel`, `Close`, `Reset`, `Reload`, `Retry`, `Fit`, or `Arrange` are prohibited. Compact tabs/filter labels may be nouns, but their accessible names must include the controlled object.

## State and Copy Contract

| Situation | Heading/status | Body/action |
|---|---|---|
| Initial empty | `Open a SQLite database` | `Inspect tables and run read-only queries. Your database stays in this browser.` |
| Engine loading | `Preparing SQLite…` | `This happens locally in a browser worker.` |
| Engine ready | `SQLite ready` | No extra success banner. |
| Engine startup failed | `SeeQLite could not start SQLite` | `Reload the page. If it happens again, try a current browser.` Action: `Reload SeeQLite` |
| File reading | `Reading {filename}…` | `The file is being copied into browser memory.` |
| Sample loading | `Opening the sample database…` | `The sample is bundled with SeeQLite.` |
| Readiness running | `Running SELECT 1…` | Disable `Run readiness check`; `Reset workspace` remains available. |
| Readiness success | `Database ready` | `1 row · {elapsed} ms · bounded result` |
| Readiness failure | `The SQLite check did not finish` | `Reopen the database or reload the page.` |
| Degraded optional feature | `{feature} is unavailable` | `Database inspection still works; {affected feature} will stay off.` |
| No JavaScript | `SeeQLite needs JavaScript` | `Database work runs locally in your browser; no server fallback is available.` |

Copy rules: sentence case, direct verb+noun actions, no exclamation marks, no “Oops”, no “secure/private” absolutes, no unexplained WASM/CSP/COOP jargon in primary copy, and no filename in a URL, page title, analytics, or error-report link.

## Keyboard, Focus, and Accessibility

- DOM order matches visible order: skip link, header identity/link, engine status, theme control, main heading, open actions, notices, readiness action/result.
- On load, do not steal focus. Skip link targets `main` with `tabindex="-1"`.
- Picker cancellation returns focus to the `Open SQLite database` button and produces no alert.
- Successful open moves focus to `Database ready`; failure moves focus to the error heading. Use programmatic focus only after the async outcome is visible.
- `Enter`/`Space` activate buttons. File input has an associated label/name. Drop is an enhancement; every drop workflow has a picker equivalent.
- Status changes are announced once. Engine state text remains visible; do not expose duplicate live regions.
- The readiness result uses `<table>`, `<caption>`, `<th scope="col">`, and textual metadata.
- Minimum pointer target is 40×40px; primary and file controls are at least 44px high. At 200% zoom controls reflow without clipping or page-level horizontal scroll.
- Standard focus is a 2px `--focus-ring` outline with 4px offset. Where an overflow container would clip that outline, render a non-interactive focus pseudo-element inset 4px from the container edge with a 2px `--focus-ring` border; reserve at least 8px inner padding so the inset ring does not cover text. This is the only clipped-container equivalent.
- Test high-contrast/forced-colors: borders use system colors where custom colors are ignored; focus and state labels remain visible.

## Motion

- Standard color/border/opacity transition: 120ms ease-out. Panel entrance, if used: 160ms opacity plus at most 4px translate. No spring, bounce, parallax, or animated grid.
- Loading indicator may rotate at 800ms linear only when paired with visible loading text.
- Under `prefers-reduced-motion: reduce`, remove transforms, scrolling animation, spinner rotation, and skeleton pulsing; state changes are immediate. Use the TinyCrafts `0.01ms` reset pattern.
- Never delay state publication to complete animation.

## Responsive and Overflow Rules

- At 375px, primary and secondary open buttons become full-width and remain in source order. Trust copy wraps; no text truncation except filenames.
- At 768px, actions may be inline; workbench stays one column.
- At 1024px+, the opener is centered within the workspace with maximum width 720px; it does not stretch edge-to-edge.
- Long capability names and localized copy wrap. Use `min-width: 0` on every grid/flex child.
- Only code/result regions may scroll horizontally. The viewport/body may not.
- Safe-area insets augment, not replace, the 16px narrow padding.

## Visual Acceptance Checks

- [ ] Capture initial, checking, required-missing, optional-degraded, drag-active, file-loading, readiness-success, and readiness-error at 375×812, 768×1024, 1024×768, and 1440×900.
- [ ] Capture every state in light and dark themes; both have identical hierarchy and no missing border/focus information.
- [ ] Compare token values programmatically to this file; no component-local hex colors except transparent gradients derived from tokens.
- [ ] First paint uses the resolved theme with no visible light-to-dark flash.
- [ ] At 200% zoom and 375px width, no page-level horizontal overflow, clipped CTA, or unreachable status exists.
- [ ] Automated contrast assertions verify `--ink`/`--ink-2` text on every paper and semantic-soft surface at 4.5:1, `--boundary` and `--focus-ring` against adjacent surfaces at 3:1, `--accent-deep` light-theme text on paper/accent-soft at 4.5:1, semantic text on its soft surface at 4.5:1, and every `--on-*` value on its solid fill at 4.5:1.
- [ ] No visible text uses `--ink-3`; no meaningful control/state edge relies on `--rule`, `--rule-strong`, or `--accent-border`.
- [ ] The 2px focus outline with 4px offset is visible on paper, paper-2, paper-3, accent-soft, danger-soft, warning-soft, and success-soft; clipped scroll regions use the exact inset equivalent.
- [ ] Grid remains subordinate to copy and disappears beneath panels/inputs.
- [ ] Axe has no serious/critical issues; keyboard smoke completes open → readiness check → Reset workspace.
- [ ] Reduced-motion capture contains no transform/rotation/pulse.
- [ ] Database-derived unique markers do not appear in network, URL, console, storage, or cache evidence.

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | None | Not initialized; project explicitly chose a manual system — 2026-07-15 |
| Third-party registries | None | No registry code permitted by this contract — 2026-07-15 |

## Decision Provenance

- Phase 1 context: focused file-opening workbench, early capability gate, matched themes, local-only copy, worker readiness.
- Requirements: PLAT-01..04, UX-01, TEST-01, responsive/zoom/reduced-motion/privacy evidence.
- Research summary: manual CSS, TinyCrafts tokens, self-hosted fonts, no component kit, compact workspace, real production worker/WASM.
- TinyCrafts landing: exact paper/ink/rule/accent values, Inter/JetBrains Mono pairing, 36px grid, compact radii, focus treatment, direct copy.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-15
