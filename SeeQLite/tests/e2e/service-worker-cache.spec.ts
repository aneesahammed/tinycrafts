import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

test('precaches the lazy SQL editor before opening a database', async ({ page }) => {
  await page.goto('/');
  const cachedUrls = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const cacheName = (await caches.keys()).find((key) => key.startsWith('seeqlite-'));
    if (!cacheName) return [];
    return (await (await caches.open(cacheName)).keys()).map((request) => request.url);
  });

  expect(cachedUrls.some((url) => /\/assets\/SqlEditor-[^/]+\.js$/.test(url))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.route('**/assets/SqlEditor-*.js', (route) => route.fulfill({ status: 404 }));
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  await page.getByLabel('SQL query').fill('SELECT email FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ada@example.test');
});
