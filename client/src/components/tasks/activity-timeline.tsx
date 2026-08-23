"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/use-collab";

dayjs.extend(relativeTime);

const ACTION_LABEL: Record<string, string> = {
  "task.created": "created the task",
  "task.completed": "completed the task",
  "task.reopened": "reopened the task",
  "task.updated": "updated the task",
  "share.granted": "granted access to",
  "share.revoked": "revoked access from",
  "comment.created": "commented",
};

export function ActivityTimeline({ taskId }: { taskId: string }) {
  const { data, isPending, error } = useActivity(taskId);

  if (isPending) {
    return (
      <div className="space-y-2 pt-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 bg-surface-2" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="pt-2 text-sm text-danger">
        {error instanceof Error ? error.message : "Couldn't load activity"}
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {data?.activity.map((entry) => {
        const who =
          typeof entry.user === "object" && entry.user
            ? entry.user.username
            : "system";
        return (
          <li key={entry._id} className="relative">
            <span className="absolute -left-[23px] top-1.5 size-1.5 rounded-full bg-amber-dim" />
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{who}</span>{" "}
              {ACTION_LABEL[entry.action] ?? entry.action}
              {entry.meta?.username ? ` ${String(entry.meta.username)}` : ""}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">
              {entry.action} · {dayjs(entry.createdAt).fromNow()}
            </p>
          </li>
        );
      })}
      {(data?.activity.length ?? 0) === 0 && (
        <li className="py-6 text-sm text-ink-3">No activity yet.</li>
      )}
    </ol>
  );
}
