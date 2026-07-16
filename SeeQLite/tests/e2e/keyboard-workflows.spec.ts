import { expect, test } from '@playwright/test';

test('completes the primary workflow without pointer-only actions', async ({ page }) => {
  await page.goto('/');

  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();

  const sample = page.getByRole('button', { name: 'Try sample database' });
  await sample.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Run readiness check' })).toBeVisible();

  const editor = page.getByLabel('SQL query');
  await editor.fill('SELECT email FROM users;');
  await editor.focus();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.result-panel')).toContainText('ada@example.test');
  await expect(editor).toBeFocused();

  const plan = page.getByRole('button', { name: 'Show query plan' });
  await plan.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'SQLite query plan' })).toContainText('SCAN');

  const diagram = page.getByRole('tab', { name: /Diagram/ });
  await diagram.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('FOREIGN KEY');

  const join = page.getByRole('button', { name: 'Generate join from notes to users' });
  const dialog = page.waitForEvent('dialog').then(async (event) => {
    await event.accept();
  });
  await join.focus();
  await page.keyboard.press('Enter');
  await dialog;
  await expect(page.getByRole('tab', { name: 'Query' })).toHaveAttribute('aria-selected', 'true');

  const csv = page.getByRole('button', { name: 'Download CSV' });
  const download = page.waitForEvent('download');
  await csv.focus();
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('seeqlite-result.csv');

  const history = page.locator('summary').filter({ hasText: 'Query history' });
  await history.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.history-list')).toContainText('SELECT email FROM users;');

  const theme = page.getByRole('button', { name: 'Switch to dark theme' });
  await theme.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
});
