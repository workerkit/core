import { describe, expect, it } from "vitest";
import { byName, executeTool, type PortEdenClient } from "../src/index.js";

describe("Action worker contracts", () => {
  it("forwards only version and arguments, with a stable idempotency header", async () => {
    const calls: unknown[] = [];
    const client = { post: async (...args: unknown[]) => { calls.push(args); return { status: 200 }; } } as unknown as PortEdenClient;
    const input = { tokenId: 7, toolName: "slack_send_dm", arguments: { userId: "U123", text: "Hello" }, idempotencyKey: "one-intended-message" };
    await executeTool(client, byName("worker_tool_call")!, input, { token: "pe_mgr_test" });
    expect(calls).toEqual([["/api/manage/workers/7/tools/slack_send_dm/invoke", {
      token: "pe_mgr_test", headers: { "Idempotency-Key": "one-intended-message" }, timeoutMs: 90000,
      body: { contractVersion: 1, arguments: input.arguments }, signal: undefined,
    }]]);
  });
  it.each(["connectionId", "senderId", "actionSpec", "model", "preview"])("rejects an invocation override: %s", async key => {
    let calls = 0;
    const client = { post: async () => { calls++; } } as unknown as PortEdenClient;
    await expect(executeTool(client, byName("worker_tool_call")!, { tokenId: 7, toolName: "slack_send_dm", arguments: {}, [key]: "override" })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("preserves an omitted selection so the server chooses and freezes defaults", async () => {
    let body: unknown;
    const client = { post: async (_path: string, opts: { body: unknown }) => { body = opts.body; return {}; } } as unknown as PortEdenClient;
    await executeTool(client, byName("action_worker_create")!, { requestId: "create-1", name: "Slack", slackConnectionId: 4 });
    expect(body).toEqual({ requestId: "create-1", name: "Slack", slackConnectionId: 4 });
  });
  it("supports a future app and typed arguments without a Slack connection or client registry edit", async () => {
    const calls: unknown[] = [];
    const client = { post: async (...args: unknown[]) => { calls.push(args); return {}; } } as unknown as PortEdenClient;
    await executeTool(client, byName("action_worker_create")!, { requestId: "future-1", name: "New app", app: "mcp:future",
      actionSpec: { schemaVersion: 1, tools: [{ ref: "future__add", version: 1 }] } });
    await executeTool(client, byName("worker_tool_call")!, { tokenId: 7, toolName: "future__add",
      arguments: { count: 3, enabled: false, rows: [{ id: 1 }] }, idempotencyKey: "future-write" });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls)).not.toContain("slackConnectionId");
    expect((calls[1] as [string, { body: unknown }])[1].body).toEqual({ contractVersion: 1, arguments: { count: 3, enabled: false, rows: [{ id: 1 }] } });
  });
});
