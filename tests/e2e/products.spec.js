// End-to-end tests for the Products page:
// "Can make now" worked out from real stock, variants, the tomorrow status
// (✓ Enough / ⚠ Need more → What to buy on Materials), add / delete,
// plus wrong-input and security checks.
//
// Run with: npm run test:e2e
// Needs the app running (server on :3000 + Vite on :5173, e.g. `npm run dev`)
// and MongoDB + the .env file that db.js reads.
//
// Every test registers its own "e2e_" seller, makes its own materials and products,
// and afterwards deletes the seller and everything they made with deleteUserAndData() (db.js).
import { test, expect } from '@playwright/test';
import { deleteUserAndData } from './helpers/db.js';
import { newTestUser, registerUser, login, uniqueName, createOrder } from './helpers/orders.js';
import {
  createMaterial,
  createProduct,
  getProduct,
  openMaterials,
  openProducts,
  cardFor,
  formModal,
  whatToBuy,
  fillBought,
} from './helpers/inventory.js';

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

// The seller for the test that is running
let testUser;

test.beforeEach(async ({ page }) => {
  testUser = newTestUser();
  await deleteUserAndData(testUser.username); // in case an old run left it behind
  await registerUser(page, testUser);
  await login(page, testUser);
});

test.afterEach(async () => {
  if (testUser) {
    await deleteUserAndData(testUser.username); // the seller and all their products and materials
  }
});

// One option's row inside a product card ("Regular", "Large", ...)
function optionRow(card, optionName) {
  return card.locator('.inv-cap-row', { hasText: optionName });
}

// 1000 g of flour + a product that uses 200 g each → can make 5
async function flourAndCookies(page) {
  const flourName = uniqueName('Flour');
  const flour = await createMaterial(page, { name: flourName, unit: 'g', quantity: 1000 });
  const cookiesName = uniqueName('Cookies');
  const cookies = await createProduct(page, {
    name: cookiesName,
    recipe: [{ material: flour._id, amountPerUnit: 200 }],
  });
  return { flour, flourName, cookies, cookiesName };
}

// ---------------------------------------------------------------------------
// Can make now
// ---------------------------------------------------------------------------
test.describe('Products: can make now', () => {
  test('1. adding a product with a recipe shows how many you can make', async ({ page }) => {
    const flourName = uniqueName('Flour');
    await createMaterial(page, { name: flourName, unit: 'g', quantity: 1000 });
    const name = uniqueName('Cookies');
    await openProducts(page);

    await page.getByRole('button', { name: '+ Add product' }).click();
    const form = formModal(page);
    await form.locator('#product-name').fill(name);
    await form.locator('#product-price').fill('15');
    // Add a recipe line if the form doesn't start with an empty one
    if ((await form.getByLabel('Recipe material 1').count()) === 0) {
      await form.getByRole('button', { name: '+ Add material' }).click();
    }
    await form.getByLabel('Recipe material 1').selectOption({ label: flourName });
    await form.getByLabel('Amount 1', { exact: true }).fill('200');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(`${name} added.`)).toBeVisible();

    // 1000 g ÷ 200 g = 5
    const card = cardFor(page, name);
    await expect(optionRow(card, 'Regular').locator('.cap-num')).toHaveText('5');
    await expect(card).toContainText(`Limited by ${flourName}`);

    const saved = await getProduct(page, name);
    expect(saved.recipe).toHaveLength(1);
    expect(saved.recipe[0].amountPerUnit).toBe(200);
  });

  test('2. buying more on Materials makes Can make go up on Products', async ({ page }) => {
    const { flourName, cookiesName } = await flourAndCookies(page);

    await openProducts(page);
    await expect(optionRow(cardFor(page, cookiesName), 'Regular').locator('.cap-num')).toHaveText('5');

    // Buy 1 kg on the Materials page
    await openMaterials(page);
    await cardFor(page, flourName).getByRole('button', { name: 'Mark as bought' }).click();
    await fillBought(page, flourName, 1, 'kg');

    // 2000 g ÷ 200 g = 10
    await openProducts(page);
    await expect(optionRow(cardFor(page, cookiesName), 'Regular').locator('.cap-num')).toHaveText('10');
  });

  test('3. each variant has its own Can make, using its extra materials', async ({ page }) => {
    const flourName = uniqueName('Flour');
    const flour = await createMaterial(page, { name: flourName, unit: 'g', quantity: 1000 });
    const name = uniqueName('Cake');
    await createProduct(page, {
      name,
      recipe: [{ material: flour._id, amountPerUnit: 200 }],
      variants: [{ name: 'Large', price: 25, extras: [{ material: flour._id, amountPerUnit: 300 }] }],
    });
    await openProducts(page);

    const card = cardFor(page, name);
    await expect(optionRow(card, 'Regular').locator('.cap-num')).toHaveText('5'); // 1000 ÷ 200
    await expect(optionRow(card, 'Large').locator('.cap-num')).toHaveText('2'); // 1000 ÷ (200 + 300)
  });
});

