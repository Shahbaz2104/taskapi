"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleNotch,
  CopySimple,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { OtpInput } from "@/components/auth/otp-input";
import { useAuth } from "@/lib/auth";
import { use2faDisable, use2faEnable, use2faSetup } from "@/hooks/use-settings";

type Step = "idle" | "qr" | "codes";

export function TwoFactorPanel({ enabled }: { enabled?: boolean }) {
  const router = useRouter();
  const { logout } = useAuth();
  const setup = use2faSetup();
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const enable = use2faEnable();
  const disable = use2faDisable(async () => {
    await logout();
    router.replace("/login");
  });

  async function start() {
    try {
      await setup.mutateAsync();
      setStep("qr");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    }
  }

  function copyAllCodes() {
    if (!recoveryCodes) return;
    void navigator.clipboard?.writeText(recoveryCodes.join("\n"));
    toast.success("Recovery codes copied");
  }

  /* ── Enabled state ─────────────────────────────────────── */
  if (enabled && step === "idle") {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-ok">
          <ShieldCheck size={17} weight="fill" />
          Active — sign-ins require your authenticator or a recovery code.
        </p>
        <div className="max-w-xs space-y-3 rounded-card border border-danger/25 bg-danger/5 p-4">
          <Label>Disable two-factor</Label>
          <Input
            type="password"
            placeholder="Current password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
          <div>
            <Input
              placeholder="Authenticator code"
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="font-mono tracking-widest"
            />
            <FieldError>Disabling signs you out everywhere.</FieldError>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={
              disable.isPending || !disablePassword || disableCode.length !== 6
            }
            onClick={() =>
              disable.mutate({
                password: disablePassword,
                code: disableCode,
              })
            }
          >
            {disable.isPending ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : (
              "Disable 2FA"
            )}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Recovery codes shown once ─────────────────────────── */
  if (step === "codes" && recoveryCodes) {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-ink-2">
          These eight codes each work exactly once — for the moments you don't
          have your phone. They are hashed on our side and never shown again.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-card border border-amber-dim/40 bg-amber-glow/5 p-4">
          {recoveryCodes.map((c) => (
            <span
              key={c}
              className="font-mono text-sm tracking-widest text-amber-bright"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={copyAllCodes}>
            <CopySimple size={14} /> Copy all
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setRecoveryCodes(null);
              setStep("idle");
            }}
          >
            <Check size={14} weight="bold" /> I've saved them
          </Button>
        </div>
      </div>
    );
  }

  /* ── Setup flow ────────────────────────────────────────── */
  if (step === "qr" && setup.data) {
    return (
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="rounded-card border border-line bg-white p-2.5">
          // eslint-disable-next-line @next/next/no-img-element -- data: URL
          <img
            src={setup.data.qrDataUrl}
            alt="Scan this QR code with your authenticator app"
            width={148}
            height={148}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-2">
            <li>Open Google Authenticator / 1Password / Authy</li>
            <li>Scan the code (or paste the URI below)</li>
            <li>Enter the current 6-digit code</li>
          </ol>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(setup.data!.otpauthUri);
              toast.success("URI copied");
            }}
            className="w-full truncate rounded-field border border-line bg-surface px-3 py-2 text-left font-mono text-[11px] text-ink-3 hover:border-ink-3"
            aria-label="Copy otpauth URI"
          >
            {setup.data.otpauthUri}
          </button>
          <OtpInput
            onChange={setCode}
            onComplete={(value) =>
              enable.mutate(value, {
                onSuccess: (data) => {
                  setRecoveryCodes(data.recoveryCodes);
                  setStep("codes");
                },
              })
            }
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={enable.isPending || code.length !== 6}
              onClick={() =>
                enable.mutate(code, {
                  onSuccess: (data) => {
                    setRecoveryCodes(data.recoveryCodes);
                    setStep("codes");
                  },
                })
              }
            >
              {enable.isPending ? (
                <CircleNotch size={14} className="animate-spin" />
              ) : null}
              Verify &amp; enable
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Idle / not enabled ────────────────────────────────── */
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-ink-2">
        Add a second factor: codes rotate every 30 seconds in your authenticator
        app.
      </p>
      <Button size="sm" onClick={() => void start()} disabled={setup.isPending}>
        {setup.isPending ? (
          <CircleNotch size={14} className="animate-spin" />
        ) : null}
        Enable 2FA
      </Button>
    </div>
  );
}
