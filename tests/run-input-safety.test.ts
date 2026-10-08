import { describe, expect, it } from "vitest";
import { byName, executeTool, type PortEdenClient } from "../src/index.js";

describe("run controls fail closed before forwarding", () => {
  it.each([
    ["worker_run", { tokenId: 1, preview: true }],
    ["worker_run", { tokenId: 1, dryRun: true }],
    ["run_bulk", { workers: [{ tokenId: 1, preview: true }] }],
    ["run_bulk", { workers: [{ tokenId: 1 }], preview: true }],
  ])("rejects unsupported fields in %s", async (name, params) => {
    let calls = 0;
    const client = { post: async () => { calls++; return {}; } } as unknown as PortEdenClient;
    await expect(executeTool(client, byName(name as string)!, params as Record<string, unknown>)).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
