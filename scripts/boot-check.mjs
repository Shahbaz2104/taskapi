import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = process.env.BOOT_CHECK_PORT || 3987;
const BASE = `http://127.0.0.1:${PORT}`;

const waitFor = async (path, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (res.ok) return res;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout waiting for ${path}`);
};

const mongo = await MongoMemoryServer.create();
process.env.NODE_ENV = "production";
process.env.PORT = String(PORT);
process.env.MONGO_URI = mongo.getUri();
process.env.JWT_SECRET = "boot-check-secret";

await import("../dist/server.js");

const health = await waitFor("/health");
console.log("health:", health.status, (await health.json()).status);

await waitFor("/ready");
console.log("ready: ok");

const reg = await fetch(`${BASE}/api/v1/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "bootcheck",
    email: "boot@example.com",
    password: "bootpass1",
  }),
});
const body = await reg.json();
if (!reg.ok || !body.accessToken) {
  throw new Error(`register failed: ${reg.status} ${JSON.stringify(body)}`);
}
console.log("auth roundtrip: ok (accessToken received)");

console.log("BOOT CHECK PASSED");
process.exit(0);
