// Shared helpers for the order end-to-end tests (orders.spec.js).
//
// Every test gets its OWN brand-new seller account (username starts with "e2e_"),
// with one product, and makes its own orders. So tests never depend on each other,
// can run in parallel, and don't need the seed data.
// After each test the account and all its data are deleted with deleteUserAndData() from db.js.
import { expect } from '@playwright/test';

// A new test seller. Usernames must be 3–20 characters and start with "e2e_"
// (db.js refuses to delete anything else), e.g. "e2e_o_lzx4k2ab17".
export function newTestUser() {
  const id = Date.now().toString(36) + Math.floor(Math.random() * 100);
  const username = `e2e_o_${id}`.slice(0, 20);
  return {
    username,
    email: `${username}@example.com`,
    shopName: 'E2E Order Shop',
    password: 'password1234',
  };
}

// Creates the account through the API (same as the Register page does)
export async function registerUser(page, user) {
  const response = await page.request.post('/api/auth/register', { data: user });

  // If this fails, show what the server actually said, to make the cause obvious.
  // A 500 with an empty or HTML body usually means the API server on :3000 isn't running
  // (Vite answers 500 when it can't reach it).
  if (response.status() !== 201) {
    const body = await response.text();
    throw new Error(
      `Registering ${user.username} failed with ${response.status()}: ${body.slice(0, 300) || '(empty response)'}\n` +
        'Check the terminal running the server for an error, and that http://localhost:3000 is up.'
    );
  }
}

// Gives the test seller one product, so orders can be made
export async function createTestProduct(page) {
  const response = await page.request.post('/api/products', {
    data: { name: 'E2E Chocolate cookies', price: 20 },
  });
  expect(response.status(), 'creating the test product should work').toBe(201);
  return response.json();
}

// Log in through the API. page.request shares cookies with the browser,
// so after this every page.goto() is already logged in.
export async function login(page, user) {
  const response = await page.request.post('/api/auth/login', {
    data: { username: user.username, password: user.password, rememberMe: false },
  });
  expect(response.ok(), `logging in as ${user.username} should work`).toBeTruthy();

  // The app keeps the logged-in user in localStorage for the profile button
  const loggedInUser = await response.json();
  await page.addInitScript((u) => localStorage.setItem('user', JSON.stringify(u)), loggedInUser);
}

// A customer name nobody else has, e.g. "E2E Tan 1730612345678-482"
export function uniqueName(label) {
  const random = Math.floor(Math.random() * 1000);
  return `E2E ${label} ${Date.now()}-${random}`;
}

// The seller's first product (used to build test orders)
export async function firstProduct(page) {
  const response = await page.request.get('/api/products');
  expect(response.ok()).toBeTruthy();
  const products = await response.json();
  expect(products.length, 'the test seller needs a product (createTestProduct)').toBeGreaterThan(0);
  return products[0];
}

// Creates an order through the API and returns it (with _id and orderNo).
// options: { paymentStatus, depositAmount, price, status, dueInDays, product, quantity }
//   status: 'in-progress' (default), 'ready' or 'completed'
export async function createOrder(page, customerName, options = {}) {
  const product = options.product ?? (await firstProduct(page));
  const price = options.price ?? 20;

  // Due in 2 days by default, so it is never shown as overdue
  const days = options.dueInDays ?? 2;
  const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const response = await page.request.post('/api/orders', {
    data: {
      customerName,
      customerContact: '91234567',
      items: [{ product: product._id, variantId: null, quantity: options.quantity ?? 1 }],
      price,
      paymentStatus: options.paymentStatus ?? 'unpaid',
      depositAmount: options.depositAmount ?? 0,
      fulfilmentMethod: 'self-collect',
      dueAt,
      rawMessage: 'Hi, can I order 1 box please? Thanks!',
    },
  });
  expect(response.status(), 'creating the test order should work').toBe(201);
  const order = await response.json();

  // Move it to Ready / Completed if the test needs that
  if (options.status && options.status !== 'in-progress') {
    if (options.status === 'completed') {
      await setStatus(page, order._id, 'ready');
    }
    await setStatus(page, order._id, options.status);
  }

  return order;
}

export async function setStatus(page, id, status) {
  const response = await page.request.patch(`/api/orders/${id}/status`, { data: { status } });
  expect(response.ok(), `setting status to ${status} should work`).toBeTruthy();
}

// Reads an order straight from the server, to check what was really saved
export async function getOrder(page, id) {
  const response = await page.request.get(`/api/orders/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

// Opens the Order detail page and waits until it has loaded
export async function openOrder(page, order) {
  await page.goto(`/orders/${order._id}`);
  await expect(page.getByRole('heading', { level: 1, name: order.customerName })).toBeVisible();
}

// Cancels the order from the "Cancellation and refund" card
export async function cancelFromCard(page, reason) {
  const card = page.getByTestId('dispute-card');
  await card.getByRole('button', { name: 'Cancel order' }).click();
  await card.locator('#dispute-reason').fill(reason);
  await card.getByRole('button', { name: 'Confirm cancellation' }).click();
}

// Refunds the order from the "Cancellation and refund" card
export async function refundFromCard(page, amount, reason) {
  const card = page.getByTestId('dispute-card');
  await card.getByRole('button', { name: 'Refund', exact: true }).click();
  await card.locator('#refund-amount').fill(String(amount));
  await card.locator('#dispute-reason').fill(reason);
  await card.getByRole('button', { name: 'Confirm refund' }).click();
}

// ---- Materials (for the stock tests) ----

// Creates a quantity-tracked material, e.g. 1000 g of flour
export async function createTestMaterial(page, name, quantity) {
  const response = await page.request.post('/api/materials', {
    data: { name, unit: 'g', trackingMode: 'quantity', quantity, lowStockThreshold: 0 },
  });
  expect(response.status(), 'creating the test material should work').toBe(201);
  return response.json();
}

// Creates a product whose recipe uses `amountPerUnit` of the material for each unit
export async function createProductWithRecipe(page, name, material, amountPerUnit) {
  const response = await page.request.post('/api/products', {
    data: { name, price: 20, recipe: [{ material: material._id, amountPerUnit }] },
  });
  expect(response.status(), 'creating the recipe product should work').toBe(201);
  return response.json();
}

// The material's current quantity, read from the server
export async function materialQuantity(page, materialId) {
  const response = await page.request.get('/api/materials');
  expect(response.ok()).toBeTruthy();
  const materials = await response.json();
  const material = materials.find((m) => m._id === materialId);
  expect(material, 'the test material should still exist').toBeTruthy();
  return material.quantity;
}