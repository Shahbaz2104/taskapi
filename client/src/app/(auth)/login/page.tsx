"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { useAuth } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export const CHALLENGE_KEY = "taskapi.challenge";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "auth") router.replace("/dashboard");
  }, [status, router]);

  async function onSubmit(formData: FormData) {
    const parsed = loginSchema.safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your credentials");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const outcome = await login(parsed.data.username, parsed.data.password);
      if (outcome.kind === "challenge") {
        sessionStorage.setItem(CHALLENGE_KEY, outcome.challengeToken);
        router.push("/two-factor");
      } else {
        router.replace("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to the cockpit."
      error={error}
      footer={
        <>
          New here?{" "}
          <Link
            href="/register"
            className="text-amber-bright hover:text-amber-glow"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
          />
          <FieldError />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <FieldError />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <CircleNotch size={17} className="animate-spin" />
          ) : (
            <>
              Sign in
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="text-xs text-ink-3 transition-colors duration-150 hover:text-ink-2"
        >
          Forgot password?
        </Link>
      </div>
    </AuthShell>
  );
}
