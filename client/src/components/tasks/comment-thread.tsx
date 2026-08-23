"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PaperPlaneRight } from "@phosphor-icons/react/dist/ssr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddComment, useComments } from "@/hooks/use-collab";
import { useAuth } from "@/lib/auth";

dayjs.extend(relativeTime);

export function CommentThread({ taskId }: { taskId: string }) {
  const { data, isPending, error } = useComments(taskId);
  const { user } = useAuth();
  const add = useAddComment(taskId, user?.username);
  const [text, setText] = useState("");
  const [blocked, setBlocked] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    add.mutate(body, {
      onSuccess: () => setText(""),
      onError: (err) => {
        if (err instanceof Error && /editor/i.test(err.message))
          setBlocked(true);
      },
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={blocked ? "Viewer access — read only" : "Leave a note…"}
          disabled={blocked || add.isPending}
          aria-label="Write a comment"
        />
        <Button
          type="submit"
          size="icon"
          disabled={blocked || add.isPending || !text.trim()}
          aria-label="Send comment"
        >
          <PaperPlaneRight weight="fill" />
        </Button>
      </form>
      {blocked && (
        <p className="font-mono text-[11px] text-warn">
          editor role required to comment
        </p>
      )}

      {isPending ? (
        <div className="space-y-2 pt-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 bg-surface-2" />
          ))}
        </div>
      ) : error ? (
        <p className="pt-2 text-sm text-danger">
          {error instanceof Error ? error.message : "Couldn't load comments"}
        </p>
      ) : (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
          className="space-y-2.5"
        >
          <AnimatePresence initial={false}>
            {data?.comments.map((comment) => {
              const username =
                typeof comment.user === "string"
                  ? "member"
                  : comment.user.username;
              return (
                <motion.li
                  key={comment._id}
                  layout
                  initial={{ opacity: 0, transform: "translateY(6px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="rounded-card border border-line bg-card px-4 py-3"
                >
                  <p className="text-sm text-ink">{comment.body}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-3">
                    {username} · {dayjs(comment.createdAt).fromNow()}
                    {comment._id.startsWith("temp-") ? " · sending…" : ""}
                  </p>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {(data?.comments.length ?? 0) === 0 && (
            <li className="py-8 text-center text-sm text-ink-3">
              No comments yet — start the conversation.
            </li>
          )}
        </motion.ul>
      )}
    </div>
  );
}
