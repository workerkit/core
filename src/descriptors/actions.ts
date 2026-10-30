// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { z } from "../zod.js";
import { creationResultGuidance, managerAuthorityPreflight, workerCreationTimezoneHint } from "../guidance.js";
import { defineTool, CREATE, READ_ONLY, TRIGGER, type ToolDescriptor } from "./types.js";

export const actionSpecSchema = z.object({
  schemaVersion: z.literal(1).describe("Always 1."),
  tools: z.array(z.object({
    ref: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
      .describe("A tool name exactly as action_worker_options lists it in tools[].name, from any of its apps."),
    version: z.literal(1).default(1).describe("Always 1."),
    contractHash: z.string().regex(/^[A-Fa-f0-9]{64}$/).optional()
      .describe("Optional pin, present when the selection is copied from a kit's actionSpec: creation is refused if that tool's contract changed since."),
  }).strict()).min(1).max(64).describe("1-64 tools, each listed once."),
}).strict().describe("An explicit tool selection instead of the app's defaults: {schemaVersion: 1, tools: [{ref, version: 1}]}.");

// invokeActions is younger than most keys: the same snapshot rule as every newer scope.
const INVOKE_SCOPE_NOTE =
  " Check key_info for scope snapshots and authority; never automatically retry a 403.";

const worker = {
  tokenId: z.number().int().positive()
    .describe("Action worker numeric tokenId from workers_list/action_worker_create (modelType none). key_info shows worker reach."),
};

