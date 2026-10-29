import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateContract, syncContract } from "./import-backend-contract.mjs";
import { allDescriptors, instructionsByProfile, restInstructions, restTransportGuidance, scopeRequirementFor, renderScopeRequirement, backendContractProvenance, toolDocumentation, guidanceCoverage, guidanceCoverageFailures, toolsForProfile, textAuditPolicy, reviewedTextFragments, z } from "../dist/index.js";
import { measureSurface } from "./measure-descriptions.mjs";
import { zodToJsonSchema } from "zod-to-json-schema";

const contract = JSON.parse(readFileSync(new URL("../contracts/backend-agent-contract.json", import.meta.url), "utf8"));
// Activates classified/quality receipt guidance and success-shaped creation guidance.
const fullResultProbe = { kind: "hybrid", qualityEvaluation: { status: "unknown" }, workerUrl: "https://workerkit.ai/workers/guidance-probe" };

test("generated core modules and built exports match the pinned backend contract", () => {
  syncContract(contract, true);
  assert.deepEqual(instructionsByProfile, contract.instructions);
  assert.deepEqual(restInstructions, contract.restInstructions);
  assert.deepEqual(restTransportGuidance, contract.transportGuidance);
  assert.deepEqual(guidanceCoverage, contract.guidanceCoverage);
  assert.deepEqual(textAuditPolicy, contract.textAuditPolicy);
  assert.deepEqual(reviewedTextFragments, contract.reviewedTextFragments);
  for (const [key,value] of Object.entries(backendContractProvenance)) assert.equal(value, contract[key]);
  assert.equal(contract.operations.length, 130); // memory_add has two REST bindings
  assert.deepEqual([...new Set(contract.operations.map(o => o.tool))].sort(), allDescriptors.map(d=>d.name).sort());
  for (const operation of contract.operations) {
    const tool = allDescriptors.find(d=>d.name === operation.tool);
    assert.equal(tool.title, operation.title);
    assert.equal(toolDocumentation(tool), operation.description);
    if (tool.resultDescription) {
      assert.ok(tool.footer, tool.name + ": result guidance has a delivery path");
      assert.equal(tool.footer(fullResultProbe, {}), tool.resultDescription);
    }
    assert.equal(tool.method, operation.method);
    assert.deepEqual(scopeRequirementFor(tool.name), operation.scopes);
    assert.equal(operation.scopeDescription, renderScopeRequirement(scopeRequirementFor(tool.name), tool.auth === "anonymous"));
    assert.deepEqual(Object.fromEntries(Object.entries(tool.schema).filter(([,f])=>f.description).map(([n,f])=>[n,f.description])), operation.parameters);
  }
});

test("built core retains every backend-declared guidance destination", () => {
  for (const profile of Object.keys(instructionsByProfile)) {
    assert.deepEqual(guidanceCoverageFailures(profile, check => {
      if (check.kind === "instructions") return instructionsByProfile[profile];
      const tool = toolsForProfile(profile).find(d=>d.name===check.tool);
      if (check.kind === "parameter") return tool?.schema[check.parameter]?.description;
      if (check.kind === "result") return tool?.footer?.(fullResultProbe, {});
      return tool?.description;
    }), []);
  }
});

test("import rejects tampered bundles and paths outside the generated source inventory", () => {
  const tampered = structuredClone(contract);
  tampered.files["guidance.ts"] += "// drift";
  assert.throws(()=>validateContract(tampered), /hash mismatch/);
  const unexpected = structuredClone(contract);
  unexpected.files["../outside.ts"] = "untrusted";
  const {schemaVersion, sourceRepository, contractVersion, sourceRevision, contentHash, ...payload} = unexpected;
  unexpected.contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  assert.throws(()=>validateContract(unexpected), /source inventory/);
});

