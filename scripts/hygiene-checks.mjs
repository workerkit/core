import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateContract, syncContract } from "./import-backend-contract.mjs";
import { allDescriptors, instructionsByProfile, restInstructions, restTransportGuidance, scopeRequirementFor, renderScopeRequirement, backendContractProvenance } from "../dist/index.js";
import { measureSurface } from "./measure-descriptions.mjs";

const contract = JSON.parse(readFileSync(new URL("../contracts/backend-agent-contract.json", import.meta.url), "utf8"));

test("generated core modules and built exports match the pinned backend contract", () => {
  syncContract(contract, true);
  assert.deepEqual(instructionsByProfile, contract.instructions);
  assert.deepEqual(restInstructions, contract.restInstructions);
  assert.deepEqual(restTransportGuidance, contract.transportGuidance);
  for (const [key,value] of Object.entries(backendContractProvenance)) assert.equal(value, contract[key]);
  assert.equal(contract.operations.length, 106); // memory_add has two REST bindings
  assert.deepEqual([...new Set(contract.operations.map(o => o.tool))].sort(), allDescriptors.map(d=>d.name).sort());
  for (const operation of contract.operations) {
    const tool = allDescriptors.find(d=>d.name === operation.tool);
    assert.equal(tool.title, operation.title);
    assert.equal(tool.description, operation.description);
    assert.equal(tool.method, operation.method);
    assert.deepEqual(scopeRequirementFor(tool.name), operation.scopes);
    assert.equal(operation.scopeDescription, renderScopeRequirement(scopeRequirementFor(tool.name), tool.auth === "anonymous"));
    assert.deepEqual(Object.fromEntries(Object.entries(tool.schema).filter(([,f])=>f.description).map(([n,f])=>[n,f.description])), operation.parameters);
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
  assert.deepEqual(report.shouting,[{location:"one",word:"SHOUTING"},{location:"two",word:"SHOUTING"}]);
  assert.equal(report.catalogChars,JSON.stringify({tools}).length);
});