export const actionDescriptors: readonly ToolDescriptor[] = [
  defineTool({
    name: "action_worker_options", title: "Action Worker Setup", auth: "manager", method: "get",
    path: "/api/manage/workers/action-options", strictInput: true,
    description: managerAuthorityPreflight + "Discover Action setup; creates/executes nothing. Omit app for the app inventory only, then choose an app for reviewed tools, defaults and connection requirements. Native/enabled reviewed MCP contracts can enter actionSpec; capabilities names source limits. app:customApi returns setup metadata, not selectable refs: API-only jobs use Language workers and dashboard finite-version bindings; no private API worker-slot calls. Action workers need no model/deployment. Actual Slack selections require a fixed active bot before creation; identities are server-owned. {{scope}}",
    schema: {
      operatorId: z.string().uuid().optional()
        .describe("The operator (workspace) to read connections for, as a GUID from apps_list → operators[]. Omit for the account's default operator."),
      app: z.string().min(1).max(128).optional()
        .describe("Omit for app inventory only. Supply an apps[].code for that app's reviewed tools/defaultTools; customApi returns setup metadata only."),
    },
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "action_worker_create", title: "Create Action Worker", auth: "manager", method: "post",
    path: "/api/manage/workers/actions", strictInput: true,
    description: managerAuthorityPreflight + "Create a private Action kit and worker after options discovery. Explicit app or actionSpec is required; there is no implicit app. app copies its reviewed defaults once; actionSpec selects up to 64 native/reviewed MCP tools across apps without needing app. Review any writes before creation. Private API refs are not selectable; follow source capabilities. Actual Slack tools require a fixed active bot; ordinary missing connections can follow creation. Only owner edits change tools. {{scope}} A selected-worker key gains its created worker. Reuse requestId/identical body after timeout; never recreate for recovery. Returns IDs/kitSlug/modelType none, no worker key. No model/deployment/run: worker_run/worker_deploy refuse with 400 action_worker_requires_invoke.",
    resultDescription: creationResultGuidance,
    footer: data => {
      if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
      const result = data as Record<string, unknown>;
      return typeof result.workerUrl === "string" && result.workerUrl.trim() && result.error == null
        ? creationResultGuidance : undefined;
    },
    schema: {
      requestId: z.string().min(1).max(128)
        .describe("Your idempotency key for this creation. Repeat it only with the identical body, to recover a timed-out call's result; a different body under the same requestId is 409 request_conflict."),
      name: z.string().min(1).max(100).describe("Name for the new worker and its private kit."),
      timeZoneId: z.string().trim().min(1).max(64).optional().describe(workerCreationTimezoneHint),
      app: z.string().min(1).max(128).optional()
        .describe("Required when actionSpec is absent: an explicit app from action_worker_options. Copies that app's reviewed defaults once. Omit when selecting exact actionSpec tools."),
      slackConnectionId: z.number().int().positive().optional()
        .describe("Slack tools only: the bot connection to pin, an id from action_worker_options connections[] (app slack). A sole usable connection is selected automatically."),
      operatorId: z.string().uuid().optional()
        .describe("The operator (workspace) to create the worker on, as a GUID from apps_list → operators[]. Omit for the account's default operator."),
      actionSpec: actionSpecSchema.optional(),
    },
    annotations: { ...CREATE, idempotentHint: true },
  }),
  defineTool({
    name: "worker_tools", title: "List Action Worker Tools", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tools`, paramFilter: () => ({}), strictInput: true,
    description: managerAuthorityPreflight + "Discover saved Action tools, exact schemas, connections and sender. {{scope}} Copy a returned name and inputs to worker_tool_call. Each tool reports invocationSource, effect, idempotencyRequired, keyFormat, workerCallsSupported and invocationManagerScopes; follow these rather than inferring from readOnly. Private API effect is the declared operation description; readOnly stays false even for reads, which still require a versioned key. available:false blocks calls pending setup/contract review. availableTools are not callable until explicitly selected. Discovery grants no access; policy is checked each call.",
    schema: worker, annotations: READ_ONLY,
  }),
  defineTool({
    name: "worker_tool_call", title: "Call Action Worker Tool", auth: "manager", method: "post",
    path: p => `/api/manage/workers/${p.tokenId}/tools/${encodeURIComponent(String(p.toolName))}/invoke`, strictInput: true,
    description: managerAuthorityPreflight + "Invoke one saved Action tool without a model; discover worker_tools first and follow idempotencyRequired/keyFormat. {{scope}} Cannot change tools, connection, sender or permissions. Native/MCP writes need a unique key; reads need none. Every private API operation, including reads, needs managePrivateApiApps plus invokeActions and v1:<Unix timestamp>:<32-hex UUID>. Reuse a key and identical arguments to recover transport loss; it replays the journal, never resends. A retryable native/MCP refusal needs a new key for a later attempt. Poll in_progress with worker_tool_invocation. outcome_unknown: do not automatically retry or issue a new key. Native/MCP write receipts retain confirmation, not private response content; never resend to recover a body. Returns {invocationId,tool,status,result,error,replayed,contractVersion}; status succeeded|denied|failed|in_progress|outcome_unknown. Native/MCP reads leave no receipt; private API calls do. Pre-dispatch refusals use {error,message,code}: 403 tool_not_exposed, 409 tool_contract_changed (review/re-save), 409 idempotency_conflict (changed arguments), 400 invalid_request (schema mismatch)." + INVOKE_SCOPE_NOTE,
    schema: {
      ...worker,
      toolName: z.string().min(1).max(128)
        .describe("A tools[].name from worker_tools for this worker, exactly."),
      contractVersion: z.literal(1).default(1).describe("Always 1."),
      arguments: z.record(z.unknown())
        .describe("The tool's inputs, exactly as its inputSchema in worker_tools declares them, with their JSON types. Send {} for a tool that takes none."),
      idempotencyKey: z.string().min(1).max(128).regex(/^[!-~]+$/).optional()
        .describe("Follow worker_tools.idempotencyRequired/keyFormat: native/MCP writes use 1-128 printable characters; every private API call, even read, uses v1:<Unix timestamp>:<32-hex UUID>. Reuse only for identical arguments to recover the original journal; changed arguments return 409 idempotency_conflict."),
    },
    bodyBuilder: p => ({ contractVersion: p.contractVersion, arguments: p.arguments }),
    headerBuilder: (p): Record<string, string> => p.idempotencyKey ? { "Idempotency-Key": String(p.idempotencyKey) } : {},
    requestTimeoutMs: () => 90_000, annotations: { ...TRIGGER, idempotentHint: false },
  }),
  defineTool({
    name: "worker_tool_invocation", title: "Read Action Invocation", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tool-invocations/${p.invocationId}`, paramFilter: () => ({}), strictInput: true,
    description: managerAuthorityPreflight + "Read an Action invocation's status and effect references. {{scope}} Does not execute or retry anything. Unknown outcomes must not be automatically resent. A write still in_progress after two minutes reads as outcome_unknown: check the app itself before deciding anything." + INVOKE_SCOPE_NOTE,
    schema: {
      ...worker,
      invocationId: z.string().uuid().describe("The invocationId returned for a native/MCP write or any private API invocation."),
    },
    annotations: READ_ONLY,
  }),
];
