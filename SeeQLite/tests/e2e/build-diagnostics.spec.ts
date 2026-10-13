import { expect, test } from '@playwright/test';

test('shows the active build in the footer in both themes', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toHaveText(/^Build [0-9a-f]{10}$/);
  const label = await footer.textContent();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(footer).toHaveText(label!);
  await page.reload();
  await expect(footer).toHaveText(label!);
});

test('logs a failed SQL editor import with the active build ID', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4174/', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/assets/SqlEditor-*.js', (route) => route.fulfill({ status: 404 }));

  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  const buildId = (await page.getByRole('contentinfo').textContent())?.replace(/^Build /, '');
  expect(buildId).toBeTruthy();
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await expect.poll(() => errors.some((message) => message.includes(`[SeeQLite build ${buildId}] SQL editor module failed to load.`))).toBe(true);
  await context.close();
});

test('logs service worker registration failure with the active build ID', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', {
      value: () => Promise.reject(new DOMException('blocked by policy', 'SecurityError')),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  const buildId = (await page.getByRole('contentinfo').textContent())?.replace(/^Build /, '');
  expect(buildId).toBeTruthy();
  await expect.poll(() => errors.some((message) => message.includes(`[SeeQLite build ${buildId}] Service worker registration failed.`))).toBe(true);
});
