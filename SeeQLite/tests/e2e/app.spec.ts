import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');
const malformedFixture = path.join(process.cwd(), 'tests/fixtures/malformed.sqlite');
const limitedFixture = path.join(process.cwd(), 'tests/fixtures/limited.sqlite');
const virtualFixture = path.join(process.cwd(), 'tests/fixtures/virtual.sqlite');
const exoticFixture = path.join(process.cwd(), 'tests/fixtures/exotic.sqlite');
const hostileFixture = path.join(process.cwd(), 'tests/fixtures/hostile.sqlite');
const wideCatalogFixture = path.join(process.cwd(), 'tests/fixtures/wide-catalog.sqlite');
const relationshipsFixture = path.join(process.cwd(), 'tests/fixtures/relationships.sqlite');
const identifiersFixture = path.join(process.cwd(), 'tests/fixtures/identifiers.sqlite');

test('opens a local database and renders a bounded query result', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open a SQLite database' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');

  await page.getByLabel('SQL query').fill('SELECT u.email, n.body, n.payload FROM users u JOIN notes n ON n.user_id = u.id;');
  await page.getByRole('button', { name: 'Run query' }).click();

  const results = page.locator('.result-panel');
  await expect(results).toContainText('ada@example.test');
  await expect(results).toContainText('first note');
  await expect(results).toContainText('BLOB · 2 bytes');
});

test('rejects mutation queries before they reach SQLite', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');

  await page.getByLabel('SQL query').fill('UPDATE users SET email = email;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.file-status')).toContainText('read-only');
});

test('rejects trailing statements instead of silently executing only the first one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT 1; SELECT 2;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.file-status')).toContainText('one read-only statement');
});

test('enforces the read-only policy for SQLite-native mutation paths', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  const query = page.getByLabel('SQL query');
  const run = page.getByRole('button', { name: 'Run query' });

  for (const { sql, message } of [
    { sql: 'WITH changed AS (SELECT 1) UPDATE users SET email = email;', message: 'read-only policy' },
    { sql: "SELECT load_extension('seeqlite-test');", message: 'SQLite could not run that query.' },
    { sql: 'PRAGMA writable_schema = ON;', message: 'read-only policy' },
  ]) {
    await query.fill(sql);
    await run.click();
    await expect(page.locator('.file-status')).toContainText(message);
    await expect(page.locator('.file-status')).not.toContainText('users');
  }

  await query.fill('SELECT ? AS parameter;');
  await run.click();
  await expect(page.locator('.file-status')).toContainText('Bind parameters are not supported');

  await query.fill('SELECT 1;');
  await run.click();
  await expect(page.locator('.result-panel')).toContainText('1');
});

test('opens the bundled sample and runs the fixed readiness check', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.locator('.file-status')).toContainText('sample.sqlite');
  await page.locator('.db-pill').click();
  await page.getByRole('button', { name: 'Run readiness check' }).click();
  await expect(page.locator('.result-panel')).toContainText('ready');
  await expect(page.locator('.result-panel')).toContainText('1');
  await expect(page.locator('.file-status')).toContainText('SQLite is ready');
});

test('searches tables and columns with explicit filtered and empty states', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  const search = page.getByLabel('Search tables and columns');
  await search.fill('notes');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await expect(page.locator('.catalog-rail')).toContainText('1 match');
  await search.fill('user_id');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await expect(page.locator('.table-list-item')).toContainText('notes');
  await search.fill('does-not-exist');
  await expect(page.locator('.table-list-item')).toHaveCount(0);
  await expect(page.locator('.catalog-empty')).toContainText('No objects match');
});

