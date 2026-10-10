import { describe, expect, it, vi } from "vitest";
import { byName, executeTool, z, type PortEdenClient } from "../src/index.js";

describe("support request wire contract", () => {
  it("posts the request fields as the body", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200 });
    const params = {
      category: "error",
      subject: "worker_run returns 500",
      message: "worker_run returned HTTP 500 with no error code.",
      runId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    };
    await executeTool({ post } as unknown as PortEdenClient, byName("support_request_create")!, params, { token: "credential" });
    expect(post).toHaveBeenCalledWith("/api/manage/support/requests", { body: params, token: "credential", signal: undefined });
  });

  it("redacts WorkerKit keys and bearer tokens from the subject and message", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200 });
    await executeTool({ post } as unknown as PortEdenClient, byName("support_request_create")!, {
      category: "error",
      subject: "Install fails with pe_test1234",
      message: "Sent Authorization: Bearer test0000test0000 and got HTTP 500.",
    }, { token: "credential" });
    const { body } = post.mock.calls[0][1];
    expect(body.subject).toBe("Install fails with [REDACTED]");
    expect(body.message).toBe("Sent Authorization: [REDACTED] and got HTTP 500.");
  });

  it("rejects an unknown category, out-of-range lengths and malformed ids", () => {
    const schema = z.object(byName("support_request_create")!.schema).strict();
    const valid = { category: "app_request", subject: "Add Pipedrive", message: "Please add a Pipedrive app." };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, category: "feature" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, subject: "Hi" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, message: "x".repeat(2001) }).success).toBe(false);
    expect(schema.safeParse({ ...valid, workerId: "42" }).success).toBe(false);
  });

  it("tells an agent to use it for errors it cannot fix", () => {
    const description = byName("support_request_create")!.description;
    expect(description).toContain("fails in a way you cannot fix");
    expect(description).toContain("user_not_connected");
    expect(description).toContain("referenceNumber");
  });
});
