"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/api";
import { AuthShell } from "@/components/auth/auth-shell";

function VerifyEmailInner() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"pending" | "ok" | "fail">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("fail");
      setMessage("No verification token in the link.");
      return;
    }
    api<{ message?: string }>("/auth/verify-email", {
      method: "POST",
      body: { token },
    })
      .then(() => setState("ok"))
      .catch((e) => {
        setState("fail");
        setMessage(e instanceof Error ? e.message : "Verification failed");
      });
  }, [token]);

  return (
    <AuthShell
      title="Email verification"
      footer={
        <Link
          href="/dashboard"
          className="text-amber-bright hover:text-amber-glow"
        >
          Continue to the dashboard →
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        {state === "pending" && (
          <>
            <CircleNotch size={30} className="animate-spin text-amber-bright" />
            <p className="text-sm text-ink-2">Confirming your link…</p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle size={34} weight="fill" className="text-ok" />
            <p className="text-sm text-ok">Email verified. All systems go.</p>
          </>
        )}
        {state === "fail" && (
          <>
            <WarningCircle size={34} weight="fill" className="text-danger" />
            <p className="text-sm text-danger">{message}</p>
            <p className="text-xs text-ink-3">
              Links expire after 24 hours — request a fresh one.
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
