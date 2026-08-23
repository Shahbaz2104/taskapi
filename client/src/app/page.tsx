import Link from "next/link";
import {
  ArrowRight,
  Broadcast,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/landing/site-nav";
import { HeroIntro } from "@/components/landing/hero-intro";
import { ConstellationZone } from "@/components/landing/constellation-zone";
import { AuthPanel } from "@/components/landing/auth-panel";
import { TeamPanel } from "@/components/landing/team-panel";
import { WebhookTerminal } from "@/components/landing/webhook-terminal";
import { Aurora } from "@/components/bits/aurora";
import { CountUp } from "@/components/bits/count-up";
import { Marquee } from "@/components/bits/marquee";
import { Reveal } from "@/components/bits/reveal";
import { SplitText } from "@/components/bits/split-text";
import { GridPattern } from "@/components/kokonut/grid-pattern";
import { ShimmerButton } from "@/components/kokonut/shimmer-button";

const CHAPTERS = [
  {
    icon: ShieldCheck,
    eyebrow: "Access control",
    title: "Sessions you can see. Second factors you control.",
    body: "Every device that holds a token is listed and revocable. TOTP pairs with eight single-use recovery codes, and challenge tokens are purpose-scoped — a leaked challenge opens nothing else.",
    visual: <AuthPanel />,
    flip: false,
  },
  {
    icon: UsersThree,
    eyebrow: "Collaboration",
    title: "Share the deck. Keep the keys.",
    body: "Grant viewer or editor access by username. Outsiders can't tell a shared task from a missing one, owners stay the only ones who can re-share, and every action lands in an append-only activity trail.",
    visual: <TeamPanel />,
    flip: true,
  },
  {
    icon: Broadcast,
    eyebrow: "Integrations",
    title: "Your systems hear about it first.",
    body: "Task events hit your endpoints with HMAC-signed, timestamped payloads you can verify in one line. Failed deliveries retry five times with backoff; dead endpoints disable themselves.",
    visual: <WebhookTerminal />,
    flip: false,
  },
];

const STACK = [
  "Next.js 16",
  "React 19",
  "Express 5",
  "MongoDB 9",
  "Redis",
  "BullMQ",
  "JWT rotation",
  "TOTP 2FA",
  "HMAC webhooks",
  "Sentry",
  "PostHog",
  "OpenAPI docs",
];

export default function Landing() {
  return (
    <>
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <Aurora />
        <ConstellationZone className="absolute inset-y-0 right-0 hidden w-[58%] lg:block" />

        <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col px-6 pt-28 pb-20">
          <HeroIntro />
          <Reveal delay={0.35} className="mt-10 flex flex-wrap gap-3">
            <ShimmerButton href="/register">
              Start flying
              <ArrowRight size={17} weight="bold" />
            </ShimmerButton>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Numbers ──────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <dl className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 sm:grid-cols-3">
          {[
            [154, "tests green"],
            [36, "API endpoints"],
            [3, "background workers"],
          ].map(([value, label]) => (
            <Reveal key={label as string}>
              <dt className="font-display text-5xl font-semibold text-ink">
                <CountUp end={value as number} />
              </dt>
              <dd className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-ink-3">
                {label}
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ── Chapters ─────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl space-y-32 px-6 py-32">
        {CHAPTERS.map((chapter) => (
          <section
            key={chapter.eyebrow}
            className="grid items-center gap-12 lg:grid-cols-2"
          >
            <Reveal className={chapter.flip ? "lg:order-2" : undefined}>
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-amber-glow">
                <chapter.icon size={15} weight="duotone" />
                {chapter.eyebrow}
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                <SplitText text={chapter.title} />
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2">
                {chapter.body}
              </p>
            </Reveal>
            <Reveal
              variant="clip"
              className={chapter.flip ? "lg:order-1" : undefined}
            >
              {chapter.visual}
            </Reveal>
          </section>
        ))}
      </div>

      {/* ── Stack marquee ────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40 py-8">
        <Marquee items={STACK} />
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <GridPattern />
        <div className="relative mx-auto max-w-6xl px-6 py-36 text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
            <SplitText text="Cleared for launch." delay={0.1} />
          </h2>
          <p className="mx-auto mt-5 max-w-md text-ink-2">
            One account unlocks the API, the dashboard, and everything in
            between.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <ShimmerButton href="/register">
              Create free account
              <ArrowRight size={17} weight="bold" />
            </ShimmerButton>
            <Button variant="ghost" size="lg" asChild>
              <a
                href="https://github.com/Shahbaz2104/taskapi"
                target="_blank"
                rel="noreferrer"
              >
                Read the source
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 font-mono text-xs text-ink-3 sm:flex-row">
          <span>
            TASK<span className="text-amber-dim">API</span> — mission control
          </span>
          <a
            href="https://github.com/Shahbaz2104/taskapi"
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-150 hover:text-ink"
          >
            github.com/Shahbaz2104/taskapi
          </a>
          <span>© 2026 Shahbaz · live Swagger at /api-docs</span>
        </div>
      </footer>
    </>
  );
}
