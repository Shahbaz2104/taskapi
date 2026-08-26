import express from "express";
import mongoose from "mongoose";
import { authenticator } from "otplib";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

let mongoServer: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = "test-secret";

  const [{ default: authRoutes }, { default: userRoutes }, { errorHandler }] =
    await Promise.all([
      import("../../src/routes/auth.routes.js"),
      import("../../src/routes/user.routes.js"),
      import("../../src/middleware/error_handler.js"),
    ]);

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
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

const enroll2fa = async (authHeader: string) => {
  const setupRes = await request(app)
    .post("/api/v1/me/2fa/setup")
    .set("Authorization", authHeader);
  expect(setupRes.status).toBe(200);

  const uri = new URL(setupRes.body.otpauthUri);
  const secret = uri.searchParams.get("secret") as string;

  const code = authenticator.generate(secret);
  const enableRes = await request(app)
    .post("/api/v1/me/2fa/enable")
    .set("Authorization", authHeader)
    .send({ token: code });
  expect(enableRes.status).toBe(200);
  return { secret, recoveryCodes: enableRes.body.recoveryCodes as string[] };
};

const authOf = (loginRes: request.Response): string =>
  `Bearer ${loginRes.body.accessToken}`;

describe("Two-factor authentication (TOTP)", () => {
  it("setup returns an otpauth URI and QR data URL without enabling yet", async () => {
    const login = await registerAndLogin();
    const res = await request(app)
      .post("/api/v1/me/2fa/setup")
      .set("Authorization", authOf(login));

    expect(res.status).toBe(200);
    expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/TaskAPI:/);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

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

  it("full enrollment returns 8 recovery codes once; profile reflects state", async () => {
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

    const wrong = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: secondLogin.body.challengeToken,
      code: "000000",
    });
    expect(wrong.status).toBe(401);

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

  it("a consumed challenge token rejects wrong codes on reuse", async () => {
    const firstLogin = await registerAndLogin("challuser");
    const { secret } = await enroll2fa(authOf(firstLogin));

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "challuser", password: "password1" });
    const challengeToken = login.body.challengeToken as string;

    await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({
        challengeToken,
        code: authenticator.generate(secret),
      });

    const reuse = await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .send({ challengeToken, code: "000000" });
    expect(reuse.status).toBe(401);
  });

  it("garbage or forged challenge tokens are rejected", async () => {
    for (const bad of ["not-a-jwt", "abc.def.ghi"]) {
      const res = await request(app)
        .post("/api/v1/auth/2fa/challenge")
        .send({ challengeToken: bad, code: "123456" });
      expect(res.status).toBe(401);
    }

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

    const again = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "recover", password: "password1" });
    const reused = await request(app).post("/api/v1/auth/2fa/challenge").send({
      challengeToken: again.body.challengeToken,
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.status).toBe(401);

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

    const pwOnly = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "password1" });
    expect(pwOnly.status).toBe(400);

    const badPw = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "wrongpass", code: authenticator.generate(secret) });
    expect(badPw.status).toBe(400);

    const off = await request(app)
      .post("/api/v1/me/2fa/disable")
      .set("Authorization", authOf(firstLogin))
      .send({ password: "password1", recoveryCode: recoveryCodes[0] });
    expect(off.status).toBe(200);

    const plain = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "disableuser", password: "password1" });
    expect(plain.status).toBe(200);
    expect(plain.body.accessToken).toBeDefined();
    expect(plain.body.requires2FA).toBeUndefined();
  });
});
