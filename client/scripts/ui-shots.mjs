/**
 * UI review rig: boots memory-mongo + the real API + Next dev, seeds a
 * realistic account, and captures every surface at desktop + mobile.
 * Output: .ui-shots/*.png (gitignored — review only).
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");

const SHOTS = ".ui-shots";
mkdirSync(SHOTS, { recursive: true });

const mongo = await MongoMemoryServer.create({
  binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
});
const nextBin = path.join(repoRoot, "client", "node_modules", ".bin", "next");
const next = spawn(nextBin, ["dev"], {
  cwd: path.join(repoRoot, "client"),
  env: { ...process.env, PORT: "5173" },
  stdio: ["ignore", "ignore", "ignore"],
});
const api = spawn(tsxBin, ["src/server.ts"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: "3000",
    MONGO_URI: mongo.getUri("uix"),
    JWT_SECRET: "ui-review-secret",
    CLIENT_BASE_URL: "http://localhost:5173",
  },
  stdio: ["ignore", "ignore", "ignore"],
});

const waitFor = async (url, tries = 90) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout: ${url}`);
};
await waitFor("http://localhost:3000/health");
await waitFor("http://localhost:5173");
console.log("[shots] servers up");

const reg = await fetch("http://localhost:3000/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "commander",
    email: "cmd@example.com",
    password: "orbit1234",
  }),
});
const tokens = await reg.json();

const H = {
  Authorization: `Bearer ${tokens.accessToken}`,
  "Content-Type": "application/json",
};
const mk = (body) =>
  fetch("http://localhost:3000/api/v1/tasks", {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });

const day = 86400000;
await mk({
  title: "Launch the falcon",
  priority: "high",
  dueDate: new Date(Date.now() + day).toISOString(),
  tags: ["ops", "launch"],
});
await mk({
  title: "Refuel orbital stage",
  description: "Coordinate with ground crew before window opens.",
  status: "in_progress",
  priority: "high",
});
await mk({
  title: "File flight plan",
  priority: "medium",
  dueDate: new Date(Date.now() - day * 2).toISOString(),
  tags: ["docs"],
});
await mk({
  title: "Calibrate star trackers",
  status: "completed",
  priority: "low",
  tags: ["avionics"],
});
await mk({
  title: "Scrub telemetry from pass 7",
  description: "Downlink was noisy — recheck CRC failures.",
  priority: "medium",
  dueDate: new Date(Date.now() + day * 5).toISOString(),
});
const trash = await mk({ title: "Old burn manifest", priority: "low" });
await fetch("http://localhost:3000/api/v1/tasks/bulk", {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ ids: [trash._id ?? trash.id], action: "trash" }),
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await ctx.addInitScript(
  ([rt, sid]) => {
    localStorage.setItem("taskapi.refresh", rt);
    if (sid) localStorage.setItem("taskapi.session", sid);
  },
  [tokens.refreshToken, String(tokens.sessionId)]
);

const page = await ctx.newPage();
const shot = (name) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

await page.goto("http://localhost:5173/");
await page.waitForTimeout(3500); // hero canvas settle
await shot("01-landing-hero");

await page.goto("http://localhost:5173/login");
await page.waitForTimeout(800);
await shot("02-login");

await page.goto("http://localhost:5173/register");
await page.waitForTimeout(800);
await shot("03-register");

await page.goto("http://localhost:5173/dashboard");
await page.waitForTimeout(2500);
await shot("04-dashboard");

await page.goto("http://localhost:5173/trash");
await page.waitForTimeout(1200);
await shot("05-trash");

await page.goto("http://localhost:5173/settings");
await page.waitForTimeout(1500);
await shot("06-settings");

await page.goto("http://localhost:5173/shared");
await page.waitForTimeout(1200);
await shot("07-shared-empty");

// task detail
const listRes = await fetch(
  "http://localhost:3000/api/v1/tasks?limit=1&status=in_progress",
  { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
);
const firstTask = (await listRes.json()).tasks[0];
if (firstTask) {
  await page.goto(`http://localhost:5173/dashboard/task/${firstTask._id}`);
  await page.waitForTimeout(1500);
  await shot("08-task-detail");
}

// mobile passes
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mob.addInitScript(
  ([rt]) => localStorage.setItem("taskapi.refresh", rt),
  [tokens.refreshToken]
);
const mp = await mob.newPage();
await mp.goto("http://localhost:5173/");
await mp.waitForTimeout(3000);
await mp.screenshot({ path: `${SHOTS}/m1-landing.png`, fullPage: false });
await mp.goto("http://localhost:5173/dashboard");
await mp.waitForTimeout(2000);
await mp.screenshot({ path: `${SHOTS}/m2-dashboard.png`, fullPage: true });
await mob.close();

await browser.close();
shutdown();
process.exit(0);

function shutdown() {
  api.kill("SIGTERM");
  next.kill("SIGTERM");
  void mongo.stop();
}
