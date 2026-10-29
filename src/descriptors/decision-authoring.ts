// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { z } from "../zod.js";
import { creationResultGuidance, managerAuthorityPreflight, workerCreationTimezoneHint } from "../guidance.js";
import { defineTool, CREATE, type ToolDescriptor } from "./types.js";

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

export const createDecisionWorker: ToolDescriptor = defineTool({
  name: "decision_worker_create",
  title: "Create Decision Worker",
  description: managerAuthorityPreflight + "Create a reusable classifier to categorize, score, filter or triage data. Discover recipes with kit_app_tools(purpose:'decision'); kit_authoring_guide(section:'decision') has examples. Missing ordinary app connections do not prevent creation: create first, then prompt connection setup. Creates a private kit and worker atomically; optionally deploys, never runs. Questions and source mappings compile deterministically; source filters do not narrow read permissions. {{scope}} A selected-worker key gains the worker it creates. Reuse requestId and the identical body after a timeout; changed body returns 409. Returns tokenId, workerId, kitSlug, workerUrl, readiness, deployment/error, setupActions and nextCall. A deployment error leaves the worker saved, without that deployment's model/ceilings; never recreate it. Choice adds unclear; setup answers adjust categories/levels later. Returns no worker API secret. Arbitrary sources/routed actions: kit_validate → kit_publish(private) → kit_install.",
  auth: "manager", method: "post", path: "/api/manage/decision-workers",
  strictInput: true,
  resultDescription: creationResultGuidance,
  footer: data => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
    const result = data as Record<string, unknown>;
    return typeof result.workerUrl === "string" && result.workerUrl.trim() && result.error == null
      ? creationResultGuidance : undefined;
  },
  schema: {
    requestId: z.string().min(1).max(128).regex(/^[!-~]+$/).describe("Unique creation id. Reuse with the same body on retries; new id creates a new worker."),
    name: z.string().min(1).max(100),
    timeZoneId: z.string().trim().min(1).max(64).optional().describe(workerCreationTimezoneHint),
    source: z.object({
      recipe: z.enum(["email-previews", "calendar-events", "sheets-rows"]),
      args: z.record(z.unknown()).optional().describe("Arguments from the discovered recipe's argsSchema. No placeholders. Sheets requires fileId, range and columns."),
    }).strict(),
    questions: z.array(decisionQuestion).min(1).max(8).describe("Independent questions with unique keys. Choice: 1–20 options, excluding reserved unclear; name + description ≤200 chars. Score: ordered levels, lowest first. Noul: probability of a statement."),
    confidenceFloor: z.number().min(0).max(1).describe("Required confidence threshold; uncertain choices/scores are flagged, not omitted. Not an accuracy guarantee."),
    maxItems: z.number().int().min(1).max(50).default(20),
    operatorId: z.string().uuid().optional(),
    deploy: z.boolean().default(false).describe("Create a hosted deployment too. Does not execute a run."),
    decisionProfileId: z.string().min(1).max(64).optional().describe("Default classifier for the kit and worker: a profileId from models_list.decisionProfiles. Omit for Jev. Independent of deployment and spend settings."),
    maxUsdPerRun: z.number().min(0.01).max(1000).optional(),
    maxUsdPerDay: z.number().min(0.01).max(10000).optional(),
  },
  outputSchema: {
    tokenId: z.number().int().positive().describe("Use with existing worker tools and CLI commands."),
    workerId: z.string().uuid(), kitSlug: z.string(), modelType: z.literal("decision"), workerUrl: z.string(),
    connectAppsUrl: z.string().nullable().optional(),
    setupActions: z.array(z.object({
      code: z.string(), message: z.string(), url: z.string().optional(), apps: z.array(z.string()),
      tool: z.string().optional(), arguments: z.record(z.unknown()),
    })).optional(),
    readiness: z.record(z.unknown()).nullable(), deployment: z.record(z.unknown()).nullable(),
    deploymentError: z.record(z.unknown()).nullable(), warnings: z.array(z.string()),
    nextCall: z.object({ tool: z.string(), arguments: z.record(z.unknown()) }),
  },
  annotations: { ...CREATE, idempotentHint: true },
});
