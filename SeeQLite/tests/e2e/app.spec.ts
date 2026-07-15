import { expect, test } from '@playwright/test';
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

test('opens the bundled sample and runs the fixed readiness check', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.locator('.file-status')).toContainText('sample.sqlite');
  await page.getByRole('button', { name: 'Run readiness check' }).click();
  await expect(page.locator('.result-panel')).toContainText('ready');
  await expect(page.locator('.result-panel')).toContainText('1');
  await expect(page.locator('.file-status')).toContainText('SQLite is ready');
});

test('shows the catalog as a relationship diagram and can target a table', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect(page.locator('.table-list-item')).toHaveCount(2);
  await page.getByRole('tab', { name: /Diagram/ }).click();
  await expect(page.getByRole('region', { name: 'Entity relationship diagram' })).toBeVisible();
  await expect(page.locator('.diagram-card')).toHaveCount(2);
  await page.getByRole('button', { name: /users table/ }).click();
  await expect(page.getByLabel('SQL query')).toHaveValue('SELECT * FROM "users" LIMIT 100;');
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

  await page.getByText(/Query history/).click();
  await expect(page.locator('.history-list')).toContainText('SELECT email FROM users;');
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
