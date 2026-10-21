import { describe, expect, it } from "vitest";
import { byName, executeTool, scopeRequirementFor, type PortEdenClient } from "../src/index.js";

const appId = "11111111-1111-4111-8111-111111111111";
const revision = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const definition = { schemaVersion: 1, origin: "https://api.example.com", operations: [{
  key: "lookup", description: "Read an approved ticket", effect: "Read only", method: "GET", path: "/tickets/{id}",
  inputs: { type: "object", properties: { id: { type: "string", maxLength: 80 } }, required: ["id"], additionalProperties: false },
  pathInputs: { id: { input: "id" } }, authentication: { kind: "none" }, responseFields: { id: "/id" },
}] };

describe("API app authoring", () => {
  it("preserves the reviewed definition and strips route identifiers from mutation bodies", async () => {
    const calls: unknown[] = [];
    const client = Object.fromEntries(["get", "post", "put", "delete"].map(method => [method,
      async (...args: unknown[]) => { calls.push([method, ...args]); return { status: 200, data: {} }; },
    ])) as unknown as PortEdenClient;
    const create = { name: "Tickets", definition };
    await executeTool(client, byName("api_app_create")!, create, { token: "pe_mgr_test" });
    await executeTool(client, byName("api_app_update")!, { ...create, appId, revision, enabled: false });
    await executeTool(client, byName("api_app_publish")!, { appId, revision });
    await executeTool(client, byName("api_app_version_get")!, { appId, versionId });
    await executeTool(client, byName("api_app_version_revoke")!, { appId, versionId });
    expect(calls).toEqual([
      ["post", "/api/manage/custom-api/apps", { token: "pe_mgr_test", body: create, signal: undefined }],
      ["put", `/api/manage/custom-api/apps/${appId}`, { body: { ...create, revision, enabled: false }, token: undefined, signal: undefined }],
      ["post", `/api/manage/custom-api/apps/${appId}/versions`, { body: { revision }, token: undefined, signal: undefined }],
      ["get", `/api/manage/custom-api/apps/${appId}/versions/${versionId}`, { params: {}, token: undefined, signal: undefined }],
      ["delete", `/api/manage/custom-api/apps/${appId}/versions/${versionId}`, { token: undefined, signal: undefined }],
    ]);
    expect(scopeRequirementFor("api_app_create")).toEqual({ kind: "scope", scope: "managePrivateApiApps" });
  });

  it.each([
    { name: "Tickets", definition, secrets: { token: "must-not-be-stored-here" } },
    { name: "Tickets", definition: { ...definition, operations: [] } },
    { name: "Tickets", definition: { ...definition, script: "unsupported" } },
  ])("rejects unsupported authoring inputs before making an HTTP request", async input => {
    let calls = 0;
    const client = { post: async () => { calls++; return {}; } } as unknown as PortEdenClient;
    await expect(executeTool(client, byName("api_app_create")!, input)).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
