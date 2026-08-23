import { test as setup, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const STATE_PATH = fileURLToPath(new URL("./.auth/user.json", import.meta.url));
const stamp = Date.now().toString(36);

setup("authenticate", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Username").fill(`pilot${stamp}`);
  await page.getByLabel("Email").fill(`pilot${stamp}@example.com`);
  await page.getByLabel("Password").fill("launchpad7");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { name: "Account created" })
  ).toBeVisible();
  // Fresh panel can win the pointer race vs hydration in dev-mode.
  await page
    .getByRole("button", { name: "Enter the cockpit" })
    .dispatchEvent("click");

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await page.context().storageState({ path: STATE_PATH });
});
