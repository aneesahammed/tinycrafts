import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

test('opens a WAL-mode main database file without changing the source bytes', async ({ page }) => {
  const bytes = Buffer.from(await readFile(fixture));
  bytes[18] = 2;
  bytes[19] = 2;

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'wal.sqlite', mimeType: 'application/vnd.sqlite3', buffer: bytes });
  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  await expect(page.locator('.wal-notice')).toContainText('changes held only in a separate WAL file are not included');
  await page.getByLabel('SQL query').fill('SELECT count(*) AS total FROM users;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('total');
  await expect(page.locator('.wal-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('.wal-notice')).toBeVisible();
  const sourceHeader = await page.locator('input[type="file"]').evaluate(async (input) =>
    [...new Uint8Array(await (input as HTMLInputElement).files![0].arrayBuffer()).slice(18, 20)],
  );
  expect(sourceHeader).toEqual([2, 2]);

  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.wal-notice')).toHaveCount(0);
});