test('browses an Explorer object in one click while preserving a custom SQL draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT 1 AS draft;');

  await page.getByRole('button', { name: /users table/ }).click();
  await expect(page.getByLabel('SQL query')).toHaveText('SELECT * FROM "users" LIMIT 100;');
  await expect(page.getByRole('region', { name: 'users details' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Query results' })).toContainText('ada@example.test');
  await page.getByRole('button', { name: 'Restore SQL draft' }).click();
  await expect(page.getByLabel('SQL query')).toHaveText('SELECT 1 AS draft;');
  await expect(page.getByRole('region', { name: 'Query results' })).toContainText('Ready');
});

test('keeps SQLite internal objects hidden until explicitly requested', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  await expect(page.locator('.table-list-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Show internal objects' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Show internal objects' }).click();
  await expect(page.getByRole('button', { name: 'Hide internal objects' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.table-list-item')).toHaveCount(4);
  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /sqlite_schema/ }).click();
  await expect(page.getByRole('region', { name: 'sqlite_schema details' })).toContainText('INTERNAL');

  await page.getByRole('button', { name: /users table/ }).click();
  await expect(page.getByRole('region', { name: 'users details' })).toContainText('CREATE TABLE users');
  await expect(page.getByRole('region', { name: 'users details' })).toContainText('sqlite_autoindex_users_1');
  await expect(page.getByRole('region', { name: 'users details' })).toContainText('UNIQUE');
  await expect(page.getByRole('region', { name: 'users details' })).toContainText('users_email_lower_idx');
  await expect(page.getByRole('region', { name: 'users details' })).toContainText('expression');

  await page.getByRole('button', { name: /notes table/ }).click();
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('notes_body_partial_idx');
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('PARTIAL');
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('WHERE body IS NOT NULL');
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('body_length');
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('GENERATED STORED');
  await expect(page.getByRole('region', { name: 'notes details' })).toContainText('FK');

  await page.getByRole('button', { name: 'Hide internal objects' }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'notes details' })).toBeVisible();
});

test('keeps a malformed view isolated from healthy catalog objects', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(malformedFixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  await expect(page.locator('.table-list-item')).toHaveCount(4);

  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /settings table/ }).click();
  await expect(page.getByRole('region', { name: 'settings details' })).toContainText('WITHOUT ROWID');
  await expect(page.getByRole('region', { name: 'settings details' })).toContainText('STRICT');

  await page.getByRole('button', { name: /broken_view view/ }).click();
  await expect(page.getByRole('region', { name: 'broken_view details' })).toContainText('Column metadata could not be read');

  await page.getByRole('button', { name: /healthy table/ }).click();
  await expect(page.getByRole('region', { name: 'healthy details' })).toContainText('CREATE TABLE healthy');
  await expect(page.getByRole('region', { name: 'healthy details' })).toContainText('No explicit indexes');
});

test('represents virtual and shadow objects without losing the virtual table', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(virtualFixture);
  await expect(page.locator('.file-status')).toContainText('1 table ready');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /documents virtual/ })).toBeVisible();

  await page.getByRole('button', { name: /Show internal objects/ }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(7);
  await expect(page.getByRole('button', { name: /documents virtual/ })).toContainText('virtual');
  const shadow = page.getByRole('button', { name: /documents_config/ });
  await expect(shadow).toContainText('internal');
  await expect(shadow).toContainText('shadow');

  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /documents virtual/ }).click();
  await expect(page.getByRole('region', { name: 'documents details' })).toContainText('VIRTUAL');
  await expect(page.getByRole('region', { name: 'documents details' })).toContainText('title');
  await expect(page.getByRole('region', { name: 'documents details' })).toContainText('body');
});

test('keeps FTS4 and RTree virtual modules visible with bounded shadow metadata', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(exoticFixture);
  await expect(page.locator('.file-status')).toContainText('3 tables ready');
  await expect(page.locator('.table-list-item')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /points virtual/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /search4 virtual/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /points_archive table/ })).toBeVisible();

  await page.getByRole('button', { name: 'Show internal objects' }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(12);
  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /points virtual/ }).click();
  await expect(page.getByRole('region', { name: 'points details' })).toContainText('VIRTUAL');
  await expect(page.getByRole('region', { name: 'points details' })).toContainText('Column metadata could not be read');
  await page.getByRole('button', { name: /search4 virtual/ }).click();
  await expect(page.getByRole('region', { name: 'search4 details' })).toContainText('VIRTUAL');
  await expect(page.getByRole('region', { name: 'search4 details' })).toContainText('Column metadata could not be read');
});

