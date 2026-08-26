import { describe, expect, it } from "vitest";
import {
  csvRowsToObjects,
  foldICalLine,
  formatICalDate,
  icalEscape,
  nextDueDate,
  normalizeImportRow,
  parseCsvText,
  parseSort,
} from "../../src/services/tasks.service.js";

describe("tasks.service/pure", () => {
  describe("parseSort", () => {
    it("parses direction prefixes and whitelists fields", () => {
      expect(parseSort("-priority")).toEqual({
        field: "priority",
        direction: -1,
      });
      expect(parseSort("dueDate")).toEqual({ field: "dueDate", direction: 1 });
    });

    it("rejects unknown or empty sort values", () => {
      expect(parseSort("hacker")).toBeNull();
      expect(parseSort("")).toBeNull();
      expect(parseSort("   ")).toBeNull();
      expect(parseSort(undefined)).toBeNull();
      expect(parseSort(null)).toBeNull();
    });
  });

  describe("parseCsvText", () => {
    it("handles BOM, quoted commas, escaped quotes and CRLF", () => {
      const csv = '\uFEFFtitle,description\r\n"Task, A","say ""hi"""\r\n';
      expect(parseCsvText(csv)).toEqual([
        ["title", "description"],
        ["Task, A", 'say "hi"'],
      ]);
    });

    it("keeps embedded newlines inside quotes and drops blank lines", () => {
      const csv = 't,d\n"line1\nline2",x\n\ny,z';
      expect(parseCsvText(csv)).toEqual([
        ["t", "d"],
        ["line1\nline2", "x"],
        ["y", "z"],
      ]);
    });
  });

  describe("csvRowsToObjects", () => {
    it("maps header aliases onto canonical keys and skips blanks", () => {
      const rows = [
        ["Name", "Desc", "Due_Date", "Labels", "mystery"],
        [" Alpha ", "", "2026-01-01", "a;b", "zzz"],
      ];
      expect(csvRowsToObjects(rows)).toEqual([
        { title: "Alpha", dueDate: "2026-01-01", tags: "a;b" },
      ]);
    });
  });

  describe("normalizeImportRow", () => {
    it("accepts a full valid row and coerces types", () => {
      const out = normalizeImportRow({
        title: " T ",
        description: "d",
        status: "pending",
        priority: "high",
        dueDate: "2026-03-01T00:00:00.000Z",
        recurrence: "weekly",
        tags: "a; b ;a,c",
      });
      expect(out.error).toBeUndefined();
      expect(out.doc).toMatchObject({
        title: "T",
        status: "pending",
        priority: "high",
        recurrence: "weekly",
        tags: ["a", "b", "c"],
      });
      expect(out.doc?.dueDate).toBeInstanceOf(Date);
    });

    it("enforces model constraints with stable messages", () => {
      expect(normalizeImportRow({}).error).toBe("title is required");
      expect(normalizeImportRow({ title: "x".repeat(201) }).error).toBe(
        "title exceeds 200 characters"
      );
      expect(
        normalizeImportRow({ title: "ok", description: "d".repeat(2001) }).error
      ).toBe("description exceeds 2000 characters");
      expect(normalizeImportRow({ title: "ok", status: "weird" }).error).toBe(
        'invalid status "weird"'
      );
      expect(
        normalizeImportRow({ title: "ok", priority: "urgent" }).error
      ).toBe('invalid priority "urgent"');
      expect(
        normalizeImportRow({ title: "ok", recurrence: "hourly" }).error
      ).toBe('invalid recurrence "hourly"');
      expect(
        normalizeImportRow({ title: "ok", dueDate: "not-a-date" }).error
      ).toBe('invalid dueDate "not-a-date"');
      expect(
        normalizeImportRow({ title: "ok", tags: [1, 2, 3, 4, 5, 6] }).error
      ).toBe("at most 5 tags per task");
      expect(
        normalizeImportRow({ title: "ok", tags: { bad: true } }).error
      ).toBe("tags must be an array or semicolon-delimited string");
    });
  });

  describe("iCal helpers", () => {
    it("formats UTC timestamps without dashes or millis", () => {
      expect(formatICalDate("2026-01-02T03:04:05.678Z")).toBe(
        "20260102T030405Z"
      );
    });

    it("escapes text values per RFC 5545", () => {
      expect(icalEscape("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    });

    it("folds lines over 75 octets with CRLF + leading space", () => {
      const short = foldICalLine("short");
      expect(short).toBe("short");

      const line = "x".repeat(160);
      const folded = foldICalLine(line);
      const segments = folded.split("\r\n");
      expect(segments[0]).toHaveLength(75);
      expect(segments[1]?.startsWith(" ")).toBe(true);
      expect(segments[1]).toHaveLength(75);
      expect(folded.replace(/\r\n /g, "")).toBe(line);
    });
  });

  describe("nextDueDate", () => {
    it.each([
      ["daily", "2026-01-01T00:00:00.000Z", 1],
      ["weekly", "2026-01-01T00:00:00.000Z", 7],
    ] as const)("advances %s by %i day(s)", (recurrence, base, days) => {
      const next = nextDueDate(base, recurrence);
      const expected = new Date(base);
      expected.setUTCDate(expected.getUTCDate() + days);
      expect(next.toISOString()).toBe(expected.toISOString());
    });

    it("adds a calendar month for monthly recurrence", () => {
      const next = nextDueDate(new Date("2026-01-31T00:00:00.000Z"), "monthly");
      expect(next.getUTCMonth()).toBe(2);
    });
  });
});
