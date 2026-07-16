# SeeQLite browser fixtures

These files contain synthetic data only.

- `smoke.sqlite` is generated from `smoke.sql` with `sqlite3 smoke.sqlite < smoke.sql`.
- `malformed.sqlite` is generated from `malformed.sql` with `sqlite3 malformed.sqlite < malformed.sql`.
- `virtual.sqlite` is generated from `virtual.sql` and covers an FTS5 virtual table plus its SQLite shadow tables. It verifies that the virtual object remains visible while shadow metadata is opt-in.
- `hostile.sqlite` is generated from `hostile.sql` and uses an HTML-like identifier to prove catalog and query-plan text stays inert when rendered.
- `identifiers.sqlite` is generated from `identifiers.sql` and covers a keyword, embedded quote, dotted name, and Unicode identifier for centralized quoting tests.
- `wide-catalog.sqlite` contains 26 tables with 2,000 columns each (52,000 catalog columns including the schema row). It is generated with the same Node/sqlite3 pipeline used by the boundary test:

  ```sh
  node --input-type=module -e "console.log('PRAGMA journal_mode=OFF;'); console.log('PRAGMA synchronous=OFF;'); for (let table = 0; table < 26; table += 1) { const columns = Array.from({ length: 2000 }, (_, column) => \`c_\${String(column).padStart(4, '0')} TEXT\`).join(','); console.log(\`CREATE TABLE wide_\${String(table).padStart(2, '0')} (\${columns});\`); }" | sqlite3 wide-catalog.sqlite
  ```
- `relationships.sqlite` is generated from `relationships.sql` and covers composite implicit-parent keys, parallel foreign keys, a self-link, and an unresolved parent.
- `limited.sqlite` contains 5,001 user tables (`t_0000` through `t_5000`) plus SQLite's main schema object. It is generated with:

  ```sh
  node --input-type=module -e "console.log('PRAGMA journal_mode=OFF;'); console.log('PRAGMA synchronous=OFF;'); for (let i = 0; i < 5001; i += 1) console.log(\`CREATE TABLE t_\${String(i).padStart(4, '0')} (id INTEGER);\`);" | sqlite3 limited.sqlite
  ```

The committed binaries are the exact browser inputs used by the Playwright real-WASM tests.
