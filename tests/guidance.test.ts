import { describe, expect, it } from "vitest";
import { allDescriptors, byName, instructionsByProfile, toolsForProfile, toolScopeRequirements, renderScopeRequirement } from "../src/index.js";

describe("canonical guidance", () => {
  it("covers every tool with an explicit authorization declaration", () => {
    expect(Object.keys(toolScopeRequirements).sort()).toEqual(allDescriptors.map(d => d.name).sort());
    expect(renderScopeRequirement(toolScopeRequirements.kit_install)).toContain("manageDeployments when deploy:true");
    expect(renderScopeRequirement(toolScopeRequirements.kit_install)).toContain("manageDeployments when deployment is supplied");
    expect(renderScopeRequirement(toolScopeRequirements.wallet_checkout_get)).toContain("only for a checkout created by this credential");
    for (const tool of allDescriptors) {
      expect(tool.description, tool.name).not.toContain("{{scope}}");
      if (tool.auth === "manager") {
        const requirement = renderScopeRequirement(toolScopeRequirements[tool.name]);
        expect(tool.description.split(requirement), tool.name).toHaveLength(2);
      }
    }
  });

  it("keeps the profile inventories and instructions aligned", () => {
    expect(toolsForProfile("workers")).toHaveLength(107);
    expect(toolsForProfile("decision")).toHaveLength(24);
    expect(toolsForProfile("decision").map(tool => tool.name)).not.toContain("worker_quality_set");
    expect(toolsForProfile("directory")).toHaveLength(8);
    for (const [profile, instruction] of Object.entries(instructionsByProfile)) {
      expect(instruction.length, profile).toBeLessThanOrEqual(2048);
      if (profile !== "directory") {
        expect(instruction.slice(0, 512)).toContain("Never automatically retry a 403");
        expect(instruction.slice(0, 512)).toContain("Skipped");
      }
    }
    expect(instructionsByProfile.decision).not.toContain("worker_tool_call");
    expect(instructionsByProfile.decision).not.toContain("run_events");
  });

  it("keeps consequential guidance available when initialize instructions are absent", () => {
    const d = (name: string) => byName(name)!.description;
    expect(d("key_info")).toContain('do not automatically gain scopes added after minting, even when minted with "all"');
    expect(d("key_info")).toContain("An authorized edit can update an existing key");
    expect(d("key_info")).toContain("expanding beyond an agent grant requires fresh consent");
    expect(d("key_info")).toContain("never retry a 403");
    expect(d("key_info")).toContain("workerIds");
    expect(d("worker_run")).toContain("HTTP 200 Skipped");
    expect(d("worker_run")).toContain("normal receipt, not an error");
    for (const name of ["worker_run", "run_bulk", "run_get"]) {
      expect(d(name)).toContain("FleetSpendCap alone does not identify the ceiling");
      expect(d(name)).toContain("human_spend_ceiling");
      expect(d(name)).toContain("fleet_spend_cap");
    }
    expect(d("worker_run")).toContain("422 RUNTIME_NOT_ENABLED");
    expect(d("worker_run")).toContain("do not retry");
    expect(d("run_events")).toContain("afterSeq");
    expect(d("run_events")).toContain("lastSeq");
    expect(d("instruction_version_get")).toContain("403");
    expect(d("kit_install")).toContain("rawKey");
    expect(d("kit_install")).toContain("ONCE");
    expect(d("delivery_secret_rotate")).toContain("signingSecret");
    expect(d("worker_delete")).toContain("NEVER proves an earlier delete succeeded");
    expect(d("worker_tool_call")).toContain("outcome_unknown");
    expect(d("worker_tool_call")).toContain("do not automatically retry or issue a new key");
    expect(d("model_key_set")).toContain("based on provider list price");
    expect(d("worker_runs")).toContain("Use walletChargeUsd when present");
    expect(d("worker_runs")).toContain("platform-funded classification even on BYOK");
    expect(d("worker_runs")).toContain("FreeRun uses the signup allowance, not the wallet");
    expect(d("run_answer")).toContain("new receipt has parentRunId");
    for (const name of ["delivery_create", "delivery_update"]) {
      expect(byName(name)!.schema.target.description).toContain("sms|whatsapp");
    }
  });
});
