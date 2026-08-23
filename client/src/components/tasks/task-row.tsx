"use client";

import { motion } from "motion/react";
import Link from "next/link";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Check,
  DotsThreeVertical,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fadeUp } from "@/lib/motion";
import type { Task } from "@/lib/tasks-api";

dayjs.extend(relativeTime);

const PRIORITY_STYLE = {
  high: "text-danger border-danger/30",
  medium: "text-warn border-warn/30",
  low: "text-info border-info/30",
} as const;

export function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle(next: boolean): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const done = task.status === "completed";
  const overdue =
    task.dueDate && !done && dayjs(task.dueDate).isBefore(dayjs(), "day");

  return (
    <motion.li
      layout
      variants={fadeUp}
      exit={{
        opacity: 0,
        transform: "scale(0.96)",
        transition: { duration: 0.15 },
      }}
      className="group flex items-start gap-3 rounded-card border border-line bg-card px-4 py-3.5 transition-colors duration-150 ease-out hover:border-ink-3"
    >
      {/* Complete toggle — the primary micro-interaction */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={
          done ? `Mark "${task.title}" pending` : `Complete "${task.title}"`
        }
        onClick={() => onToggle(!done)}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90 ${
          done
            ? "border-ok bg-ok text-base"
            : "border-ink-3 text-transparent hover:border-amber-glow"
        }`}
      >
        <Check size={13} weight="bold" />
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/task/${task._id}`}
          className={`block truncate text-sm font-medium transition-colors duration-200 hover:text-amber-bright ${
            done ? "text-ink-3 line-through" : "text-ink"
          }`}
        >
          {task.title}
        </Link>
        {task.description && (
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {task.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-px font-mono text-[10px] uppercase tracking-wide ${PRIORITY_STYLE[task.priority]}`}
          >
            {task.priority}
          </span>
          {task.dueDate && (
            <span
              className={`font-mono text-[11px] ${overdue ? "text-danger" : "text-ink-3"}`}
            >
              {overdue ? "⚠ " : ""}
              due {dayjs(task.dueDate).fromNow()}
            </span>
          )}
          {task.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="font-mono text-[11px] text-amber-dim">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for "${task.title}"`}
            className="mt-0.5 rounded-field p-1.5 text-ink-3 opacity-0 transition-opacity duration-150 ease-out hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <DotsThreeVertical size={17} weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-line">
          <DropdownMenuItem onClick={onEdit}>
            <PencilSimple size={15} className="mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-danger focus:text-danger"
          >
            <Trash size={15} className="mr-2" />
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.li>
  );
}
