import { test, expect } from '@playwright/test';
test('welcome screen offers local ledger actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /your money/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /create new ledger/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /import json/i })).toBeVisible();
});

test('creates and resumes a ledger from browser storage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).click();

  await page.getByRole('button', { name: /create ledger/i }).click();
  await expect(page.getByRole('heading', { name: /good to see you/i })).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /good to see you/i })).toBeVisible();

  await page.getByRole('button', { name: 'Categories' }).click();
  await page.getByLabel('New category name').fill('Travel');
  await page.getByLabel('New category color').fill('#c45533');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const travelCategory = page.locator('.managed-category').filter({ hasText: 'Travel' });
  await expect(travelCategory).toBeVisible();
  await expect(travelCategory.locator('.color-dot').first()).toHaveCSS(
    'background-color',
    'rgb(196, 85, 51)',
  );

  await page.getByLabel('Color for Travel').fill('#315f8a');
  await expect(travelCategory.locator('.color-dot').first()).toHaveCSS(
    'background-color',
    'rgb(49, 95, 138)',
  );
});

test('exports a backup explicitly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).click();
  await page.getByRole('button', { name: /create ledger/i }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export backup/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^expense-tracker-personal-expenses-r1-\d{4}-\d{2}-\d{2}\.json$/,
  );
});

test('mobile overview and transaction controls are compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).click();
  await page.getByRole('button', { name: /create ledger/i }).click();
  const segmented = page.locator('.segmented');
  await expect(segmented).toBeVisible();
  expect(await segmented.evaluate((node) => node.scrollWidth >= node.clientWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Transactions' }).click();
  await expect(page.getByRole('button', { name: 'Filter' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('.filters')).toBeHidden();
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByLabel('Category', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Sort by')).toBeVisible();
});

test('modal locks background scrolling and restores the previous position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).click();
  await page.getByRole('button', { name: /create ledger/i }).click();
  const scrollPosition = await page.evaluate(() => {
    document.documentElement.style.minHeight = '2000px';
    document.body.style.minHeight = '2000px';
    window.scrollTo(0, 400);
    return window.scrollY;
  });
  expect(scrollPosition).toBeGreaterThan(0);

  await page
    .getByRole('button', { name: /add transaction/i })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed');
  await expect
    .poll(() => page.evaluate(() => document.body.style.top))
    .toBe(`-${scrollPosition}px`);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollPosition);
});

test('touch navigation switches tabs once and resets the page scroll', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 500 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: /create new ledger/i }).tap();
  await page.getByRole('button', { name: /create ledger/i }).tap();
  const scrollPosition = await page.evaluate(() => {
    document.documentElement.style.minHeight = '2000px';
    document.body.style.minHeight = '2000px';
    window.scrollTo(0, 400);
    return window.scrollY;
  });
  expect(scrollPosition).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Transactions' }).tap();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  for (const [tab, heading] of [
    ['Categories', 'Categories'],
    ['Settings', 'Settings'],
    ['Dashboard', 'Good to see you.'],
  ] as const) {
    await page.getByRole('button', { name: tab }).tap();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  const navBox = await page.locator('.sidebar').boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.height).toBeGreaterThanOrEqual(62);
  expect(Math.round(navBox!.y + navBox!.height)).toBe(500);
  await context.close();
});
