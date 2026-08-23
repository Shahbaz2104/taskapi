import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const MEMBERS = [
  { initials: "SB", name: "shahbaz", role: "owner", when: "now" },
  { initials: "AK", name: "ayesha.k", role: "editor", when: "4m ago" },
  { initials: "UM", name: "umar", role: "viewer", when: "12m ago" },
];

/** Chapter visual: the collaboration surface — roles, comments, trail. */
export function TeamPanel() {
  return (
    <div className="rounded-card border border-line bg-card">
      <div className="border-b border-line/60 px-6 py-4 font-mono text-xs uppercase tracking-widest text-ink-3">
        launch-checklist · shared with 2
      </div>

      <ul className="px-6 py-3">
        {MEMBERS.map((m) => (
          <li
            key={m.name}
            className="flex items-center gap-3 border-b border-line/40 py-3 last:border-b-0"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-surface-3 font-mono text-[11px] text-ink-2">
                {m.initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-ink">{m.name}</span>
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-wider text-amber-bright"
            >
              {m.role}
            </Badge>
            <span className="ml-auto font-mono text-xs text-ink-3">
              {m.when}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-line/60 px-6 py-4">
        <p className="border-l-2 border-amber-glow pl-3 text-sm text-ink-2">
          “Deploy checklist looks done — ship it?”
        </p>
        <p className="mt-3 font-mono text-[11px] text-ink-3">
          activity · status changed pending → ready · 2m ago
        </p>
      </div>
    </div>
  );
}
