import { describe, expect, it } from "vitest";
import { byName, executeTool, type PortEdenClient } from "../src/index.js";

describe("selected schedule days", () => {
  it("sends create and partial update days through the shared HTTP adapter", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const send = async (path: string, opts: { body: unknown }) => {
      calls.push({ path, body: opts.body });
      return { status: 200, data: { daysOfWeek: ["Friday"] } };
    };
    const client = { post: send, patch: send } as unknown as PortEdenClient;
    await executeTool(client, byName("schedule_create")!, {
      tokenId: 71, scheduleType: "DailyAtTime", timeOfDayMinutes: 420, daysOfWeek: ["Friday"],
    });
    await executeTool(client, byName("schedule_update")!, {
      tokenId: 71, scheduleId: 52, daysOfWeek: ["Monday", "Friday"],
    });
    await executeTool(client, byName("schedule_update")!, { tokenId: 71, scheduleId: 52, title: "Renamed" });
    expect(calls[0]).toMatchObject({ path: "/api/manage/workers/71/schedules", body: { daysOfWeek: ["Friday"] } });
    expect(calls[1]).toMatchObject({ path: "/api/manage/workers/71/schedules/52", body: { daysOfWeek: ["Monday", "Friday"] } });
    expect((calls[2].body as Record<string, unknown>).daysOfWeek).toBeUndefined();
  });
});
