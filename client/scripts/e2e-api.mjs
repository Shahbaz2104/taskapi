/**
 * Boots an in-memory MongoDB + the real Express API for E2E runs.
 * Kept alive until Playwright tears the webServer down.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const mongo = await MongoMemoryServer.create({
  // 8.x binaries SIGSEGV in some sandboxes; 7.0.14 is battle-tested.
  instance: { storageEngine: "wiredTiger" },
  binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
});
const uri = mongo.getUri("taskapi-e2e");

console.log(`[e2e] mongo ready at ${uri}`);

const api = spawn("npx", ["tsx", "src/server.ts"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: "3000",
    MONGO_URI: uri,
    JWT_SECRET: "e2e-only-secret-not-used-in-prod",
    CLIENT_BASE_URL: "http://localhost:5173",
    // No Redis/SMTP/PostHog/Sentry — every subsystem fails soft by design.
  },
  stdio: ["ignore", "inherit", "inherit"],
});

function shutdown() {
  api.kill("SIGTERM");
  void mongo.stop();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
