import { describe, expect, it } from "vitest";
import {
  patchTaskInPage,
  prependTaskToPage,
  removeTaskFromPage,
} from "@/hooks/use-tasks";
import type { TasksPage } from "@/lib/tasks-api";

const page: TasksPage = {
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
  tasks: [
    {
      _id: "a",
      title: "Alpha",
      status: "pending",
      priority: "low",
      tags: [],
      createdAt: "",
      updatedAt: "",
    },
    {
      _id: "b",
      title: "Beta",
      status: "pending",
      priority: "high",
      tags: [],
      createdAt: "",
      updatedAt: "",
    },
  ],
};

describe("tasks page reducers", () => {
  it("patches only the matching task, immutably", () => {
    const next = patchTaskInPage(page, "b", { status: "completed" });
    expect(next?.tasks.find((t) => t._id === "b")?.status).toBe("completed");
    expect(next?.tasks.find((t) => t._id === "a")?.status).toBe("pending");
    // new tasks array, but untouched rows keep identity (cheap re-renders)
    expect(next?.tasks).not.toBe(page.tasks);
    expect(next?.tasks[0]).toBe(page.tasks[0]);
    expect(page.tasks[1].status).toBe("pending"); // original untouched
  });

  it("removes the task and decrements total", () => {
    const next = removeTaskFromPage(page, "a");
    expect(next?.tasks.map((t) => t._id)).toEqual(["b"]);
    expect(next?.total).toBe(1);
  });

  it("prepends new tasks onto page 1 only", () => {
    const fresh = { ...page.tasks[0], _id: "c" };
    const p1 = prependTaskToPage(page, fresh);
    expect(p1?.tasks[0]._id).toBe("c");
    expect(p1?.total).toBe(3);

    // non-first pages are left alone — invalidation covers them
    const p2 = prependTaskToPage({ ...page, page: 2 }, fresh);
    expect(p2?.page).toBe(2);
    expect(p2?.tasks.some((t) => t._id === "c")).toBe(false);
  });

  it("passes undefined through untouched", () => {
    expect(patchTaskInPage(undefined, "a", {})).toBeUndefined();
    expect(removeTaskFromPage(undefined, "a")).toBeUndefined();
  });
});
