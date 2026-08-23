"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dayjs from "dayjs";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { CommentThread } from "@/components/tasks/comment-thread";
import { ActivityTimeline } from "@/components/tasks/activity-timeline";
import { SharePanel } from "@/components/tasks/share-panel";
import { useAuth } from "@/lib/auth";
import { useTaskDetail } from "@/hooks/use-collab";
import { useTaskMutations } from "@/hooks/use-tasks";
import type { TaskInput } from "@/lib/tasks-api";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: task, isPending, error } = useTaskDetail(id);
  const { edit, remove } = useTaskMutations({ page: 1, limit: 10 });
  const [editOpen, setEditOpen] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2 bg-surface-2" />
        <Skeleton className="h-40 bg-surface-2" />
      </div>
    );
  }

  // Owner or collaborator? Anything else is an indistinguishable 404.
  if (error || !task) {
    return (
      <div className="rounded-card border border-dashed border-line bg-card/50 px-6 py-16 text-center">
        <p className="text-sm text-ink-2">Task not found.</p>
        <Button variant="ghost" size="sm" asChild className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft size={14} /> Back to the deck
          </Link>
        </Button>
      </div>
    );
  }

  const isOwner = user && task.user === user._id;

  function handleEdit(input: TaskInput) {
    edit.mutate(
      { id: task!._id, patch: input },
      { onSuccess: () => router.refresh() }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors duration-150 hover:text-ink-2"
        >
          <ArrowLeft size={13} /> Deck
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {task.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`font-mono text-[10px] uppercase ${
                  task.status === "completed"
                    ? "border-ok/40 text-ok"
                    : "text-ink-2"
                }`}
              >
                {task.status.replace("_", " ")}
              </Badge>
              <Badge
                variant="outline"
                className={`font-mono text-[10px] uppercase ${task.priority === "high" ? "border-danger/30 text-danger" : task.priority === "medium" ? "border-warn/30 text-warn" : "border-info/30 text-info"}`}
              >
                {task.priority}
              </Badge>
              {task.dueDate && (
                <span
                  className={`font-mono text-xs ${task.status !== "completed" && dayjs(task.dueDate).isBefore(dayjs(), "day") ? "text-danger" : "text-ink-3"}`}
                >
                  due {dayjs(task.dueDate).fromNow()}
                </span>
              )}
              {task.tags?.map((tag) => (
                <span key={tag} className="font-mono text-xs text-amber-dim">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            {isOwner && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  remove.mutate(task._id, {
                    onSuccess: () => router.push("/dashboard"),
                  })
                }
              >
                Trash
              </Button>
            )}
          </div>
        </div>

        {task.description && (
          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
            {task.description}
          </p>
        )}
      </div>

      <Tabs defaultValue="comments" className="gap-6">
        <TabsList className="bg-surface border border-line">
          <TabsTrigger value="comments" className="text-xs">
            Comments
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">
            Activity
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="shares" className="text-xs">
              Access
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="comments">
          <CommentThread taskId={id} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTimeline taskId={id} />
        </TabsContent>
        {isOwner && (
          <TabsContent value="shares">
            <SharePanel taskId={id} />
          </TabsContent>
        )}
      </Tabs>

      <TaskDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        task={task}
        onSubmit={handleEdit}
        pending={edit.isPending}
      />
    </div>
  );
}