// ---------------------------------------------------------------------------
// Tomorrow: enough or not, and the link to What to buy
// ---------------------------------------------------------------------------
test.describe('Products: tomorrow', () => {
  test('4. enough stock for tomorrow shows ✓', async ({ page }) => {
    const { cookies, cookiesName } = await flourAndCookies(page);
    await createOrder(page, uniqueName('Small'), { product: cookies, quantity: 2, dueInDays: 1 }); // needs 400 g of 1000 g

    await openProducts(page);
    await expect(cardFor(page, cookiesName)).toContainText('Enough for tomorrow');
  });

  test('5. not enough for tomorrow → What to buy → that material is highlighted on Materials', async ({ page }) => {
    const { flourName, cookies, cookiesName } = await flourAndCookies(page);
    // 10 × 200 g = 2000 g, but only 1000 g in stock. The order can still be saved.
    await createOrder(page, uniqueName('Big'), { product: cookies, quantity: 10, dueInDays: 1 });

    await openProducts(page);
    const card = cardFor(page, cookiesName);
    await expect(optionRow(card, 'Regular').locator('.cap-num')).toHaveText('0'); // never a negative number
    await expect(card).toContainText(`Need more ${flourName} for tomorrow`);

    await card.getByRole('link', { name: 'What to buy →' }).click();

    // Materials, with the flour highlighted in What to buy, on the 1 week list
    await expect(page).toHaveURL(/\/materials/);
    const highlighted = whatToBuy(page).locator('.buy__row.is-highlighted');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toContainText(flourName);
    await expect(whatToBuy(page).getByRole('button', { name: '1 week' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('6. nothing ordered or expected tomorrow → no status line', async ({ page }) => {
    const { cookiesName } = await flourAndCookies(page);

    await openProducts(page);
    const card = cardFor(page, cookiesName);
    await expect(card).toBeVisible();
    await expect(card.locator('.fc-status')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Search and delete
// ---------------------------------------------------------------------------
test.describe('Products: search and delete', () => {
  test('7. search by product name', async ({ page }) => {
    const wanted = uniqueName('Brownies');
    await createProduct(page, { name: wanted });
    await createProduct(page, { name: uniqueName('Tarts') }); // should NOT match
    await openProducts(page);

    const cards = page.locator('.prod-grid article');
    await expect(cards).toHaveCount(2);
    await page.locator('#product-search').fill(wanted.toLowerCase());
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(wanted);
  });

  test('8. deleting a product removes it', async ({ page }) => {
    const name = uniqueName('Old product');
    await createProduct(page, { name });
    await openProducts(page);

    page.once('dialog', (dialog) => dialog.accept()); // "Delete X?" → OK
    await cardFor(page, name).getByRole('button', { name: 'Edit' }).click();
    await formModal(page).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(`${name} deleted.`)).toBeVisible();
    await expect(cardFor(page, name)).toHaveCount(0);
    expect(await getProduct(page, name)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wrong input is refused
// ---------------------------------------------------------------------------
test.describe('Products: wrong input', () => {
  test('9. a product needs a name', async ({ page }) => {
    await openProducts(page);
    await page.getByRole('button', { name: '+ Add product' }).click();
    const form = formModal(page);
    await form.locator('#product-price').fill('10');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(form).toContainText('Please enter a product name');
    await expect(page.locator('.prod-grid article')).toHaveCount(0);

    // The server refuses too
    const response = await page.request.post('/api/products', { data: { name: '', price: 10 } });
    expect(response.status()).toBe(400);
  });

  test('10. a recipe amount of 0 is refused by the server', async ({ page }) => {
    const flour = await createMaterial(page, { name: uniqueName('Flour'), quantity: 1000 });
    const response = await page.request.post('/api/products', {
      data: { name: uniqueName('Zero'), price: 10, recipe: [{ material: flour._id, amountPerUnit: 0 }] },
    });
    expect(response.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Security: sellers only see their own products
// ---------------------------------------------------------------------------
test.describe('Products: security', () => {
  test('11. another seller cannot see or change my product', async ({ page }) => {
    const name = uniqueName('Private');
    const mine = await createProduct(page, { name, price: 20 });

    const otherUser = newTestUser();
    await registerUser(page, otherUser);
    await login(page, otherUser);

    try {
      const list = await (await page.request.get('/api/products')).json();
      expect(list.some((p) => p._id === mine._id)).toBe(false);
      expect((await page.request.put(`/api/products/${mine._id}`, { data: { name: 'Hacked', price: 1 } })).status()).toBe(404);
      expect((await page.request.delete(`/api/products/${mine._id}`)).status()).toBe(404);

      await openProducts(page);
      await expect(page.getByText(name)).toHaveCount(0);
    } finally {
      await deleteUserAndData(otherUser.username);
    }

    // Back as the real seller: nothing was changed
    await login(page, testUser);
    const saved = await getProduct(page, name);
    expect(saved.price).toBe(20);
  });
});