test('opens an oversized catalog in bounded searchable mode', async ({ page }) => {
  await page.goto('/');
  const started = Date.now();
  await page.locator('input[type="file"]').setInputFiles(limitedFixture);
  await expect(page.locator('.file-status')).toContainText('Catalog limited');
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(page.locator('.catalog-limit')).toContainText('objects capped at 5,000');
  await expect(page.getByRole('tab', { name: /Diagram/ })).toBeDisabled();
  await expect(page.locator('.table-list-item')).toHaveCount(100);
  await expect(page.getByRole('navigation', { name: 'Catalog page controls' })).toContainText('Page 1 of 50');

  const detailStarted = Date.now();
  await page.getByLabel('Search tables and columns').fill('t_0999');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /t_0999 table/ }).click();
  await expect(page.getByRole('region', { name: 't_0999 details' })).toContainText('No explicit indexes');
  expect(Date.now() - detailStarted).toBeLessThan(2000);

  await page.getByRole('tab', { name: 'Query' }).click();
  await page.getByLabel('SQL query').fill('SELECT 1 AS ready;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ready');
  await expect(page.locator('.result-panel')).toContainText('1');
});

test('degrades only column metadata at the approved catalog-column boundary', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(wideCatalogFixture);
  await expect(page.locator('.file-status')).toContainText('26 tables ready');
  await expect(page.locator('.catalog-limit')).toContainText('columns capped at 50,000');
  await expect(page.locator('.catalog-limit')).not.toContainText('objects capped');
  await expect(page.getByRole('tab', { name: /Diagram/ })).toBeDisabled();

  await page.getByLabel('Search tables and columns').fill('wide_25');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: /wide_25 table/ }).click();
  await expect(page.getByRole('region', { name: 'wide_25 details' })).toContainText('Column metadata is limited by the browser catalog budget');

  await page.getByRole('tab', { name: 'Query' }).click();
  await page.getByLabel('SQL query').fill('SELECT 1 AS ready;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ready');

  await page.getByLabel('SQL query').fill('SELECT * FROM wide_00;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.file-status')).toContainText('browser safety limit');
});

test('provides a SQLite-aware editor with keyboard execution', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  const editor = page.getByLabel('SQL query');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill('SELECT email FROM users;');
  await editor.click();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.result-panel')).toContainText('ada@example.test');
});

