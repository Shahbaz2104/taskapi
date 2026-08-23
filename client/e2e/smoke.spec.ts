import { test, expect } from "@playwright/test";

/**
 * One continuous flight (authed via setup project): create → complete →
 * trash → undo → trash → restore → settings → sign out.
 */
const TASK = "Launch the falcon";

test.describe.configure({ mode: "serial" });

test("create a task", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Control deck" })
  ).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill(TASK);
  await page.getByRole("button", { name: "Create task", exact: true }).click();

  await expect(page.getByRole("link", { name: TASK })).toBeVisible();
});

test("complete it optimistically", async ({ page }) => {
  const toggle = page.getByRole("checkbox", { name: `Complete "${TASK}"` });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("trash it, then undo via toast", async ({ page }) => {
  await page.getByRole("button", { name: `Actions for "${TASK}"` }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();

  await expect(page.getByRole("link", { name: TASK })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: TASK })).toBeVisible();
});

test("delete again and restore from the trash page", async ({ page }) => {
  await page.getByRole("button", { name: `Actions for "${TASK}"` }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();

  await page.getByRole("link", { name: "Trash" }).click();
  await expect(
    page.getByText("trashed", { exact: false }).first()
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Restore/ })
    .first()
    .click();

  await page.getByRole("link", { name: "Deck" }).click();
  await expect(page.getByRole("link", { name: TASK })).toBeVisible();
});

test("settings shows this device among sessions", async ({ page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("this device").first()).toBeVisible();
});

test("sign out returns to login", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
