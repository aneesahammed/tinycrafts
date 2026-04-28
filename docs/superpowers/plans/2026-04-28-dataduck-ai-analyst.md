# DataDuck AI Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-first AI analyst to DataDuck so users can ask questions about the active CSV/Parquet file and get locally executed DuckDB-WASM results with charts.

**Architecture:** Add a contained React island using assistant-ui `LocalRuntime` and Recharts, mounted into DataDuck's existing vanilla JS app and styled with existing DataDuck CSS variables. Groq BYOK produces structured analysis plans only; DataDuck validates, compiles, executes, and renders everything locally.

**Tech Stack:** Vite, DuckDB-WASM, vanilla JS shell, React island, `@assistant-ui/react`, Recharts, Zod, Groq OpenAI-compatible API, IndexedDB/WebCrypto, Vitest/jsdom.

---

## Summary

Implement under `/Users/aneesahammed/Documents/dev/web/tinycrafts/dataduck`; do not touch `stratum`.

Scope for v1:

- Active CSV/Parquet file only.
- No joins.
- No Stratum-style semantic layer.
- No backend.
- No Tailwind/shadcn setup.
- No assistant attachments.
- No raw SQL from Groq.

Default privacy mode:

- Groq receives schema/profile metadata only.
- Source rows, current result rows, sample rows, top values, and text/blob/list/struct min/max are excluded.
- Optional aggregate upload is explicit user opt-in with preview and caps.

## Key Implementation Requirements

- Reuse DataDuck's existing right panel as `rightPanel.type === 'assistant'`.
- Add a React island, styled with DataDuck CSS, not Tailwind/shadcn.
- Use Groq BYOK with optional encrypted IndexedDB/WebCrypto persistence.
- Validate Groq structured plans with Zod before compiling SQL.
- Compile only safe SQL against `active_file`.
- Detect stale active-file changes by dataset fingerprint.
- Normalize chart data before Recharts.
- Require explicit confirmation before sending aggregate result rows to Groq.
- Bump the PWA service worker cache version.
- Add a bundle budget check that warns above 750 KB gzip total JS and fails above 950 KB gzip total JS.

## Task List

- [x] React island scaffold and dependency setup.
- [x] Right panel integration and global shortcut guard.
- [x] Groq client, secure key store, privacy constants.
- [x] Redacted dataset context and fingerprint.
- [x] Zod analysis plan schema and prompt builder.
- [x] Safe query compiler.
- [x] Analyst orchestration.
- [x] Assistant UI and charts.
- [x] Aggregate narrative opt-in.
- [x] Thread store.
- [x] Bundle budget and service-worker update.
- [x] Documentation and final verification.

## Acceptance Criteria

- `npm test` passes in `dataduck`.
- `npm run build` passes in `dataduck`.
- `npm run check:bundle` passes in `dataduck`.
- `node scripts/build-pages.mjs` and `node scripts/verify-pages-build.mjs` pass from TinyCrafts root.
- Groq prompts never include source rows, result rows, samples, top values, string min/max, or API keys by default.
- No raw SQL from Groq is executed.
- Generated analysis runs locally through DuckDB-WASM.
- "Ask DataDuck" opens through the existing right panel.
