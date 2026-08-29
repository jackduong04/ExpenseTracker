import { test, expect } from '@playwright/test';
test('welcome screen offers local ledger actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /your money/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /create new ledger/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /open ledger file/i })).toBeVisible();
});

test('creates a ledger through the desktop download fallback', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /create & save copy/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^expense-tracker-personal-expenses-r1-\d{4}-\d{2}-\d{2}\.json$/,
  );
  await expect(page.getByRole('heading', { name: /good to see you/i })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Categories' }).click();
  await page.getByLabel('New category name').fill('Travel');
  await page.getByLabel('New category color').fill('#c45533');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const travelCategory = page.locator('.managed-category').filter({ hasText: 'Travel' });
  await expect(travelCategory).toBeVisible();
  await expect(travelCategory.locator('.color-dot')).toHaveCSS(
    'background-color',
    'rgb(196, 85, 51)',
  );

  await page.getByLabel('Color for Travel').fill('#315f8a');
  await expect(travelCategory.locator('.color-dot')).toHaveCSS(
    'background-color',
    'rgb(49, 95, 138)',
  );
});
