import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewports = [
  { name: 'narrow', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1024, height: 900 },
  { name: 'wide', width: 1440, height: 900 },
] as const;

async function expectNoSeriousAxeViolations(page: Parameters<typeof AxeBuilder>[0]['page']) {
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(violations).toEqual([]);
}

for (const viewport of viewports) {
  test(`keeps the primary workflow contained and accessible at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expectNoSeriousAxeViolations(page);

    await page.getByRole('button', { name: 'Try sample database' }).click();
    await expect(page.getByRole('button', { name: 'Run query' })).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    await page.getByLabel('SQL query').fill('SELECT email FROM users;');
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.result-panel')).toContainText('ada@example.test');
    await expectNoSeriousAxeViolations(page);

    await page.getByRole('tab', { name: /Diagram/ }).click();
    await expect(page.getByRole('region', { name: 'Declared relationships' })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`keeps query, plan, and relationship states accessible in ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.getByRole('button', { name: 'Try sample database' }).click();
    await page.getByLabel('SQL query').fill('SELECT email FROM users;');
    await page.getByRole('button', { name: 'Run query' }).click();
    await page.getByRole('button', { name: 'Explain' }).click();
    await expect(page.getByRole('list', { name: 'SQLite query plan' })).toContainText('SCAN');
    await expectNoSeriousAxeViolations(page);
    await page.getByRole('tab', { name: /Diagram/ }).click();
    await page.getByRole('button', { name: /users table/ }).first().click();
    await page.getByRole('tab', { name: 'Schema' }).click();
    await expect(page.getByRole('region', { name: 'users details' })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });
}
