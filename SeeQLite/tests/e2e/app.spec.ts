import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

test('opens a local database and renders a bounded query result', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See what’s inside.' })).toBeVisible();

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
  await expect(page.locator('.table-explorer')).toContainText('1 of 2 objects');
  await search.fill('user_id');
  await expect(page.locator('.table-list-item')).toHaveCount(1);
  await expect(page.locator('.table-list-item')).toContainText('notes');
  await search.fill('does-not-exist');
  await expect(page.locator('.table-list-item')).toHaveCount(0);
  await expect(page.locator('.catalog-empty')).toContainText('No objects match');
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

test('shows the catalog as a relationship diagram and can target a table', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(2);
  await page.getByRole('tab', { name: /Diagram/ }).click();
  await expect(page.getByRole('region', { name: 'Entity relationship diagram' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('FOREIGN KEY · MANY → ONE');
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('user_id references id');
  await expect(page.locator('.diagram-card')).toHaveCount(2);
  await page.locator('.diagram-card').filter({ hasText: 'users' }).click();
  await expect(page.getByLabel('SQL query')).toHaveText('SELECT * FROM "users" LIMIT 100;');
  await page.getByRole('button', { name: 'Copy SELECT' }).click();
  await expect(page.locator('.copy-status')).toContainText('Copied a safe SELECT statement');
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
  await expect(page.getByRole('button', { name: 'Reset workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset workspace' }).click();
  await expect(page.locator('.file-status')).toContainText('No database open');
  await expect(page.getByRole('button', { name: 'Run query' })).toBeDisabled();
});

test('shows a read-only query plan, exports the result, and keeps bounded history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByLabel('SQL query').fill('SELECT email FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ada@example.test');

  await page.getByRole('button', { name: 'Show query plan' }).click();
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
  await page.getByRole('button', { name: 'Show query plan' }).click();
  await expect(page.getByRole('list', { name: 'SQLite query plan' })).toContainText('SCAN');
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
  await page.locator('.diagram-card').filter({ hasText: 'users' }).click();
  const darkDetailsViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(darkDetailsViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.waitForTimeout(250);
  const lightDetailsViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(lightDetailsViolations).toEqual([]);
});
