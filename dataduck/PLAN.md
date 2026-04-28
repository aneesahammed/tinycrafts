# DataDuck Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild DataDuck's chrome and architecture per [dataduck/DESIGN.md](../../../dataduck/DESIGN.md) — Editorial Minimal visual language, multi-file support with DuckDB-style column rail, ⌘K palette, no italics anywhere, while keeping the DuckDB-WASM engine and PWA shell.

**Architecture:** Split the monolithic `dataduck/app.js` into focused ES modules under `dataduck/src/{duckdb,state,sql,ui}/`. Replace the single-file state with a `Map<tableName, FileRecord>` and an `activeTable` pointer. Re-skin everything with a token-driven CSS rewrite. Keep DuckDB-WASM 1.30, Vite, and the existing PWA service worker untouched.

**Tech Stack:** Vite 8, DuckDB-WASM 1.30, vanilla ES modules (no framework), Vitest + jsdom for tests, `sql-formatter` (lazy-loaded) for the format command. No new runtime deps beyond `sql-formatter`.

---

## Conventions

Apply these to every task in this plan:

- **TDD where logic is pure.** Sanitize, sample-query templates, palette filters, format helpers — write the failing test first.
- **Structural tests for components.** Mount the module against jsdom, dispatch events, assert DOM state. No visual regression in v1.
- **Commit after every green task.** Use `git add <specific paths>` (never `git add .`). Conventional commit prefixes: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`.
- **No italics ever.** Never write `font-style: italic`, `<em>`, `<i>` (HTML emphasis), or italic-serif glyph icons. Pre-commit hook in Phase 9 enforces this.
- **Keep the app runnable between tasks.** No broken intermediate states. If a refactor must temporarily break a feature, do it in one atomic task, not split across commits.
- **Use safe shell APIs.** Always prefer `execFileSync` / `spawn` over `exec` / `execSync` — pass argv arrays, never string-interpolate user data into shell commands.
- **Spec is the source of truth.** When in doubt about a token value, layout dimension, or behavior, read [dataduck/DESIGN.md](../../../dataduck/DESIGN.md). Do not invent variants.

## File Structure (target)

After this plan completes, `dataduck/` looks like this:

```
dataduck/
  index.html                      # New skeleton matching DESIGN.md §3 layout
  styles.css                      # Token-driven, no italics, full rewrite
  src/
    main.js                       # Entry — wires modules to store
    duckdb/
      engine.js                   # DuckDB-WASM init, file registration, view creation
      sanitize.js                 # filename → SQL identifier (with tests)
      summarize.js                # SUMMARIZE-based column profiling
      profile.js                  # File-open profile bundle (metadata + schema + row groups)
      files.js                    # Open / close / switch active orchestration
    state/
      store.js                    # files Map, activeTable, observable
      recents.js                  # IndexedDB-backed recent file names
    sql/
      highlight.js                # Regex-based DuckDB SQL highlighter
      templates.js                # SUMMARIZE/DESCRIBE/sample query builders
    ui/
      header.js                   # Brand + crumb + ⌘K hint + theme + Run
      rail.js                     # Files / Columns / Metadata sections
      editor.js                   # Tabs + textarea + highlighter + keyboard
      result.js                   # Sticky-header table
      status.js                   # Floating dark pill (rows · ms · pager · CSV)
      palette.js                  # ⌘K modal
      palette-filter.js           # Pure filter + command builder (TDD)
      empty.js                    # Day-1 hero with recents
      theme.js                    # Light/dark toggle, system pref
      toast.js                    # Existing toast, extracted
    util/
      arrow.js                    # arrowTableToObjects (extracted from app.js)
      format.js                   # formatNumber, formatBytes, valueToDisplay (extracted)
      csv.js                      # toCsv, escapeCsv, downloadBlob (extracted)
      sql-quote.js                # quoteString, quoteIdentifier (extracted)
      pick.js                     # pick helper (extracted)
  tests/
    duckdb/
      sanitize.test.js
      summarize-types.test.js
    state/
      store.test.js
    sql/
      templates.test.js
      highlight.test.js
    ui/
      palette-filter.test.js
    util/
      format.test.js
      csv.test.js
  scripts/
    check-no-italics.mjs          # CI / pre-commit guard
  sw.js                           # Unchanged
  manifest.json                   # Unchanged (theme color may bump)
  icon.svg / icon-192.png / icon-512.png   # Unchanged
  vite.config.js                  # Unchanged
  package.json                    # +vitest, +@vitest/coverage-v8, +jsdom, +sql-formatter
  vitest.config.js                # New — jsdom env
  DESIGN.md                       # Already committed (8e60080)
  README.md                       # Updated for multi-file in Phase 9
```

The old `dataduck/app.js` is deleted at the end of Phase 3 once `src/main.js` covers everything it did.

---

# Phase 1 — Foundation

Goal of phase: get the new design language on screen with new tokens and HTML skeleton; keep the legacy `app.js` running so the page is interactive after every commit.

### Task 1.1: Add Vitest + jsdom

**Files:**
- Modify: `dataduck/package.json`
- Create: `dataduck/vitest.config.js`
- Create: `dataduck/tests/smoke.test.js`

- [ ] **Step 1: Install dev dependencies**

```bash
cd dataduck && npm install --save-dev vitest@2 @vitest/coverage-v8@2 jsdom@25 sql-formatter@15
```

- [ ] **Step 2: Replace scripts in package.json**

```json
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
```

- [ ] **Step 3: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
```

- [ ] **Step 4: Smoke test**

`dataduck/tests/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd dataduck && npm test
```

Expected: 1 file, 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add dataduck/package.json dataduck/package-lock.json dataduck/vitest.config.js dataduck/tests/smoke.test.js
git commit -m "chore: add vitest + jsdom test infrastructure"
```

---

### Task 1.2: Rewrite styles.css with the design token system

**Files:**
- Replace: `dataduck/styles.css`

Full token system per DESIGN.md §2. The new file replaces the existing one entirely.

- [ ] **Step 1: Replace `dataduck/styles.css`**

Use the CSS in [dataduck/DESIGN.md §2.1–§2.4 + §5 component specs] expanded to a complete sheet. Key blocks: `:root` and `[data-theme="dark"]` token sets, `.app/.head/.stage/.rail/.work/.editor/.result/.status/.empty/.palette/.toast` selectors per the mockups in `.superpowers/brainstorm/29682-1777300943/content/`.

The full CSS body is too long to inline here — copy verbatim from [working-state-v1.html](../../../.superpowers/brainstorm/29682-1777300943/content/working-state-v1.html) and [dark-mode-and-cmd-k.html](../../../.superpowers/brainstorm/29682-1777300943/content/dark-mode-and-cmd-k.html) `<style>` blocks, lifting the `.pv-mock`/`.pv-dark` prefixes off so the rules apply globally. Keep the dark-mode token block under `[data-theme="dark"]`. **Verify zero `font-style: italic` and zero italic-serif type-icons before commit.**

- [ ] **Step 2: Verify visually with `npm run dev`**

The HTML still uses old IDs in this commit — that's expected. Background should be `#fafaf9` (light) or `#0d0e0f` (dark). Quit the dev server.

- [ ] **Step 3: Commit**

```bash
git add dataduck/styles.css
git commit -m "style: rewrite styles.css with token-driven Editorial Minimal design system"
```

---

### Task 1.3: Rewrite index.html as component mount-point skeleton

**Files:**
- Replace: `dataduck/index.html`

- [ ] **Step 1: Replace index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fafaf9" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d0e0f" media="(prefers-color-scheme: dark)" />
    <meta name="description" content="DataDuck is a local-first Parquet viewer PWA powered by DuckDB-WASM. Open, inspect, query, and join multiple Parquet files without uploads." />
    <link rel="manifest" href="./manifest.json" />
    <link rel="icon" href="./icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="./icon-192.png" />
    <title>DataDuck</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app" id="app">
      <header class="head" id="head"></header>
      <div class="stage" id="stage">
        <aside class="rail" id="rail"></aside>
        <main class="work" id="work"></main>
      </div>
    </div>
    <div class="palette-scrim" id="paletteScrim" hidden>
      <div class="palette" id="palette"></div>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <input id="fileInput" class="sr-only" type="file" accept=".parquet,.parq,application/octet-stream" multiple />
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add dataduck/index.html
git commit -m "refactor: rewrite index.html as component mount-point skeleton"
```

---

### Task 1.4: src/main.js bootstrap stub + theme module

**Files:**
- Create: `dataduck/src/main.js`
- Create: `dataduck/src/ui/theme.js`

The stub keeps the build green while we extract the legacy app.

- [ ] **Step 1: Write theme.js**

```js
const STORAGE_KEY = 'dataduck-theme';

export function restoreTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
    return saved;
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
    return 'dark';
  }
  document.documentElement.dataset.theme = 'light';
  return 'light';
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}
```

- [ ] **Step 2: Write src/main.js stub**

```js
// Bootstrap entry. Replaced incrementally — keep importing the legacy app
// until Phase 3 cuts over to the modular wiring.
import { restoreTheme } from './ui/theme.js';

restoreTheme();

import('../app.js').catch((error) => console.error('Failed to load legacy app.js', error));
```

- [ ] **Step 3: Verify build**

```bash
cd dataduck && npm run build
```

The runtime is broken because `app.js` looks for old DOM IDs that no longer exist — that's expected. The build itself must succeed.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/main.js dataduck/src/ui/theme.js
git commit -m "refactor: add src/main.js bootstrap + extract theme module"
```

---

# Phase 2 — Modular split: extract pure utilities

Goal of phase: pull every reusable utility out of `app.js` into focused modules with tests. App still has the legacy renderer; we just give it modular dependencies.

### Task 2.1: Extract format helpers (TDD)

**Files:**
- Create: `dataduck/src/util/format.js`
- Create: `dataduck/tests/util/format.test.js`

