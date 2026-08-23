"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/api";
import { forgotSchema } from "@/lib/schemas";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    const parsed = forgotSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the email");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { method: "POST", body: parsed.data });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle={
        sent ? undefined : "We'll send a link that expires in 30 minutes."
      }
      error={error}
      footer={
        <Link href="/login" className="text-ink-3 hover:text-ink-2">
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-field border border-ok/25 bg-ok/10 px-3 py-2.5 text-sm text-ok">
          If an account exists, a reset link was sent.
        </p>
      ) : (
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
            />
            <FieldError />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <CircleNotch size={17} className="animate-spin" />
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
