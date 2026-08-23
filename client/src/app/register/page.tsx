import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-ink-3">
          New pilot registration
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold">
          Create account
        </h1>
        <p className="mt-4 text-sm text-ink-2">Auth screens land in Phase 2.</p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-amber-bright hover:text-amber-glow"
        >
          ← Back to base
        </Link>
      </div>
    </main>
  );
}
