# Phase 6.06 — TinyCrafts landing integration

Recorded: 2026-07-16

## Exact diff scope

- `../index.htm`: kept the existing `Specimens - 08 shipped` count and No. 01–07 markup unchanged; corrected only the appended No. 08 SeeQLite copy and tags to the approved UI6 contract.
- `tests/e2e/tinycrafts-landing.spec.ts`: added a production-shaped local HTTP fixture, exact catalogue assertions, route resolution, responsive/zoom/keyboard/focus/hover/theme checks, and Chromium full-page visual baselines.
- `tests/e2e/tinycrafts-landing.spec.ts-snapshots/`: eight deterministic light/dark full-page baselines at 375, 768, 1024, and 1440 CSS pixels.

## Copy provenance

SeeQLite uses the locked TinyCrafts contract from `06-UI-SPEC.md`:

`Open a local SQLite file, inspect schema and declared relationships, run read-only SQL, and export displayed results. Your database stays in the browser.`

Tags are exactly `sqlite`, `browser-only`, `read-only`, `live`; no unproven ER-inference, upload, or full-export claim is exposed.

## Automated evidence

| Surface | Result |
|---|---|
| Exact No. 08/count/name/glyph/ordinal/caption/blurb/tags/CTA/domain | PASS in Chromium, Firefox, and WebKit |
| No. 01–07 links, labels, ordinals, titles, captions, blurbs, and tag order unchanged | PASS in Chromium, Firefox, and WebKit |
| Direct `/seeqlite/` route | HTTP 200, SeeQLite title, non-fallback document; PASS in Chromium, Firefox, and WebKit |
| Responsive layout | 375, 768, 1024, and 1440; no document-level horizontal overflow; PASS in Chromium, Firefox, and WebKit |
| Keyboard/focus/hover/theme | Semantic focus, hover state, and light/dark toggle; PASS in Chromium, Firefox, and WebKit |
| 200% zoom | Card remains reachable and no document-level overflow; PASS in Chromium, Firefox, and WebKit |
| Full-page visual regression | 8 Chromium baselines: light/dark × 375/768/1024/1440; PASS |

Landing tests block external Google Fonts and GoatCounter requests so visual evidence is local and repeatable. No landing CSS, font, asset, script, analytics, or layout override was added.

## Remaining release gates

This slice does not close the separate manual Safari/VoiceOver, Windows NVDA, deployed-header, constrained-host, rollback, or public deployment evidence gates tracked in `docs/release/gaps/RELEASE-GAPS.md`.
