// End-to-end tests for the order journey:
// Log order → Order log (search, bulk select, paging, filters) → Order detail
// (stages, payment, cancel, refund, stock, copy message), plus security
// and wrong-input checks.
//
// Run with: npm run test:e2e
// Needs the app running (server on :3000 + Vite on :5173, e.g. `npm run dev`)
// and MongoDB + the .env file that db.js reads.
//
// Every test registers its own "e2e_" seller with one product, makes its own
// orders, and afterwards deletes the seller and all their orders, products,
// materials and counters with deleteUserAndData() (db.js).
import { test, expect } from '@playwright/test';
import { deleteUserAndData } from './helpers/db.js';
import {
  newTestUser,
  registerUser,
  createTestProduct,
  login,
  uniqueName,
  createOrder,
  getOrder,
  openOrder,
  cancelFromCard,
  refundFromCard,
  createTestMaterial,
  createProductWithRecipe,
  materialQuantity,
} from './helpers/orders.js';

// Same address as userAuth.spec.js (the Vite dev server, which forwards /api to :3000).
// Override with E2E_BASE_URL=http://localhost:3000 to test the built app instead.
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

// The seller for the test that is running (each worker runs one test at a time)
let testUser;

test.beforeEach(async ({ page }) => {
  testUser = newTestUser();
  await deleteUserAndData(testUser.username); // in case an old run left it behind
  await registerUser(page, testUser);
  await login(page, testUser);
  await createTestProduct(page);
});

test.afterEach(async () => {
  if (testUser) {
    await deleteUserAndData(testUser.username); // the seller and all their orders
  }
});

