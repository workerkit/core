import { describe, expect, it, vi } from "vitest";
import { byName, executeTool, z, type PortEdenClient } from "../src/index.js";

describe("onboarding wire contract", () => {
  it("sends purchase idempotency in a header and only the amount in the body", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200 });
    await executeTool({ post } as unknown as PortEdenClient, byName("wallet_checkout_create")!,
      { amountUsd: 20, idempotencyKey: "purchase-1" }, { token: "credential" });
    expect(post).toHaveBeenCalledWith("/api/manage/wallet/checkouts", {
      headers: { "Idempotency-Key": "purchase-1" }, body: { amountUsd: 20 }, token: "credential", signal: undefined,
    });
  });
  it("validates whole-cent amounts and header-safe idempotency keys", () => {
    const schema = z.object(byName("wallet_checkout_create")!.schema).strict();
    expect(schema.safeParse({ amountUsd: 20.25, idempotencyKey: "purchase-2" }).success).toBe(true);
    expect(schema.safeParse({ amountUsd: 20.001, idempotencyKey: "purchase-3" }).success).toBe(false);
    expect(schema.safeParse({ amountUsd: 20, idempotencyKey: "bad\r\nkey" }).success).toBe(false);
  });
  it("encodes checkout identifiers without sending them as query parameters", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200 });
    await executeTool({ get } as unknown as PortEdenClient, byName("wallet_checkout_get")!, { sessionId: "cs/a?b" }, { token: "credential" });
    expect(get).toHaveBeenCalledWith("/api/manage/wallet/checkouts/cs%2Fa%3Fb", { params: {}, token: "credential", signal: undefined });
  });
});