test('shows the catalog as a relationship diagram and can select a table without leaving it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(2);
  await page.getByRole('tab', { name: /Diagram/ }).click();
  await expect(page.getByRole('region', { name: 'Entity relationship diagram' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('FOREIGN KEY · MANY → ONE');
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('user_id references id');
  await expect(page.locator('.er-node')).toHaveCount(2);
  await page.locator('.er-node').filter({ hasText: 'users' }).click();
  await expect(page.getByRole('tab', { name: /Diagram/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Schema' }).click();
  await page.getByRole('button', { name: 'Copy SELECT' }).click();
  await expect(page.locator('.copy-status')).toContainText('Copied a safe SELECT statement');
});

test('labels unresolved relationships and generates composite implicit-key joins', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(relationshipsFixture);
  await expect(page.locator('.file-status')).toContainText('4 tables ready');
  await page.getByRole('tab', { name: /Diagram/ }).click();
  const relationships = page.getByRole('region', { name: 'Declared relationships' });
  await expect(relationships).toContainText('4 declared');
  await expect(relationships).toContainText('RESOLVED');
  await expect(relationships).toContainText('UNRESOLVED');
  await expect(relationships).toContainText('ON UPDATE NO ACTION');
  await expect(relationships).toContainText('ON DELETE NO ACTION');
  await expect(relationships).toContainText('MATCH NONE');
  await expect(page.getByRole('button', { name: 'Generate join from unresolved to missing_parent' })).toBeDisabled();

  const dialog = page.waitForEvent('dialog').then(async (event) => {
    await event.accept();
  });
  await page.getByRole('button', { name: 'Generate join from child to parent' }).first().click();
  await dialog;
  await expect(page.getByLabel('SQL query')).toHaveText(/child\."parent_a" = parent\."part_a"\s+AND\s+child\."parent_b" = parent\."part_b"/);

  await page.getByRole('tab', { name: /Diagram/ }).click();
  const selfDialog = page.waitForEvent('dialog').then(async (event) => {
    await event.accept();
  });
  await page.getByRole('button', { name: 'Generate join from self_link to self_link' }).click();
  await selfDialog;
  await expect(page.getByLabel('SQL query')).toHaveText(/FROM "self_link" AS child\s*JOIN "self_link" AS parent/);
});

test('generates a quoted join only after confirming draft replacement', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByRole('tab', { name: /Diagram/ }).click();
  const dialog = page.waitForEvent('dialog').then(async (event) => {
    expect(event.message()).toContain('Replace the current SQL draft');
    await event.accept();
  });
  await page.getByRole('button', { name: 'Generate join from notes to users' }).click();
  await dialog;
  await expect(page.getByRole('tab', { name: 'Query' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('SQL query')).toHaveText(/SELECT \*\s*FROM "notes" AS child\s*JOIN "users" AS parent ON child\."user_id" = parent\."id";/);
});

test('keeps the current SQL draft when generated-join replacement is cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByRole('tab', { name: /Diagram/ }).click();
  const dialog = page.waitForEvent('dialog').then((event) => event.dismiss());
  await page.getByRole('button', { name: 'Generate join from notes to users' }).click();
  await dialog;
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toBeVisible();
  await page.getByRole('tab', { name: 'Query' }).click();
  await expect(page.getByLabel('SQL query')).toHaveText(/SELECT 1 AS ready/);
});

test('resets the worker-backed workspace without retaining the database view', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.locator('.db-pill').click();
  await expect(page.getByRole('button', { name: 'Close database' })).toBeVisible();
  await page.getByRole('button', { name: 'Close database' }).click();
  await expect(page.locator('.file-status')).toContainText('No database open');
    await expect(page.getByRole('heading', { name: 'Open a SQLite database' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run query' })).toHaveCount(0);
});

test('shows a read-only query plan, exports the result, and keeps bounded history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT email FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ada@example.test');

  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.locator('.plan-panel')).toContainText('SCAN');
  await expect(page.getByRole('list', { name: 'SQLite query plan' })).toContainText('SCAN');
  await expect(page.getByRole('list', { name: 'SQLite query plan' }).getByRole('listitem')).toHaveCount(1);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('seeqlite-result.csv');

  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const jsonPath = await (await jsonDownload).path();
  expect(jsonPath).toBeTruthy();
  const parsed = JSON.parse(await readFile(jsonPath!, 'utf8')) as { columns: string[]; rows: unknown[][]; truncated: boolean };
  expect(parsed.columns).toEqual(['email']);
  expect(parsed.rows[0]).toEqual(['ada@example.test']);
  expect(parsed.truncated).toBe(false);

  await page.getByText(/Query history/).click();
  await expect(page.locator('.history-list')).toContainText('SELECT email FROM users;');
});

test('plans an already-explained statement without nesting EXPLAIN', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('EXPLAIN QUERY PLAN SELECT email FROM users;');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('list', { name: 'SQLite query plan' })).toContainText('SCAN');
});

test('renders hostile query-plan detail as inert text', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(hostileFixture);
  await expect(page.locator('.file-status')).toContainText('1 table ready');
  await page.getByLabel('SQL query').fill('EXPLAIN QUERY PLAN SELECT * FROM "<img src=x onerror=alert(1)>";');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.locator('.plan-detail')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.plan-detail img')).toHaveCount(0);
});

test('quotes unusual catalog identifiers in bounded SELECT actions', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(identifiersFixture);
  await expect(page.locator('.file-status')).toContainText('4 tables ready');
  await page.getByLabel('Search tables and columns').fill('a"b');
  const table = page.getByRole('button', { name: /a"b table/ });
  await expect(table).toBeVisible();
  await table.click();
  await expect(page.getByLabel('SQL query')).toHaveText(/SELECT \* FROM "a""b" LIMIT 100;/);
  await expect(page.locator('.result-panel')).toContainText('7');
});

test('clears a stale plan when the SQL result changes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT email FROM users;');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.locator('.plan-panel')).toContainText('SCAN');

  await page.getByLabel('SQL query').fill('SELECT id FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('1');
  await expect(page.locator('.plan-panel')).toHaveCount(0);
});

