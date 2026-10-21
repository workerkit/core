// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { z } from "../zod.js";
import { CREATE, DELETE, READ_ONLY, UPDATE, defineTool, type ToolDescriptor } from "./types.js";

const API = "/api/manage/custom-api";
const appId = z.string().uuid().describe("Account-owned app UUID from api_apps_list or api_app_create. Another account's app is indistinguishable from a missing app.");
const versionId = z.string().uuid().describe("Immutable version UUID from api_app_get or api_app_publish.");
const revision = z.string().uuid().describe("Current revision from api_app_get, api_app_create or api_app_update. After publishing use appRevision from that response. A 409 requires re-reading and reviewing the draft; never overwrite using a newer revision automatically.");
const operations = "Named operations. Each declares key, description, effect, method (GET/HEAD/POST/PUT/PATCH/DELETE), fixed path, inputs, and responseFields (output name to JSON Pointer), or emptyResponse:true. inputs is a closed object schema with properties, additionalProperties:false and optional required; supported types: object/array/string/integer/number/boolean, bounded enum/const and type-appropriate bounds. pathInputs/query/headers map names to {input:field} or {literal:value}; each declared top-level input maps once. body uses those leaves in a JSON object. Path placeholders occupy whole segments. authentication is {kind:none}, {kind:bearer,secretSlot}, {kind:basic,usernameSlot,passwordSlot}, or {kind:apiKey,headers:{name:slot},query:{name:slot}}. Store slot names only, never credentials. successStatuses contains declared 2xx codes. The backend rejects unknown fields, unsafe mappings and unsupported schema features; api_app_validate reports errors before saving.";
export const apiAppOperationsText = operations;
const definition = z.object({
  schemaVersion: z.literal(1).describe("Definition format version; must be 1."),
  origin: z.string().url().max(2048).describe("One public HTTPS origin on port 443 without a path, query, credentials or fragment. Private networks and WorkerKit control-plane hosts are denied."),
  operations: z.array(z.record(z.unknown())).min(1).max(40).describe(operations),
}).strict().describe("Structured API definition, at most 128 KiB. No scripts, OpenAPI imports, executable templates or credentials. Validate before saving; preview only constructs a request shape and sends nothing.");
const path = (params: Record<string, unknown>) => `${API}/apps/${encodeURIComponent(String(params.appId))}`;
const versionPath = (params: Record<string, unknown>) => `${path(params)}/versions/${encodeURIComponent(String(params.versionId))}`;

