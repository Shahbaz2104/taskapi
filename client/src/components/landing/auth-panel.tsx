import { CheckCircle, Lock, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { SpotlightCard } from "@/components/bits/spotlight-card";

const CODE_DIGITS = ["4", "9", "2", "8"];

/** Chapter visual: a hardened 2FA challenge, frozen mid-verification. */
export function AuthPanel() {
  return (
    <SpotlightCard className="p-6">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ink-3">
          <ShieldCheck
            size={16}
            className="text-amber-bright"
            weight="duotone"
          />
          Two-factor challenge
        </span>
        <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] text-ink-3">
          purpose-scoped token
        </span>
      </div>

      <div className="mt-6 flex gap-2">
        {CODE_DIGITS.map((digit, i) => (
          <div
            key={i}
            className="flex size-11 items-center justify-center rounded-field border border-line bg-base font-mono text-lg text-ink"
          >
            {digit}
          </div>
        ))}
        {[0, 1].map((i) => (
          <div
            key={`empty-${i}`}
            className="flex size-11 animate-pulse items-center justify-center rounded-field border border-amber-dim/50 bg-base"
          />
        ))}
      </div>

      <p className="mt-5 flex items-center gap-2 text-sm text-ok">
        <CheckCircle size={15} weight="fill" />
        Session hardened · device remembered
      </p>
      <p className="mt-4 flex items-center gap-2 border-t border-line/60 pt-4 font-mono text-xs text-ink-3">
        <Lock size={13} />8 recovery codes · single-use · hashed at rest
      </p>
    </SpotlightCard>
  );
}
