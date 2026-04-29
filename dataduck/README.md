# DataDuck

A minimal local-first Parquet and CSV viewer PWA powered by DuckDB-WASM.

## What it does

- Opens local `.parquet`, `.parq`, and `.csv` files
- Registers the file with DuckDB-WASM in the browser
- Creates virtual tables named after each file, plus `active_file` and legacy `parquet_file` aliases
- Shows file facts, schema, Parquet metadata where available, and query results
- Runs SQL queries against the file
- Answers questions about the active file with Ask DataDuck, an optional BYOK assistant for Claude or Groq
- Exports the current result set to CSV
- Works as an installable PWA after the first successful load

No backend is required. Files are not uploaded.

## Project structure

```text
/dataduck
  index.html
  styles.css
  app.js
  sw.js
  manifest.json
  vite.config.js
  package.json
  icon.svg
  icon-192.png
  icon-512.png
```

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

## Build

```bash
npm run build
npm run preview
```

The production output is generated in:

```text
dist/
```

## Deploy under TinyCrafts

The Vite base is set to `./`, so the built app can be hosted under a subpath such as:

```text
https://tinycrafts.ai/dataduck/
```

The repository deploys through GitHub Actions. The Pages workflow runs the shared site builder from the repository root:

```bash
node scripts/build-pages.mjs
node scripts/verify-pages-build.mjs
```

That builds DataDuck and publishes the generated `dist/` contents into `dataduck/` inside the Pages artifact. Do not commit `dist/` directly.

## Default SQL

```sql
SELECT *
FROM active_file
LIMIT 500;
```

Useful queries:

```sql
DESCRIBE SELECT *
FROM active_file;
```

```sql
SUMMARIZE active_file;
```

Parquet-only metadata queries:

```sql
SELECT *
FROM parquet_file_metadata('your_registered_file.parquet');
```

```sql
SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count
FROM parquet_metadata('your_registered_file.parquet')
LIMIT 100;
```

The legacy `parquet_file` alias still follows the active file for existing queries. CSV files use DuckDB's auto-detected reader by default. If DuckDB cannot read an inferred CSV type, reopen the file as text columns from the recovery toast.

## Ask DataDuck AI analyst

Ask DataDuck is an optional browser-side assistant for the active CSV or Parquet file. It uses a user-provided Claude or Groq API key to choose a structured analysis tool plan. DataDuck validates that plan, compiles engine-owned SQL against `active_file`, executes it locally in DuckDB-WASM, and renders one or more local analysis artifacts in the browser.

The v1 tool catalog is deliberately bounded:

- `profile_overview` summarizes data health from existing rail/profile metadata.
- `missingness` ranks columns by null count and null percentage.
- `top_n` groups one dimension by one aggregate metric, defaulting to top 10.
- `aggregate_query` covers general single-table aggregate questions.
- `histogram` uses fixed-width bins, default 20 and max 50.
- `trend` requires a real DuckDB temporal column; string-date casting is not automatic.
- `outliers` uses Tukey IQR bounds.
- `correlation` uses Pearson correlation with pairwise null exclusion.

Privacy defaults:

- Source file rows are not sent to the selected AI provider.
- Current query result rows are not sent to the selected AI provider by default.
- Prompt context contains schema/profile metadata only. Local file names, virtual table names, dataset fingerprints, SQL, source rows, current result rows, API keys, top values, and text/blob/list/struct min/max values are excluded.
- For wide schemas, prompts include all columns only up to 120 columns and 24,000 serialized characters. Wider files use deterministic question/column token overlap to send at most 40 relevant columns; if none match, Ask DataDuck asks the user to name columns before calling the provider.
- Follow-up memory is limited to same-dataset tool metadata and excludes sensitive column-name patterns such as `ssn`, `salary`, `patient`, `token`, `key`, `password`, and `account_id`.
- Claude planner calls use Anthropic Messages tool calling with forced `tool_choice`. The provider-facing compact JSON Schema is derived from the strict analysis tool-plan schema, and DataDuck still validates the returned tool input against the strict schema before compiling SQL.
- Claude planner calls use Anthropic's 5-minute ephemeral prompt caching for the static system and dataset context. The dynamic question stays outside the cached block.
- Optional aggregate summaries require an explicit confirmation and send only the capped aggregate result preview shown in the assistant.
- Thread history stores sanitized v2 analysis records. Runtime artifacts can hold the local result rows needed to render the active answer; persisted artifacts keep summaries, chart metadata, row counts, and a capped preview of 20 rows, 8 columns, and 160 characters per cell.
- API keys are never stored in localStorage. "Remember key" is off by default; when enabled, each provider key is stored only in this browser using WebCrypto and IndexedDB. Legacy Groq-only key rows are migrated to provider-scoped storage when remembering is enabled and cleaned when remembering is disabled. This protects against casual storage inspection, not same-origin script compromise.
- Claude direct browser calls include Anthropic's `anthropic-dangerous-direct-browser-access` header. That header acknowledges the explicit BYOK design: the user's browser calls Anthropic directly, with no DataDuck proxy.

Limitations in v1:

- Only the active file is analyzed.
- Joins and multi-file analysis are not generated by the assistant.
- Multi-step plans are independent artifacts only; one step cannot reference another step's output in v1.
- The AI provider never returns executable SQL; DataDuck compiles SQL from a validated plan.
- OpenAI and OpenRouter adapters are not included in this phase; the provider adapter layer is structured so those can be added without changing the assistant settings shape.
- Live provider contract tests are manual BYOK smoke tests rather than CI tests because the project does not ship provider API keys.
- Streaming responses are deferred because planner calls need complete JSON.
- CSV files reopened as all-text columns do not get silent numeric casts. Ask DataDuck will request clarification for numeric analysis on text columns.

## Notes

- Browser memory is still the hard limit. Keep preview queries limited for large files.
- CSV files over 50 MB open without eager column statistics; run `SUMMARIZE` manually when needed.
- The dependency uses DuckDB-WASM `1.30.0` exactly to avoid pulling unexpected dev or compromised versions.
- Vite `8.0.10` requires Node.js `20.19.0` or newer.