- [ ] **Step 1: Write the failing tests**

`dataduck/tests/util/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatNumber, formatBytes, valueToDisplay } from '../../src/util/format.js';

describe('formatNumber', () => {
  it('returns "-" for null/undefined/empty', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber('')).toBe('-');
  });
  it('handles bigints', () => {
    expect(formatNumber(1234567n)).toBe('1,234,567');
  });
  it('handles regular numbers', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
  it('returns string for non-finite', () => {
    expect(formatNumber('abc')).toBe('abc');
  });
});

describe('formatBytes', () => {
  it('returns "-" for invalid', () => {
    expect(formatBytes(NaN)).toBe('-');
    expect(formatBytes(-1)).toBe('-');
  });
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.50 MB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15.0 MB');
  });
  it('handles bigints', () => {
    expect(formatBytes(1024n)).toBe('1.00 KB');
  });
});

describe('valueToDisplay', () => {
  it('converts null to NULL', () => {
    expect(valueToDisplay(null)).toBe('NULL');
    expect(valueToDisplay(undefined)).toBe('NULL');
  });
  it('handles bigint', () => {
    expect(valueToDisplay(99n)).toBe('99');
  });
  it('handles dates', () => {
    expect(valueToDisplay(new Date('2024-01-01T00:00:00Z'))).toBe('2024-01-01T00:00:00.000Z');
  });
  it('handles plain values', () => {
    expect(valueToDisplay(42)).toBe('42');
    expect(valueToDisplay('abc')).toBe('abc');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd dataduck && npm test -- format
```

Expected: import error.

- [ ] **Step 3: Implement src/util/format.js**

(Verbatim port from app.js lines 713–757.)

```js
export function valueToDisplay(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (ArrayBuffer.isView(value)) return bytesToHex(new Uint8Array(value.buffer));
  if (Array.isArray(value) || typeof value === 'object') return safeJson(value);
  return String(value);
}

export function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    );
  } catch {
    return String(value);
  }
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .slice(0, 32)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function formatNumber(value) {
  if (value == null || value === '') return '-';
  if (typeof value === 'bigint') return value.toLocaleString();
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : String(value);
}

export function formatBytes(value) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(number) || number < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = number;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}
```

- [ ] **Step 4: Run tests — pass**

```bash
cd dataduck && npm test -- format
```

Expected: 11 tests passed.

- [ ] **Step 5: Commit**

```bash
git add dataduck/src/util/format.js dataduck/tests/util/format.test.js
git commit -m "refactor: extract format helpers to src/util/format.js with TDD coverage"
```

---

### Task 2.2: Extract CSV helpers (TDD)

**Files:**
- Create: `dataduck/src/util/csv.js`
- Create: `dataduck/tests/util/csv.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { toCsv, escapeCsv } from '../../src/util/csv.js';

describe('escapeCsv', () => {
  it('returns empty for null/undefined', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });
  it('quotes values with commas', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
  });
  it('quotes and escapes embedded quotes', () => {
    expect(escapeCsv('a"b')).toBe('"a""b"');
  });
  it('quotes values with newlines', () => {
    expect(escapeCsv('a\nb')).toBe('"a\nb"');
  });
});

describe('toCsv', () => {
  it('builds header + rows', () => {
    const csv = toCsv(['a', 'b'], [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    expect(csv).toBe('a,b\n1,2\n3,4');
  });
});
```

- [ ] **Step 2: Implement src/util/csv.js**

```js
import { valueToDisplay } from './format.js';

export function toCsv(columns, rows) {
  const header = columns.map(escapeCsv).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function escapeCsv(value) {
  if (value == null) return '';
  const text = valueToDisplay(value).replaceAll('"', '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Run tests — pass**

```bash
cd dataduck && npm test -- csv
```

Expected: 5 tests passed.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/util/csv.js dataduck/tests/util/csv.test.js
git commit -m "refactor: extract CSV helpers with TDD coverage"
```

---

### Task 2.3: Extract trivial utilities (sql-quote, pick, arrow)

**Files:**
- Create: `dataduck/src/util/sql-quote.js`
- Create: `dataduck/src/util/pick.js`
- Create: `dataduck/src/util/arrow.js`

