import { z } from "../zod.js";
import { CREATE, READ_ONLY, TRIGGER, type ToolDescriptor } from "./types.js";

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
  " A key minted before invokeActions existed does not carry it (even one minted with \"all\"): a 403 here is fixed by an account admin re-scoping or re-minting the key at https://workerkit.ai, never by retrying — check key_info's scopes first.";

const worker = {
  tokenId: z.number().int().positive()
    .describe("The Action worker's numeric tokenId, as returned by workers_list or action_worker_create (modelType none on worker_get). 404 not_found = no such Action worker on this account."),
};

export const actionDescriptors: readonly ToolDescriptor[] = [
  {
    name: "action_worker_options", title: "Action Worker Setup", auth: "manager", method: "get",
    path: "/api/manage/workers/action-options", strictInput: true,
    description: "Get available apps, reviewed tool contracts, the selected app's default tools and any required connections for creating an Action worker: a worker with no model, instruction or deployment, whose selected app tools a caller invokes directly with worker_tool_call (modelType none). Connection IDs and sender identities are server-owned. Requires readWorkers; creates and executes nothing.",
    schema: {
      operatorId: z.string().uuid().optional()
        .describe("The operator (workspace) to read connections for, as a GUID from apps_list → operators[]. Omit for the account's default operator."),
      app: z.string().min(1).max(128).optional()
        .describe("The app whose tools and defaultTools to return, exactly as apps[].code lists it. Omit for Slack."),
    },
    annotations: READ_ONLY,
  },
  {
    name: "action_worker_create", title: "Create Action Worker", auth: "manager", method: "post",
    path: "/api/manage/workers/actions", strictInput: true,
    description: "Create a private Action kit and worker for an app from action_worker_options. No model or deployment. The server copies that app's default tools once; optionally provide an explicit actionSpec of up to 64 tools across apps. Slack tools require a fixed bot connection. Only explicit owner edits change installed tools. Requires publishKits and installKits. Reuse requestId with the same body after a timeout; never create a second worker to recover a lost response. Returns tokenId, workerId, kitSlug and modelType none, and no worker key. The worker is never deployed or run (worker_run and worker_deploy refuse it with 400 action_worker_requires_invoke): call worker_tools next, then worker_tool_call.",
    schema: {
      requestId: z.string().min(1).max(128)
        .describe("Your idempotency key for this creation. Repeat it only with the identical body, to recover a timed-out call's result; a different body under the same requestId is 409 request_conflict."),
      name: z.string().min(1).max(100).describe("Name for the new worker and its private kit."),
      timeZoneId: z.string().trim().min(1).max(64).optional().describe("The worker's timezone, as an IANA id such as America/New_York. Ask the worker creator for it if it is not already known; never guess it from connected calendars or the server's clock. Omitted means UTC."),
      app: z.string().min(1).max(128).optional()
        .describe("The app whose default tools are copied when actionSpec is omitted, exactly as action_worker_options apps[].code lists it. Omit for Slack."),
      slackConnectionId: z.number().int().positive().optional()
        .describe("Slack tools only: the bot connection to pin, an id from action_worker_options connections[] (app slack). A sole usable connection is selected automatically."),
      operatorId: z.string().uuid().optional()
        .describe("The operator (workspace) to create the worker on, as a GUID from apps_list → operators[]. Omit for the account's default operator."),
      actionSpec: actionSpecSchema.optional(),
    },
    annotations: { ...CREATE, idempotentHint: true },
  },
  {
    name: "worker_tools", title: "List Action Worker Tools", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tools`, paramFilter: () => ({}), strictInput: true,
    description: "Discover the saved tools, exact input/output schemas, connection and sender of an Action worker. Requires readWorkers. Select a named tool and supply its declared inputs using worker_tool_call. Discovery does not grant execution permission; current policy is checked on each call. Each tools[] entry carries name (the toolName), inputSchema, outputSchema, readOnly (false = a write, which needs an idempotencyKey) and available (false = not callable now: the tool left the catalog, its contract changed or, for a Slack tool, its bot connection is missing, until the owner reviews and re-saves the selection). availableTools are not callable until the owner selects them.",
    schema: worker, annotations: READ_ONLY,
  },
  {
    name: "worker_tool_call", title: "Call Action Worker Tool", auth: "manager", method: "post",
    path: p => `/api/manage/workers/${p.tokenId}/tools/${encodeURIComponent(String(p.toolName))}/invoke`, strictInput: true,
    description: "Execute exactly one saved Action worker tool with structured inputs, without a model. Discover worker_tools first. Requires invokeActions. Cannot change tools, connection, sender or permissions. Supply a unique idempotencyKey for each intended write and reuse it for transport retries. A repeated key never resends: it replays the first answer, so a refusal with error.retryable true is retried later under a new key. For in_progress poll worker_tool_invocation. outcome_unknown means the app may have completed the action: do not automatically retry or issue a new key. Generic write receipts retain confirmation but not private app response content. Never resend to recover a lost response body. The answer is {invocationId, tool, status, result, error, replayed, contractVersion} with status succeeded | denied | failed | in_progress | outcome_unknown; invocationId is set on writes only (reads leave no receipt). Refusals before the app is reached use the {error, message, code} envelope: 403 tool_not_exposed, 409 tool_contract_changed (the owner must re-save the selection), 409 idempotency_conflict (same key, different arguments), 400 invalid_request (arguments that do not match inputSchema)." + INVOKE_SCOPE_NOTE,
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
  },
  {
    name: "worker_tool_invocation", title: "Read Action Invocation", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tool-invocations/${p.invocationId}`, paramFilter: () => ({}), strictInput: true,
    description: "Read an Action invocation's status and effect references. Requires invokeActions. Does not execute or retry anything. Unknown outcomes must not be automatically resent. A write still in_progress after two minutes reads as outcome_unknown: check the app itself before deciding anything." + INVOKE_SCOPE_NOTE,
    schema: {
      ...worker,
      invocationId: z.string().uuid().describe("The invocationId a worker_tool_call answer carried for a write."),
    },
    annotations: READ_ONLY,
  },
];
