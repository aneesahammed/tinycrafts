import { expect, test } from '@playwright/test';
import path from 'node:path';

const relationshipsFixture = path.join(process.cwd(), 'tests/fixtures/relationships.sqlite');
const mixedObjectsFixture = path.join(process.cwd(), 'tests/fixtures/malformed.sqlite');

test('routes relationships with cardinality and selected column mappings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample database' }).click();
  await page.getByRole('tab', { name: /Diagram/ }).click();

  await expect(page.getByLabel('Relationship cardinality legend')).toContainText('N child');
  await expect(page.getByLabel('Relationship cardinality legend')).toContainText('1 parent');
  await expect(page.locator('.er-edge-line')).toHaveCount(1);
  expect(await page.locator('.er-edge-line').getAttribute('d')).toContain('Q');
  await expect(page.locator('.er-cardinality-from')).toHaveText('N');
  await expect(page.locator('.er-cardinality-to')).toHaveText('1');

  await page.locator('.er-node').filter({ hasText: 'users' }).click();
  await expect(page.locator('.er-edge-label')).toHaveText('user_id → id');

  await page.getByRole('button', { name: /^Views/ }).click();
  await expect(page.locator('.er-node')).toHaveCount(0);
  await expect(page.locator('.er-edge')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Declared relationships' })).toContainText('No declared foreign keys');
  await page.getByRole('button', { name: /^Tables/ }).click();
  await expect(page.locator('.er-node')).toHaveCount(2);
  await expect(page.locator('.er-edge')).toHaveCount(1);
});

test('consolidates duplicate constraints and routes self references as loops', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(relationshipsFixture);
  await page.getByRole('tab', { name: /Diagram/ }).click();

  await expect(page.locator('.er-edge[data-constraint-count="2"]')).toHaveCount(1);
  await expect(page.locator('.er-edge[data-self-relation="true"]')).toHaveCount(1);
  expect(await page.locator('.er-edge[data-self-relation="true"] .er-edge-line').getAttribute('d')).toContain('Q');

  await page.locator('.er-node').filter({ hasText: 'self_link' }).click();
  await expect(page.locator('.er-edge[data-self-relation="true"] .er-edge-label')).toHaveText('parent_id → id');
});

test('filters all objects, tables, and views and preserves the choice across tabs', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(mixedObjectsFixture);
  await page.getByRole('tab', { name: /Diagram/ }).click();

  const filter = page.getByRole('group', { name: 'Diagram objects' });
  await expect(filter.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.er-node')).toHaveCount(4);

  await filter.getByRole('button', { name: /^Views/ }).click();
  await expect(filter.getByRole('button', { name: /^Views/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.er-node')).toHaveCount(2);
  expect(await page.locator('.er-node-kind').allTextContents()).toEqual(['view', 'view']);

  await page.getByRole('tab', { name: 'Query' }).click();
  await page.getByRole('tab', { name: /Diagram/ }).click();
  await expect(filter.getByRole('button', { name: /^Views/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.er-node')).toHaveCount(2);

  await filter.getByRole('button', { name: /^Tables/ }).click();
  await expect(page.locator('.er-node')).toHaveCount(2);
  expect(await page.locator('.er-node-kind').allTextContents()).toEqual(['table', 'table']);

  await filter.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.er-node')).toHaveCount(4);
});
