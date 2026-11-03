
import { test, expect } from '@playwright/test';

import { deleteUserAndData } from './helpers/db.js';

import {
  newTestUser,
  registerUser,
  login,
  createTestProduct,
  createOrder,
  uniqueName,
} from './helpers/orders.js';

// Match the team's existing Playwright configuration
test.use({
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
});

let testUser;

// SETUP: runs before each test
test.beforeEach(async ({ page }) => {
  testUser = newTestUser();

  await registerUser(page, testUser);
  await login(page, testUser);
  await createTestProduct(page);
});

// CLEANUP: runs after each test, including assertion failures
test.afterEach(async () => {
  if (testUser) {
    await deleteUserAndData(testUser.username);
    testUser = null;
  }
});


// TEST 1: Home loads after login
test('Home dashboard loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('page-home')).toBeVisible();

  await expect(
    page.getByRole('heading', { name: /This week/i })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: /Needs your attention/i })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: /How the business is doing/i })
  ).toBeVisible();
});


// TEST 2: Creating an order updates Today's orders
test('New order appears on Home', async ({ page }) => {
  await page.goto('/');

  // Initially, no outstanding orders are due today
  await expect(
    page.getByText('No outstanding orders due today.')
  ).toBeVisible();

  // Create one order for today
  const customer = uniqueName('Home Customer');

  await createOrder(page, customer, {
    dueInDays: 0,
    quantity: 2,
  });

  // Reload Home to retrieve the new order
  await page.reload();

  // Verify the order appears in Today's orders
  const todayCard = page.locator('.home-order-wrapper');

  await expect(todayCard).toHaveCount(1);
  await expect(todayCard.first()).toContainText(customer);
});


// TEST 3: Order log navigation
test('Order log link navigates correctly', async ({ page }) => {
  await page.goto('/');

  const weeklySection = page.locator(
    '[aria-labelledby="week-heading"]'
  );

  await weeklySection
    .getByRole('link', { name: /Order log/i })
    .click();

  await expect(page).toHaveURL(/\/orders$/);

  await expect(
    page.getByTestId('order-search')
  ).toBeVisible();
});


test('Home has no horizontal overflow at 575px', async ({ page }) => {
  await page.setViewportSize({
    width: 575,
    height: 652,
  });

  await page.goto('/');

  await expect(
    page.getByTestId('page-home')
  ).toBeVisible();

  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth >
      document.documentElement.clientWidth;
  });

  expect(hasOverflow).toBe(false);
});
