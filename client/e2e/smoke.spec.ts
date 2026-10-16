import { test, expect } from "./fixtures";

/**
 * One continuous flight (authed via setup project): create → complete →
 * trash → undo → trash → restore → settings → sign out.
 */
const TASK = "Launch the falcon";

test.describe.configure({ mode: "serial" });

test("create a task", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await expect(
    sharedPage.getByRole("heading", { name: "Control deck" })
  ).toBeVisible();

  await sharedPage.getByRole("button", { name: "New task" }).first().click();
  await sharedPage.getByLabel("Title").fill(TASK);
  await sharedPage
    .getByRole("button", { name: "Create task", exact: true })
    .click();

  await expect(sharedPage.getByRole("link", { name: TASK })).toBeVisible();
});

test("complete it optimistically", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await sharedPage
    .getByRole("checkbox", { name: `Complete "${TASK}"` })
    .click();
  // Completing renames the control: Complete "X" → Mark "X" pending
  await expect(
    sharedPage.getByRole("checkbox", { name: `Mark "${TASK}" pending` })
  ).toHaveAttribute("aria-checked", "true");
});

test("trash it, then undo via toast", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await sharedPage
    .getByRole("button", { name: `Actions for "${TASK}"` })
    .click();
  await sharedPage.getByRole("menuitem", { name: "Move to trash" }).click();

  await expect(sharedPage.getByRole("link", { name: TASK })).toHaveCount(0);
  await sharedPage.getByRole("button", { name: "Undo" }).click();
  await expect(sharedPage.getByRole("link", { name: TASK })).toBeVisible();
});

test("delete again and restore from the trash page", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await sharedPage
    .getByRole("button", { name: `Actions for "${TASK}"` })
    .click();
  await sharedPage.getByRole("menuitem", { name: "Move to trash" }).click();

  await sharedPage.getByRole("link", { name: "Trash" }).click();
  await expect(
    sharedPage.getByText("trashed", { exact: false }).first()
  ).toBeVisible();
  await sharedPage
    .getByRole("button", { name: /Restore/ })
    .first()
    .click();

  await sharedPage.getByRole("link", { name: "Deck" }).click();
  await expect(sharedPage.getByRole("link", { name: TASK })).toBeVisible();
});

test("settings shows this device among sessions", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await sharedPage.getByRole("link", { name: "Settings" }).click();
  await expect(sharedPage.getByText("this device").first()).toBeVisible();
});

test("sign out returns to login", async ({ sharedPage }) => {
  await sharedPage.goto("/dashboard");
  await sharedPage.getByRole("button", { name: "Sign out" }).click();
  await expect(sharedPage).toHaveURL(/\/login$/);
});
