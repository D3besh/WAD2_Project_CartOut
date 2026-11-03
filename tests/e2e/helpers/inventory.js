// Shared helpers for the Materials and Products end-to-end tests
// (materials.spec.js and products.spec.js).
//
// Same idea as helpers/orders.js: set up data through the API (fast), so each
// test only clicks through the part it is actually testing.
// The test seller, login and clean-up come from helpers/orders.js and helpers/db.js.
import { expect } from '@playwright/test';

// ---- Set-up through the API ----

// Creates a material. Unlike createTestMaterial() in orders.js, you can choose the
// unit and the low-stock level, e.g.
//   await createMaterial(page, { name: 'E2E Vanilla', unit: 'ml', quantity: 40, lowStockThreshold: 50 })
export async function createMaterial(page, { name, unit = 'g', quantity = 0, lowStockThreshold = null }) {
  const response = await page.request.post('/api/materials', {
    data: { name, unit, trackingMode: 'quantity', quantity, lowStockThreshold },
  });
  expect(response.status(), `creating the material ${name} should work`).toBe(201);
  return response.json();
}

// Creates a product, e.g.
//   await createProduct(page, { name: 'E2E Cookies', recipe: [{ material: flour._id, amountPerUnit: 200 }] })
// variants: [{ name: 'Large', price: 25, extras: [{ material: flour._id, amountPerUnit: 300 }] }]
export async function createProduct(page, { name, price = 20, recipe = [], variants = [] }) {
  const response = await page.request.post('/api/products', {
    data: { name, price, recipe, variants },
  });
  expect(response.status(), `creating the product ${name} should work`).toBe(201);
  return response.json();
}

// ---- Reading what the server really saved ----

// One material by name, or undefined if it doesn't exist
export async function getMaterial(page, name) {
  const response = await page.request.get('/api/materials');
  expect(response.ok()).toBeTruthy();
  const materials = await response.json();
  return materials.find((m) => m.name === name);
}

// One product by name, or undefined if it doesn't exist
export async function getProduct(page, name) {
  const response = await page.request.get('/api/products');
  expect(response.ok()).toBeTruthy();
  const products = await response.json();
  return products.find((p) => p.name === name);
}

// ---- Pages ----

// Opens Materials and waits until it has loaded
export async function openMaterials(page) {
  await page.goto('/materials');
  await expect(page.getByTestId('page-materials')).toBeVisible();
}

// Opens Products and waits until it has loaded
export async function openProducts(page) {
  await page.goto('/products');
  await expect(page.getByTestId('page-products')).toBeVisible();
}

// The card for one material or product (every card is an <article>)
export function cardFor(page, name) {
  return page.locator('article', { has: page.getByRole('heading', { name, exact: true }) });
}

// The Add / Edit pop-up on Materials and Products
export function formModal(page) {
  return page.locator('.inv-modal');
}

// The "What to buy" panel on Materials, and one material's row in it
export function whatToBuy(page) {
  return page.locator('aside.buy');
}
export function buyRow(page, name) {
  return whatToBuy(page).locator('.buy__row', { hasText: name });
}

// In the "How much X did you buy?" pop-up: type the amount, pick the unit, Save.
// e.g. await fillBought(page, 'E2E Flour', 1, 'kg')
export async function fillBought(page, name, amount, unitLabel) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `How much ${name} did you buy?` })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: `How much ${name} did you buy?` }).fill(String(amount));
  if (unitLabel) {
    await dialog.getByRole('combobox', { name: `Unit for ${name}` }).selectOption(unitLabel);
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0); // the pop-up closed = saved
}