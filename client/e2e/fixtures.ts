import { test as base, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const STATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".auth/user.json"
);

/**
 * One browser context per WORKER, seeded once from the auth setup's
 * storage state — the smoke flight is continuous: refresh tokens are
 * single-use and rotate on every boot restore, so per-test contexts
 * re-seeded from the static file would replay a dead token and trip
 * theft detection.
 */
export const test = base.extend<{}, { sharedPage: Page }>({
  sharedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        storageState: STATE_PATH,
      });
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect };
