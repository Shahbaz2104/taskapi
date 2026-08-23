/**
 * API layer — fetch wrapper with single-flight silent refresh.
 *
 * Token strategy (documented tradeoff):
 * - Access token: memory only. Lost on reload → boot refresh restores it.
 * - Refresh token: localStorage. XSS-exposed by design for this portfolio
 *   build; httpOnly-cookie BFF upgrade is a roadmap item.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const PREFIX = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

const REFRESH_KEY = "taskapi.refresh";
const SESSION_KEY = "taskapi.session";

export function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

export function storeSessionId(id: string | undefined) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function storeRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearSession() {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(SESSION_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const res = await rawRequest(path, options);

  if (res.status === 401 && getRefreshToken()) {
    const token = await silentRefresh();
    if (!token) throw new ApiError(401, "Session expired");
    const retried = await rawRequest(path, options);
    return handleResponse<T>(retried);
  }

  return handleResponse<T>(res);
}

/** Same auth semantics as api(), but returns the raw body as text (CSV). */
export async function apiText(path: string): Promise<string> {
  let res = await rawRequest(path, {});
  if (res.status === 401 && getRefreshToken()) {
    const token = await silentRefresh();
    if (!token) throw new ApiError(401, "Session expired");
    res = await rawRequest(path, {});
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* keep fallback */
    }
    throw new ApiError(res.status, message);
  }
  return res.text();
}

async function rawRequest(
  path: string,
  { method = "GET", body, signal }: ApiOptions
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return fetch(`${API_BASE}${PREFIX}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* non-JSON error body — keep fallback */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Exchange the stored refresh token for a fresh pair. Single-flight. */
export async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_BASE}${PREFIX}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  accessToken = data.accessToken;
  storeRefreshToken(data.refreshToken);
  return true;
}

let refreshInFlight: Promise<boolean> | null = null;

function silentRefresh(): Promise<string | null> {
  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight.then((ok) => (ok ? accessToken : null));
}

/** Decode a JWT payload's `exp` as epoch seconds, or null when malformed. */
export function decodeJwtExp(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}
