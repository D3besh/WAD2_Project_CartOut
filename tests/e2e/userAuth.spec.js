import { test, expect } from "@playwright/test";
import { deleteUserByUsername } from "./helpers/db";

function getTestUser(browserName) {
  return {
    username: `e2e_test_${browserName}`,
    email: `e2e_${browserName}@example.com`,
    shopName: "E2E Test Shop",
    password: "password1234",
  };
}

test.describe("account lifecycle", async () => {

  test.beforeEach(async ({}, testInfo) => {
    const user = getTestUser(testInfo.project.name);
    await deleteUserByUsername(user.username);
  });

  test.afterEach(async ({}, testInfo) => {
    const user = getTestUser(testInfo.project.name);
    await deleteUserByUsername(user.username);
  });

  test("register, edit profile, log out and in, delete", async ({ page }, testInfo) => {
    const TEST_USER = getTestUser(testInfo.project.name);

    const UPDATED = {
      shopName: "E2E Updated Shop",
      email: `e2e_test_${testInfo.project.name}_new@example.com`,
      password: "password12345",
    };

    await test.step("Register", async () => {
      await page.goto("http://localhost:5173/login");
      await page.getByRole("link", { name: "Create one" }).click();

      await page
        .getByRole("textbox", { name: "Username" })
        .fill(TEST_USER.username);
      await page.getByRole("textbox", { name: "Email" }).fill(TEST_USER.email);
      await page
        .getByRole("textbox", { name: "Shop name" })
        .fill(TEST_USER.shopName);
      await page
        .getByRole("textbox", { name: "Password", exact: true })
        .fill(TEST_USER.password);
      await page
        .getByRole("textbox", { name: "Confirm password" })
        .fill(TEST_USER.password);
      await page.getByRole("button", { name: "Create account" }).click();

      await expect(page).toHaveURL(/login/);
    });

    await test.step("Log In", async () => {
      await page
        .getByRole("textbox", { name: "Username" })
        .fill(TEST_USER.username);
      await page
        .getByRole("textbox", { name: "Password" })
        .fill(TEST_USER.password);
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(
        page.getByRole("heading", { name: TEST_USER.shopName }),
      ).toBeVisible();
    });

    await test.step("View and edit profile", async () => {
      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "View profile" }).click();
      await expect(
        page.getByText(`Shop name${TEST_USER.shopName}`),
      ).toBeVisible();
      await expect(
        page.getByText(`Username${TEST_USER.username}`),
      ).toBeVisible();
      await expect(page.getByText(`Email${TEST_USER.email}`)).toBeVisible();

      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "Edit profile" }).click();
      await page.locator('input[type="text"]').click();
      await page.locator('input[type="text"]').fill(UPDATED.shopName);
      await page.getByRole("button", { name: "Update shop name" }).click();
      await expect(
        page.getByRole("heading", { name: UPDATED.shopName }),
      ).toBeVisible();
      await expect(page.getByText("Shop name updated!")).toBeVisible();

      await page.locator('input[type="email"]').click();
      await page.locator('input[type="email"]').click();
      await page.locator('input[type="email"]').fill(UPDATED.email);
      await page.getByRole("button", { name: "Update email" }).click();
      await expect(page.getByText("Email updated!")).toBeVisible();

      await page.getByRole("textbox", { name: "Current password" }).click();
      await page
        .getByRole("textbox", { name: "Current password" })
        .fill(TEST_USER.password);
      await page
        .getByRole("textbox", { name: "New password", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "New password", exact: true })
        .fill(UPDATED.password);
      await page.getByRole("textbox", { name: "Confirm new password" }).click();
      await page
        .getByRole("textbox", { name: "Confirm new password" })
        .fill(UPDATED.password);
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByText("Password updated!")).toBeVisible();
    });

    await test.step("User successfully logout", async () => {
      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();
      await page.getByRole("button", { name: "Log out" }).click();

      await expect(
        page.getByRole("heading", { name: "You've been logged out" }),
      ).toBeVisible();
    });

    await test.step("User successfully logs in using updated password", async () => {
      await page.getByRole("button", { name: "Log in again" }).click();
      await expect(page).toHaveURL(/login/);
      await page
        .getByRole("textbox", { name: "Username" })
        .fill(TEST_USER.username);
      await page
        .getByRole("textbox", { name: "Password" })
        .fill(UPDATED.password);
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(
        page.getByRole("heading", { name: UPDATED.shopName }),
      ).toBeVisible();
    });

    await test.step("User succesfully deletes account", async () => {
      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "View profile" }).click();
      await page.getByRole("link", { name: "Edit profile" }).click();
      await page.getByRole("button", { name: "Delete account" }).click();
      await page
        .getByRole("textbox", { name: "Password", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Password", exact: true })
        .fill(UPDATED.password);
      await page.getByRole("button", { name: "Delete forever" }).click();

      await expect(
        page.getByRole("heading", { name: "Your account has been deleted" }),
      ).toBeVisible();
    });

    await test.step("User can go to account creation page after deletion", async () => {
      await page.getByRole("button", { name: "Create a new account" }).click();

      await expect(
        page.getByRole("heading", { name: "Create your account" }),
      ).toBeVisible();
      await expect(
        page.getByText("Set up your shop in a minute."),
      ).toBeVisible();
    });
  });
});


test('Login error handling', async({page}) => {
  await page.goto('http://localhost:5173/login');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('benbakes');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('12345');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByText('Invalid username or password')).toBeVisible();
})

test('Password lesser than 8 characters error handling', async({page}) => {
  await page.goto('http://localhost:5173/register');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('benbakes');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('benbakes55@gmail.com');
  await page.getByRole('textbox', { name: 'Shop name' }).click();
  await page.getByRole('textbox', { name: 'Shop name' }).fill('benshop');
  await page.getByRole('textbox', { name: 'Password', exact: true }).click();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('1234567');
  await page.getByRole('textbox', { name: 'Confirm password' }).click();
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('1234567');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Password must be at least 8')).toBeVisible();
})

test('Username already taken error handling', async({page}) => {
  await page.goto('http://localhost:5173/register');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('benbakes');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('benbakes55@gmail.com');
  await page.getByRole('textbox', { name: 'Shop name' }).click();
  await page.getByRole('textbox', { name: 'Shop name' }).fill('benshop');
  await page.getByRole('textbox', { name: 'Password', exact: true }).click();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('12345678');
  await page.getByRole('textbox', { name: 'Confirm password' }).click();
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('12345678');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('username already taken')).toBeVisible();
})

test('Passwords do not match error handling', async({page}) => {
  await page.goto('http://localhost:5173/register');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('benbakes555');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('benbakes55@gmail.com');
  await page.getByRole('textbox', { name: 'Shop name' }).click();
  await page.getByRole('textbox', { name: 'Shop name' }).fill('benshop');
  await page.getByRole('textbox', { name: 'Password', exact: true }).click();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('12345678');
  await page.getByRole('textbox', { name: 'Confirm password' }).click();
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('123456789');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Passwords do not match.')).toBeVisible();
})