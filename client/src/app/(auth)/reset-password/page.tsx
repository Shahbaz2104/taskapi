"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/api";
import { resetSchema } from "@/lib/schemas";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

function ResetPasswordInner() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) router.replace("/forgot-password");
  }, [token, router]);

  async function onSubmit(formData: FormData) {
    const parsed = resetSchema.safeParse({
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { token, password: parsed.data.password },
      });
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Your old sessions stay valid until you sign out."
      error={error}
      footer={
        <Link href="/login" className="text-ink-3 hover:text-ink-2">
          ← Back to sign in
        </Link>
      }
    >
      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
          />
          <FieldError>Minimum 6 characters.</FieldError>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
          <FieldError />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <CircleNotch size={17} className="animate-spin" />
          ) : (
            "Save password"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}
