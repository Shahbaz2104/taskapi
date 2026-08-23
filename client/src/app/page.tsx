import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroIntro } from "@/components/landing/hero-intro";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

export default function Landing() {
  return (
    <SmoothScroll>
      <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6">
        <header className="flex items-center justify-between py-6">
          <span className="font-mono text-sm font-semibold tracking-widest text-ink">
            TASK<span className="text-amber-bright">API</span>
          </span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Create account</Link>
            </Button>
          </nav>
        </header>

        <section className="flex flex-1 flex-col items-start justify-center pb-32 pt-24">
          <HeroIntro />
          <div className="mt-10 flex gap-3">
            <Button size="lg" asChild>
              <Link href="/register">
                Start flying
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      </main>
    </SmoothScroll>
  );
}