test('keeps duplicate labels positional and neutralizes CSV formulas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill("SELECT '=1+1' AS value, 1 AS value;");
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('=1+1');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csvPath = await (await csvDownload).path();
  expect(await readFile(csvPath!, 'utf8')).toContain("'=1+1");

  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const jsonPath = await (await jsonDownload).path();
  const parsed = JSON.parse(await readFile(jsonPath!, 'utf8')) as { columns: string[]; rows: unknown[][] };
  expect(parsed.columns).toEqual(['value', 'value']);
  expect(parsed.rows).toEqual([['=1+1', 1]]);
});

test('registers the app shell without caching database files', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  })).toBe(true);
  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).map((request) => request.url);
  });
  expect(cachedUrls.some((url) => url.endsWith('.sqlite') || url.endsWith('.db'))).toBe(false);
});

test('reloads the complete shell offline without deleting sibling caches', async ({ page, browserName }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  })).toBe(true);
  await page.evaluate(async () => {
    const cache = await caches.open('dataduck-sentinel-v1');
    await cache.put('/dataduck/sentinel', new Response('keep sibling cache'));
  });

  if (browserName === 'webkit') {
    const cachedDocument = await page.evaluate(async () => {
      const response = await caches.match(location.href);
      return response ? response.text() : null;
    });
    expect(cachedDocument).toContain('SeeQLite');
  } else {
    await page.route('**/*', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Open a SQLite database' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open SQLite database' })).toBeVisible();
  }
  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys();
    const seeqliteKeys = keys.filter((key) => key.startsWith('seeqlite-'));
    const urls = (await Promise.all(seeqliteKeys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat();
    const sibling = await caches.match('/dataduck/sentinel');
    return { keys, urls, sibling: sibling ? await sibling.text() : null };
  });
  expect(cacheState.keys).toContain('dataduck-sentinel-v1');
  expect(cacheState.sibling).toBe('keep sibling cache');
  expect(cacheState.urls.some((url) => /\.(sqlite|sqlite3|db|wal|shm|journal)(?:$|\?)/i.test(url))).toBe(false);
});

test('keeps the worker and database workflow same-origin and non-isolated', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT email FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBeLessThanOrEqual(1);
});

test('keeps the narrow layout usable and preserves keyboard focus semantics', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('.skip-link').focus();
  await expect(page.getByRole('link', { name: 'Skip to workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-dark', '');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-dark');
});

test('blocks intake when a required browser capability is missing', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'Worker', { configurable: true, value: undefined }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Web Worker');
  await expect(page.getByRole('button', { name: 'Open SQLite database' })).toHaveCount(0);
});

test('keeps drag-and-drop intake single-file and non-destructive', async ({ page }) => {
  await page.goto('/');
  await page.locator('.open-zone').evaluate((zone) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['one'], 'one.sqlite'));
    transfer.items.add(new File(['two'], 'two.sqlite'));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.locator('.file-status')).toContainText('Drop one SQLite file at a time');
  await expect(page.locator('.file-status')).toContainText('No database open');
});

test('rejects SQLite sidecar files before opening them', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'sample.sqlite-wal', mimeType: 'application/octet-stream', buffer: Buffer.from('not a database') });
  await expect(page.locator('.file-status')).toContainText('sidecar files are not standalone databases');
  await expect(page.locator('.file-status')).toContainText('No database open');
});

test('has no serious or critical accessibility violations in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const lightViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(lightViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.waitForTimeout(250);
  const darkViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(darkViolations).toEqual([]);
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByRole('tab', { name: /Diagram/ }).click();
  const darkDiagramViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(darkDiagramViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.waitForTimeout(250);
  const lightDiagramViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(lightDiagramViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.waitForTimeout(250);
  await page.locator('.er-node').filter({ hasText: 'users' }).click();
  const darkDetailsViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(darkDetailsViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.waitForTimeout(250);
  const lightDetailsViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(lightDetailsViolations).toEqual([]);
});

test('keeps the primary workflow usable in forced colors and 200% zoom', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('heading', { name: 'Open a SQLite database' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open SQLite database' })).toBeVisible();
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.getByRole('button', { name: 'Run query' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth * 2)).toBe(true);
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(violations).toEqual([]);
});
