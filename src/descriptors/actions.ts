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
    description: managerAuthorityPreflight + "Get available apps, reviewed tool contracts, default tools and required connections for an Action worker: no model, instruction or deployment; invoke selected tools directly with worker_tool_call (modelType none). Slack tools need an active fixed bot: if no usable bot is returned, prompt connection setup and do not submit creation. Connection IDs and sender identities are server-owned. {{scope}} Creates and executes nothing.",
    schema: {
      operatorId: z.string().uuid().optional()
        .describe("The operator (workspace) to read connections for, as a GUID from apps_list → operators[]. Omit for the account's default operator."),
      app: z.string().min(1).max(128).optional()
        .describe("The app whose tools and defaultTools to return, exactly as apps[].code lists it. Omit for Slack."),
    },
    annotations: READ_ONLY,
  }),
  defineTool({
    name: "action_worker_create", title: "Create Action Worker", auth: "manager", method: "post",
    path: "/api/manage/workers/actions", strictInput: true,
    description: managerAuthorityPreflight + "Create a private Action kit and worker from action_worker_options. No model or deployment. Copies the app's default tools once; optional actionSpec selects up to 64 tools across apps. Slack tools require an active fixed bot: if none is available, prompt connection setup and do not submit creation. Missing ordinary app connections can be resolved after creation. Only explicit owner edits change installed tools. {{scope}} A selected-worker key gains the worker it creates. Reuse requestId with the same body after a timeout; never create a second worker to recover a lost response. Returns tokenId, workerId, kitSlug and modelType none, no worker key. Never deploy or run an Action worker: worker_run/worker_deploy refuse it with 400 action_worker_requires_invoke.",
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
        .describe("The app whose default tools are copied when actionSpec is omitted, exactly as action_worker_options apps[].code lists it. Omit for Slack."),
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
    description: managerAuthorityPreflight + "Discover the saved tools, exact input/output schemas, connection and sender of an Action worker. {{scope}} Select a named tool and supply its declared inputs using worker_tool_call. Discovery does not grant execution permission; current policy is checked on each call. Each tools[] entry carries name (the toolName), inputSchema, outputSchema, readOnly (false = a write, which needs an idempotencyKey) and available (false = not callable now: the tool left the catalog, its contract changed or, for a Slack tool, its bot connection is missing, until the owner reviews and re-saves the selection). availableTools are not callable until the owner selects them.",
    schema: worker, annotations: READ_ONLY,
  }),
  defineTool({
    name: "worker_tool_call", title: "Call Action Worker Tool", auth: "manager", method: "post",
    path: p => `/api/manage/workers/${p.tokenId}/tools/${encodeURIComponent(String(p.toolName))}/invoke`, strictInput: true,
    description: managerAuthorityPreflight + "Execute exactly one saved Action worker tool with structured inputs, without a model. Discover worker_tools first. {{scope}} Cannot change tools, connection, sender or permissions. Supply a unique idempotencyKey for each intended write and reuse it for transport retries. A repeated key never resends: it replays the first answer, so a refusal with error.retryable true is retried later under a new key. For in_progress poll worker_tool_invocation. outcome_unknown means the app may have completed the action: do not automatically retry or issue a new key. Generic write receipts retain confirmation but not private app response content. Never resend to recover a lost response body. The answer is {invocationId, tool, status, result, error, replayed, contractVersion} with status succeeded | denied | failed | in_progress | outcome_unknown; invocationId is set on writes only (reads leave no receipt). Refusals before the app is reached use the {error, message, code} envelope: 403 tool_not_exposed, 409 tool_contract_changed (the owner must re-save the selection), 409 idempotency_conflict (same key, different arguments), 400 invalid_request (arguments that do not match inputSchema)." + INVOKE_SCOPE_NOTE,
    schema: {
      ...worker,
      toolName: z.string().min(1).max(128)
        .describe("A tools[].name from worker_tools for this worker, exactly."),
      contractVersion: z.literal(1).default(1).describe("Always 1."),
      arguments: z.record(z.unknown())
        .describe("The tool's inputs, exactly as its inputSchema in worker_tools declares them, with their JSON types. Send {} for a tool that takes none."),
      idempotencyKey: z.string().min(1).max(128).regex(/^[!-~]+$/).optional()
        .describe("Required on a write tool (readOnly false in worker_tools): 1-128 printable characters, one per intended write. The same key with the same arguments returns the stored receipt without calling the app again; with different arguments it is 409 idempotency_conflict. Reads need none."),
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
      invocationId: z.string().uuid().describe("The invocationId a worker_tool_call answer carried for a write."),
    },
    annotations: READ_ONLY,
  }),
];
