"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UserMinus } from "@phosphor-icons/react/dist/ssr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShareMutations, useShares } from "@/hooks/use-collab";
import type { CollaboratorRole } from "@/lib/collab-api";

dayjs.extend(relativeTime);

export function SharePanel({ taskId }: { taskId: string }) {
  const { data, isPending } = useShares(taskId, true);
  const { grant, revoke } = useShareMutations(taskId);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("viewer");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    grant.mutate(
      { username: name, role },
      { onSuccess: () => setUsername("") }
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="w-40 font-mono"
          aria-label="Username to grant access"
        />
        <Select
          value={role}
          onValueChange={(v) => setRole(v as CollaboratorRole)}
        >
          <SelectTrigger className="w-28" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-line">
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={grant.isPending || !username.trim()}>
          Grant access
        </Button>
      </form>

      {isPending ? (
        <div className="h-10" />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false}>
            {data?.shares.map((share) => (
              <motion.li
                key={share._id}
                layout
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="flex items-center gap-3 rounded-card border border-line bg-card px-4 py-2.5"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-surface-3 font-mono text-[11px] text-ink-2">
                    {share.user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-sm text-ink">
                  {share.user.username}
                </span>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase ${
                    share.role === "editor"
                      ? "border-amber-dim/50 text-amber-bright"
                      : "text-ink-3"
                  }`}
                >
                  {share.role}
                </Badge>
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  since {dayjs(share.createdAt).fromNow()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke ${share.user.username}'s access`}
                  onClick={() => revoke.mutate(share._id)}
                  disabled={revoke.isPending}
                >
                  <UserMinus size={15} />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
          {(data?.shares.length ?? 0) === 0 && (
            <li className="py-4 text-sm text-ink-3">
              Not shared with anyone yet.
            </li>
          )}
        </motion.ul>
      )}
    </div>
  );
}
