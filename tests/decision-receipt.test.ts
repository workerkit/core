import { expect, it } from "vitest";
import { byName } from "../src/index.js";

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
