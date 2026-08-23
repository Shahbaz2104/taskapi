"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { SessionsPanel } from "@/components/settings/sessions-panel";
import { TwoFactorPanel } from "@/components/settings/twofa-panel";
import { CalendarFeedCard } from "@/components/settings/calendar-feed-card";
import { WebhooksPanel } from "@/components/settings/webhooks-panel";
import { useAuth } from "@/lib/auth";
import { useChangePassword } from "@/hooks/use-settings";

function PasswordCard() {
  const { logout } = useAuth();
  const router = useRouter();
  const change = useChangePassword(async () => {
    await logout();
    router.replace("/login");
  });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <div className="max-w-sm space-y-4 rounded-card border border-line bg-card p-5">
      <h3 className="font-display text-base font-semibold">Password</h3>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!current || !next) return;
          change.mutate({ current, next });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cur-pw">Current password</Label>
          <Input
            id="cur-pw"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <FieldError>Minimum 6 characters.</FieldError>
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={change.isPending || next.length < 6 || !current}
        >
          {change.isPending ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : null}
          Change password
        </Button>
        <p className="text-xs text-ink-3">
          Changing it signs you out on every device.
        </p>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Signed in as{" "}
          <span className="font-mono text-xs text-amber-bright">
            {user?.username}
          </span>
        </p>
      </div>

      <Tabs defaultValue="devices" className="gap-8">
        <TabsList className="bg-surface border border-line">
          <TabsTrigger value="devices" className="text-xs">
            Devices
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs">
            Security
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs">
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <SessionsPanel />
        </TabsContent>

        <TabsContent value="security" className="space-y-8">
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold">
              Two-factor authentication
            </h2>
            <TwoFactorPanel enabled={user?.totpEnabled} />
          </section>
          <PasswordCard />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-8">
          <CalendarFeedCard />
          <section>
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
              <BroadcastIcon /> Webhooks
            </h2>
            <WebhooksPanel />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BroadcastIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 256 256"
      fill="#ffb84d"
      aria-hidden
    >
      <path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Z" />
      <path d="M184.57,71.43a80,80,0,0,0-113.14,0,8,8,0,0,0,11.31,11.32,64,64,0,0,1,90.52,0,8,8,0,0,0,11.31-11.32Z" />
      <path d="M48.97,48.97a112,112,0,0,0,0,158.39,8,8,0,0,0,11.31-11.32,96,96,0,0,1,0-135.76A8,8,0,0,0,48.97,48.97Z" />
      <path d="M207.03,48.97a8,8,0,0,0-11.31,11.32,96,96,0,0,1,0,135.76,8,8,0,0,0,11.31,11.32,112,112,0,0,0,0-158.4Z" />
    </svg>
  );
}
