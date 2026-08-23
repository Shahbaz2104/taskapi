"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  API_BASE,
  api,
  clearSession,
  decodeJwtExp,
  getAccessToken,
  getRefreshToken,
  refreshTokens,
  setAccessToken,
  storeRefreshToken,
} from "@/lib/api";

export interface User {
  _id: string;
  username: string;
  email: string;
  role?: string;
}

type LoginOutcome =
  { kind: "ok" } | { kind: "challenge"; challengeToken: string };

interface AuthValue {
  status: "loading" | "anon" | "auth";
  user: User | null;
  /** Backend authenticates by username. */
  login(username: string, password: string): Promise<LoginOutcome>;
  /** Adopt an externally-obtained pair (e.g. right after registration). */
  adopt(accessToken: string, refreshToken: string): Promise<void>;
  challenge(input: {
    challengeToken: string;
    code?: string;
    recoveryCode?: string;
  }): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const PROACTIVE_MARGIN_MS = 45_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleProactiveRefresh = useCallback(function schedule() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const token = getAccessToken();
    const exp = token ? decodeJwtExp(token) : null;
    if (!exp) return;
    const delay = Math.max(
      exp * 1000 - Date.now() - PROACTIVE_MARGIN_MS,
      5_000
    );
    timerRef.current = setTimeout(async () => {
      const ok = await refreshTokens();
      if (!ok) {
        setUser(null);
        setStatus("anon");
      } else {
        schedule();
      }
    }, delay);
  }, []);

  /** Adopt a fresh token pair + hydrate profile. */
  const adoptSession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      setAccessToken(accessToken);
      storeRefreshToken(refreshToken);
      const me = await api<User>("/me");
      setUser(me);
      setStatus("auth");
      scheduleProactiveRefresh();
    },
    [scheduleProactiveRefresh]
  );

  // Boot: restore session from the persisted refresh token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!getRefreshToken()) {
          setStatus("anon");
          return;
        }
        const ok = await refreshTokens();
        if (!ok || cancelled) {
          if (!cancelled) setStatus("anon");
          return;
        }
        const me = await api<User>("/me");
        if (cancelled) return;
        setUser(me);
        setStatus("auth");
        scheduleProactiveRefresh();
      } catch {
        clearSession();
        if (!cancelled) setStatus("anon");
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleProactiveRefresh]);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginOutcome> => {
      const data = await api<{
        requires2FA?: boolean;
        challengeToken?: string;
        accessToken?: string;
        refreshToken?: string;
      }>("/auth/login", { method: "POST", body: { username, password } });

      if (data.requires2FA && data.challengeToken) {
        return { kind: "challenge", challengeToken: data.challengeToken };
      }
      await adoptSession(data.accessToken!, data.refreshToken!);
      return { kind: "ok" };
    },
    [adoptSession]
  );

  const adopt = useCallback<AuthValue["adopt"]>(
    async (accessToken, refreshToken) =>
      adoptSession(accessToken, refreshToken),
    [adoptSession]
  );

  const challenge = useCallback<AuthValue["challenge"]>(
    async ({ challengeToken, code, recoveryCode }) => {
      const data = await api<{ accessToken: string; refreshToken: string }>(
        "/auth/2fa/challenge",
        { method: "POST", body: { challengeToken, code, recoveryCode } }
      );
      await adoptSession(data.accessToken, data.refreshToken);
    },
    [adoptSession]
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      /* best-effort — local teardown always proceeds */
    }
    clearSession();
    if (timerRef.current) clearTimeout(timerRef.current);
    setUser(null);
    setStatus("anon");
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, user, login, adopt, challenge, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
