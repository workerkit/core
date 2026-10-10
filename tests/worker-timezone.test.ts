import { describe, expect, it } from "vitest";
import { byName, z } from "../src/index.js";

describe("worker timezone", () => {
  it("requires an explicit value and preserves null for choosing UTC", () => {
    const tool = byName("worker_timezone_set")!;
    const schema = z.object(tool.schema);
    expect(schema.safeParse({ tokenId: 7 }).success).toBe(false);
    for (const timeZoneId of ["America/New_York", "UTC", null]) {
      const params = schema.parse({ tokenId: 7, timeZoneId });
      expect(typeof tool.path === "function" ? tool.path(params) : tool.path).toBe("/api/manage/workers/7/timezone");
      expect(tool.bodyBuilder!(params)).toEqual({ timeZoneId });
    }
    expect(tool.description).toContain("manageSchedules");
    expect(tool.description).toContain("explicit schedule timezone overrides remain unchanged");
  });

  it("forwards install timezone independently of schedule settings", () => {
    const tool = byName("kit_install")!;
    const schema = z.object(tool.schema);
    const params = schema.parse({ slug: "daily-digest", timeZoneId: "America/New_York" });
    expect(tool.bodyBuilder!(params)).toMatchObject({ timeZoneId: "America/New_York" });
    expect(schema.safeParse({ slug: "daily-digest", timeZoneId: "  " }).success).toBe(false);
    expect(schema.safeParse({ slug: "daily-digest" }).success).toBe(true);
    expect(tool.schema.timeZoneId.description).toContain("Ask the worker creator");
    expect(tool.schema.timeZoneId.description).toContain("Omitted means UTC");
  });

  it.each(["decision_worker_create", "action_worker_create"])("%s exposes creator timezone with UTC fallback", name => {
    const field = byName(name)!.schema.timeZoneId;
    expect(field.parse("America/New_York")).toBe("America/New_York");
    expect(field.parse(undefined)).toBeUndefined();
    expect(field.safeParse(" ").success).toBe(false);
    expect(field.description).toContain("Ask the worker creator");
  });
});
