# SeeQLite browser fixtures

These files contain synthetic data only.

- `smoke.sqlite` is generated from `smoke.sql` with `sqlite3 smoke.sqlite < smoke.sql`.
- `malformed.sqlite` is generated from `malformed.sql` with `sqlite3 malformed.sqlite < malformed.sql`.
- `limited.sqlite` contains 1,001 user tables (`t_0000` through `t_1000`) plus SQLite's main schema object. It is generated with:

  ```sh
  node --input-type=module -e "console.log('PRAGMA journal_mode=OFF;'); console.log('PRAGMA synchronous=OFF;'); for (let i = 0; i < 1001; i += 1) console.log(\`CREATE TABLE t_\${String(i).padStart(4, '0')} (id INTEGER);\`);" | sqlite3 limited.sqlite
  ```

The committed binaries are the exact browser inputs used by the Playwright real-WASM tests.
