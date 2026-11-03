// End-to-end tests for the Log order page (/orders/new):
//   A. fields only turn red after Save is pressed
//   B. no backdating (page and server)
//   C. busiest-day note under the Due field
//   D. "not enough materials" note under each quantity (StockCheck)
//   E. after saving: banner + scroll back to the top
//
// Run with: npx playwright test tests/e2e/logOrder.spec.js
// Needs the app running (server on :3000 + Vite on :5173, e.g. `npm run dev`)
// and MongoDB + the .env file that db.js reads.
//
// Same pattern as order.spec.js:
//   test starts → registers its own "e2e_" seller → does its checks →
//   afterEach deletes the seller and ALL their data with deleteUserAndData() (db.js)
import { test, expect } from '@playwright/test';
import { deleteUserAndData } from './helpers/db.js';
import {
  newTestUser,
  registerUser,
  createTestProduct,
  login,
  uniqueName,
  createOrder,
  createTestMaterial,
  createProductWithRecipe,
} from './helpers/orders.js';

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

let testUser;

test.beforeEach(async ({ page }) => {
  testUser = newTestUser();
  await deleteUserAndData(testUser.username); // in case an old run left it behind
  await registerUser(page, testUser);
  await login(page, testUser);
  await createTestProduct(page); // "E2E Chocolate cookies", no recipe
});

test.afterEach(async () => {
  if (testUser) {
    await deleteUserAndData(testUser.username);
  }
});

