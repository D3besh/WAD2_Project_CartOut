// End-to-end tests for the Materials page:
// add / edit / delete, Mark as bought, What to buy, search, filter, paging,
// plus wrong-input and security checks.
//
// Run with: npm run test:e2e
// Needs the app running (server on :3000 + Vite on :5173, e.g. `npm run dev`)
// and MongoDB + the .env file that db.js reads.
//
// Every test registers its own "e2e_" seller, makes its own materials, and afterwards
// deletes the seller and everything they made with deleteUserAndData() (db.js).
import { test, expect } from '@playwright/test';
import { deleteUserAndData } from './helpers/db.js';
import { newTestUser, registerUser, login, uniqueName } from './helpers/orders.js';
import {
  createMaterial,
  createProduct,
  getMaterial,
  openMaterials,
  cardFor,
  formModal,
  buyRow,
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
    await deleteUserAndData(testUser.username); // the seller and all their materials
  }
});

// ---------------------------------------------------------------------------
// Add, edit, delete
// ---------------------------------------------------------------------------
test.describe('Materials: add, edit, delete', () => {
  test('1. adding a material shows it in kg, and it is saved', async ({ page }) => {
    const name = uniqueName('Butter');
    await openMaterials(page);

    await page.getByRole('button', { name: '+ Add material' }).click();
    const form = formModal(page);
    await form.locator('#material-name').fill(name);
    await form.locator('#material-unit').selectOption('g');
    await form.getByRole('button', { name: 'Exact amount' }).click();
    await form.locator('#material-qty').fill('2000');
    await form.locator('#material-threshold').fill('500');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(`${name} added.`)).toBeVisible();

    // Shown in kg, not 2000 g
    const card = cardFor(page, name);
    await expect(card.locator('.inv-qty')).toHaveText(/^\s*2\s*kg\s*$/);
    await expect(card).toContainText('Low below 500 g');
    await expect(card).toContainText('In stock');

    // Still there after a reload = really saved in the database
    await page.reload();
    await expect(cardFor(page, name)).toBeVisible();

    const saved = await getMaterial(page, name);
    expect(saved.quantity).toBe(2000);
    expect(saved.unit).toBe('g');
    expect(saved.lowStockThreshold).toBe(500);
  });

  test('2. editing a material saves the change', async ({ page }) => {
    const name = uniqueName('Sugar');
    await createMaterial(page, { name, unit: 'g', quantity: 3000, lowStockThreshold: 500 });
    await openMaterials(page);

    await cardFor(page, name).getByRole('button', { name: 'Edit' }).click();
    const form = formModal(page);
    await expect(form.locator('#material-name')).toHaveValue(name); // the form is filled in
    await form.locator('#material-threshold').fill('800');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(`Changes to ${name} saved.`)).toBeVisible();
    await expect(cardFor(page, name)).toContainText('Low below 800 g');
    expect((await getMaterial(page, name)).lowStockThreshold).toBe(800);
  });

  test('3. deleting a material removes it', async ({ page }) => {
    const name = uniqueName('Old');
    await createMaterial(page, { name, quantity: 100 });
    await openMaterials(page);

    page.once('dialog', (dialog) => dialog.accept()); // "Delete X?" → OK
    await cardFor(page, name).getByRole('button', { name: 'Edit' }).click();
    await formModal(page).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(`${name} deleted.`)).toBeVisible();
    await expect(cardFor(page, name)).toHaveCount(0);
    expect(await getMaterial(page, name)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mark as bought and What to buy
// ---------------------------------------------------------------------------
test.describe('Materials: Mark as bought and What to buy', () => {
  test('4. Mark as bought on a card adds to the stock', async ({ page }) => {
    const name = uniqueName('Flour');
    await createMaterial(page, { name, unit: 'g', quantity: 1000 });
    await openMaterials(page);

    await cardFor(page, name).getByRole('button', { name: 'Mark as bought' }).click();
    await fillBought(page, name, 1, 'kg'); // bought 1 kg

    await expect(page.getByText(`${name} restocked.`)).toBeVisible();
    await expect(cardFor(page, name).locator('.inv-qty')).toHaveText(/^\s*2\s*kg\s*$/);
    expect((await getMaterial(page, name)).quantity).toBe(2000);
  });

  test('5. a low material is in What to buy, and buying the suggested amount clears it', async ({ page }) => {
    const name = uniqueName('Vanilla');
    await createMaterial(page, { name, unit: 'ml', quantity: 40, lowStockThreshold: 50 });
    await openMaterials(page);

    // Low on its card, and listed in What to buy
    await expect(cardFor(page, name)).toContainText('Low stock');
    const row = buyRow(page, name);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Low now');

    // Keep the suggested amount and save
    await row.getByRole('button', { name: 'Mark as bought' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();

    // Gone from What to buy, and no longer low
    await expect(buyRow(page, name)).toHaveCount(0);
    await expect(cardFor(page, name)).toContainText('In stock');
    expect((await getMaterial(page, name)).isLow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Search, filter, paging
// ---------------------------------------------------------------------------
test.describe('Materials: search, filter, paging', () => {
  test('6. search and the Low stock filter', async ({ page }) => {
    const plenty = uniqueName('Eggs');
    const low = uniqueName('Matcha');
    await createMaterial(page, { name: plenty, unit: 'pieces', quantity: 60, lowStockThreshold: 12 });
    await createMaterial(page, { name: low, unit: 'g', quantity: 50, lowStockThreshold: 100 });
    await openMaterials(page);
    const cards = page.locator('.mat-grid article');
    await expect(cards).toHaveCount(2);

    // Search (capitals shouldn't matter)
    await page.locator('#material-search').fill(low.toLowerCase());
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(low);
    await page.locator('#material-search').fill('');

    // Low stock filter shows only the low one, and its count
    const lowChip = page.getByRole('button', { name: /^Low stock/ });
    await expect(lowChip).toContainText('1');
    await lowChip.click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(low);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(cards).toHaveCount(2);
  });

  test('7. 12 materials per page, and Next shows the rest', async ({ page }) => {
    const prefix = uniqueName('Page');
    for (let i = 1; i <= 13; i++) {
      await createMaterial(page, { name: `${prefix} ${String(i).padStart(2, '0')}`, quantity: 100 });
    }
    await openMaterials(page);
    const cards = page.locator('.mat-grid article');

    await expect(cards).toHaveCount(12);
    await expect(page.getByText('Showing 1–12 of 13 materials')).toBeVisible();

    await page.getByRole('button', { name: /Next/ }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText('Showing 13–13 of 13 materials')).toBeVisible();

    await page.getByRole('button', { name: /Prev/ }).click();
    await expect(cards).toHaveCount(12);
  });
});

// ---------------------------------------------------------------------------
// Wrong input is refused
// ---------------------------------------------------------------------------
test.describe('Materials: wrong input', () => {
  test('8. a material needs a name', async ({ page }) => {
    await openMaterials(page);
    await page.getByRole('button', { name: '+ Add material' }).click();
    const form = formModal(page);
    await form.locator('#material-qty').fill('100');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(form).toContainText('Please enter a name');
    await expect(page.locator('.mat-grid article')).toHaveCount(0);

    // The server refuses too
    const response = await page.request.post('/api/materials', {
      data: { name: '', unit: 'g', trackingMode: 'quantity', quantity: 100 },
    });
    expect(response.status()).toBe(400);
  });

  test('9. a negative amount is refused', async ({ page }) => {
    const name = uniqueName('Negative');
    await openMaterials(page);
    await page.getByRole('button', { name: '+ Add material' }).click();
    const form = formModal(page);
    await form.locator('#material-name').fill(name);
    await form.getByRole('button', { name: 'Exact amount' }).click();
    await form.locator('#material-qty').fill('-5');
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(form.locator('.inv-banner--danger')).toBeVisible(); // error shown in the pop-up
    expect(await getMaterial(page, name)).toBeUndefined(); // nothing saved

    // The server refuses too
    const response = await page.request.post('/api/materials', {
      data: { name, unit: 'g', trackingMode: 'quantity', quantity: -5 },
    });
    expect(response.status()).toBe(400);
  });

  test('10. a material used in a recipe cannot be deleted', async ({ page }) => {
    const name = uniqueName('Butter');
    const butter = await createMaterial(page, { name, quantity: 1000 });
    await createProduct(page, { name: uniqueName('Shortbread'), recipe: [{ material: butter._id, amountPerUnit: 100 }] });
    await openMaterials(page);

    page.once('dialog', (dialog) => dialog.accept());
    await cardFor(page, name).getByRole('button', { name: 'Edit' }).click();
    await formModal(page).getByRole('button', { name: 'Delete' }).click();

    await expect(formModal(page)).toContainText('Remove it from these products first');
    expect(await getMaterial(page, name)).toBeTruthy(); // still there
  });
});

// ---------------------------------------------------------------------------
// Security: sellers only see their own materials
// ---------------------------------------------------------------------------
test.describe('Materials: security', () => {
  test('11. another seller cannot see or change my material', async ({ page }) => {
    const name = uniqueName('Private');
    const mine = await createMaterial(page, { name, quantity: 1000 });

    const otherUser = newTestUser();
    await registerUser(page, otherUser);
    await login(page, otherUser);

    try {
      // API: not in their list, and can't edit, restock or delete it
      const list = await (await page.request.get('/api/materials')).json();
      expect(list.some((m) => m._id === mine._id)).toBe(false);
      expect((await page.request.put(`/api/materials/${mine._id}`, { data: { name: 'Hacked' } })).status()).toBe(404);
      expect(
        (await page.request.patch(`/api/materials/${mine._id}/restock`, { data: { amount: 500 } })).status()
      ).toBe(404);
      expect((await page.request.delete(`/api/materials/${mine._id}`)).status()).toBe(404);

      // Page: not shown on their Materials page
      await openMaterials(page);
      await expect(page.getByText(name)).toHaveCount(0);
    } finally {
      await deleteUserAndData(otherUser.username);
    }

    // Back as the real seller: nothing was changed
    await login(page, testUser);
    const saved = await getMaterial(page, name);
    expect(saved.quantity).toBe(1000);
  });
});