These are literal ports — no behavior change, no tests required (they're trivial wrappers used by tested modules).

- [ ] **Step 1: src/util/sql-quote.js**

```js
export function quoteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
```

- [ ] **Step 2: src/util/pick.js**

```js
export function pick(row, ...names) {
  if (!row) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  const lowerMap = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(String(name).toLowerCase());
    if (key) return row[key];
  }
  return undefined;
}
```

- [ ] **Step 3: src/util/arrow.js**

```js
export function arrowTableToObjects(table) {
  const columns = Array.from(table?.schema?.fields || []).map((field) => field.name);
  const rows = Array.from(table?.toArray?.() || []).map((row) => {
    const raw = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const object = {};
    const keys = columns.length ? columns : Object.keys(raw || {});
    for (const key of keys) object[key] = raw?.[key];
    return object;
  });
  return { columns, rows };
}
```

- [ ] **Step 4: Verify build**

```bash
cd dataduck && npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add dataduck/src/util/sql-quote.js dataduck/src/util/pick.js dataduck/src/util/arrow.js
git commit -m "refactor: extract sql-quote, pick, arrow utilities"
```

---

### Task 2.4: Extract DuckDB engine + toast modules

**Files:**
- Create: `dataduck/src/duckdb/engine.js`
- Create: `dataduck/src/ui/toast.js`

- [ ] **Step 1: src/duckdb/engine.js**

```js
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { arrowTableToObjects } from '../util/arrow.js';

const BUNDLES = {
  mvp: { mainModule: duckdbWasmMvp, mainWorker: duckdbWorkerMvp },
  eh: { mainModule: duckdbWasmEh, mainWorker: duckdbWorkerEh },
};

let dbPromise = null;

export async function getEngine() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES);
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const conn = await db.connect();
      return { db, conn, worker, duckdb };
    })();
  }
  return dbPromise;
}

export async function query(sql) {
  const { conn } = await getEngine();
  const table = await conn.query(sql);
  return arrowTableToObjects(table);
}

export async function tryQuery(sql) {
  try { return await query(sql); }
  catch (error) { console.warn('Optional query failed:', sql, error); return { columns: [], rows: [] }; }
}

export async function registerFile(virtualName, fileHandle) {
  const { db, duckdb: dd } = await getEngine();
  await db.registerFileHandle(virtualName, fileHandle, dd.DuckDBDataProtocol.BROWSER_FILEREADER, true);
}

export async function unregisterFile(virtualName) {
  const { db } = await getEngine();
  try { await db.dropFile(virtualName); }
  catch (error) { console.warn('dropFile failed:', error); }
}
```

- [ ] **Step 2: src/ui/toast.js**

```js
const TOAST_MS = 3600;
let timer = null;

export function showToast(message, type = '') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), TOAST_MS);
}

export function toErrorMessage(error) {
  const raw = error?.message || String(error);
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}
```

- [ ] **Step 3: Verify build**

```bash
cd dataduck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/duckdb/engine.js dataduck/src/ui/toast.js
git commit -m "refactor: extract DuckDB engine init + toast module"
```

---

# Phase 3 — Multi-file architecture and cutover

Goal of phase: introduce sanitization, observable store, files orchestrator, and cut over from `app.js` to the modular `src/main.js`. By end of phase the app supports multiple files with the back-compat alias.

### Task 3.1: Sanitize module (TDD)

**Files:**
- Create: `dataduck/src/duckdb/sanitize.js`
- Create: `dataduck/tests/duckdb/sanitize.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { sanitizeTableName, uniqueTableName } from '../../src/duckdb/sanitize.js';

describe('sanitizeTableName', () => {
  it('strips .parquet', () => { expect(sanitizeTableName('events.parquet')).toBe('events'); });
  it('strips .parq', () => { expect(sanitizeTableName('events.parq')).toBe('events'); });
  it('lowercases', () => { expect(sanitizeTableName('ORDERS_2024.parquet')).toBe('orders_2024'); });
  it('replaces spaces with underscore', () => { expect(sanitizeTableName('user data.parquet')).toBe('user_data'); });
  it('replaces invalid chars', () => { expect(sanitizeTableName('weird-name!.parquet')).toBe('weird_name'); });
  it('collapses runs of underscores', () => { expect(sanitizeTableName('a   b.parquet')).toBe('a_b'); });
  it('prefixes digit-leading names with t_', () => { expect(sanitizeTableName('2024.parquet')).toBe('t_2024'); });
  it('handles uppercase + spaces + leading digit', () => { expect(sanitizeTableName('2024 Q1 Sales.parquet')).toBe('t_2024_q1_sales'); });
  it('handles empty result by returning "data"', () => { expect(sanitizeTableName('!!!.parquet')).toBe('data'); });
  it('strips trailing underscores', () => { expect(sanitizeTableName('events___.parquet')).toBe('events'); });
});

describe('uniqueTableName', () => {
  it('returns the base name when not taken', () => { expect(uniqueTableName('events', new Set())).toBe('events'); });
  it('appends _1 when base is taken', () => { expect(uniqueTableName('events', new Set(['events']))).toBe('events_1'); });
  it('appends _2 when _1 also taken', () => { expect(uniqueTableName('events', new Set(['events', 'events_1']))).toBe('events_2'); });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd dataduck && npm test -- sanitize
```

- [ ] **Step 3: Implement src/duckdb/sanitize.js**

```js
const PARQUET_EXT = /\.(parquet|parq)$/i;
const INVALID = /[^a-z0-9_]+/g;
const COLLAPSE = /_+/g;
const TRIM = /^_+|_+$/g;

export function sanitizeTableName(filename) {
  const stem = String(filename).replace(PARQUET_EXT, '');
  const lowered = stem.toLowerCase();
  const replaced = lowered.replace(INVALID, '_');
  const collapsed = replaced.replace(COLLAPSE, '_').replace(TRIM, '');
  if (!collapsed) return 'data';
  if (/^[0-9]/.test(collapsed)) return `t_${collapsed}`;
  return collapsed;
}

export function uniqueTableName(base, takenSet) {
  if (!takenSet.has(base)) return base;
  let i = 1;
  while (takenSet.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}
```

- [ ] **Step 4: Run — pass**

```bash
cd dataduck && npm test -- sanitize
```

Expected: 13 tests passed.

- [ ] **Step 5: Commit**

```bash
git add dataduck/src/duckdb/sanitize.js dataduck/tests/duckdb/sanitize.test.js
git commit -m "feat: add sanitizeTableName + uniqueTableName"
```

---

### Task 3.2: Observable store (TDD)

**Files:**
- Create: `dataduck/src/state/store.js`
- Create: `dataduck/tests/state/store.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../src/state/store.js';

describe('createStore', () => {
  it('exposes initial state', () => {
    const store = createStore();
    expect(store.state.files).toBeInstanceOf(Map);
    expect(store.state.files.size).toBe(0);
    expect(store.state.activeTable).toBe(null);
    expect(store.state.resultColumns).toEqual([]);
    expect(store.state.resultRows).toEqual([]);
  });

  it('addFile inserts and emits change', () => {
    const store = createStore();
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.addFile('events', { virtualName: 'v_1', size: 1234, file: { name: 'events.parquet' } });
    expect(store.state.files.has('events')).toBe(true);
    expect(store.state.files.get('events').size).toBe(1234);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('first added file becomes active', () => {
    const store = createStore();
    store.addFile('events', {});
    expect(store.state.activeTable).toBe('events');
  });

  it('setActive switches focus', () => {
    const store = createStore();
    store.addFile('events', {});
    store.addFile('orders', {});
    store.setActive('orders');
    expect(store.state.activeTable).toBe('orders');
  });

  it('removeFile clears active when active is removed', () => {
    const store = createStore();
    store.addFile('events', {});
    store.addFile('orders', {});
    store.setActive('events');
    store.removeFile('events');
    expect(store.state.files.has('events')).toBe(false);
    expect(store.state.activeTable).toBe('orders');
  });

  it('removeFile sets active null when last file removed', () => {
    const store = createStore();
    store.addFile('events', {});
    store.removeFile('events');
    expect(store.state.activeTable).toBe(null);
  });

  it('unsubscribe stops emissions', () => {
    const store = createStore();
    const onChange = vi.fn();
    const unsub = store.subscribe(onChange);
    unsub();
    store.addFile('events', {});
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement src/state/store.js**

```js
export function createStore() {
  const state = {
    files: new Map(),
    activeTable: null,
    resultColumns: [],
    resultRows: [],
    queryElapsedMs: null,
    page: 0,
    pageSize: 100,
    isBusy: false,
    paletteOpen: false,
  };

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    addFile(tableName, record) {
      state.files.set(tableName, record);
      if (state.activeTable == null) state.activeTable = tableName;
      emit();
    },
    removeFile(tableName) {
      state.files.delete(tableName);
      if (state.activeTable === tableName) {
        state.activeTable = state.files.size ? state.files.keys().next().value : null;
      }
      emit();
    },
    setActive(tableName) {
      if (!state.files.has(tableName)) return;
      state.activeTable = tableName;
      emit();
    },
    setResult({ columns, rows, elapsedMs }) {
      state.resultColumns = columns;
      state.resultRows = rows;
      state.queryElapsedMs = elapsedMs;
      state.page = 0;
      emit();
    },
    setBusy(busy) { state.isBusy = busy; emit(); },
    setPaletteOpen(open) { state.paletteOpen = open; emit(); },
    setPage(page) { state.page = page; emit(); },
    setPageSize(pageSize) { state.pageSize = pageSize; state.page = 0; emit(); },
  };
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test -- store
```

Expected: 7 tests passed.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/state/store.js dataduck/tests/state/store.test.js
git commit -m "feat: add observable store with multi-file Map state"
```

---

### Task 3.3: profile.js + files.js orchestrator

**Files:**
- Create: `dataduck/src/duckdb/profile.js`
- Create: `dataduck/src/duckdb/files.js`

- [ ] **Step 1: src/duckdb/profile.js**

(Extracted and modernized from `app.js` `loadFileProfile` lines 265–296.)

```js
import { tryQuery, query } from './engine.js';
import { quoteString, quoteIdentifier } from '../util/sql-quote.js';

export async function profileFile(virtualName, tableName) {
  const filePath = quoteString(virtualName);
  const tableId = quoteIdentifier(tableName);

  const [schema, fileMeta, codecs, rowGroups] = await Promise.all([
    query(`DESCRIBE SELECT * FROM ${tableId};`),
    tryQuery(`SELECT * FROM parquet_file_metadata(${filePath}) LIMIT 1;`),
    tryQuery(`
      SELECT compression, COUNT(*) AS column_chunks
      FROM parquet_metadata(${filePath})
      GROUP BY compression
      ORDER BY column_chunks DESC;
    `),
    tryQuery(`
      SELECT
        row_group_id,
        MAX(row_group_num_rows) AS rows,
        MAX(row_group_bytes) AS bytes,
        COUNT(*) AS column_chunks,
        STRING_AGG(DISTINCT compression, ', ') AS compression
      FROM parquet_metadata(${filePath})
      GROUP BY row_group_id
      ORDER BY row_group_id
      LIMIT 250;
    `),
  ]);

  return {
    schema: schema.rows,
    fileMeta: fileMeta.rows[0] || null,
    codecs: codecs.rows,
    rowGroups: rowGroups.rows,
  };
}
```

- [ ] **Step 2: src/duckdb/files.js**

```js
import { registerFile, unregisterFile, query } from './engine.js';
import { sanitizeTableName, uniqueTableName } from './sanitize.js';
import { profileFile } from './profile.js';
import { quoteIdentifier, quoteString } from '../util/sql-quote.js';

const PARQUET_EXT = /\.(parquet|parq)$/i;

export function looksLikeParquet(file) { return PARQUET_EXT.test(file.name); }

function virtualNameFor(originalName) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || 'data.parquet';
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `dataduck_${id}_${safe}`;
}

export async function openFileInto(store, file) {
  if (!looksLikeParquet(file)) throw new Error(`${file.name} is not a .parquet or .parq file.`);

  const taken = new Set(store.state.files.keys());
  const tableName = uniqueTableName(sanitizeTableName(file.name), taken);
  const virtualName = virtualNameFor(file.name);

  await registerFile(virtualName, file);
  await query(
    `CREATE OR REPLACE VIEW ${quoteIdentifier(tableName)} AS SELECT * FROM read_parquet(${quoteString(virtualName)});`,
  );

  const profile = await profileFile(virtualName, tableName);

  store.addFile(tableName, { virtualName, file, size: file.size, profile });
  await rebindLegacyAlias(store);
  return tableName;
}

export async function closeFile(store, tableName) {
  const record = store.state.files.get(tableName);
  if (!record) return;
  await query(`DROP VIEW IF EXISTS ${quoteIdentifier(tableName)};`).catch((e) => console.warn('drop view', e));
  await unregisterFile(record.virtualName);
  store.removeFile(tableName);
  await rebindLegacyAlias(store);
}

export async function setActiveFile(store, tableName) {
  store.setActive(tableName);
  await rebindLegacyAlias(store);
}

async function rebindLegacyAlias(store) {
  const active = store.state.activeTable;
  if (!active) {
    await query(`DROP VIEW IF EXISTS parquet_file;`).catch(() => {});
    return;
  }
  await query(`CREATE OR REPLACE VIEW parquet_file AS SELECT * FROM ${quoteIdentifier(active)};`).catch((e) =>
    console.warn('rebind parquet_file', e),
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd dataduck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/duckdb/profile.js dataduck/src/duckdb/files.js
git commit -m "feat: files.js + profile.js orchestrate multi-file open/close/switch"
```

---

### Task 3.4: Cutover — replace app.js with modular wiring

**Files:**
- Replace: `dataduck/src/main.js`
- Create: `dataduck/src/ui/header.js`
- Create: `dataduck/src/ui/rail.js` (stub — Phase 4 enriches)
- Create: `dataduck/src/ui/editor.js` (stub — Phase 5 enriches)
- Create: `dataduck/src/ui/result.js` (stub — Phase 6 enriches)
- Create: `dataduck/src/ui/status.js` (stub — Phase 6 enriches)
- Create: `dataduck/src/ui/empty.js` (stub — Phase 8 enriches)
- Delete: `dataduck/app.js`

This task is a single atomic cutover. After it: app uses the new architecture with minimal UI; subsequent phases enrich each component in place.

- [ ] **Step 1: src/ui/header.js**

```js
export function mountHeader(el, store, handlers) {
  el.innerHTML = `
    <a class="brand" href="./" aria-label="DataDuck home">
      <span class="mark">P</span><span class="word">DataDuck</span>
    </a>
    <div class="crumb"><span class="file" id="hCrumbFile">No file</span><span class="sep" id="hCrumbSep" hidden>·</span><span id="hCrumbMeta"></span></div>
    <div class="grow"></div>
    <button class="kbd" id="hPalette" type="button"><span>Search</span><span class="k">⌘K</span></button>
    <button class="icon-btn" id="hTheme" type="button" aria-label="Toggle theme">◐</button>
    <button class="run" id="hRun" type="button" disabled>Run<span class="k">⌘↩</span></button>
  `;
  el.querySelector('#hRun').addEventListener('click', handlers.onRun);
  el.querySelector('#hTheme').addEventListener('click', handlers.onToggleTheme);
  el.querySelector('#hPalette').addEventListener('click', handlers.onOpenPalette);

  store.subscribe((s) => {
    const file = el.querySelector('#hCrumbFile');
    const sep = el.querySelector('#hCrumbSep');
    const meta = el.querySelector('#hCrumbMeta');
    if (s.activeTable) {
      file.textContent = s.activeTable;
      sep.hidden = false;
      const rec = s.files.get(s.activeTable);
      const cols = rec?.profile?.schema?.length ?? 0;
      const rows = rec?.profile?.fileMeta?.num_rows;
      meta.textContent = `${rows ? `${Number(rows).toLocaleString()} rows · ` : ''}${cols} cols${rec?.size ? ` · ${(rec.size/1024/1024).toFixed(rec.size>10*1024*1024?1:2)} MB` : ''}`;
    } else {
      file.textContent = 'No file';
      sep.hidden = true;
      meta.textContent = '';
    }
    el.querySelector('#hRun').disabled = !s.activeTable || s.isBusy;
  });
}
```

- [ ] **Step 2: src/ui/rail.js (Phase 4 enriches)**

```js
export function mountRail(el, store, handlers) {
  el.innerHTML = `
    <div class="search"><input id="rSearch" type="search" placeholder="Search columns, files, queries…" /></div>
    <div class="section"><div class="label"><span>Files <span class="count" id="rFileCount">0</span></span><button class="add" id="rAdd" type="button" aria-label="Open file">+</button></div></div>
    <div class="files" id="rFiles"></div>
    <div class="section" id="rColsSection" hidden><div class="label"><span>Columns of <span style="color:var(--accent);" id="rColsName"></span></span><span class="count" id="rColsCount">0</span></div></div>
    <div class="cols" id="rCols"></div>
    <div class="section" id="rMetaSection" hidden><div class="label">Metadata</div></div>
    <div class="meta-rows" id="rMeta"></div>
  `;
  el.querySelector('#rAdd').addEventListener('click', handlers.onPickFiles);
  store.subscribe((s) => render(el, s, handlers));
}

function render(el, s, handlers) {
  el.querySelector('#rFileCount').textContent = String(s.files.size);
  const filesEl = el.querySelector('#rFiles');
  filesEl.innerHTML = '';
  for (const [name, rec] of s.files.entries()) {
    const row = document.createElement('div');
    row.className = `file${name === s.activeTable ? ' active' : ''}`;
    row.innerHTML = `
      <span class="dot"></span>
      <span class="name">${escape(name)}</span>
      <span class="rows">${rec.size ? abbreviate(Math.round(rec.size/1024)) + 'K' : ''}</span>
      <button class="x" type="button" title="Close" aria-label="Close ${escape(name)}">×</button>
    `;
    row.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); handlers.onClose(name); });
    row.addEventListener('click', () => handlers.onSwitch(name));
    filesEl.appendChild(row);
  }
  const active = s.activeTable && s.files.get(s.activeTable);
  el.querySelector('#rColsSection').hidden = !active;
  el.querySelector('#rMetaSection').hidden = !active;
  if (!active) { el.querySelector('#rCols').innerHTML = ''; el.querySelector('#rMeta').innerHTML = ''; return; }
  el.querySelector('#rColsName').textContent = s.activeTable;
  const schema = active.profile?.schema || [];
  el.querySelector('#rColsCount').textContent = String(schema.length);
  el.querySelector('#rCols').innerHTML = schema.map((row) => {
    const name = row.column_name || row.name;
    const type = row.column_type || row.type || '';
    return `<div class="col" data-col="${escape(name)}"><span class="ico">·</span><span class="name">${escape(name)}</span><span class="stat">${escape(type)}</span></div>`;
  }).join('');
  const codec = (active.profile?.codecs || []).map((c) => c.compression).filter(Boolean).join(', ');
  el.querySelector('#rMeta').innerHTML = `
    ${codec ? `<div class="meta-row"><span>Compression</span><b>${escape(codec)}</b></div>` : ''}
    ${active.profile?.rowGroups?.length ? `<div class="meta-row"><span>Row groups</span><b>${active.profile.rowGroups.length}</b></div>` : ''}
    ${active.profile?.fileMeta?.created_by ? `<div class="meta-row"><span>Created by</span><b>${escape(active.profile.fileMeta.created_by)}</b></div>` : ''}
  `;
}

function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function abbreviate(n) { if (n >= 1000) return `${Math.round(n/1000)}K`; return String(n); }
```

- [ ] **Step 3: src/ui/editor.js (Phase 5 enriches)**

```js
export function mountEditor(el, store, handlers) {
  const wrap = document.createElement('div'); wrap.className = 'editor';
  wrap.innerHTML = `
    <div class="tabs"><div class="tab on">Query</div><div class="grow"></div><div class="right">SELECT</div></div>
    <div class="body">
      <div class="ln" id="eLn">1</div>
      <textarea id="eSql" spellcheck="false" style="background:var(--surface); color:var(--ink);">SELECT 1;</textarea>
    </div>
    <div class="foot"><span class="ok">●</span><span id="eStatus">Ready</span><span class="grow"></span><span class="pill">⌘↩ run</span></div>
  `;
  el.appendChild(wrap);
  const ta = wrap.querySelector('#eSql');
  const ln = wrap.querySelector('#eLn');
  const update = () => {
    const lines = ta.value.split('\n').length;
    ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  };
  ta.addEventListener('input', update);
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handlers.onRun(); }
  });
  update();
  return { getSql: () => ta.value, setSql: (v) => { ta.value = v; update(); ta.focus(); } };
}
```

- [ ] **Step 4: src/ui/result.js (Phase 6 enriches)**

```js
import { valueToDisplay } from '../util/format.js';

export function mountResult(el, store) {
  const wrap = document.createElement('div'); wrap.className = 'result';
  el.appendChild(wrap);
  store.subscribe((s) => render(wrap, s));
}

function render(wrap, s) {
  if (!s.resultColumns.length) { wrap.innerHTML = ''; return; }
  const head = `<tr><th>#</th>${s.resultColumns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr>`;
  const start = s.page * s.pageSize;
  const rows = s.resultRows.slice(start, start + s.pageSize);
  const body = rows.map((r, i) => {
    const cells = s.resultColumns.map((c) => `<td>${escape(valueToDisplay(r[c]))}</td>`).join('');
    return `<tr><td>${start + i + 1}</td>${cells}</tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
```

- [ ] **Step 5: src/ui/status.js (Phase 6 enriches)**

```js
import { formatNumber } from '../util/format.js';

export function mountStatus(el, store) {
  const pill = document.createElement('div'); pill.className = 'status'; pill.hidden = true;
  pill.innerHTML = `<span class="dot"></span><span id="sRows"></span><span class="sep">·</span><span id="sMs"></span>`;
  el.appendChild(pill);
  store.subscribe((s) => {
    pill.hidden = !s.resultColumns.length;
    if (pill.hidden) return;
    pill.querySelector('#sRows').textContent = `${formatNumber(s.resultRows.length)} rows`;
    pill.querySelector('#sMs').textContent = `${s.queryElapsedMs ?? 0} ms`;
  });
}
```

- [ ] **Step 6: src/ui/empty.js (Phase 8 enriches)**

```js
export function mountEmpty(el, store, handlers) {
  const empty = document.createElement('div'); empty.className = 'empty';
  empty.innerHTML = `
    <div class="hero">
      <h1>Open a .parquet file</h1>
      <p>Files stay in your browser. Nothing is uploaded — DuckDB-WASM does the work locally.</p>
      <button class="drop" type="button">
        <div class="icon">⇡</div>
        <div class="label">Drop files here, or click to browse</div>
        <div class="hint">Multiple files supported</div>
      </button>
      <p class="footnote">Local-first · works offline · install as a PWA</p>
    </div>
  `;
  el.appendChild(empty);
  empty.querySelector('.drop').addEventListener('click', handlers.onPickFiles);
  store.subscribe((s) => { empty.hidden = s.files.size > 0; });
}
```

- [ ] **Step 7: Replace src/main.js**

```js
import { restoreTheme, toggleTheme } from './ui/theme.js';
import { createStore } from './state/store.js';
import { getEngine, query } from './duckdb/engine.js';
import { openFileInto, closeFile, setActiveFile } from './duckdb/files.js';
import { showToast, toErrorMessage } from './ui/toast.js';
import { mountHeader } from './ui/header.js';
import { mountRail } from './ui/rail.js';
import { mountEditor } from './ui/editor.js';
import { mountResult } from './ui/result.js';
import { mountStatus } from './ui/status.js';
import { mountEmpty } from './ui/empty.js';

restoreTheme();

const store = createStore();
const head = document.querySelector('#head');
const rail = document.querySelector('#rail');
const work = document.querySelector('#work');
const fileInput = document.querySelector('#fileInput');

mountHeader(head, store, {
  onRun: () => runActiveQuery(),
  onToggleTheme: () => toggleTheme(),
  onOpenPalette: () => store.setPaletteOpen(true),
  onPickFiles: () => fileInput.click(),
});
mountRail(rail, store, {
  onPickFiles: () => fileInput.click(),
  onClose: (table) => closeFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onSwitch: (table) => setActiveFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
});
const editor = mountEditor(work, store, { onRun: runActiveQuery });
mountResult(work, store);
mountStatus(work, store);
mountEmpty(work, store, { onPickFiles: () => fileInput.click() });

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  for (const file of files) {
    try {
      const table = await openFileInto(store, file);
      editor.setSql(`SELECT *\nFROM ${table}\nLIMIT 500;`);
    } catch (error) {
      showToast(toErrorMessage(error), 'error');
    }
  }
});

window.addEventListener('keydown', (event) => {
  const meta = event.ctrlKey || event.metaKey;
  if (meta && event.key === 'Enter') { event.preventDefault(); runActiveQuery(); }
  if (meta && event.key.toLowerCase() === 'k') { event.preventDefault(); store.setPaletteOpen(!store.state.paletteOpen); }
  if (meta && event.key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); }
  if (meta && event.key.toLowerCase() === 'd') { event.preventDefault(); toggleTheme(); }
});

['dragenter', 'dragover'].forEach((evt) => window.addEventListener(evt, (e) => e.preventDefault()));
window.addEventListener('drop', async (event) => {
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []).filter((f) => /\.(parquet|parq)$/i.test(f.name));
  for (const file of files) {
    try { await openFileInto(store, file); }
    catch (error) { showToast(toErrorMessage(error), 'error'); }
  }
});

async function runActiveQuery() {
  if (store.state.isBusy) return;
  const sql = editor.getSql().trim();
  if (!sql) { showToast('Enter a SQL query first.', 'error'); return; }
  store.setBusy(true);
  const startedAt = performance.now();
  try {
    await getEngine();
    const result = await query(sql);
    store.setResult({ columns: result.columns, rows: result.rows, elapsedMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    showToast(toErrorMessage(error), 'error');
  } finally {
    store.setBusy(false);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url), { scope: './' })
    .catch((e) => console.warn('SW', e));
}
```

- [ ] **Step 8: Delete legacy app.js**

```bash
git rm dataduck/app.js
```

- [ ] **Step 9: Build, dev, smoke test**

```bash
cd dataduck && npm run build && npm run dev
```

Open the dev URL. Verify:
- Empty state hero shows
- Drop a `.parquet` file → rail lists it (active), header crumb updates, editor pre-fills with `SELECT * FROM <table> LIMIT 500;`, Run executes, table renders.
- Drop a second file → both appear, click to switch active.

- [ ] **Step 10: Commit**

```bash
git add dataduck/src/main.js dataduck/src/ui/header.js dataduck/src/ui/rail.js dataduck/src/ui/editor.js dataduck/src/ui/result.js dataduck/src/ui/status.js dataduck/src/ui/empty.js
git rm dataduck/app.js
git commit -m "refactor: cut over from monolithic app.js to modular src/main.js with multi-file wiring"
```

---

# Phase 4 — Column rail with SUMMARIZE

### Task 4.1: SUMMARIZE-based column profiling + type icons

**Files:**
- Create: `dataduck/src/duckdb/summarize.js`
- Create: `dataduck/tests/duckdb/summarize-types.test.js`
- Modify: `dataduck/src/duckdb/files.js`
- Modify: `dataduck/src/ui/rail.js`

- [ ] **Step 1: Write the failing type-icon tests**

```js
import { describe, it, expect } from 'vitest';
import { typeIcon } from '../../src/duckdb/summarize.js';

describe('typeIcon', () => {
  it('returns # for numeric types', () => {
    expect(typeIcon('INTEGER')).toBe('#');
    expect(typeIcon('BIGINT')).toBe('#');
    expect(typeIcon('DOUBLE')).toBe('#');
    expect(typeIcon('DECIMAL(10,2)')).toBe('#');
    expect(typeIcon('FLOAT')).toBe('#');
  });
  it('returns ⏱ for temporal', () => {
    expect(typeIcon('DATE')).toBe('⏱');
    expect(typeIcon('TIME')).toBe('⏱');
    expect(typeIcon('TIMESTAMP')).toBe('⏱');
    expect(typeIcon('TIMESTAMP WITH TIME ZONE')).toBe('⏱');
    expect(typeIcon('INTERVAL')).toBe('⏱');
  });
  it('returns B for boolean', () => {
    expect(typeIcon('BOOLEAN')).toBe('B');
  });
  it('returns {} for struct', () => {
    expect(typeIcon('STRUCT(a INTEGER)')).toBe('{}');
  });
  it('returns [] for list', () => {
    expect(typeIcon('INTEGER[]')).toBe('[]');
    expect(typeIcon('LIST(INTEGER)')).toBe('[]');
  });
  it('returns T for text', () => {
    expect(typeIcon('VARCHAR')).toBe('T');
    expect(typeIcon('TEXT')).toBe('T');
    expect(typeIcon('BLOB')).toBe('T');
  });
  it('returns ? for unknown', () => {
    expect(typeIcon('JIBBERISH')).toBe('?');
  });
});
```

- [ ] **Step 2: Implement src/duckdb/summarize.js**

```js
import { query } from './engine.js';
import { quoteIdentifier } from '../util/sql-quote.js';

const RX_NUM = /^(TINY|SMALL|BIG|HUGE)?INT(EGER)?$|^DECIMAL|^DOUBLE|^FLOAT|^REAL|^NUMERIC/i;
const RX_TIME = /^DATE$|^TIME(STAMP)?(\s|$)|^INTERVAL$/i;
const RX_BOOL = /^BOOLEAN$|^BOOL$/i;
const RX_STRUCT = /^STRUCT/i;
const RX_LIST = /\[\]$|^LIST\(/i;
const RX_TEXT = /^VARCHAR$|^TEXT$|^STRING$|^BLOB$|^CHAR/i;

export function typeIcon(sqlType) {
  const t = String(sqlType || '').trim().toUpperCase();
  if (RX_LIST.test(t)) return '[]';
  if (RX_STRUCT.test(t)) return '{}';
  if (RX_BOOL.test(t)) return 'B';
  if (RX_NUM.test(t)) return '#';
  if (RX_TIME.test(t)) return '⏱';
  if (RX_TEXT.test(t)) return 'T';
  return '?';
}

export function iconClass(icon) {
  if (icon === '#') return 'n';
  if (icon === '⏱') return 'd';
  if (icon === 'T') return 't';
  return '';
}

export async function summarizeTable(tableName) {
  const result = await query(`SUMMARIZE ${quoteIdentifier(tableName)};`);
  const map = new Map();
  for (const row of result.rows) {
    const name = row.column_name;
    if (!name) continue;
    map.set(name, {
      type: row.column_type,
      distinct: pickNumber(row.approx_unique),
      nulls: pickNumber(row.null_percentage) ?? pickNumber(row.null_count),
      rowCount: pickNumber(row.count),
      min: row.min,
      max: row.max,
    });
  }
  return map;
}

function pickNumber(value) {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test -- summarize-types
```

Expected: 7 passed.

- [ ] **Step 4: Wire SUMMARIZE into files.js openFileInto**

In `dataduck/src/duckdb/files.js`, add the import:

```js
import { summarizeTable } from './summarize.js';
```

In `openFileInto`, after `const profile = await profileFile(...)`:

```js
let summary = new Map();
try { summary = await summarizeTable(tableName); }
catch (e) { console.warn('SUMMARIZE failed:', e); }
```

Change the `store.addFile` call to include `summary`:

```js
store.addFile(tableName, { virtualName, file, size: file.size, profile, summary });
```

- [ ] **Step 5: Update rail.js to render type icons + bars**

Replace the column-row rendering block in `dataduck/src/ui/rail.js`:

```js
import { typeIcon, iconClass } from '../duckdb/summarize.js';

// Replace the existing `el.querySelector('#rCols').innerHTML = ...` line with:
const summary = active.summary || new Map();
const totalRows = active.profile?.fileMeta?.num_rows
  ? Number(active.profile.fileMeta.num_rows)
  : Math.max(1, ...[...summary.values()].map((s) => s.rowCount ?? 0));
el.querySelector('#rCols').innerHTML = schema.map((row) => {
  const name = row.column_name || row.name;
  const type = row.column_type || row.type || '';
  const stats = summary.get(name) || {};
  const ico = typeIcon(type);
  const cls = iconClass(ico);
  const distinct = stats.distinct;
  const distinctText = distinct == null ? '' : distinct >= totalRows * 0.8 ? 'all' : abbreviate(distinct);
  const barWidth = distinct == null || !totalRows ? 0 : Math.min(100, Math.round((distinct / totalRows) * 100));
  const bar = barWidth ? `<span class="bar"><i style="width:${barWidth}%"></i></span>` : '';
  return `<div class="col" data-col="${escape(name)}" title="${escape(type)}"><span class="ico ${cls}">${ico}</span><span class="name">${escape(name)}</span><span class="stat">${bar}${distinctText}</span></div>`;
}).join('');
```

- [ ] **Step 6: Manual test**

`npm run dev`, open a Parquet file. Rail should show columns with type icons and density bars.

- [ ] **Step 7: Commit**

```bash
git add dataduck/src/duckdb/summarize.js dataduck/src/duckdb/files.js dataduck/src/ui/rail.js dataduck/tests/duckdb/summarize-types.test.js
git commit -m "feat: SUMMARIZE-based column profiling with type icons + cardinality bars"
```

---

### Task 4.2: Click-column-to-insert-SQL

**Files:**
- Modify: `dataduck/src/main.js`
- Modify: `dataduck/src/ui/rail.js`

- [ ] **Step 1: Add onColClick handler to mountRail call in main.js**

```js
mountRail(rail, store, {
  onPickFiles: () => fileInput.click(),
  onClose: (table) => closeFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onSwitch: (table) => setActiveFile(store, table).catch((e) => showToast(toErrorMessage(e), 'error')),
  onColClick: (col) => {
    const active = store.state.activeTable;
    if (!active) return;
    editor.setSql(`SELECT ${col}\nFROM ${active}\nLIMIT 500;`);
  },
});
```

- [ ] **Step 2: Wire handler in rail.js render()**

After the `el.querySelector('#rCols').innerHTML = ...` assignment:

```js
el.querySelector('#rCols').querySelectorAll('.col').forEach((row) => {
  row.addEventListener('click', () => handlers.onColClick(row.dataset.col));
});
```

- [ ] **Step 3: Manual test**

`npm run dev`, click a column, verify editor SQL changes.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/main.js dataduck/src/ui/rail.js
git commit -m "feat: clicking a column inserts SELECT col template into editor"
```

---

# Phase 5 — Editor polish

### Task 5.1: SQL highlighter (TDD)

**Files:**
- Create: `dataduck/src/sql/highlight.js`
- Create: `dataduck/tests/sql/highlight.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { highlightSql } from '../../src/sql/highlight.js';

describe('highlightSql', () => {
  it('wraps keywords', () => {
    expect(highlightSql('SELECT 1;')).toContain('<span class="kw">SELECT</span>');
  });
  it('wraps function calls', () => {
    expect(highlightSql('COUNT(*)')).toContain('<span class="fn">COUNT</span>');
  });
  it('wraps numbers', () => {
    expect(highlightSql('LIMIT 500')).toContain('<span class="num">500</span>');
  });
  it('wraps strings', () => {
    expect(highlightSql("'abc'")).toContain('<span class="str">');
  });
  it('escapes HTML', () => {
    const result = highlightSql('<script>SELECT</script>');
    expect(result).not.toMatch(/<script>/);
    expect(result).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Implement src/sql/highlight.js**

```js
const KEYWORDS = /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|USING|AS|AND|OR|NOT|IN|IS|NULL|TRUE|FALSE|CASE|WHEN|THEN|ELSE|END|UNION|ALL|DISTINCT|WITH|CREATE|VIEW|TABLE|REPLACE|DROP|DESCRIBE|SUMMARIZE|EXPLAIN|OVER|PARTITION|BETWEEN|LIKE|ILIKE|EXISTS)\b/gi;
const FUNCTIONS = /\b([A-Z_][A-Z_0-9]+)(?=\s*\()/gi;
const NUMBERS = /\b(\d+(?:\.\d+)?)\b/g;
const STRINGS = /'([^'\\]|\\.)*'/g;

export function highlightSql(sql) {
  const escaped = String(sql).replace(/[&<>]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  return escaped
    .replace(STRINGS, (m) => `<span class="str">${m}</span>`)
    .replace(KEYWORDS, (m) => `<span class="kw">${m}</span>`)
    .replace(FUNCTIONS, (m) => `<span class="fn">${m}</span>`)
    .replace(NUMBERS, (m) => `<span class="num">${m}</span>`);
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test -- highlight
```

Expected: 5 passed.

- [ ] **Step 4: Wire highlighter into editor.js**

Replace `dataduck/src/ui/editor.js`:

```js
import { highlightSql } from '../sql/highlight.js';

export function mountEditor(el, store, handlers) {
  const wrap = document.createElement('div'); wrap.className = 'editor';
  wrap.innerHTML = `
    <div class="tabs"><div class="tab on">Query</div><div class="grow"></div><div class="right">SELECT</div></div>
    <div class="body" style="position:relative;">
      <div class="ln" id="eLn">1</div>
      <div style="position:relative; flex:1;">
        <pre class="hl" id="eHl" aria-hidden="true"></pre>
        <textarea id="eSql" spellcheck="false" style="position:absolute; inset:0;">SELECT 1;</textarea>
      </div>
    </div>
    <div class="foot"><span class="ok">●</span><span id="eStatus">Ready</span><span class="grow"></span><span class="pill">⌘↩ run</span><span class="pill">⌘/ comment</span></div>
  `;
  el.appendChild(wrap);
  const ta = wrap.querySelector('#eSql');
  const hl = wrap.querySelector('#eHl');
  const ln = wrap.querySelector('#eLn');
  const update = () => {
    hl.innerHTML = highlightSql(ta.value) + '\n';
    const lines = ta.value.split('\n').length;
    ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  };
  ta.addEventListener('input', update);
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handlers.onRun(); }
    if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); toggleComment(ta); update(); }
  });
  update();
  return { getSql: () => ta.value, setSql: (v) => { ta.value = v; update(); ta.focus(); } };
}

function toggleComment(ta) {
  const { selectionStart, selectionEnd, value } = ta;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionEnd);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const slice = value.slice(lineStart, end);
  const lines = slice.split('\n');
  const allCommented = lines.every((l) => l.trimStart().startsWith('--') || l.trim() === '');
  const next = lines.map((l) =>
    allCommented ? l.replace(/^(\s*)--\s?/, '$1') : (l.trim() === '' ? l : `-- ${l}`),
  ).join('\n');
  ta.value = value.slice(0, lineStart) + next + value.slice(end);
  ta.setSelectionRange(lineStart, lineStart + next.length);
}
```

- [ ] **Step 5: Manual test**

`npm run dev`. Type SQL — keywords should be teal, numbers amber, function names purple. Press ⌘/ on a line, verify it toggles `--` comments.

- [ ] **Step 6: Commit**

```bash
git add dataduck/src/sql/highlight.js dataduck/src/ui/editor.js dataduck/tests/sql/highlight.test.js
git commit -m "feat: DuckDB SQL highlighter + ⌘/ comment toggle"
```

---

### Task 5.2: Sample query templates

**Files:**
- Create: `dataduck/src/sql/templates.js`
- Create: `dataduck/tests/sql/templates.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { sampleQueries } from '../../src/sql/templates.js';

describe('sampleQueries', () => {
  it('returns templates for a given table', () => {
    const q = sampleQueries('events', 'dataduck_xyz_events.parquet');
    expect(q.find((t) => t.label === 'SELECT *').sql).toContain('SELECT *');
    expect(q.find((t) => t.label === 'SELECT *').sql).toContain('events');
    expect(q.find((t) => t.label === 'DESCRIBE').sql).toBe('DESCRIBE SELECT *\nFROM events;');
    expect(q.find((t) => t.label === 'SUMMARIZE').sql).toBe('SUMMARIZE events;');
  });
});
```

- [ ] **Step 2: Implement src/sql/templates.js**

```js
import { quoteString } from '../util/sql-quote.js';

export function sampleQueries(tableName, virtualFileName) {
  const file = quoteString(virtualFileName);
  return [
    { label: 'SELECT *', sql: `SELECT *\nFROM ${tableName}\nLIMIT 500;` },
    { label: 'DESCRIBE', sql: `DESCRIBE SELECT *\nFROM ${tableName};` },
    { label: 'SUMMARIZE', sql: `SUMMARIZE ${tableName};` },
    { label: 'parquet_file_metadata', sql: `SELECT *\nFROM parquet_file_metadata(${file});` },
    { label: 'parquet_metadata', sql: `SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count\nFROM parquet_metadata(${file})\nLIMIT 100;` },
  ];
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test -- templates
```

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/sql/templates.js dataduck/tests/sql/templates.test.js
git commit -m "feat: sample query templates module"
```

---

# Phase 6 — Result + status pill

### Task 6.1: Floating status pill with pagination + CSV export

**Files:**
- Modify: `dataduck/src/ui/status.js`
- Modify: `dataduck/src/ui/result.js`

- [ ] **Step 1: Replace status.js**

```js
import { formatNumber } from '../util/format.js';
import { toCsv, downloadBlob } from '../util/csv.js';

export function mountStatus(el, store) {
  const pill = document.createElement('div'); pill.className = 'status'; pill.hidden = true;
  pill.innerHTML = `
    <span class="dot"></span>
    <span id="sRows"></span>
    <span class="sep">·</span>
    <span id="sMs"></span>
    <span class="sep">·</span>
    <button class="btn" id="sPrev" type="button" title="Previous page">◀</button>
    <span id="sPage"></span>
    <button class="btn" id="sNext" type="button" title="Next page">▶</button>
    <span class="sep">·</span>
    <button class="btn" id="sExport" type="button" title="Export CSV">⤓ CSV</button>
  `;
  el.appendChild(pill);

  pill.querySelector('#sPrev').addEventListener('click', () => store.setPage(Math.max(0, store.state.page - 1)));
  pill.querySelector('#sNext').addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(store.state.resultRows.length / store.state.pageSize));
    store.setPage(Math.min(pageCount - 1, store.state.page + 1));
  });
  pill.querySelector('#sExport').addEventListener('click', () => {
    const s = store.state;
    if (!s.resultColumns.length) return;
    const csv = toCsv(s.resultColumns, s.resultRows);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `dataduck-${stamp}.csv`);
  });

  store.subscribe((s) => {
    pill.hidden = !s.resultColumns.length;
    if (pill.hidden) return;
    pill.querySelector('#sRows').textContent = `${formatNumber(s.resultRows.length)} rows`;
    pill.querySelector('#sMs').textContent = `${s.queryElapsedMs ?? 0} ms`;
    const pageCount = Math.max(1, Math.ceil(s.resultRows.length / s.pageSize));
    pill.querySelector('#sPage').textContent = `${s.page + 1}/${pageCount}`;
    pill.querySelector('#sPrev').disabled = s.page === 0;
    pill.querySelector('#sNext').disabled = s.page >= pageCount - 1;
  });
}
```

- [ ] **Step 2: Update result.js with numeric class**

```js
import { valueToDisplay } from '../util/format.js';

export function mountResult(el, store) {
  const wrap = document.createElement('div'); wrap.className = 'result';
  el.appendChild(wrap);
  store.subscribe((s) => render(wrap, s));
}

function render(wrap, s) {
  if (!s.resultColumns.length) { wrap.innerHTML = ''; return; }
  const head = `<tr><th>#</th>${s.resultColumns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr>`;
  const start = s.page * s.pageSize;
  const rows = s.resultRows.slice(start, start + s.pageSize);
  const body = rows.map((r, i) => {
    const cells = s.resultColumns.map((c) => {
      const v = r[c];
      const isNum = typeof v === 'number' || typeof v === 'bigint';
      const isNull = v == null;
      const cls = [isNum && 'num', isNull && 'null'].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''}>${escape(valueToDisplay(v))}</td>`;
    }).join('');
    return `<tr><td>${start + i + 1}</td>${cells}</tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
```

- [ ] **Step 3: Manual test pagination + CSV**

`npm run dev`, run a query that returns >100 rows, paginate, click `⤓ CSV`, verify download.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/ui/status.js dataduck/src/ui/result.js
git commit -m "feat: floating status pill with pagination, timing, CSV export"
```

---

# Phase 7 — ⌘K palette

### Task 7.1: Palette filter + command builder (TDD)

**Files:**
- Create: `dataduck/src/ui/palette-filter.js`
- Create: `dataduck/tests/ui/palette-filter.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { filterCommands } from '../../src/ui/palette-filter.js';

const COMMANDS = [
  { group: 'Queries', title: 'SUMMARIZE active', sub: 'SUMMARIZE events' },
  { group: 'Queries', title: 'DESCRIBE active', sub: 'DESCRIBE events' },
  { group: 'Files', title: 'Switch to events', sub: '78K rows' },
  { group: 'Files', title: 'Switch to orders', sub: '412K rows' },
  { group: 'Actions', title: 'Run query', sub: '' },
  { group: 'Actions', title: 'Export result as CSV', sub: '' },
];

describe('filterCommands', () => {
  it('returns all when query is empty', () => {
    expect(filterCommands(COMMANDS, '').length).toBe(6);
  });
  it('matches title case-insensitively', () => {
    const r = filterCommands(COMMANDS, 'sum');
    expect(r.length).toBe(1);
    expect(r[0].title).toBe('SUMMARIZE active');
  });
  it('matches subtitle', () => {
    const r = filterCommands(COMMANDS, '412');
    expect(r.length).toBe(1);
    expect(r[0].title).toBe('Switch to orders');
  });
  it('returns empty for no matches', () => {
    expect(filterCommands(COMMANDS, 'zzz').length).toBe(0);
  });
});
```

- [ ] **Step 2: Implement src/ui/palette-filter.js**

```js
export function filterCommands(commands, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...commands];
  return commands.filter((c) => `${c.title} ${c.sub || ''}`.toLowerCase().includes(q));
}

export function buildCommands(state, actions) {
  const list = [];
  if (state.activeTable) {
    list.push(
      { group: 'Queries', icon: 'Σ', title: 'SUMMARIZE active file', sub: `SUMMARIZE ${state.activeTable}`, run: () => actions.setSql(`SUMMARIZE ${state.activeTable};`) },
      { group: 'Queries', icon: '?', title: 'DESCRIBE active file', sub: `DESCRIBE ${state.activeTable}`, run: () => actions.setSql(`DESCRIBE SELECT *\nFROM ${state.activeTable};`) },
      { group: 'Queries', icon: '*', title: 'SELECT * (LIMIT 500)', sub: `SELECT * FROM ${state.activeTable}`, run: () => actions.setSql(`SELECT *\nFROM ${state.activeTable}\nLIMIT 500;`) },
    );
  }
  if (state.files.size > 1) {
    list.push({
      group: 'Queries',
      icon: 'Σ',
      title: 'SUMMARIZE all files',
      sub: [...state.files.keys()].join(', '),
      run: () => {
        const u = [...state.files.keys()].map((t) => `SELECT '${t}' AS file, * FROM ${t}`).join('\nUNION ALL\n');
        actions.setSql(`WITH all_files AS (\n${u}\n)\nSUMMARIZE all_files;`);
      },
    });
  }
  let i = 0;
  for (const [name] of state.files) {
    i += 1;
    list.push({
      group: 'Files',
      icon: 'F',
      title: `Switch to ${name}`,
      sub: name === state.activeTable ? 'active' : '',
      shortcut: i <= 9 ? ['⌘', String(i)] : null,
      run: () => actions.switchActive(name),
    });
  }
  list.push(
    { group: 'Files', icon: '+', title: 'Open file…', sub: '', run: () => actions.pickFiles() },
    { group: 'Actions', icon: '↻', title: 'Run query', shortcut: ['⌘', '↩'], run: () => actions.run() },
    { group: 'Actions', icon: '⤓', title: 'Export result as CSV', shortcut: ['⌘', 'E'], run: () => actions.exportCsv() },
    { group: 'Actions', icon: '◐', title: 'Toggle theme', shortcut: ['⌘', 'D'], run: () => actions.toggleTheme() },
    { group: 'Actions', icon: '×', title: 'Close all files', sub: '', run: () => actions.closeAll() },
  );
  return list;
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test -- palette-filter
```

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/ui/palette-filter.js dataduck/tests/ui/palette-filter.test.js
git commit -m "feat: palette filter + command builder logic"
```

---

### Task 7.2: Palette UI module

**Files:**
- Create: `dataduck/src/ui/palette.js`
- Modify: `dataduck/src/main.js`

- [ ] **Step 1: src/ui/palette.js**

```js
import { filterCommands, buildCommands } from './palette-filter.js';

export function mountPalette(scrim, store, actions) {
  const root = scrim.querySelector('#palette');
  let selected = 0;
  let commands = [];
  let filtered = [];

  function rebuild() {
    commands = buildCommands(store.state, actions);
    filtered = filterCommands(commands, root.querySelector('input')?.value || '');
    render();
  }

  function render() {
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    const groups = new Map();
    for (let i = 0; i < filtered.length; i += 1) {
      const c = filtered[i];
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push({ ...c, idx: i });
    }
    const groupHtml = [...groups.entries()].map(([name, items]) => `
      <div class="p-group">
        <div class="p-glabel">${escape(name)}</div>
        ${items.map((c) => `
          <div class="p-row${c.idx === selected ? ' on' : ''}" data-idx="${c.idx}">
            <div class="p-icon">${escape(c.icon || '·')}</div>
            <div class="p-text">
              <div class="p-title">${escape(c.title)}</div>
              ${c.sub ? `<div class="p-sub">${escape(c.sub)}</div>` : ''}
            </div>
            <div class="p-key">${(c.shortcut || []).map((k) => `<span>${escape(k)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    const currentInputValue = root.querySelector('input')?.value || '';
    root.innerHTML = `
      <div class="p-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
        <input value="${escape(currentInputValue)}" placeholder="Run command, jump to file or column…" />
        <span class="badge">⌘K</span>
      </div>
      ${groupHtml}
      <div class="p-foot">
        <span class="hint"><span>↑</span><span>↓</span> navigate</span>
        <span class="hint"><span>↩</span> select</span>
        <span class="hint"><span>esc</span> close</span>
        <span class="grow"></span>
        <span>${filtered.length} result${filtered.length === 1 ? '' : 's'}</span>
      </div>
    `;
    const input = root.querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('input', () => {
      selected = 0;
      filtered = filterCommands(commands, input.value);
      render();
    });
    root.querySelectorAll('.p-row').forEach((rowEl) => {
      rowEl.addEventListener('mouseenter', () => { selected = Number(rowEl.dataset.idx); render(); });
      rowEl.addEventListener('click', () => exec(filtered[Number(rowEl.dataset.idx)]));
    });
  }

  function exec(cmd) { if (!cmd) return; cmd.run(); store.setPaletteOpen(false); }

  function onKey(e) {
    if (!store.state.paletteOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); store.setPaletteOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); render(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); render(); return; }
    if (e.key === 'Enter') { e.preventDefault(); exec(filtered[selected]); return; }
  }
  window.addEventListener('keydown', onKey);

  store.subscribe((s) => {
    scrim.hidden = !s.paletteOpen;
    if (s.paletteOpen) rebuild();
  });
  scrim.addEventListener('click', (e) => { if (e.target === scrim) store.setPaletteOpen(false); });
}

function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
```

- [ ] **Step 2: Wire into main.js**

Add the import:

```js
import { mountPalette } from './ui/palette.js';
```

After the other mounts, add:

```js
mountPalette(document.querySelector('#paletteScrim'), store, {
  setSql: (sql) => editor.setSql(sql),
  switchActive: (name) => setActiveFile(store, name),
  pickFiles: () => fileInput.click(),
  run: runActiveQuery,
  exportCsv: () => document.querySelector('#sExport')?.click(),
  toggleTheme,
  closeAll: async () => { for (const t of [...store.state.files.keys()]) { await closeFile(store, t); } },
});
```

- [ ] **Step 3: Manual test**

`npm run dev`. ⌘K opens palette. Type to filter. ↑↓ navigates. ↩ executes. Esc closes.

- [ ] **Step 4: Commit**

```bash
git add dataduck/src/ui/palette.js dataduck/src/main.js
git commit -m "feat: ⌘K command palette modal with arrow-key navigation"
```

---

# Phase 8 — Empty state polish + recents

### Task 8.1: IndexedDB recents

**Files:**
- Create: `dataduck/src/state/recents.js`
- Modify: `dataduck/src/duckdb/files.js`
- Modify: `dataduck/src/ui/empty.js`

- [ ] **Step 1: src/state/recents.js**

```js
const DB_NAME = 'dataduck';
const STORE = 'recents';
const MAX_RECENTS = 5;

function withDb(fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store)).then((value) => {
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function recordRecent({ name, size }) {
  await withDb((store) => store.put({ name, size, openedAt: Date.now() }));
}

export async function listRecents() {
  return withDb((store) => new Promise((resolve) => {
    const out = [];
    const cursor = store.openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (!c) {
        resolve(out.sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_RECENTS));
        return;
      }
      out.push(c.value);
      c.continue();
    };
  }));
}

export async function clearRecents() {
  await withDb((store) => store.clear());
}
```

- [ ] **Step 2: Wire into files.js**

Add the import to `dataduck/src/duckdb/files.js`:

```js
import { recordRecent } from '../state/recents.js';
```

In `openFileInto`, after `store.addFile(...)`:

```js
await recordRecent({ name: file.name, size: file.size }).catch(() => {});
```

- [ ] **Step 3: Update empty.js**

Replace `dataduck/src/ui/empty.js`:

```js
import { listRecents, clearRecents } from '../state/recents.js';

export function mountEmpty(el, store, handlers) {
  const empty = document.createElement('div'); empty.className = 'empty';
  el.appendChild(empty);

  async function render() {
    const recents = await listRecents().catch(() => []);
    empty.innerHTML = `
      <div class="hero">
        <h1>Open a .parquet file</h1>
        <p>Files stay in your browser. Nothing is uploaded — DuckDB-WASM does the work locally.</p>
        <button class="drop" type="button">
          <div class="icon">⇡</div>
          <div class="label">Drop files here, or click to browse</div>
          <div class="hint">Multiple files supported</div>
        </button>
        ${recents.length ? `
          <div class="recent">
            <div class="h"><span>Recent</span><button class="clear" id="recClear" type="button">Clear</button></div>
            ${recents.map((r) => `
              <div class="row">
                <span class="name">${escape(r.name)}</span>
                <span class="meta">${formatSize(r.size)}</span>
                <span class="when">${relativeTime(r.openedAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <p class="footnote">Local-first · works offline · install as a PWA</p>
      </div>
    `;
    empty.querySelector('.drop').addEventListener('click', handlers.onPickFiles);
    empty.querySelector('#recClear')?.addEventListener('click', async () => { await clearRecents(); render(); });
  }

  store.subscribe((s) => {
    empty.hidden = s.files.size > 0;
    if (!empty.hidden) render();
  });
  render();
}

function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function formatSize(n) {
  if (!n) return '–';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function relativeTime(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (s < 86400) return `${Math.floor(s/3600)} h ago`;
  return `${Math.floor(s/86400)} d ago`;
}
```

- [ ] **Step 4: Manual test**

Open a file, refresh, see it in the Recent list. Click Clear, list empties.

- [ ] **Step 5: Commit**

```bash
git add dataduck/src/state/recents.js dataduck/src/duckdb/files.js dataduck/src/ui/empty.js
git commit -m "feat: IndexedDB-backed recent file list on empty state"
```

---

# Phase 9 — Polish and verification

### Task 9.1: No-italics CI guard

**Files:**
- Create: `dataduck/scripts/check-no-italics.mjs`
- Modify: `dataduck/package.json`

- [ ] **Step 1: Write the guard script**

`dataduck/scripts/check-no-italics.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

// Use execFileSync (no shell) — argv array, no string interpolation, no injection risk.
const out = execFileSync(
  'git',
  ['ls-files', 'src', 'styles.css', 'index.html'],
  { cwd: root, encoding: 'utf8' },
);

const files = out.split('\n').filter(Boolean);

const checks = [
  { rx: /font-style\s*:\s*italic/i, message: 'font-style: italic' },
  { rx: /<em(\s|>)/i, message: '<em> tag' },
  { rx: /<i(\s|>)/i, message: '<i> tag' },
];

const violations = [];
for (const file of files) {
  const path = join(root, file);
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch { continue; }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const c of checks) {
      if (c.rx.test(lines[i])) {
        violations.push({ file, line: i + 1, msg: c.message, text: lines[i].trim() });
      }
    }
  }
}

if (violations.length) {
  console.error(`\nNo-italics check FAILED — ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.msg}\n    ${v.text}`);
  process.exit(1);
}
console.log('No-italics check passed.');
```

- [ ] **Step 2: Wire into npm test**

Update `dataduck/package.json` scripts:

```json
"scripts": {
  "dev": "vite --host 0.0.0.0",
  "build": "vite build",
  "preview": "vite preview --host 0.0.0.0",
  "test": "vitest run && node scripts/check-no-italics.mjs",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint:no-italics": "node scripts/check-no-italics.mjs"
}
```

- [ ] **Step 3: Run — pass**

```bash
cd dataduck && npm test
```

Expected: vitest green + "No-italics check passed."

- [ ] **Step 4: Commit**

```bash
git add dataduck/scripts/check-no-italics.mjs dataduck/package.json
git commit -m "chore: add CI guard preventing italic typography in source"
```

---

### Task 9.2: Update README

**Files:**
- Replace: `dataduck/README.md`

- [ ] **Step 1: Replace README**

```markdown
# DataDuck

A local-first Parquet viewer PWA powered by DuckDB-WASM. Open multiple `.parquet` files, query with SQL (cross-file joins supported), inspect schema and column distributions, export results — all in the browser, nothing uploaded.

## Highlights

- **Multiple files** open at once. Each becomes a SQL view named after the sanitized filename (`events.parquet` → `events`, `2024.parquet` → `t_2024`, duplicates get `_1`/`_2`). The legacy `parquet_file` alias is preserved and follows whichever file is active.
- **Editorial Minimal redesign** with a DuckDB-UI inspired column rail showing type icons and inline distinct-count distribution bars.
- **⌘K command palette** for queries, file switching, and actions.
- **No italic typography** in the design system — enforced by `npm test`.

See [DESIGN.md](DESIGN.md) for the full design spec.

## Run

```bash
npm install
npm run dev          # vite dev server
npm test             # vitest + no-italics guard
npm run build        # production build into dist/
```

## Default queries

```sql
SELECT * FROM <table> LIMIT 500;
SUMMARIZE <table>;
DESCRIBE SELECT * FROM <table>;
SELECT * FROM events JOIN orders USING (user_id);
```

## Keyboard

| Shortcut | Action |
| --- | --- |
| ⌘↩ / Ctrl↩ | Run query |
| ⌘K | Open command palette |
| ⌘O | Open file picker |
| ⌘D | Toggle theme |
| ⌘/ | Toggle line comment |

## Notes

- Browser memory is the hard limit on file size.
- DuckDB-WASM pinned at `1.30.0`.
- Vite `8.0.10` requires Node `>= 20.19.0`.
```

- [ ] **Step 2: Commit**

```bash
git add dataduck/README.md
git commit -m "docs: update README for multi-file support, ⌘K, redesign"
```

---

### Task 9.3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

```bash
cd dataduck && npm test
```

Expected: every test green, italics guard passes.

- [ ] **Step 2: Production build**

```bash
cd dataduck && npm run build
```

Inspect `dist/` size — should be within ~30KB of pre-redesign (DuckDB-WASM dwarfs everything).

- [ ] **Step 3: Manual smoke checklist**

`npm run preview`, open in a browser:

- Empty state hero displays (with recents if any)
- Drop a `.parquet` file — rail populates, columns render with type icons + bars
- Drop a second file — both appear, click to switch active
- Cross-file `SELECT * FROM events JOIN orders USING (user_id)` runs successfully
- ⌘K opens palette, arrow keys navigate, Enter executes
- ⌘D toggles light/dark cleanly (no flash, no italics anywhere)
- Status pill paginates and exports CSV
- `parquet_file` alias resolves to active file (test by writing `SELECT * FROM parquet_file LIMIT 5`)

- [ ] **Step 4: Verify clean working tree**

```bash
git status
```

Expected: nothing to commit.

---

## Self-review

**Spec coverage** — every section in [DESIGN.md](../../../dataduck/DESIGN.md) maps to a task:

- §2 design language → Task 1.2 (CSS), §2.5 no-italics → Task 9.1 (CI guard)
- §3 layout → Task 1.3 (skeleton)
- §4 multi-file → Tasks 3.1–3.4 (sanitize, store, files orchestrator, cutover)
- §5.1 header → Task 3.4
- §5.2 rail → Task 3.4 stub + Task 4.1 (SUMMARIZE), Task 4.2 (click-insert)
- §5.3 editor → Tasks 3.4 stub, 5.1 (highlighter), 5.2 (templates)
- §5.4 result table → Task 6.1
- §5.5 status pill → Task 6.1
- §5.6 ⌘K palette → Tasks 7.1, 7.2
- §6 empty state → Tasks 3.4 stub + 8.1 (recents)
- §7 file structure → Tasks 1.4, 2.1–2.4, 3.4 cumulatively land here
- §8 PWA → unchanged (sw.js + manifest preserved); manifest theme color updated in Task 1.3
- §9 out of scope → respected — no histograms, no multi-tab queries, no CSV import
- §10 success criteria → Task 9.3 manual smoke + Task 9.1 italic guard

**Placeholder scan** — no "TBD"/"TODO"/"add appropriate error handling" placeholders. The CSS in Task 1.2 is the only step that says "copy from mockup" rather than inlining the full sheet — that's a deliberate handoff to the mockups already in `.superpowers/brainstorm/29682-1777300943/content/`. Implementer must verify zero italic rules.

**Type consistency** — `openFileInto`, `closeFile`, `setActiveFile` signatures consistent across `files.js`, `main.js`, `palette.js` actions. Store API (`addFile`, `removeFile`, `setActive`, `setResult`, `setBusy`, `setPaletteOpen`, `setPage`, `setPageSize`) matches between `store.js` definition and consumers in `main.js` / `rail.js` / `result.js` / `status.js` / `palette.js`. The `summary` Map field is added to FileRecord in Task 4.1; rail.js consumes it in the same task.

**Open question carried from spec §11**: Column-click is implemented as inserting `SELECT col FROM …` (Task 4.2) — DESIGN.md §11 question 2 leaned this way. If you want clipboard or popover, swap the handler in main.js mountRail call.

---

## Open questions still unresolved (need user call before/during implementation)

1. **Recents click behavior (DESIGN.md §11 q1):** Plan ships read-only recents — clicking a recent does nothing (the list is informational). To make it interactive needs the File System Access API (Chromium-only). Confirm read-only is OK for v1.
2. **Numeric column accent (DESIGN.md §11 q4):** Plan keeps colored amber `#` icon. To go pure monochrome, change the `.rail .col .ico.n` color rule in `styles.css` from `var(--num)` to `var(--ink-2)`.
3. **Sample button removed:** The DuckDB-style approach is to discover queries via ⌘K rather than a separate "Sample" tab. Plan removes the existing Sample button. Confirm OK; if not, add a "Sample" tab to editor.js in Phase 5.