// "2026-11-05T14:30" for a datetime-local input, N days from now
function dateTimeInput(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Windows puts \r\n line breaks on the clipboard, the textarea uses \n.
// Compare both with plain \n so the test works on Windows, Mac and Linux.
function normalise(text) {
  return text.replace(/\r\n/g, '\n').trim();
}

// Returns a function that reads the clipboard (for expect.poll)
function readClipboard(page) {
  return async () => normalise(await page.evaluate(() => navigator.clipboard.readText()));
}

// The status pill in the key-facts strip at the top of Order detail
const statusPill = (page) => page.locator('header .status');

// ---------------------------------------------------------------------------
// Order log
// ---------------------------------------------------------------------------
test.describe('Order log', () => {
  test('1. creating a new order shows the new order', async ({ page }) => {
    const name = uniqueName('New');

    await page.goto('/orders/new');
    await expect(page.getByTestId('page-log-order')).toBeVisible();

    await page.locator('#customerName').fill(name);
    await page.locator('#product-0').selectOption({ label: 'E2E Chocolate cookies' });
    await page.locator('#qty-0').fill('2');
    await page.locator('#price').fill('30');
    await page.locator('#fulfilmentMethod').selectOption('self-collect');
    await page.locator('#dueAt').fill(dateTimeInput(2));

    const save = page.getByRole('button', { name: 'Save order' });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByText(`Order for ${name} saved.`)).toBeVisible();

    // It shows up in the Order log
    await page.goto('/orders');
    await page.getByTestId('order-search').fill(name);
    const cards = page.getByTestId('order-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(name);
    await expect(cards.first()).toContainText('$30.00');
  });

  test('2. search by customer name', async ({ page }) => {
    const name = uniqueName('SearchName');
    await createOrder(page, name);
    await createOrder(page, uniqueName('Someone Else')); // should NOT match

    await page.goto('/orders');
    await page.getByTestId('order-search').fill(name.toLowerCase()); // capitals shouldn't matter

    const cards = page.getByTestId('order-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(name);
    await expect(page.getByText('Searching all orders.')).toBeVisible();
  });

  test('3. search by order number', async ({ page }) => {
    const name = uniqueName('SearchNo');
    const order = await createOrder(page, name);
    expect(order.orderNo).toBeTruthy();

    await page.goto('/orders');
    await page.getByTestId('order-search').fill(order.orderNo);

    const cards = page.getByTestId('order-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(order.orderNo);
    await expect(cards.first()).toContainText(name);
  });

  test('4. select orders and bulk-update them', async ({ page }) => {
    const prefix = uniqueName('Bulk');
    const a = await createOrder(page, `${prefix} A`);
    const b = await createOrder(page, `${prefix} B`);

    await page.goto('/orders');
    await page.getByTestId('order-search').fill(prefix);
    await expect(page.getByTestId('order-card')).toHaveCount(2);

    await page.getByTestId('bulk-select').click();
    const bar = page.getByTestId('bulk-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('0 selected');

    await page.getByRole('checkbox', { name: `Select order for ${prefix} A` }).check();
    await page.getByRole('checkbox', { name: `Select order for ${prefix} B` }).check();
    await expect(bar).toContainText('2 selected');

    // The Materials needed card appears for the ticked orders
    await expect(page.getByTestId('materials-needed')).toBeVisible();

    await bar.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByText('2 orders marked as Ready')).toBeVisible();

    expect((await getOrder(page, a._id)).status).toBe('ready');
    expect((await getOrder(page, b._id)).status).toBe('ready');
  });

  test('5. clicking an order opens the correct Order detail', async ({ page }) => {
    const name = uniqueName('Detail');
    const order = await createOrder(page, name, { price: 27 });

    await page.goto('/orders');
    await page.getByTestId('order-search').fill(name);
    await page.getByTestId('order-card').first().click();

    await expect(page).toHaveURL(new RegExp(`/orders/${order._id}$`));
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator('header')).toContainText(order.orderNo);
    await expect(statusPill(page)).toHaveText('In progress');
    await expect(page.locator('header')).toContainText('$27.00');
    await expect(page.locator('header')).toContainText('Self-collect');
    await expect(page.getByText('Hi, can I order 1 box please? Thanks!')).toBeVisible(); // original message
  });
});

// ---------------------------------------------------------------------------
// Order detail: stages and payment
// ---------------------------------------------------------------------------
test.describe('Order detail: progress and payment', () => {
  test('6. clicking Ready moves the order to Ready', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Ready'));
    await openOrder(page, order);

    await page.getByTestId('stage-ready').click();

    await expect(page.getByTestId('stage-ready')).toHaveAttribute('aria-pressed', 'true');
    await expect(statusPill(page)).toHaveText('Ready');
    await expect.poll(async () => (await getOrder(page, order._id)).status).toBe('ready');
  });

  test('7. clicking Completed moves the order to Completed', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Completed'));
    await openOrder(page, order);

    await page.getByTestId('stage-completed').click();

    await expect(page.getByTestId('stage-completed')).toHaveAttribute('aria-pressed', 'true');
    await expect(statusPill(page)).toHaveText('Completed');
    await expect.poll(async () => (await getOrder(page, order._id)).status).toBe('completed');
  });

  test('8. recording a deposit', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Deposit'), { price: 20 });
    await openOrder(page, order);

    await page.getByTestId('pay-deposit').click();
    const input = page.getByTestId('deposit-input');
    await expect(input).toBeVisible();
    await input.fill('5');
    await input.press('Enter');

    await expect
      .poll(async () => {
        const saved = await getOrder(page, order._id);
        return `${saved.paymentStatus} ${saved.depositAmount}`;
      })
      .toBe('deposit 5');

    await expect(page.locator('.money-box').filter({ hasText: 'Paid so far' })).toContainText('$5.00');
    await expect(page.locator('.money-box').filter({ hasText: 'Balance due' })).toContainText('$15.00');
  });

  test('9. marking the order as paid', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Paid'), { price: 20 });
    await openOrder(page, order);

    await page.getByTestId('pay-paid').click();

    await expect.poll(async () => (await getOrder(page, order._id)).paymentStatus).toBe('paid');
    await expect(page.locator('.money-box').filter({ hasText: 'Paid so far' })).toContainText('$20.00');
    await expect(page.locator('.money-box').filter({ hasText: 'Balance due' })).toContainText('$0.00');
  });
});

