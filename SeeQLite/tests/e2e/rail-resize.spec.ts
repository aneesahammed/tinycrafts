import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/smoke.sqlite');

test('resizes both workspace rails from their non-interactive surfaces', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('button', { name: /notes table/ }).click();

  const explorer = page.locator('.catalog-rail');
  const initialExplorer = await explorer.boundingBox();
  expect(initialExplorer).not.toBeNull();
  await expect(explorer).toHaveCSS('cursor', 'auto');
  await page.mouse.move(initialExplorer!.x + 20, initialExplorer!.y + 22);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveAttribute('data-rail-resizing', 'catalog');
  await expect(page.locator('body')).toHaveCSS('cursor', 'col-resize');
  await page.mouse.move(initialExplorer!.x + 90, initialExplorer!.y + 22, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveAttribute('data-rail-resizing');
  expect((await explorer.boundingBox())!.width).toBeGreaterThan(initialExplorer!.width + 50);

  const inspector = page.locator('.inspector-rail');
  const initialInspector = await inspector.boundingBox();
  expect(initialInspector).not.toBeNull();
  await expect(inspector).toHaveCSS('cursor', 'auto');
  await page.mouse.move(initialInspector!.x + 20, initialInspector!.y + 22);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveAttribute('data-rail-resizing', 'inspector');
  await page.mouse.move(initialInspector!.x - 55, initialInspector!.y + 22, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveAttribute('data-rail-resizing');
  expect((await inspector.boundingBox())!.width).toBeGreaterThan(initialInspector!.width + 40);

  await expect(page.getByRole('button', { name: 'Copy identifier' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy SELECT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' }).locator('svg')).toBeVisible();
});

test('collapses and restores the inspector without losing its chosen width', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('button', { name: /notes table/ }).click();

  const inspector = page.locator('#object-inspector');
  const expandedWidth = (await inspector.boundingBox())!.width;
  const collapse = page.getByRole('button', { name: 'Collapse inspector' });
  await expect(collapse).toHaveAttribute('aria-controls', 'object-inspector');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');

  await collapse.click();
  await expect(page.getByRole('button', { name: 'Expand inspector' })).toHaveAttribute('aria-expanded', 'false');
  await expect(inspector).toHaveClass(/is-collapsed/);
  expect((await inspector.boundingBox())!.width).toBeLessThanOrEqual(42);
  await expect(page.getByRole('heading', { name: 'Notes' })).not.toBeVisible();

  await page.getByRole('button', { name: 'Expand inspector' }).click();
  await expect(page.getByRole('button', { name: 'Collapse inspector' })).toHaveAttribute('aria-expanded', 'true');
  expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(expandedWidth - 1);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
});
