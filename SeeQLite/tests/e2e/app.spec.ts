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
  await expect(page.locator('.diagram-card')).toHaveCount(2);
  await page.getByRole('button', { name: /users table/ }).click();
  await expect(page.getByLabel('SQL query')).toHaveText('SELECT * FROM "users" LIMIT 100;');
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

test('has no serious or critical accessibility violations in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const lightViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(lightViolations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.waitForTimeout(250);
  const darkViolations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(darkViolations).toEqual([]);
});