// ---------------------------------------------------------------------------
// Order detail: cancellation and refund
// ---------------------------------------------------------------------------
test.describe('Order detail: cancellation and refund', () => {
  test('10. cancelling an order that is in progress', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Cancel InProgress'));
    await openOrder(page, order);

    await cancelFromCard(page, 'Customer changed their mind');

    const card = page.getByTestId('dispute-card');
    await expect(card).toContainText('Cancelled: Customer changed their mind');
    await expect(statusPill(page)).toHaveText('Cancelled');
    await expect(page.getByTestId('stage-ready')).toBeDisabled(); // stages are locked now
    await expect(card.getByRole('button', { name: 'Cancel order' })).toBeDisabled();

    expect((await getOrder(page, order._id)).status).toBe('cancelled');
  });

  test('11. refunding an order that is in progress', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Refund InProgress'), { price: 20, paymentStatus: 'paid' });
    await openOrder(page, order);

    await refundFromCard(page, 5, 'Missing one item');

    const card = page.getByTestId('dispute-card');
    await expect(card).toContainText('Refunded $5.00: Missing one item');
    await expect(page.getByTestId('pay-refunded')).toBeVisible();

    const saved = await getOrder(page, order._id);
    expect(saved.refundAmount).toBe(5);
    expect(saved.status).toBe('in-progress'); // a refund alone doesn't cancel the order
  });

  test('12. cancelling after a refund, while in progress', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Refund Then Cancel'), { price: 20, paymentStatus: 'paid' });
    await openOrder(page, order);

    await refundFromCard(page, 20, 'Full refund');
    const card = page.getByTestId('dispute-card');
    await expect(card).toContainText('Refunded $20.00');

    await cancelFromCard(page, 'Cancelled after refund');

    await expect(card).toContainText('Cancelled: Cancelled after refund');
    // Payment tracker shows both extra steps: Refunded, then Cancelled
    await expect(page.getByTestId('pay-refunded')).toBeVisible();
    await expect(page.getByTestId('pay-cancelled')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Refund', exact: true })).toBeDisabled();

    const saved = await getOrder(page, order._id);
    expect(saved.status).toBe('cancelled');
    expect(saved.refundAmount).toBe(20);
  });

  test('13. cancelling an order that is ready', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Cancel Ready'), { status: 'ready' });
    await openOrder(page, order);
    await expect(statusPill(page)).toHaveText('Ready');

    const card = page.getByTestId('dispute-card');
    await card.getByRole('button', { name: 'Cancel order' }).click();

    // A ready order is already made, so materials always count as used
    const materialsUsed = card.locator('#mat-used');
    await expect(materialsUsed).toBeChecked();
    await expect(materialsUsed).toBeDisabled();

    await card.locator('#dispute-reason').fill('Customer did not collect');
    await card.getByRole('button', { name: 'Confirm cancellation' }).click();

    await expect(card).toContainText('Cancelled: Customer did not collect');
    await expect(card).toContainText('Materials were used');

    const saved = await getOrder(page, order._id);
    expect(saved.status).toBe('cancelled');
    expect(saved.materialsWasted).toBe(true);
  });

  test('14. a completed order cannot be cancelled', async ({ page }) => {
    const order = await createOrder(page, uniqueName('NoCancel Completed'), { status: 'completed' });
    await openOrder(page, order);
    await expect(statusPill(page)).toHaveText('Completed');

    const card = page.getByTestId('dispute-card');
    await expect(card.getByRole('button', { name: 'Cancel order' })).toBeDisabled();

    // The server refuses too, even if someone skips the button
    const response = await page.request.post(`/api/orders/${order._id}/cancel`, {
      data: { reason: 'Trying anyway' },
    });
    expect(response.status()).toBe(400);
    expect((await getOrder(page, order._id)).status).toBe('completed');
  });

  test('15. a completed order cannot be refunded', async ({ page }) => {
    // Paid, so there IS money that could be refunded: the button must still be off
    const order = await createOrder(page, uniqueName('NoRefund Completed'), {
      status: 'completed',
      paymentStatus: 'paid',
      price: 20,
    });
    await openOrder(page, order);
    await expect(statusPill(page)).toHaveText('Completed');

    const card = page.getByTestId('dispute-card');
    await expect(card.getByRole('button', { name: 'Refund', exact: true })).toBeDisabled();

    // The server refuses too, even if someone skips the button
    const response = await page.request.post(`/api/orders/${order._id}/refund`, {
      data: { amount: 5, reason: 'Trying anyway' },
    });
    expect(response.status()).toBe(400);
    expect((await getOrder(page, order._id)).refundAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Order detail: message to customer
// ---------------------------------------------------------------------------
test.describe('Order detail: message to customer', () => {
  test('16. copy message copies the (edited) message', async ({ page, context, browserName }) => {
    // Reading the clipboard in a test only works in Chromium (the desktop project)
    test.skip(browserName !== 'chromium', 'Clipboard access is only available in Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: process.env.E2E_BASE_URL || 'http://localhost:5173',
    });

    const name = uniqueName('Copy');
    const order = await createOrder(page, name);
    await openOrder(page, order);

    const box = page.getByTestId('share-message-input');
    await expect(box).not.toHaveValue(''); // wait for the automated message to load
    const automated = await box.inputValue();

    // 1. Copy the automated message
    const copyButton = page.getByRole('button', { name: /Copy message|Copied!/ });
    await copyButton.click();
    await expect(copyButton).toHaveText('Copied!');
    await expect.poll(readClipboard(page)).toBe(normalise(automated));

    // 2. Edit it, then copy: the edited text is what gets copied
    const edited = `${automated}\n\nSee you soon!`;
    await box.fill(edited);
    await expect(page.getByText('Edited. Only used when you copy, not saved.')).toBeVisible();
    await copyButton.click();
    await expect.poll(readClipboard(page)).toBe(normalise(edited));

    // 3. Reset brings back the automated message
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(box).toHaveValue(automated);
  });
});

// ---------------------------------------------------------------------------
// Order log: bulk update with the status tabs
// (each test has its own seller, so the tabs only hold this test's orders)
// ---------------------------------------------------------------------------
test.describe('Order log: bulk update', () => {
  test('17a. bulk update In progress orders to Ready', async ({ page }) => {
    const a = await createOrder(page, uniqueName('BulkReady A'));
    const b = await createOrder(page, uniqueName('BulkReady B'));

    await page.goto('/orders'); // opens on the In progress tab
    await expect(page.getByTestId('tab-in-progress')).toHaveText('In progress (2)');
    await expect(page.getByTestId('order-card')).toHaveCount(2);

    await page.getByTestId('bulk-select').click();
    const bar = page.getByTestId('bulk-bar');
    await page.getByLabel('Select all', { exact: true }).check();
    await expect(bar).toContainText('2 selected');

    // On the In progress tab, "In progress" isn't offered (they're already there)
    await expect(bar.getByRole('button', { name: 'In progress', exact: true })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Ready', exact: true }).click();

    await expect(page.getByText('2 orders marked as Ready.')).toBeVisible();

    // They left the In progress tab...
    await expect(page.getByText('No orders here.')).toBeVisible();
    await expect(page.getByTestId('tab-in-progress')).toHaveText('In progress (0)');
    await expect(page.getByTestId('tab-ready')).toHaveText('Ready (2)');

    // ...and are on the Ready tab
    await page.getByTestId('tab-ready').click();
    await expect(page.getByTestId('order-card')).toHaveCount(2);

    expect((await getOrder(page, a._id)).status).toBe('ready');
    expect((await getOrder(page, b._id)).status).toBe('ready');
  });

  test('17b. bulk update Ready orders back to In progress', async ({ page }) => {
    const a = await createOrder(page, uniqueName('BulkBack A'), { status: 'ready' });
    const b = await createOrder(page, uniqueName('BulkBack B'), { status: 'ready' });

    await page.goto('/orders');
    await page.getByTestId('tab-ready').click();
    await expect(page.getByTestId('tab-ready')).toHaveText('Ready (2)');
    await expect(page.getByTestId('order-card')).toHaveCount(2);

    await page.getByTestId('bulk-select').click();
    const bar = page.getByTestId('bulk-bar');
    await page.getByLabel('Select all', { exact: true }).check();
    await expect(bar).toContainText('2 selected');

    // On the Ready tab, "Ready" isn't offered (they're already there)
    await expect(bar.getByRole('button', { name: 'Ready', exact: true })).toHaveCount(0);
    await bar.getByRole('button', { name: 'In progress', exact: true }).click();

    await expect(page.getByText('2 orders marked as In progress.')).toBeVisible();

    // They left the Ready tab...
    await expect(page.getByText('No orders here.')).toBeVisible();
    await expect(page.getByTestId('tab-ready')).toHaveText('Ready (0)');
    await expect(page.getByTestId('tab-in-progress')).toHaveText('In progress (2)');

    // ...and are back on the In progress tab
    await page.getByTestId('tab-in-progress').click();
    await expect(page.getByTestId('order-card')).toHaveCount(2);

    expect((await getOrder(page, a._id)).status).toBe('in-progress');
    expect((await getOrder(page, b._id)).status).toBe('in-progress');
  });
});

// ---------------------------------------------------------------------------
// Security: sellers only see their own orders
// ---------------------------------------------------------------------------
test.describe('Security', () => {
  test('18. another seller cannot see or change my order', async ({ page }) => {
    const myOrder = await createOrder(page, uniqueName('Private'), { price: 20, paymentStatus: 'paid' });

    // Log in as a second, different seller
    const otherUser = newTestUser();
    await registerUser(page, otherUser);
    await login(page, otherUser);

    try {
      // API: can't read, cancel, refund or change it
      expect((await page.request.get(`/api/orders/${myOrder._id}`)).status()).toBe(404);
      expect(
        (await page.request.post(`/api/orders/${myOrder._id}/cancel`, { data: { reason: 'Not mine' } })).status()
      ).toBe(404);
      expect(
        (await page.request.post(`/api/orders/${myOrder._id}/refund`, { data: { amount: 5, reason: 'Not mine' } })).status()
      ).toBe(404);
      expect(
        (await page.request.patch(`/api/orders/${myOrder._id}/status`, { data: { status: 'ready' } })).status()
      ).toBe(404);

      // Not in their order log or search results
      const list = await (await page.request.get('/api/orders')).json();
      expect(list.some((o) => o._id === myOrder._id)).toBe(false);

      // Page: opening the link shows an error, not my customer's details
      await page.goto(`/orders/${myOrder._id}`);
      await expect(page.getByText(myOrder.customerName)).toHaveCount(0);
    } finally {
      await deleteUserAndData(otherUser.username);
    }

    // Back as the real seller: nothing was changed
    await login(page, testUser);
    const saved = await getOrder(page, myOrder._id);
    expect(saved.status).toBe('in-progress');
    expect(saved.refundAmount).toBe(0);
  });

  test('19. logged-out visitors are sent to the login page', async ({ browser }) => {
    // A fresh browser with no login cookie
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });
    const page = await context.newPage();

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/orders/new');
    await expect(page).toHaveURL(/\/login/);

    // The API refuses too
    expect((await page.request.get('/api/orders')).status()).toBe(401);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Order log: paging, filters, sort, reset
// ---------------------------------------------------------------------------
test.describe('Order log: paging and filters', () => {
  // Makes `count` In progress orders, due 1, 2, 3 ... days from now
  async function makeOrders(page, count, label) {
    const orders = [];
    for (let i = 1; i <= count; i++) {
      orders.push(await createOrder(page, `${label} ${String(i).padStart(2, '0')}`, { dueInDays: i }));
    }
    return orders;
  }

  test('20. 12 orders per page, and Next shows the rest', async ({ page }) => {
    await makeOrders(page, 13, uniqueName('Page'));

    await page.goto('/orders');
    await expect(page.getByTestId('order-card')).toHaveCount(12);
    await expect(page.getByText('Showing 1–12 of 13 orders')).toBeVisible();

    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByTestId('order-card')).toHaveCount(1);
    await expect(page.getByText('Showing 13–13 of 13 orders')).toBeVisible();

    await page.getByRole('button', { name: /Prev/ }).click();
    await expect(page.getByTestId('order-card')).toHaveCount(12);
  });

  test('21. long lists show at most 5 page numbers, around the current page', async ({ page }) => {
    test.setTimeout(120_000); // makes 73 orders = 7 pages
    await makeOrders(page, 73, uniqueName('Many'));

    await page.goto('/orders');
    const pageButton = (n) => page.getByRole('button', { name: String(n), exact: true });

    // Page 1 of 7 → 1 2 3 4 5
    for (const n of [1, 2, 3, 4, 5]) await expect(pageButton(n)).toBeVisible();
    await expect(pageButton(6)).toHaveCount(0);
    await expect(pageButton(7)).toHaveCount(0);

    // Page 4 → 2 3 4 5 6
    await pageButton(4).click();
    await expect(page.getByText('Showing 37–48 of 73 orders')).toBeVisible();
    for (const n of [2, 3, 4, 5, 6]) await expect(pageButton(n)).toBeVisible();
    await expect(pageButton(1)).toHaveCount(0);
    await expect(pageButton(7)).toHaveCount(0);

    // Last page → 3 4 5 6 7
    await page.getByRole('button', { name: 'Last page' }).click();
    await expect(page.getByText('Showing 73–73 of 73 orders')).toBeVisible();
    for (const n of [3, 4, 5, 6, 7]) await expect(pageButton(n)).toBeVisible();

    // First page → back to 1
    await page.getByRole('button', { name: 'First page' }).click();
    await expect(page.getByText('Showing 1–12 of 73 orders')).toBeVisible();
  });

  test('22. changing tab or filter goes back to page 1', async ({ page }) => {
    await makeOrders(page, 13, uniqueName('Back'));

    await page.goto('/orders');
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByText('Showing 13–13 of 13 orders')).toBeVisible();

    // Change the payment filter (all orders are unpaid, so the list stays the same)
    await page.locator('#paymentFilter').selectOption('unpaid');
    await expect(page.getByText('Showing 1–12 of 13 orders')).toBeVisible();

    // Page 2 again, then switch tabs and back
    await page.getByRole('button', { name: /Next/ }).click();
    await page.getByTestId('tab-ready').click();
    await page.getByTestId('tab-in-progress').click();
    await expect(page.getByText('Showing 1–12 of 13 orders')).toBeVisible();
  });

  test('23. payment filter shows only matching orders', async ({ page }) => {
    const paid = await createOrder(page, uniqueName('Filter Paid'), { paymentStatus: 'paid' });
    const deposit = await createOrder(page, uniqueName('Filter Deposit'), { paymentStatus: 'deposit', depositAmount: 5 });
    const unpaid = await createOrder(page, uniqueName('Filter Unpaid'));

    await page.goto('/orders');
    await expect(page.getByTestId('order-card')).toHaveCount(3);

    const cards = page.getByTestId('order-card');
    for (const [value, order] of [['paid', paid], ['deposit', deposit], ['unpaid', unpaid]]) {
      await page.locator('#paymentFilter').selectOption(value);
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText(order.customerName);
    }

    await page.locator('#paymentFilter').selectOption('all');
    await expect(cards).toHaveCount(3);
  });

  test('24. due date sort: nearest first and farthest first', async ({ page }) => {
    const soon = await createOrder(page, uniqueName('Due Soon'), { dueInDays: 1 });
    const middle = await createOrder(page, uniqueName('Due Middle'), { dueInDays: 5 });
    const late = await createOrder(page, uniqueName('Due Late'), { dueInDays: 10 });

    await page.goto('/orders');
    const cards = page.getByTestId('order-card');
    await expect(cards).toHaveCount(3);

    // Default: nearest first
    await expect(cards.nth(0)).toContainText(soon.customerName);
    await expect(cards.nth(1)).toContainText(middle.customerName);
    await expect(cards.nth(2)).toContainText(late.customerName);

    await page.locator('#dueSort').selectOption('farthest');
    await expect(cards.nth(0)).toContainText(late.customerName);
    await expect(cards.nth(1)).toContainText(middle.customerName);
    await expect(cards.nth(2)).toContainText(soon.customerName);
  });

  test('25. Reset clears the tab, filters, sort and search', async ({ page }) => {
    await createOrder(page, uniqueName('Reset'));

    await page.goto('/orders');
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    await expect(reset).toHaveCount(0); // nothing changed yet

    await page.locator('#paymentFilter').selectOption('paid');
    await page.locator('#dueSort').selectOption('farthest');
    await page.getByTestId('tab-ready').click();
    await expect(reset).toBeVisible();

    await reset.click();
    await expect(page.locator('#paymentFilter')).toHaveValue('all');
    await expect(page.locator('#dueSort')).toHaveValue('nearest');
    await expect(page.getByTestId('tab-in-progress')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('order-card')).toHaveCount(1);
    await expect(reset).toHaveCount(0);
  });

  test('26. a search with no matches says so', async ({ page }) => {
    await createOrder(page, uniqueName('Exists'));

    await page.goto('/orders');
    await page.getByTestId('order-search').fill('zz-nobody-has-this-name');

    await expect(page.getByTestId('order-card')).toHaveCount(0);
    await expect(page.getByText('No orders match "zz-nobody-has-this-name"')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Wrong input is refused
// ---------------------------------------------------------------------------
test.describe('Wrong input', () => {
  test('27. Log order: missing fields turn red only after Save is pressed', async ({ page }) => {
    await page.goto('/orders/new');
    const save = page.getByRole('button', { name: 'Save order' });

    // Empty form: the footer lists what's left, but nothing is red yet,
    // and Save can be pressed (pressing it is what shows the red fields)
    await expect(save).toBeEnabled();
    await expect(page.getByText(/required fields? left/)).toBeVisible();
    await expect(page.locator('.is-invalid')).toHaveCount(0);

    // Fill everything except the due date, then try to save
    await page.locator('#customerName').fill(uniqueName('Incomplete'));
    await page.locator('#product-0').selectOption({ label: 'E2E Chocolate cookies' });
    await page.locator('#qty-0').fill('1');
    await page.locator('#price').fill('20');
    await page.locator('#fulfilmentMethod').selectOption('self-collect');
    await expect(page.getByText(/required field left: Due date/)).toBeVisible();
    await save.click();

    // Only the due date is red, and nothing was saved
    await expect(page.locator('#dueAt')).toHaveClass(/is-invalid/);
    await expect(page.locator('#customerName')).not.toHaveClass(/is-invalid/);
    await expect(page.locator('.action-banner--error')).toContainText('Due date');
    const orders = await (await page.request.get('/api/orders')).json();
    expect(orders).toHaveLength(0);

    // Filling it clears the red straight away
    await page.locator('#dueAt').fill(dateTimeInput(2));
    await expect(page.locator('#dueAt')).not.toHaveClass(/is-invalid/);
    await expect(page.getByText('All set. Ready to save.')).toBeVisible();
  });

  test('28. Log order: delivery needs an address', async ({ page }) => {
    await page.goto('/orders/new');
    const save = page.getByRole('button', { name: 'Save order' });

    await page.locator('#customerName').fill(uniqueName('Delivery'));
    await page.locator('#product-0').selectOption({ label: 'E2E Chocolate cookies' });
    await page.locator('#qty-0').fill('1');
    await page.locator('#price').fill('20');
    await page.locator('#dueAt').fill(dateTimeInput(2));
    await page.locator('#fulfilmentMethod').selectOption('delivery');

    await expect(page.locator('#deliveryAddress')).toBeVisible();
    await expect(page.getByText(/required field left: Delivery address/)).toBeVisible();

    // Trying to save without an address turns the address field red
    await save.click();
    await expect(page.locator('#deliveryAddress')).toHaveClass(/is-invalid/);

    await page.locator('#deliveryAddress').fill('Blk 123 Bedok North Ave 1, #01-01');
    await expect(page.locator('#deliveryAddress')).not.toHaveClass(/is-invalid/);
    await expect(page.getByText('All set. Ready to save.')).toBeVisible();

    // The server refuses a delivery order without an address too
    const product = (await (await page.request.get('/api/products')).json())[0];
    const response = await page.request.post('/api/orders', {
      data: {
        customerName: 'No address',
        items: [{ product: product._id, quantity: 1 }],
        price: 20,
        paymentStatus: 'unpaid',
        fulfilmentMethod: 'delivery',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(response.status()).toBe(400);
  });

  test('29. a deposit bigger than the price is refused', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Big Deposit'), { price: 20 });
    await openOrder(page, order);

    await page.getByTestId('pay-deposit').click();
    const input = page.getByTestId('deposit-input');
    await input.fill('50');
    await input.press('Enter');

    await expect(page.getByText(/Enter a deposit between/)).toBeVisible();
    const saved = await getOrder(page, order._id);
    expect(saved.paymentStatus).toBe('unpaid');
    expect(saved.depositAmount).toBe(0);
  });

  test('30. a refund bigger than what was paid is refused', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Big Refund'), { price: 20, paymentStatus: 'paid' });
    await openOrder(page, order);

    await refundFromCard(page, 999, 'Too much');

    await expect(page.getByTestId('dispute-card')).toContainText('Enter an amount up to $20.00');
    expect((await getOrder(page, order._id)).refundAmount).toBe(0);

    // The server refuses too
    const response = await page.request.post(`/api/orders/${order._id}/refund`, {
      data: { amount: 999, reason: 'Too much' },
    });
    expect(response.status()).toBe(400);
  });

  test('31. cancelling or refunding needs a reason', async ({ page }) => {
    const order = await createOrder(page, uniqueName('No Reason'), { price: 20, paymentStatus: 'paid' });
    await openOrder(page, order);
    const card = page.getByTestId('dispute-card');

    // Cancel with no reason
    await card.getByRole('button', { name: 'Cancel order' }).click();
    await card.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(card).toContainText('Please give a reason.');
    await card.getByRole('button', { name: 'Back' }).click();

    // Refund with no reason
    await card.getByRole('button', { name: 'Refund', exact: true }).click();
    await card.getByRole('button', { name: 'Confirm refund' }).click();
    await expect(card).toContainText('Please give a reason.');

    const saved = await getOrder(page, order._id);
    expect(saved.status).toBe('in-progress');
    expect(saved.refundAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// What happens after cancelling and refunding
// ---------------------------------------------------------------------------
test.describe('After cancelling and refunding', () => {
  test('32. cancelling with materials NOT used puts the stock back', async ({ page }) => {
    const flour = await createTestMaterial(page, 'E2E Flour', 1000);
    const product = await createProductWithRecipe(page, 'E2E Flour cookies', flour, 100);

    const order = await createOrder(page, uniqueName('Stock Back'), { product, quantity: 2 });
    await expect.poll(() => materialQuantity(page, flour._id)).toBe(800); // 2 × 100 g used

    await openOrder(page, order);
    const card = page.getByTestId('dispute-card');
    await card.getByRole('button', { name: 'Cancel order' }).click();
    await expect(card.locator('#mat-used')).not.toBeChecked();
    await card.locator('#dispute-reason').fill('Cancelled before baking');
    await card.getByRole('button', { name: 'Confirm cancellation' }).click();

    await expect(card).toContainText('Materials were returned to stock.');
    await expect.poll(() => materialQuantity(page, flour._id)).toBe(1000);
  });

  test('33. cancelling with materials used does NOT put the stock back (wastage)', async ({ page }) => {
    const flour = await createTestMaterial(page, 'E2E Flour', 1000);
    const product = await createProductWithRecipe(page, 'E2E Flour cookies', flour, 100);

    const order = await createOrder(page, uniqueName('Stock Used'), { product, quantity: 2 });
    await expect.poll(() => materialQuantity(page, flour._id)).toBe(800);

    await openOrder(page, order);
    const card = page.getByTestId('dispute-card');
    await card.getByRole('button', { name: 'Cancel order' }).click();
    await card.locator('#mat-used').check();
    await card.locator('#dispute-reason').fill('Already baked');
    await card.getByRole('button', { name: 'Confirm cancellation' }).click();

    await expect(card).toContainText('Materials were used (not returned to stock).');
    expect(await materialQuantity(page, flour._id)).toBe(800);
    expect((await getOrder(page, order._id)).materialsWasted).toBe(true);
  });

  test('34. keeping the deposit when cancelling', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Keep Deposit'), {
      price: 20,
      paymentStatus: 'deposit',
      depositAmount: 5,
    });
    await openOrder(page, order);

    const card = page.getByTestId('dispute-card');
    await card.getByRole('button', { name: 'Cancel order' }).click();
    await card.locator('#forfeit').check();
    await card.locator('#dispute-reason').fill('Customer cancelled late');
    await card.getByRole('button', { name: 'Confirm cancellation' }).click();

    await expect(card).toContainText('Deposit kept: $5.00');
    expect((await getOrder(page, order._id)).forfeitedAmount).toBe(5);
  });

  test('35. payment is locked after a refund', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Lock Refund'), { price: 20, paymentStatus: 'paid' });
    await openOrder(page, order);

    await refundFromCard(page, 5, 'Partial refund');
    await expect(page.getByTestId('dispute-card')).toContainText('Refunded $5.00');

    for (const step of ['unpaid', 'deposit', 'paid']) {
      await expect(page.getByTestId(`pay-${step}`)).toBeDisabled();
    }

    // The server refuses payment changes too
    const response = await page.request.patch(`/api/orders/${order._id}/payment`, {
      data: { paymentStatus: 'unpaid' },
    });
    expect(response.status()).toBe(400);
  });

  test('36. payment and progress are locked after a cancellation', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Lock Cancel'));
    await openOrder(page, order);

    await cancelFromCard(page, 'No longer needed');
    await expect(statusPill(page)).toHaveText('Cancelled');

    for (const step of ['unpaid', 'deposit', 'paid']) {
      await expect(page.getByTestId(`pay-${step}`)).toBeDisabled();
    }
    for (const stage of ['in-progress', 'ready', 'completed']) {
      await expect(page.getByTestId(`stage-${stage}`)).toBeDisabled();
    }
  });
});

// ---------------------------------------------------------------------------
// Message to customer follows the order
// ---------------------------------------------------------------------------
test.describe('Message to customer updates', () => {
  test('37. moving to Ready changes the automated message', async ({ page }) => {
    const order = await createOrder(page, uniqueName('Msg'));
    await openOrder(page, order);

    const box = page.getByTestId('share-message-input');
    await expect(box).not.toHaveValue('');
    const before = await box.inputValue();

    await page.getByTestId('stage-ready').click();
    await expect(statusPill(page)).toHaveText('Ready');

    await expect(box).not.toHaveValue(before);
    await expect(box).toHaveValue(/ready/i);
  });
});