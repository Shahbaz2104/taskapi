"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleNotch,
  RocketLaunch,
} from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { registerSchema } from "@/lib/schemas";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

interface RegisterResponse {
  message: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Echoed only when the API runs without SMTP (dev convenience). */
  verificationUrl?: string;
}

export default function RegisterPage() {
  const { adopt, status } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    verificationUrl?: string;
    user: User | null;
  } | null>(null);

  useEffect(() => {
    if (status === "auth" && done) {
      // stay on the success panel until the user proceeds
    }
  }, [status, done]);

  async function onSubmit(formData: FormData) {
    const parsed = registerSchema.safeParse({
      username: formData.get("username"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const data = await api<RegisterResponse>("/auth/register", {
        method: "POST",
        body: parsed.data,
      });
      await adopt(data.accessToken, data.refreshToken);
      setDone({ verificationUrl: data.verificationUrl, user: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Account created"
        subtitle="You're cleared for entry."
        footer={
          <Link href="/" className="text-ink-3 hover:text-ink-2">
            ← Back to base
          </Link>
        }
      >
        <div className="space-y-4">
          {done.verificationUrl && (
            <p className="rounded-field border border-amber-dim/40 bg-amber-glow/10 px-3 py-2 text-xs text-amber-bright">
              Dev shortcut —{" "}
              <a href={done.verificationUrl} className="underline">
                verify your email now
              </a>
            </p>
          )}
          {!done.verificationUrl && (
            <p className="text-sm text-ink-2">
              Check your inbox for a verification link.
            </p>
          )}
          <Button
            className="w-full"
            onClick={() => router.replace("/dashboard")}
          >
            Enter the cockpit
            <ArrowRight size={16} weight="bold" />
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="One account for the API and the deck."
      error={error}
      footer={
        <>
          Already flying?{" "}
          <Link
            href="/login"
            className="text-amber-bright hover:text-amber-glow"
          >
            Sign in
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            required
          />
          <FieldError>Minimum 6 characters.</FieldError>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <CircleNotch size={17} className="animate-spin" />
          ) : (
            <>
              Create account
              <RocketLaunch size={16} weight="duotone" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
