import { z } from "../zod.js";
import { CREATE, type ToolDescriptor } from "./types.js";

const key = z.string().regex(/^(?=.{1,40}$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const base = { key, instructions: z.string().min(1).max(4000) };
export const decisionQuestion = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("choice"), options: z.record(key, z.string().min(1).max(200)).refine(options => {
    const entries = Object.entries(options);
    return entries.length >= 1 && entries.length <= 20 && entries.every(([name, description]) => name !== "unclear" && description.trim().length > 0 && name.length + 3 + description.length <= 200);
  }, "Provide 1–20 options excluding unclear; each name and description must fit in 200 characters including the separator.") }).strict(),
  z.object({ ...base, type: z.literal("score"), levels: z.array(z.string().min(1).max(200)).min(2).max(10) }).strict(),
  z.object({ ...base, type: z.literal("noul"), trueMeaning: z.string().max(200).optional(), falseMeaning: z.string().max(200).optional() }).strict(),
]);

export const createDecisionWorker: ToolDescriptor = {
  name: "decision_worker_create",
  title: "Create Decision Worker",
  description: "Create a reusable classifier to categorize, score, filter or triage connected data. First discover source recipes with kit_app_tools(purpose:'decision'); kit_authoring_guide(section:'decision') has examples. Creates a private kit and worker atomically; optionally deploys, never runs. Questions and source mappings compile deterministically into the ordinary decision specification. Source filters do not narrow the recipe's read permissions. Requires publishKits + installKits, plus manageDeployments when deploy:true. Reuse requestId and the identical body to recover the original receipt after a timeout; changed body returns 409. Returns tokenId for lifecycle commands, stable workerId, kitSlug, readiness, deployment/error and exact nextCall arguments. Follow nextCall, then worker_run/run_get. A deployment error means the worker already exists. Choice adds unclear automatically; setup answers adjust categories/levels later. Creation returns no worker API secret. For arbitrary sources/actions use kit_validate → kit_publish(private) → kit_install.",
  auth: "manager", method: "post", path: "/api/manage/decision-workers",
  strictInput: true,
  schema: {
    requestId: z.string().min(1).max(128).regex(/^[!-~]+$/).describe("Unique creation id. Reuse with the same body on retries; new id creates a new worker."),
    name: z.string().min(1).max(100),
    source: z.object({
      recipe: z.enum(["email-previews", "calendar-events", "sheets-rows"]),
      args: z.record(z.unknown()).optional().describe("Arguments from the discovered recipe's argsSchema. No placeholders. Sheets requires fileId, range and columns."),
    }).strict(),
    questions: z.array(decisionQuestion).min(1).max(8).describe("Independent questions with unique keys. Choice: 1–20 options, excluding reserved unclear; name + description ≤200 chars. Score: ordered levels, lowest first. Noul: probability of a statement."),
    confidenceFloor: z.number().min(0).max(1).describe("Required confidence threshold; uncertain choices/scores are flagged, not omitted. Not an accuracy guarantee."),
    maxItems: z.number().int().min(1).max(50).default(20),
    operatorId: z.string().uuid().optional(),
    deploy: z.boolean().default(false).describe("Create a hosted deployment too. Does not execute a run."),
    maxUsdPerRun: z.number().min(0.01).max(1000).optional(),
    maxUsdPerDay: z.number().min(0.01).max(10000).optional(),
  },
  outputSchema: {
    tokenId: z.number().int().positive().describe("Use with existing worker tools and CLI commands."),
    workerId: z.string().uuid(), kitSlug: z.string(), modelType: z.literal("decision"), workerUrl: z.string(),
    readiness: z.record(z.unknown()).nullable(), deployment: z.record(z.unknown()).nullable(),
    deploymentError: z.record(z.unknown()).nullable(), warnings: z.array(z.string()),
    nextCall: z.object({ tool: z.string(), arguments: z.record(z.unknown()) }),
  },
  annotations: { ...CREATE, idempotentHint: true },
};
