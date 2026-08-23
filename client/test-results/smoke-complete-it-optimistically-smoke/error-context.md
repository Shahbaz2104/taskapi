# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> complete it optimistically
- Location: e2e/smoke.spec.ts:22:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('checkbox', { name: 'Complete "Launch the falcon"' })

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * One continuous flight (authed via setup project): create → complete →
  5  |  * trash → undo → trash → restore → settings → sign out.
  6  |  */
  7  | const TASK = "Launch the falcon";
  8  | 
  9  | test.describe.configure({ mode: "serial" });
  10 | 
  11 | test("create a task", async ({ page }) => {
  12 |   await page.goto("/dashboard");
  13 |   await expect(page.getByRole("heading", { name: "Control deck" })).toBeVisible();
  14 | 
  15 |   await page.getByRole("button", { name: "New task" }).click();
  16 |   await page.getByLabel("Title").fill(TASK);
  17 |   await page.getByRole("button", { name: "Create task", exact: true }).click();
  18 | 
  19 |   await expect(page.getByRole("link", { name: TASK })).toBeVisible();
  20 | });
  21 | 
  22 | test("complete it optimistically", async ({ page }) => {
  23 |   const toggle = page.getByRole("checkbox", { name: `Complete "${TASK}"` });
> 24 |   await toggle.click();
     |                ^ Error: locator.click: Test timeout of 60000ms exceeded.
  25 |   await expect(toggle).toHaveAttribute("aria-checked", "true");
  26 | });
  27 | 
  28 | test("trash it, then undo via toast", async ({ page }) => {
  29 |   await page.getByRole("button", { name: `Actions for "${TASK}"` }).click();
  30 |   await page.getByRole("menuitem", { name: "Move to trash" }).click();
  31 | 
  32 |   await expect(page.getByRole("link", { name: TASK })).toHaveCount(0);
  33 |   await page.getByRole("button", { name: "Undo" }).click();
  34 |   await expect(page.getByRole("link", { name: TASK })).toBeVisible();
  35 | });
  36 | 
  37 | test("delete again and restore from the trash page", async ({ page }) => {
  38 |   await page.getByRole("button", { name: `Actions for "${TASK}"` }).click();
  39 |   await page.getByRole("menuitem", { name: "Move to trash" }).click();
  40 | 
  41 |   await page.getByRole("link", { name: "Trash" }).click();
  42 |   await expect(page.getByText("trashed", { exact: false }).first()).toBeVisible();
  43 |   await page.getByRole("button", { name: /Restore/ }).first().click();
  44 | 
  45 |   await page.getByRole("link", { name: "Deck" }).click();
  46 |   await expect(page.getByRole("link", { name: TASK })).toBeVisible();
  47 | });
  48 | 
  49 | test("settings shows this device among sessions", async ({ page }) => {
  50 |   await page.getByRole("link", { name: "Settings" }).click();
  51 |   await expect(page.getByText("this device").first()).toBeVisible();
  52 | });
  53 | 
  54 | test("sign out returns to login", async ({ page }) => {
  55 |   await page.getByRole("button", { name: "Sign out" }).click();
  56 |   await expect(page).toHaveURL(/\/login$/);
  57 | });
  58 | 
```