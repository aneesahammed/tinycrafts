import { expect, test } from '@playwright/test';
import path from 'node:path';

const limitedFixture = path.join(process.cwd(), 'tests/fixtures/limited.sqlite');
const smokeFixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

test('keeps limited catalogs and result pages structurally bounded', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(limitedFixture);
  await expect(page.locator('.file-status')).toContainText('Catalog limited');
  await expect(page.locator('.table-list-item')).toHaveCount(100);
  await expect(page.getByRole('tab', { name: /Diagram/ })).toBeDisabled();

  await page.getByLabel('SQL query').fill('SELECT 1 AS ready;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('ready');
  expect(await page.locator('.table-list-item').count()).toBeLessThanOrEqual(100);
});

test('renders at most one result page in the DOM while retaining the bounded result model', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(smokeFixture);
  await expect(page.locator('.file-status')).toContainText('2 tables ready');
  await page.getByLabel('SQL query').fill('WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 1000) SELECT value FROM n;');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.result-panel')).toContainText('1–50 of 1000 returned rows');
  expect(await page.locator('.result-panel tbody tr').count()).toBeLessThanOrEqual(50);
});
