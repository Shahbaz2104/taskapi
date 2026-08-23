"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleNotch, Key } from "@phosphor-icons/react/dist/ssr";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { OtpInput } from "@/components/auth/otp-input";
import { CHALLENGE_KEY } from "@/app/(auth)/login/page";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

type Mode = "code" | "recovery";

export default function TwoFactorPage() {
  const { challenge, status } = useAuth();
  const router = useRouter();
  const [challengeToken, setChallengeToken] = useState("");
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read + consume the handoff after mount (sessionStorage is client-only).
  useEffect(() => {
    const stored = sessionStorage.getItem(CHALLENGE_KEY);
    if (!stored) {
      router.replace("/login");
      return;
    }
    setChallengeToken(stored);
  }, [router]);

  useEffect(() => {
    if (status === "auth") {
      sessionStorage.removeItem(CHALLENGE_KEY);
      router.replace("/dashboard");
    }
  }, [status, router]);

  async function verify(code?: string, recoveryCode?: string) {
    if (!challengeToken) return;
    setPending(true);
    setError(null);
    try {
      await challenge({ challengeToken, code, recoveryCode });
      // status effect handles the redirect
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Two-factor required"
      subtitle="Confirm it's you to finish signing in."
      error={error}
      footer={
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "code" ? "recovery" : "code"));
            setError(null);
          }}
          className="text-amber-bright hover:text-amber-glow"
        >
          {mode === "code" ? "Use a recovery code" : "Use authenticator app"}
        </button>
      }
    >
      {mode === "code" ? (
        <div className="space-y-5">
          <OtpInput
            disabled={pending}
            onChange={setCode}
            onComplete={(value) => void verify(value)}
          />
          <Button
            className="w-full"
            disabled={pending || code.length !== 6}
            onClick={() => void verify()}
          >
            {pending ? (
              <CircleNotch size={17} className="animate-spin" />
            ) : (
              "Verify"
            )}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(undefined, recoveryCode.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="recovery">
              <span className="inline-flex items-center gap-1.5">
                <Key size={14} weight="duotone" />
                Recovery code
              </span>
            </Label>
            <Input
              id="recovery"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              className="font-mono uppercase tracking-widest"
            />
            <FieldError />
            <p className="mt-1 text-xs text-ink-3">
              Each code works once and is then burned.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <CircleNotch size={17} className="animate-spin" />
            ) : (
              "Verify recovery code"
            )}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-ink-3">
        Wrong account?{" "}
        <Link href="/login" className="hover:text-ink-2">
          Start over
        </Link>
      </p>
    </AuthShell>
  );
}
