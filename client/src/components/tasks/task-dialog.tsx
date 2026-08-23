"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type {
  Task,
  TaskInput,
  TaskPriority,
  TaskStatus,
} from "@/lib/tasks-api";

const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Max 200 characters"),
  description: z.string().trim().max(2000, "Max 2000 characters").optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().optional(),
  tags: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5)
    )
    .refine((tags) => tags.length <= 5, "At most 5 tags"),
});

type TaskForm = z.input<typeof taskSchema>;

export function TaskDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Existing task → edit mode; null → create. */
  task: Task | null;
  onSubmit(input: TaskInput): void;
  pending?: boolean;
}) {
  const [tagText, setTagText] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: defaults(null),
  });

  const status = watch("status");
  const priority = watch("priority");

  useEffect(() => {
    if (open) {
      reset(defaults(task));
      setTagText(task?.tags?.join(", ") ?? "");
    }
  }, [open, task, reset]);

  function submit(values: TaskForm) {
    onSubmit({
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      status: values.status as TaskStatus,
      priority: values.priority as TaskPriority,
      dueDate: values.dueDate || undefined,
      tags: (values.tags as unknown as string[]) || [],
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-line sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {task ? "Edit task" : "New task"}
          </DialogTitle>
          <DialogDescription>
            {task ? "Changes apply immediately." : "What needs flying?"}
          </DialogDescription>
        </DialogHeader>

        <form
          id="task-form"
          onSubmit={handleSubmit(submit)}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" autoFocus {...register("title")} />
            <FieldError>{errors.title?.message}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes</Label>
            <textarea
              id="description"
              rows={3}
              className="flex w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-amber-glow focus-visible:outline-none"
              {...register("description")}
            />
            <FieldError>{errors.description?.message}</FieldError>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input type="hidden" {...register("status")} />
            <input type="hidden" {...register("priority")} />
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue("status", v as TaskStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-line">
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setValue("priority", v as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-line">
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags (≤5)</Label>
              <Input
                id="tags"
                placeholder="ops, launch"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                {...register("tags")}
              />
              <FieldError>{errors.tags?.message}</FieldError>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={pending}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaults(task: Task | null): TaskForm {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "pending",
    priority: task?.priority ?? "medium",
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
    tags: "",
  };
}