// "2026-11-05T14:30" for a datetime-local input, N days from now (negative = in the past)
function dateTimeInput(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Opens Log order and waits until the products have loaded into the dropdown
async function openLogOrder(page) {
  await page.goto('/orders/new');
  await expect(page.getByTestId('page-log-order')).toBeVisible();
  await expect(page.locator('#product-0 option', { hasText: 'E2E Chocolate cookies' })).toHaveCount(1);
}

// Fills every required field: 1 × E2E Chocolate cookies, self-collect, due in 2 days
async function fillValidOrder(page, name, productLabel = 'E2E Chocolate cookies', quantity = 1) {
  await page.locator('#customerName').fill(name);
  await page.locator('#product-0').selectOption({ label: productLabel });
  await page.locator('#qty-0').fill(String(quantity));
  await page.locator('#fulfilmentMethod').selectOption('self-collect');
  await page.locator('#dueAt').fill(dateTimeInput(2));
}

const save = (page) => page.getByRole('button', { name: 'Save order' });

// ---------------------------------------------------------------------------
// A. Red fields
// ---------------------------------------------------------------------------
test.describe('Log order: required fields', () => {
  test('A1. nothing is red when the page opens', async ({ page }) => {
    await openLogOrder(page);

    await expect(page.locator('.is-invalid')).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
  });

  test('A2. pressing Save on an empty form turns the required fields red', async ({ page }) => {
    await openLogOrder(page);

    await save(page).click();

    await expect(page.locator('#customerName')).toHaveClass(/is-invalid/);
    await expect(page.locator('#fulfilmentMethod')).toHaveClass(/is-invalid/);
    await expect(page.locator('#dueAt')).toHaveClass(/is-invalid/);
    await expect(page.locator('.action-banner--error')).toContainText('Fill in');

    // Nothing was saved
    const orders = await (await page.request.get('/api/orders')).json();
    expect(orders).toHaveLength(0);
  });

  test('A3. a red field goes back to normal as soon as it is filled', async ({ page }) => {
    await openLogOrder(page);
    await save(page).click();
    await expect(page.locator('#customerName')).toHaveClass(/is-invalid/);

    await page.locator('#customerName').fill(uniqueName('Fixed'));

    await expect(page.locator('#customerName')).not.toHaveClass(/is-invalid/);
    await expect(page.locator('#dueAt')).toHaveClass(/is-invalid/); // the others stay red
  });
});

// ---------------------------------------------------------------------------
// B. No backdating
// ---------------------------------------------------------------------------
test.describe('Log order: no backdating', () => {
  test('B1. a due date in the past is flagged and not saved', async ({ page }) => {
    await openLogOrder(page);
    await fillValidOrder(page, uniqueName('Past'));
    await page.locator('#dueAt').fill(dateTimeInput(-1)); // yesterday

    await expect(page.getByText('This time has already passed.')).toBeVisible();

    await save(page).click();
    await expect(page.locator('#dueAt')).toHaveClass(/is-invalid/);
    const orders = await (await page.request.get('/api/orders')).json();
    expect(orders).toHaveLength(0);
  });

  test('B2. the date picker starts from now', async ({ page }) => {
    await openLogOrder(page);

    const min = await page.locator('#dueAt').getAttribute('min');
    // min has no seconds, so allow up to a minute either way
    expect(Math.abs(new Date(min).getTime() - Date.now())).toBeLessThan(60 * 1000);
  });

  test('B3. the server refuses a past due date too', async ({ page }) => {
    const product = (await (await page.request.get('/api/products')).json())[0];

    const response = await page.request.post('/api/orders', {
      data: {
        customerName: uniqueName('Backdated'),
        items: [{ product: product._id, variantId: null, quantity: 1 }],
        price: 20,
        paymentStatus: 'unpaid',
        fulfilmentMethod: 'self-collect',
        dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe("Due date can't be in the past");
  });
});

// ---------------------------------------------------------------------------
// C. Busiest day
// ---------------------------------------------------------------------------
test.describe('Log order: busiest day', () => {
  test('C1. picking the busiest day shows how many active orders are due', async ({ page }) => {
    // Setup: 3 active orders + 1 completed order in 3 days, 1 order tomorrow.
    // The seller is brand new (no history), so the busiest day is simply
    // the day with the most booked items: 3 days from now.
    for (let i = 0; i < 3; i++) {
      await createOrder(page, uniqueName('Busy'), { dueInDays: 3 });
    }
    await createOrder(page, uniqueName('Done'), { dueInDays: 3, status: 'completed' });
    await createOrder(page, uniqueName('Quiet'), { dueInDays: 1 });

    await openLogOrder(page);
    await page.locator('#dueAt').fill(dateTimeInput(3));

    const note = page.locator('.busy-note');
    await expect(note).toContainText('is your busiest day');
    // Only active orders count: the completed one is left out
    await expect(note).toContainText('You already have 3 active orders due');
  });

  test('C2. a quieter day shows no busiest-day note', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await createOrder(page, uniqueName('Busy'), { dueInDays: 3 });
    }
    await createOrder(page, uniqueName('Quiet'), { dueInDays: 1 });

    await openLogOrder(page);
    await page.locator('#dueAt').fill(dateTimeInput(1));

    await expect(page.locator('.busy-note')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// D. Not enough materials (StockCheck)
// ---------------------------------------------------------------------------
test.describe('Log order: stock check', () => {
  // 1000 g of butter, 100 g per unit → enough for 10
  async function setUpButter(page) {
    const butter = await createTestMaterial(page, 'E2E Butter', 1000);
    await createProductWithRecipe(page, 'E2E Butter cookies', butter, 100);
    await createProductWithRecipe(page, 'E2E Butter cake', butter, 100);
  }

  test('D1. a quantity within stock shows "You can make"', async ({ page }) => {
    await setUpButter(page);
    await openLogOrder(page);

    await page.locator('#product-0').selectOption({ label: 'E2E Butter cookies' });
    await page.locator('#qty-0').fill('10');

    await expect(page.locator('.stock-check.is-ok')).toContainText('You can make 10');
  });

  test('D2. more than the stock allows shows a warning, but can still be saved', async ({ page }) => {
    await setUpButter(page);
    await openLogOrder(page);

    await page.locator('#product-0').selectOption({ label: 'E2E Butter cookies' });
    await page.locator('#qty-0').fill('11');

    await expect(page.locator('.stock-check.is-short')).toContainText('You can only make 10');
    await expect(page.locator('.stock-check.is-short')).toContainText('E2E Butter');
    await expect(save(page)).toBeEnabled();
  });

  test('D3. two items sharing a material are counted together', async ({ page }) => {
    await setUpButter(page);
    await openLogOrder(page);

    // 6 cookies + 5 cakes: each fits on its own (≤ 10), but together need 1100 g
    await page.locator('#product-0').selectOption({ label: 'E2E Butter cookies' });
    await page.locator('#qty-0').fill('6');
    await page.getByRole('button', { name: '+ Add another item' }).click();
    await page.locator('#product-1').selectOption({ label: 'E2E Butter cake' });
    await page.locator('#qty-1').fill('5');

    const warnings = page.locator('.stock-check.is-short');
    await expect(warnings).toHaveCount(2);
    await expect(warnings.first()).toContainText('after your other items');
  });
});

// ---------------------------------------------------------------------------
// E. After saving
// ---------------------------------------------------------------------------
test.describe('Log order: after saving', () => {
  test('E1. saving scrolls back to the top and shows a green banner', async ({ page }) => {
    const name = uniqueName('Saved');
    await openLogOrder(page);
    await fillValidOrder(page, name);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await save(page).click();

    await expect(page.locator('.action-banner--success')).toContainText(`Order for ${name} saved.`);
    // Back at the top = the page title is on screen again. toBeInViewport keeps
    // retrying, so it waits for the smooth scroll to finish.
    await expect(page.getByRole('heading', { level: 1, name: 'Log order' })).toBeInViewport();

    // The form is cleared, with nothing red
    await expect(page.locator('#customerName')).toHaveValue('');
    await expect(page.locator('.is-invalid')).toHaveCount(0);
  });

  test('E2. saving an order the stock can\'t cover shows a purple banner', async ({ page }) => {
    const butter = await createTestMaterial(page, 'E2E Butter', 1000);
    await createProductWithRecipe(page, 'E2E Butter cookies', butter, 100);
    const name = uniqueName('Short');
    await openLogOrder(page);
    await fillValidOrder(page, name, 'E2E Butter cookies', 11);
    // Wait until the seller can SEE the warning, like a real seller would before saving.
    // (Materials load separately; clicking Save before they arrive gives a green banner.)
    await expect(page.locator('.stock-check.is-short')).toBeVisible();

    await save(page).click();

    const banner = page.locator('.action-banner--info');
    await expect(banner).toContainText(`Order for ${name} saved.`);
    await expect(banner).toContainText('Not enough E2E Butter');
  });

  test('E3. a server error shows its own message in a red banner', async ({ page }) => {
    await openLogOrder(page);
    await fillValidOrder(page, uniqueName('Refused'));

    // Make the server refuse this one save, the same way it refuses a past date
    await page.route('**/api/orders', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, json: { error: "Due date can't be in the past" } })
        : route.continue()
    );
    await save(page).click();

    await expect(page.locator('.action-banner--error')).toContainText("Due date can't be in the past");
  });
});
