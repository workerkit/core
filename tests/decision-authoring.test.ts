import { describe, expect, it } from "vitest";
import { byName, z } from "../src/index.js";
import { createDecisionWorker } from "../src/descriptors/decision-authoring.js";

const body = {
  requestId: "triage-1", name: "Customer triage", confidenceFloor: 0.7,
  source: { recipe: "email-previews", args: { after: "-7d" } },
  questions: [{ key: "category", type: "choice", instructions: "Which category?", options: { sales: "Asks to buy", support: "Needs help" } }],
};
describe("decision authoring", () => {
  const schema = z.object(createDecisionWorker.schema).strict();
  it("accepts the minimal workflow, defaults to no deployment, and advertises its result", () => {
    expect(schema.parse(body)).toMatchObject({ deploy: false, maxItems: 20 });
    expect(createDecisionWorker.outputSchema?.workerId).toBeDefined();
    expect(createDecisionWorker.outputSchema?.tokenId).toBeDefined();
    expect(createDecisionWorker.strictInput).toBe(true);
    expect(createDecisionWorker.annotations).toMatchObject({ idempotentHint: true, readOnlyHint: false });
  });
  it("rejects malformed question variants and unknown top-level controls", () => {
    expect(schema.safeParse({ ...body, run: true }).success).toBe(false);
    expect(schema.safeParse({ ...body, questions: [{ ...body.questions[0], levels: ["a", "b"] }] }).success).toBe(false);
    expect(schema.safeParse({ ...body, confidenceFloor: undefined }).success).toBe(false);
  });
  it("discovers source recipes and the focused guide through existing reads", () => {
    expect(z.object(byName("kit_app_tools")!.schema).parse({ purpose: "decision", app: "email" })).toEqual({ purpose: "decision", app: "email" });
    expect(z.object(byName("kit_authoring_guide")!.schema).parse({ section: "decision" })).toEqual({ section: "decision" });
  });
});
