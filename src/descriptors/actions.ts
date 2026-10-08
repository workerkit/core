import { z } from "../zod.js";
import { CREATE, READ_ONLY, TRIGGER, type ToolDescriptor } from "./types.js";

export const actionSpecSchema = z.object({
  schemaVersion: z.literal(1),
  tools: z.array(z.object({
    ref: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
    version: z.literal(1).default(1),
    contractHash: z.string().regex(/^[A-Fa-f0-9]{64}$/).optional(),
  }).strict()).min(1).max(64),
}).strict();
const worker = { tokenId: z.number().int().positive() };

export const actionDescriptors: readonly ToolDescriptor[] = [
  {
    name: "action_worker_options", title: "Action Worker Setup", auth: "manager", method: "get",
    path: "/api/manage/workers/action-options", strictInput: true,
    description: "Get available apps, reviewed tool contracts, the selected app's default tools and any required connections for creating an Action worker. Connection IDs and sender identities are server-owned. Requires readWorkers; creates and executes nothing.",
    schema: { operatorId: z.string().uuid().optional(), app: z.string().min(1).max(128).optional() }, annotations: READ_ONLY,
  },
  {
    name: "action_worker_create", title: "Create Action Worker", auth: "manager", method: "post",
    path: "/api/manage/workers/actions", strictInput: true,
    description: "Create a private Action kit and worker for an app from action_worker_options. No model or deployment. The server copies that app's default tools once; optionally provide an explicit actionSpec of up to 64 tools across apps. Slack tools require a fixed bot connection. Only explicit owner edits change installed tools. Requires publishKits and installKits. Reuse requestId with the same body after a timeout; never create a second worker to recover a lost response.",
    schema: {
      requestId: z.string().min(1).max(128),
      name: z.string().min(1).max(100),
      app: z.string().min(1).max(128).optional(),
      slackConnectionId: z.number().int().positive().optional(),
      operatorId: z.string().uuid().optional(),
      actionSpec: actionSpecSchema.optional(),
    },
    annotations: { ...CREATE, idempotentHint: true },
  },
  {
    name: "worker_tools", title: "List Action Worker Tools", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tools`, paramFilter: () => ({}), strictInput: true,
    description: "Discover the saved tools, exact input/output schemas, connection and sender of an Action worker. Requires readWorkers. Select a named tool and supply its declared inputs using worker_tool_call. Discovery does not grant execution permission; current policy is checked on each call.",
    schema: worker, annotations: READ_ONLY,
  },
  {
    name: "worker_tool_call", title: "Call Action Worker Tool", auth: "manager", method: "post",
    path: p => `/api/manage/workers/${p.tokenId}/tools/${encodeURIComponent(String(p.toolName))}/invoke`, strictInput: true,
    description: "Execute exactly one saved Action worker tool with structured inputs, without a model. Discover worker_tools first. Requires invokeActions. Cannot change tools, connection, sender or permissions. Supply a unique idempotencyKey for each intended write and reuse it for transport retries. A repeated key never resends. For in_progress poll worker_tool_invocation. outcome_unknown means the app may have completed the action: do not automatically retry or issue a new key. Generic write receipts retain confirmation but not private app response content. Never resend to recover a lost response body.",
    schema: {
      ...worker,
      toolName: z.string().min(1).max(128),
      contractVersion: z.literal(1).default(1),
      arguments: z.record(z.unknown()),
      idempotencyKey: z.string().min(1).max(128).regex(/^[!-~]+$/).optional(),
    },
    bodyBuilder: p => ({ contractVersion: p.contractVersion, arguments: p.arguments }),
    headerBuilder: (p): Record<string, string> => p.idempotencyKey ? { "Idempotency-Key": String(p.idempotencyKey) } : {},
    requestTimeoutMs: () => 90_000, annotations: { ...TRIGGER, idempotentHint: false },
  },
  {
    name: "worker_tool_invocation", title: "Read Action Invocation", auth: "manager", method: "get",
    path: p => `/api/manage/workers/${p.tokenId}/tool-invocations/${p.invocationId}`, paramFilter: () => ({}), strictInput: true,
    description: "Read an Action invocation's status and effect references. Requires invokeActions. Does not execute or retry anything. Unknown outcomes must not be automatically resent.",
    schema: { ...worker, invocationId: z.string().uuid() }, annotations: READ_ONLY,
  },
];
