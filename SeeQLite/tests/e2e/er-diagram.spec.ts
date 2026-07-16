import { expect, test } from '@playwright/test';
import path from 'node:path';

const relationshipsFixture = path.join(process.cwd(), 'tests/fixtures/relationships.sqlite');

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
