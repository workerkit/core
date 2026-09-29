import { expect, it } from "vitest";
import { byName } from "../src/index.js";
import { compactDecisionReceipt } from "../src/descriptors/decision-receipt.js";

it.each(["run_get", "worker_run"])("%s projects exact decision rows once without mutating the API receipt", name => {
  const rows = [{ id: "https://example.com/" + "x".repeat(400), answers: { q: "0.6999999999999999" }, probability: 0.7 }];
  const receipt = { decision: { mode: "corpus", decisions: rows, counts: { returned: 1, omitted: 2 } },
    digestStructured: { outcome: "Compared candidates", items: rows }, finalDigest: "Result" };
  const result = byName(name)!.mapData!(receipt, {}) as typeof receipt;
  expect(result.decision).toEqual(receipt.decision);
  expect(result.digestStructured).toEqual({ outcome: "Compared candidates" });
  expect(receipt.digestStructured.items).toHaveLength(1);
});

it("preserves legacy, withheld and unexpected receipts", () => {
  const map = byName("run_get")!.mapData!;
  for (const receipt of [null, { contentWithheld: true }, { digestStructured: { items: [] } },
    { decision: { decisions: [{ id: "a" }] }, digestStructured: { items: [{ id: "b" }] } }])
    expect(map(receipt, {})).toBe(receipt);
});


it("preserves exact hybrid judgments, unknown action evidence and committed charges", () => {
  const data = { kind: "hybrid", decision: { calls: 20, decisions: [{ id: "provider:" + "x".repeat(2000), answers: { route: "reply" } }] },
    agent: { status: "failed", selectedCount: 1, actions: [{ tool: "email_create_reply_draft", sourceId: "provider:1", status: "unknown" }] },
    digestStructured: { outcome: "Draft outcome uncertain" },
    usageBreakdown: { decision: { calls: 20, measuredCostUsd: 0.001 }, language: { calls: 2, funding: "byok" } }, walletChargeUsd: 0.001 };
  expect(compactDecisionReceipt(data)).toEqual(data);
  expect(compactDecisionReceipt({ kind: "hybrid", contentWithheld: true, decision: null, agent: null })).toEqual(
    { kind: "hybrid", contentWithheld: true, decision: null, agent: null });
});
