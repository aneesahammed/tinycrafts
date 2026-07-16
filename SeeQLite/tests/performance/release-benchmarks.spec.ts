import { expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import budgets from './budgets.json' with { type: 'json' };
import { createLargeDatabase, LARGE_DATABASE_SIZES_MIB, removeLargeDatabaseDirectory, type LargeDatabaseFixture } from './helpers/large-db-fixture';

type BudgetProfile = keyof typeof budgets.profiles;
type EngineBudget = (typeof budgets.profiles)[BudgetProfile]['engines'][keyof (typeof budgets.profiles)[BudgetProfile]['engines']];

function environmentProfile(): BudgetProfile {
  const override = process.env.SEEQLITE_PERF_PROFILE as BudgetProfile | undefined;
  if (override) return override;
  const memoryGiB = Math.round(os.totalmem() / 1024 ** 3);
  if (process.platform === 'darwin' && process.arch === 'arm64' && memoryGiB >= 60 && memoryGiB <= 68) return 'local-darwin-arm64-64g-headless';
  throw new Error('No environment-qualified SeeQLite performance profile. Set SEEQLITE_PERF_PROFILE only after adding a qualified budgets.json entry.');
}

function elapsed(started: number) {
  return Math.round(performance.now() - started);
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

let fixtureDirectory = '';
const fixtures = new Map<number, LargeDatabaseFixture>();

test.beforeAll(async () => {
  fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'seeqlite-performance-'));
  for (const sizeMiB of LARGE_DATABASE_SIZES_MIB) fixtures.set(sizeMiB, await createLargeDatabase(fixtureDirectory, sizeMiB));
});

test.afterAll(async () => {
  await removeLargeDatabaseDirectory(fixtureDirectory);
});

for (const sizeMiB of LARGE_DATABASE_SIZES_MIB) {
  test(`measures ${sizeMiB} MiB import, cancel/reopen, reimport, and query recovery`, async ({ page }, testInfo) => {
    const profile = environmentProfile();
    const engine = testInfo.project.name as keyof (typeof budgets.profiles)[BudgetProfile]['engines'];
    const profileBudgets = budgets.profiles[profile];
    const budget = profileBudgets?.engines[engine] as EngineBudget | undefined;
    if (!budget) throw new Error(`No budget for profile ${profile} and engine ${engine}.`);
    const fixture = fixtures.get(sizeMiB);
    if (!fixture) throw new Error(`Missing generated ${sizeMiB} MiB fixture.`);
    const input = page.locator('input[type="file"]');

    await page.goto('/');
    let started = performance.now();
    await input.setInputFiles(fixture.path);
    await expect(page.locator('.file-status')).toContainText('1 table ready');
    const openMs = elapsed(started);
    await expect(page.locator('.table-list-item')).toHaveCount(1);

    await page.getByLabel('SQL query').fill('SELECT length(data) AS payload_bytes FROM payload;');
    started = performance.now();
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result-panel')).toContainText(String(fixture.payloadBytes));
    const queryMs = elapsed(started);
    expect(await page.locator('.result-panel tbody tr').count()).toBeLessThanOrEqual(profileBudgets.hardLimits.maxResultRowsInDom);

    await page.getByLabel('SQL query').fill('WITH RECURSIVE spin(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM spin WHERE n < 1000000000) SELECT count(*) FROM spin;');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.getByRole('button', { name: 'Stop running query' })).toBeVisible();
    started = performance.now();
    await page.getByRole('button', { name: 'Stop running query' }).click();
    await expect(page.locator('.file-status')).toContainText('Query stopped. Reopen the database to continue.');
    const cancelAckMs = elapsed(started);

    started = performance.now();
    await page.getByRole('button', { name: 'Reopen database' }).click();
    await expect(page.locator('.file-status')).toContainText('1 table ready');
    const reopenMs = elapsed(started);

    started = performance.now();
    await input.setInputFiles(fixture.path);
    await expect(page.locator('.file-status')).toContainText('1 table ready');
    const reimportMs = elapsed(started);
    await page.getByLabel('SQL query').fill('SELECT 1 AS ready;');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result-panel')).toContainText('ready');

    const metrics = { profile, engine, sizeMiB, bytes: fixture.bytes, openMs, queryMs, cancelAckMs, reopenMs, reimportMs };
    console.log(`SEEQLITE_PERF ${JSON.stringify(metrics)}`);
    await testInfo.attach(`performance-${sizeMiB}MiB.json`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });

    expect(openMs).toBeLessThanOrEqual(budget.openMs);
    expect(reopenMs).toBeLessThanOrEqual(budget.reopenMs);
    expect(reimportMs).toBeLessThanOrEqual(budget.reimportMs);
    expect(queryMs).toBeLessThanOrEqual(budget.queryMs);
    expect(cancelAckMs).toBeLessThanOrEqual(profileBudgets.hardLimits.cancelAckMs);
    expect(await page.locator('.table-list-item').count()).toBeLessThanOrEqual(profileBudgets.hardLimits.maxVisibleCatalogRows);
  });
}
