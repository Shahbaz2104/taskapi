"use client";

import Link from "next/link";
import { motion } from "motion/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSharedInbox } from "@/hooks/use-collab";

dayjs.extend(relativeTime);

export default function SharedInboxPage() {
  const { data, isPending, error } = useSharedInbox();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Shared with you
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Tasks other pilots have opened to your account.
        </p>
      </div>

      {isPending ? (
        <ul className="space-y-2.5">
          {[0, 1].map((i) => (
            <li key={i}>
              <Skeleton className="h-16 bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <p className="text-sm text-danger">
          {error instanceof Error
            ? error.message
            : "Couldn't load shared tasks"}
        </p>
      ) : (data?.shared.length ?? 0) > 0 ? (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
          className="space-y-2.5"
        >
          {data!.shared.map((item) => (
            <li key={item._id}>
              <Link
                href={`/dashboard/task/${item._id}`}
                className="group flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3.5 transition-colors duration-150 ease-out hover:border-ink-3"
              >
                <UsersThree
                  size={18}
                  weight="duotone"
                  className="shrink-0 text-ink-3 group-hover:text-amber-bright"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                    shared with you {dayjs(item.sharedAt).fromNow()} · created{" "}
                    {dayjs(item.createdAt).fromNow()}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase ${
                    item.myRole === "editor"
                      ? "border-amber-dim/50 text-amber-bright"
                      : "text-ink-3"
                  }`}
                >
                  {item.myRole}
                </Badge>
              </Link>
            </li>
          ))}
        </motion.ul>
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card/50 px-6 py-14 text-center">
          <UsersThree size={28} className="mx-auto text-ink-3" />
          <p className="mt-3 text-sm text-ink-2">
            Nothing shared yet — ask a teammate to grant access.
          </p>
        </div>
      )}
    </div>
  );
}
