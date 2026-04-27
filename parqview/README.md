# ParqView

A minimal local-first Parquet viewer PWA powered by DuckDB-WASM.

## What it does

- Opens local `.parquet` and `.parq` files
- Registers the file with DuckDB-WASM in the browser
- Creates a virtual table named `parquet_file`
- Shows file facts, schema, metadata, row groups, and preview rows
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
FROM parquet_file
LIMIT 500;
```

Useful queries:

```sql
DESCRIBE SELECT *
FROM parquet_file;
```

```sql
SUMMARIZE parquet_file;
```

```sql
SELECT *
FROM parquet_file_metadata('your_registered_file.parquet');
```

```sql
SELECT row_group_id, path_in_schema, compression, stats_min, stats_max, stats_null_count
FROM parquet_metadata('your_registered_file.parquet')
LIMIT 100;
```

Use the Sample button after opening a file to insert these queries with the correct registered filename.

## Notes

- Browser memory is still the hard limit. Keep preview queries limited for large files.
- The dependency uses DuckDB-WASM `1.30.0` exactly to avoid pulling unexpected dev or compromised versions.
- Vite `8.0.10` requires Node.js `20.19.0` or newer.
