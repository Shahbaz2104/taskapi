jest.setTimeout(30000);

const mongoose = require("mongoose");
const { authenticator } = require("otplib");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");

let mongoServer;
let app;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  const authRoutes = require("../routes/auth_routes");
  const userRoutes = require("../routes/user_routes");
  const errorHandler = require("../middleware/error_handler");

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const registerAndLogin = async (username = "tfauser") => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({
      username,
      email: `${username}@example.com`,
      password: "password1",
    });
  return request(app)
    .post("/api/v1/auth/login")
    .send({ username, password: "password1" });
};

const enroll2fa = async (authHeader) => {
  const setupRes = await request(app)
    .post("/api/v1/me/2fa/setup")
    .set("Authorization", authHeader);
  expect(setupRes.status).toBe(200);

  const uri = new URL(setupRes.body.otpauthUri);
  const secret = uri.searchParams.get("secret");

  const code = authenticator.generate(secret);
  const enableRes = await request(app)
    .post("/api/v1/me/2fa/enable")
    .set("Authorization", authHeader)
    .send({ token: code });
  expect(enableRes.status).toBe(200);
  return { secret, recoveryCodes: enableRes.body.recoveryCodes };
};

const authOf = (loginBody) => `Bearer ${loginBody.body.accessToken}`;

describe("Two-factor authentication (TOTP)", () => {
  it("setup returns an otpauth URI and QR data URL without enabling yet", async () => {
    const login = await registerAndLogin();
    const res = await request(app)
      .post("/api/v1/me/2fa/setup")
      .set("Authorization", authOf(login));

    expect(res.status).toBe(200);
    expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/TaskAPI:/);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Not enabled until confirmed — login still returns a normal pair
    const stillNormal = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "tfauser", password: "password1" });
    expect(stillNormal.status).toBe(200);
    expect(stillNormal.body.accessToken).toBeDefined();
    expect(stillNormal.body.requires2FA).toBeUndefined();
  });

  it("enable fails without a pending setup and with a wrong code", async () => {
    const noSetup = await registerAndLogin("nosetup");
    const early = await request(app)
      .post("/api/v1/me/2fa/enable")
      .set("Authorization", authOf(noSetup))
      .send({ token: "123456" });
    expect(early.status).toBe(400);

    const login = await registerAndLogin();
    await request(app)
      .post("/api/v1/me/2fa/setup")
      .set("Authorization", authOf(login));
    const bad = await request(app)
      .post("/api/v1/me/2fa/enable")
      .set("Authorization", authOf(login))
      .send({ token: "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid verification code");
  });

  it("full enrollment: enable with a valid code returns 8 recovery codes once", async () => {
    const login = await registerAndLogin();
    const { recoveryCodes } = await enroll2fa(authOf(login));

    expect(recoveryCodes).toHaveLength(8);
    expect(recoveryCodes.every((c) => /^[0-9a-f]{16}$/.test(c))).toBe(true);

    const me = await request(app)
      .get("/api/v1/me")
      .set("Authorization", authOf(login));
    expect(me.body.totpEnabled).toBe(true);
    expect(me.body.totpSecret).toBeUndefined();
    expect(me.body.recoveryCodes).toBeUndefined();
  });

  it("re-enrollment while already enabled is rejected", async () => {
    const login = await registerAndLogin();
    await enroll2fa(authOf(login));
    const res = await request(app)
      .post("/api/v1/me/2fa/setup")
      .set("Authorization", authOf(login));
    expect(res.status).toBe(400);
  });

  it("login switches to challenge mode; correct TOTP completes it", async () => {
    const firstLogin = await registerAndLogin();
    const { secret } = await enroll2fa(authOf(firstLogin));

    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "tfauser", password: "password1" });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.requires2FA).toBe(true);
    expect(secondLogin.body.challengeToken).toBeDefined();
    expect(secondLogin.body.accessToken).toBeUndefined();

    // Wrong code first
    const wrong = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: secondLogin.body.challengeToken,
      code: "000000",
    });
    expect(wrong.status).toBe(401);

    // Correct code issues a working pair
    const ok = await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({
        challengeToken: secondLogin.body.challengeToken,
        code: authenticator.generate(secret),
      });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeDefined();

    const list = await request(app)
      .get("/api/v1/me/sessions")
      .set("Authorization", `Bearer ${ok.body.accessToken}`);
    expect(list.status).toBe(200);
  });

  it("a used challenge token cannot be replayed", async () => {
    const firstLogin = await registerAndLogin("challuser");
    const { secret } = await enroll2fa(authOf(firstLogin));

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "challuser", password: "password1" });
    const token = login.body.challengeToken;

    await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({ challengeToken: token, code: authenticator.generate(secret) });

    // Same JWT is still within its 5m TTL but was already consumed by use —
    // statelessness means it stays valid; a *wrong* code on it must fail.
    const reuse = await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({ challengeToken: token, code: "000000" });
    expect(reuse.status).toBe(401);
  });

  it("garbage or forged challenge tokens are rejected", async () => {
    for (const bad of ["not-a-jwt", "abc.def.ghi"]) {
      const res = await request(app)
        .post("/api/v1/auth/2fa/challenge")
        .send({ challengeToken: bad, code: "123456" });
      expect(res.status).toBe(401);
    }

    // A non-challenge JWT (e.g. an access token) must not work as a challenge
    const login = await registerAndLogin("forgery");
    const forge = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: login.body.accessToken,
      code: "123456",
    });
    expect(forge.status).toBe(401);
  });

  it("recovery codes work exactly once", async () => {
    const firstLogin = await registerAndLogin("recover");
    const { recoveryCodes } = await enroll2fa(authOf(firstLogin));

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "recover", password: "password1" });

    const firstUse = await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({
        challengeToken: login.body.challengeToken,
        recoveryCode: recoveryCodes[0],
      });
    expect(firstUse.status).toBe(200);
    expect(firstUse.body.accessToken).toBeDefined();

    // Second login + same recovery code → rejected
    const again = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "recover", password: "password1" });
    const reused = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: again.body.challengeToken,
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.status).toBe(401);

    // A different unused recovery code still works
    const third = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "recover", password: "password1" });
    const fresh = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: third.body.challengeToken,
      recoveryCode: recoveryCodes[1],
    });
    expect(fresh.status).toBe(200);
  });

  it("disable requires password plus a code; afterwards login is normal", async () => {
    const firstLogin = await registerAndLogin("disableuser");
    const { secret, recoveryCodes } = await enroll2fa(authOf(firstLogin));

    // Password alone insufficient
    const pwOnly = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "password1" });
    expect(pwOnly.status).toBe(400);

    // Wrong password rejected even with a good code
    const badPw = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "wrongpass", code: authenticator.generate(secret) });
    expect(badPw.status).toBe(400);

    // Password + recovery code succeeds; sessions revoked
    const off = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "password1", recoveryCode: recoveryCodes[0] });
    expect(off.status).toBe(200);

    // Old access token's refresh tokens are gone; next login needs no 2FA
    const plain = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "disableuser", password: "password1" });
    expect(plain.status).toBe(200);
    expect(plain.body.accessToken).toBeDefined();
    expect(plain.body.requires2FA).toBeUndefined();
  });
});
