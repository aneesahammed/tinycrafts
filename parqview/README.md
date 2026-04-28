# ParqView

A minimal local-first Parquet and CSV viewer PWA powered by DuckDB-WASM.

## What it does

- Opens local `.parquet`, `.parq`, and `.csv` files
- Registers the file with DuckDB-WASM in the browser
- Creates virtual tables named after each file, plus `active_file` and legacy `parquet_file` aliases
- Shows file facts, schema, Parquet metadata where available, and query results
- Runs SQL queries against the file
- Exports the current result set to CSV
- Works as an installable PWA after the first successful load

No backend is required. Files are not uploaded.

## Project structure

```text
/parquet-viewer
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
https://tinycrafts.ai/parqview/
```

The repository deploys through GitHub Actions. The Pages workflow runs the shared site builder from the repository root:

```bash
node scripts/build-pages.mjs
node scripts/verify-pages-build.mjs
```

That builds ParqView and publishes the generated `dist/` contents into `parqview/` inside the Pages artifact. Do not commit `dist/` directly.

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

## Notes

- Browser memory is still the hard limit. Keep preview queries limited for large files.
- CSV files over 50 MB open without eager column statistics; run `SUMMARIZE` manually when needed.
- The dependency uses DuckDB-WASM `1.30.0` exactly to avoid pulling unexpected dev or compromised versions.
- Vite `8.0.10` requires Node.js `20.19.0` or newer.