export const apiAppDescriptors: readonly ToolDescriptor[] = [
  defineTool({
    name: "api_apps_list", title: "List API Apps", auth: "manager", method: "get", schema: {}, path: `${API}/apps`,
    description: "List this account's API apps: id, name, enabled, optimistic revision and liveVersionNumber (the newest unrevoked version; null if none). connectionCount, usableConnectionCount (enabled and authorized for the live version) and stoppedWorkerCount (enabled worker bindings stopped by a revoked version or a disabled or unauthorized connection) require an account Admin credential with managePrivateApiApps; otherwise null means withheld, not zero. {{scope}} Admins see all apps; members see only enabled apps explicitly granted to their current membership. Apps stay account-private. Use api_app_get for a saved draft and published version IDs.",
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "api_app_get", title: "Get API App", auth: "manager", method: "get", schema: { appId }, path,
    paramFilter: () => ({}), strictInput: true,
    description: "Read app metadata, current revision and published version IDs/hashes/revocation state. {{scope}} The draft additionally requires an account Admin credential with managePrivateApiApps; otherwise draft:null means withheld. No credentials are returned. Existing workers keep their pinned versions when the draft changes. Use api_app_version_get for an immutable definition.",
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "api_app_validate", title: "Validate API App", auth: "manager", method: "post", schema: { definition }, path: `${API}/validate`,
    strictInput: true,
    description: "Validate an API app definition offline and return its normalized definition and content hash. {{scope}} Requires a live account Admin. Saves nothing and sends no upstream request. Correct validation errors before api_app_create or api_app_update. A definition grants no worker access by itself; connections and exact worker bindings are configured separately on the dashboard.",
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "api_app_preview", title: "Preview API Request", auth: "manager", method: "post",
    schema: { definition, operation: z.string().min(1).max(48).describe("Operation key declared in definition.operations."),
      arguments: z.record(z.unknown()).describe("Example arguments matching the operation's closed input schema. Use non-sensitive examples; this is shape validation, not a live test.") },
    path: `${API}/preview`, strictInput: true,
    description: "Construct an API request shape offline. {{scope}} Requires a live account Admin. Returns origin, method, path template, query/header names, body byte count and authentication slot names; argument values and credentials are omitted. Saves nothing, resolves no DNS and sends no upstream request. This does not prove credentials or the destination work.",
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "api_app_create", title: "Create API App", auth: "manager", method: "post",
    schema: { name: z.string().trim().min(1).max(100).describe("App's display name within this account."), definition,
      enabled: z.boolean().optional().describe("Defaults false. Enabling allows existing authorized bindings to execute; it does not publish a version or grant user/worker access.") },
    path: `${API}/apps`, strictInput: true,
    description: "Create an account-private API app draft; returns its app UUID and revision. {{scope}} Requires a live account Admin. Validate first with api_app_validate. No upstream request, connection or worker grant is created. Publish the saved draft with api_app_publish before configuring a connection and binding in the dashboard. Limited to 25 apps/account. After a lost response inspect api_apps_list before creating again; creation is not idempotent.",
    annotations: CREATE,
  }),
  defineTool({
    name: "api_app_update", title: "Update API App", auth: "manager", method: "put",
    schema: { appId, revision, name: z.string().trim().min(1).max(100).describe("Replacement display name."), definition,
      enabled: z.boolean().describe("Explicit app state. false immediately blocks new dispatches for every version; true still requires current grants, bindings, connections and policy.") },
    path, strictInput: true,
    bodyBuilder: ({ appId: _appId, ...body }) => body,
    description: "Replace an app's saved draft, name and enabled state using its current revision. {{scope}} Requires a live account Admin. Returns a new revision. Published definitions remain immutable and workers keep their pinned versions; use api_app_publish for a new version. A 409 revision_conflict requires reviewing the latest draft. Do not blindly retry a lost update with a newer revision.",
    annotations: UPDATE,
  }),
  defineTool({
    name: "api_app_publish", title: "Publish API App Version", auth: "manager", method: "post", schema: { appId, revision },
    path: params => `${path(params)}/versions`, bodyBuilder: ({ revision }) => ({ revision }), strictInput: true,
    description: "Publish the saved API app draft as an immutable version in this account; returns id, number, contentHash and appRevision. {{scope}} Requires a live account Admin. Uses the reviewed draft revision, creates no public listing and never upgrades worker bindings. Publication does not enable the app. A 409 means re-read the app; after a lost response inspect its versions before publishing again. Use appRevision for the next app edit or publication.",
    annotations: CREATE,
  }),
  defineTool({
    name: "api_app_version_get", title: "Get API App Version", auth: "manager", method: "get", schema: { appId, versionId },
    path: versionPath, paramFilter: () => ({}), strictInput: true,
    description: "Read one immutable API app definition, content hash, authentication-profile fingerprint and revoked state. {{scope}} Requires a live account Admin. No credential values are returned. Connections must match the version's origin and authentication profile; the worker's binding separately selects a finite operation list and fixed inputs. Revoked versions cannot execute.",
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "api_app_version_revoke", title: "Revoke API App Version", auth: "manager", method: "delete", schema: { appId, versionId },
    path: versionPath, strictInput: true,
    description: "Permanently revoke a published API app version. {{scope}} Requires a live account Admin. Immediately prevents new dispatches by all workers pinned to that version; already dispatched effects cannot be undone. It does not delete the definition, app or credentials. Publish a new version and review bindings to resume use; revocation cannot be reversed.",
    annotations: DELETE,
  }),
];