test("measurement counts parameter descriptions as a subset, not extra catalog text", () => {
  const tool = { name: "probe", description: "Purpose.", inputSchema: {
    type: "object", properties: { value: { type: "string", description: "Meaning." } },
  } };
  const report = measureSurface({ tools: [tool], instructions: "Rules." });
  assert.equal(report.toolCount, 1);
  assert.equal(report.catalogChars, JSON.stringify({ tools: [tool] }).length);
  assert.equal(report.parameterDescriptionChars, "Meaning.".length);
  assert.equal(report.inputSchemaChars, JSON.stringify(tool.inputSchema).length);
  assert.ok(report.catalogTokens > 0);
});

test("measurement refuses ambiguous or incomplete inventories", () => {
  const tool = { name: "probe", description: "Purpose.", inputSchema: { type: "object" } };
  assert.throws(() => measureSurface({ tools: [tool, tool], instructions: "" }), /Duplicate/);
  assert.throws(() => measureSurface({ tools: [{ name: "probe" }], instructions: "" }), /Incomplete/);
});

test("measurement attributes generated repeats and warns without truncating", () => {
  const rule = "Use the returned server timestamp to calculate elapsed time, and retain the receipt before discarding any one-time output from this response.";
  const tools = ["one", "two"].map(name=>({name,description:rule + " HTTP SHOUTING.",inputSchema:{type:"object"}}));
  const report = measureSurface({tools,instructions:""},{sharedText:{"guidance.test":rule},uppercaseTerms:{HTTP:"protocol"}});
  assert.deepEqual(report.duplicates[0].owners,["guidance.test"]);
  assert.equal(report.duplicates[0].classification,"review-required", "A shared string alone cannot exempt destinations");
  assert.deepEqual(report.shouting,[{location:"one",word:"SHOUTING"},{location:"two",word:"SHOUTING"}]);
  assert.equal(report.catalogChars,JSON.stringify({tools}).length);
});

test("reviewed repetition applies only to exact text at explicitly reviewed destinations", () => {
  const text = "Keep this receipt and its timestamps when reporting completion because a successful request by itself cannot prove that every item finished.";
  const fragments = {receipt:{text,ruleId:"RECEIPT-01",locations:["one","two"],reason:"Each independent read needs the distinction."}};
  const tools = ["one","two"].map(name=>({name,description:text,inputSchema:{type:"object"}}));
  const measure = tools=>measureSurface({tools,instructions:""},{fragments});
  assert.equal(measure(tools).duplicates[0].classification,"reviewed-generated");
  const added = [...tools,{...tools[0],name:"three"}];
  const unreviewed = measure(added).duplicates[0];
  assert.equal(unreviewed.classification,"review-required");
  assert.deepEqual(unreviewed.unreviewedLocations,["three"]);
  assert.deepEqual(unreviewed.attributions[0].reviewedLocations,["one","two"]);
  assert.equal(measure(tools.map(t=>({...t,description:text.replace("receipt","record")}))).duplicates[0].classification,"review-required");
  assert.throws(()=>measureSurface({tools,instructions:""},{fragments:{bad:{...fragments.receipt,reason:""}}}),/Invalid reviewed fragment/);
});

test("length reporting uses backend-owned classes without altering captured text", () => {
  const tools = ["worker_get","schedule_create","worker_run","unknown"].map(name=>({name,description:"a".repeat(1500),inputSchema:{type:"object"}}));
  const report = measureSurface({tools,instructions:""});
  assert.deepEqual(report.oversized.map(r=>[r.name,r.category,r.guideChars,r.chars]),[["worker_get","plain",500,1500],["schedule_create","multi",700,1500]]);
  assert.deepEqual(report.unclassifiedTools,["unknown"]);
  assert.equal(report.catalogChars,JSON.stringify({tools}).length);
});

test("every current long repeated clause has a reviewed backend source and destinations", () => {
  for (const profile of Object.keys(instructionsByProfile)) {
    const tools = toolsForProfile(profile).map(d=>({name:d.name,description:d.description,
      inputSchema:zodToJsonSchema(z.object(d.schema),{target:"jsonSchema7",$refStrategy:"none"})}));
    const report = measureSurface({tools,instructions:instructionsByProfile[profile]});
    assert.deepEqual(report.unclassifiedTools,[]);
    assert.deepEqual(report.duplicates.filter(d=>d.classification!=="reviewed-generated"),[],profile);
  }
});
