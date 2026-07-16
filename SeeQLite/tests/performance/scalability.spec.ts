import { expect, test } from '@playwright/test';
import budgets from './budgets.json' with { type: 'json' };
import { CATALOG_DATABASE_SIZES_MIB, createCatalogDatabase, removeLargeDatabaseDirectory, type CatalogDatabaseFixture } from './helpers/large-db-fixture';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const limitedFixture = path.join(process.cwd(), 'tests/fixtures/limited.sqlite');
const smokeFixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

function currentProfile() {
  const memoryGiB = Math.round(os.totalmem() / 1024 ** 3);
  if (process.platform === 'darwin' && process.arch === 'arm64' && memoryGiB >= 60 && memoryGiB <= 68) return budgets.profiles['local-darwin-arm64-64g-headless'];
  throw new Error('No environment-qualified SeeQLite catalog performance profile.');
}

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

test.describe('25/50 MiB catalog matrix', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  let fixtureDirectory = '';
  const fixtures = new Map<number, CatalogDatabaseFixture>();

  test.beforeAll(async () => {
    fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'seeqlite-catalog-performance-'));
    for (const sizeMiB of CATALOG_DATABASE_SIZES_MIB) fixtures.set(sizeMiB, await createCatalogDatabase(fixtureDirectory, sizeMiB));
  });

  test.afterAll(async () => {
    await removeLargeDatabaseDirectory(fixtureDirectory);
  });

  for (const sizeMiB of CATALOG_DATABASE_SIZES_MIB) {
    test(`opens an exact ${sizeMiB} MiB oversized catalog without unbounded rendering`, async ({ page }, testInfo) => {
      const profile = currentProfile();
      const budget = profile.engines[testInfo.project.name as keyof typeof profile.engines];
      const fixture = fixtures.get(sizeMiB);
      if (!budget || !fixture) throw new Error(`Missing catalog budget or fixture for ${testInfo.project.name}/${sizeMiB} MiB.`);

      await page.goto('/');
      const started = performance.now();
      await page.locator('input[type="file"]').setInputFiles(fixture.path);
      await expect(page.locator('.file-status')).toContainText('Catalog limited');
      const catalogOpenMs = Math.round(performance.now() - started);
      await expect(page.locator('.catalog-limit')).toContainText('objects capped at 5,000');
      await expect(page.getByRole('tab', { name: /Diagram/ })).toBeDisabled();
      await expect(page.locator('.table-list-item')).toHaveCount(100);
      expect(await page.locator('.table-list-item').count()).toBeLessThanOrEqual(profile.hardLimits.maxVisibleCatalogRows);

      await page.getByLabel('SQL query').fill('SELECT 1 AS ready;');
      await page.getByRole('button', { name: 'Run query' }).click();
      await expect(page.locator('.result-panel')).toContainText('ready');
      console.log(`SEEQLITE_CATALOG_PERF ${JSON.stringify({ engine: testInfo.project.name, sizeMiB, bytes: fixture.bytes, catalogOpenMs })}`);
      expect(catalogOpenMs).toBeLessThanOrEqual(budget.catalogOpenMs);
    });
  }
});
