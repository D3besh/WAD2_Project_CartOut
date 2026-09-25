// A first end-to-end test to prove the setup works.
// Run with: npm run test:e2e   (needs MongoDB running and `npm run seed` done)
//
// Add one spec file per main user journey, for example:
//   log-order.spec.js       paste a message, fill missing fields, confirm
//   order-status.spec.js    move an order to Ready, see the customer message
//   low-stock.spec.js       restock a material, badge disappears
//   feasibility.spec.js     log an order that can't be fulfilled, see the warning
//
// Select elements with data-testid so tests survive styling changes.
import { test, expect } from '@playwright/test';

test('the app loads and shows a page', async ({ page }) => {
  await page.goto('/');
  // Until the login redirect is built, Home loads directly.
  await expect(page.getByTestId('page-home').or(page.getByTestId('page-login'))).toBeVisible();
});
