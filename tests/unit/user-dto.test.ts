import { describe, expect, it } from "vitest";
import { toPublicUser, type UserLike } from "../../src/dto/user.dto.js";

const baseUser: UserLike = {
  _id: "65f1b2c3d4e5f6a7b8c9d0e1",
  username: "alice",
  email: "alice@example.com",
  emailVerified: true,
  role: "user",
  totpEnabled: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("dto/user", () => {
  it("serializes the exact public shape with ISO dates and string id", () => {
    const publicUser = toPublicUser(baseUser);

    expect(publicUser._id).toBe("65f1b2c3d4e5f6a7b8c9d0e1");
    expect(publicUser.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(publicUser.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(publicUser.role).toBe("user");
    expect(publicUser.totpEnabled).toBe(false);
  });

  it("never leaks credential or secret fields", () => {
    const leaked = {
      ...baseUser,
      password: "$2a$10$hash",
      totpSecret: "JBSWY3DPEHPK3PXP",
      recoveryCodes: [{ codeHash: "abc", usedAt: null }],
      calendarFeedToken: "feed-token",
      refreshTokenHash: "rth",
    };

    const serialized = JSON.stringify(toPublicUser(leaked));

    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("totpSecret");
    expect(serialized).not.toContain("recoveryCodes");
    expect(serialized).not.toContain("calendarFeedToken");
    expect(serialized).not.toContain("refreshTokenHash");
  });

  it("passes __v through when present and omits it otherwise", () => {
    expect(toPublicUser({ ...baseUser, __v: 3 }).__v).toBe(3);
    expect("__v" in toPublicUser(baseUser)).toBe(false);
  });
});
