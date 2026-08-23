import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  clearSession,
  decodeJwtExp,
  storeRefreshToken,
} from "./api";

function jwtWithExp(exp: number) {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${b64url({ exp })}.sig`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  clearSession();
});

describe("api()", () => {
  it("maps an { error } payload to ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 400,
      })
    );
    await expect(
      api("/auth/login", { method: "POST", body: {} })
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid credentials",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes once on 401 and retries the original request", async () => {
    storeRefreshToken("stale-refresh");

    fetchMock
      // original call → expired
      .mockImplementationOnce(
        () =>
          new Response(JSON.stringify({ error: "jwt expired" }), {
            status: 401,
          })
      )
      // refresh call → new pair
      .mockImplementationOnce(
        () =>
          new Response(
            JSON.stringify({
              accessToken: "new-access",
              refreshToken: "new-refresh",
            }),
            { status: 200 }
          )
      )
      // retried call → success
      .mockImplementationOnce(
        () =>
          new Response(JSON.stringify([{ _id: "t1" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      );

    const data = await api<Array<{ _id: string }>>("/tasks");

    expect(data).toEqual([{ _id: "t1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, refreshCall, retryCall] = fetchMock.mock.calls;
    expect(String(refreshCall[0])).toContain("/auth/refresh");
    expect(refreshCall[1].body).toContain("stale-refresh");
    expect(retryCall[1].headers["Authorization"]).toBe("Bearer new-access");

    // rotated refresh token persisted
    expect(localStorage.getItem("taskapi.refresh")).toBe("new-refresh");
  });

  it("throws when refresh also fails", async () => {
    storeRefreshToken("dead-refresh");
    fetchMock
      .mockImplementationOnce(
        () =>
          new Response(JSON.stringify({ error: "jwt expired" }), {
            status: 401,
          })
      )
      .mockImplementationOnce(
        () =>
          new Response(JSON.stringify({ error: "Token has been revoked" }), {
            status: 401,
          })
      );

    await expect(api("/me")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // session cleared after failed refresh
    expect(localStorage.getItem("taskapi.refresh")).toBeNull();
  });
});

describe("decodeJwtExp()", () => {
  it("reads exp from a base64url payload", () => {
    const token = jwtWithExp(1_900_000_000);
    expect(decodeJwtExp(token)).toBe(1_900_000_000);
  });

  it("returns null for garbage", () => {
    expect(decodeJwtExp("not-a-jwt")).toBeNull();
    expect(decodeJwtExp("a.b.c")).toBeNull();
  });
});
