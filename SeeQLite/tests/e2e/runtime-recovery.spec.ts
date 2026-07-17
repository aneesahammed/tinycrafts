import { expect, test } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174/';

test('retries SQLite initialization after a transient WASM download interruption', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox does not route the worker XHR fallback through Playwright interception.');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  let wasmRequests = 0;
  await context.route('**/*.wasm', async (route) => {
    wasmRequests += 1;
    if (wasmRequests <= 4) await route.abort('connectionreset');
    else await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();

  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  expect(wasmRequests).toBeGreaterThanOrEqual(3);
  await context.close();
});

test('explains a persistent SQLite runtime download failure and offers retry', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox does not route the worker XHR fallback through Playwright interception.');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await context.route('**/*.wasm', (route) => route.abort('connectionreset'));

  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();

  await expect(page.getByRole('status')).toContainText('SQLite runtime download was interrupted');
  await expect(page.getByRole('button', { name: 'Retry opening database' })).toBeVisible();
  await context.close();
});
