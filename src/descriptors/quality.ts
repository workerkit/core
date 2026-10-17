// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { z } from "../zod.js";
import { defineTool, READ_ONLY, UPDATE, type ToolDescriptor } from "./types.js";

// Worker quality: owner-reviewed acceptance criteria, three activation gates and
// a fixture preview. A manager key can read settings, save criteria and switch
// gates off; the consent that activates automatic improvement or shared learning
// lives in the owner dashboard, and no manager input grants it.

const API = "/api/manage/workers";

const TOKEN_ID = z.number().int().min(1)
  .describe("Worker tokenId from workers_list; current account and selected-worker access apply.");

// One definition shape, taught on both tools that accept it (reviewed repetition QUALITY-01).
const EVALUATION_SPEC = z.record(z.string(), z.unknown()).describe(
  "Evaluation definition: schemaVersion:1, criteria (at most 20) with id, requirement, kind deterministic|model, mandatory, evidenceKey, pointer (RFC 6901). Deterministic checks use check present|equals|count_at_least|word_count_at_most. All except present require expected; word_count_at_most takes an integer 1-10000 and counts whitespace-delimited words. No scripts. Empty criteria clears the definition. Model checks need a supported evaluator; fixture preview returns unknown."
);

const qualityPath = (params: Record<string, unknown>) => `${API}/${params.tokenId}/quality`;

const getWorkerQuality: ToolDescriptor = defineTool({
  name: "worker_quality_get",
  title: "Get Worker Quality Settings",
  description:
    "Read criteria, revision, three gates and availability reasons. {{scope}} All gates default off. Gate 1, Quality and suggestions, enables checks; gate 2, automatic improvement, and gate 3, shared learning, each require it independently. kitEvaluationSpec offers the latest public kit criteria for explicit review/copy. Under How this worker works → Continuous Learning, owners review or draft criteria, test them on saved reports using wallet credits, then activate explicitly. Paid comparisons, apply/rollback, monitoring and company/shadow learning stay owner-only. Improvements change instruction text only; shadow learning does not train model weights.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: TOKEN_ID,
  },
  path: qualityPath,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
});

const setWorkerQuality: ToolDescriptor = defineTool({
  name: "worker_quality_set",
  title: "Update Worker Quality Settings",
  description:
    "Save reviewed criteria or change quality preferences. {{scope}} Read worker_quality_get first and send expectedRevision; stale updates return 409 quality_settings_changed. Omitted fields stay unchanged. Gate 1 off clears gates 2 and 3 atomically; re-enabling never restores them. Gate 3 does not require gate 2. Automatic improvement and shared learning require owner-reviewed limits/consent in the dashboard; manager tools can disable them but cannot enable them or expand their policies. Unavailable capabilities return 409 quality_feature_unavailable. Installing or copying kit criteria grants no activation consent. Saving criteria alone enables nothing.",
  auth: "manager",
  method: "patch",
  schema: {
    tokenId: TOKEN_ID,
    expectedRevision: z.number().int().min(0)
      .describe("Current settings revision; zero if no configuration exists."),
    qualityAndSuggestionsEnabled: z.boolean().optional().describe(
      "Enable only when capabilities.qualityAndSuggestions.available and reviewed mandatory criteria are present. False also disables the other two gates."
    ),
    automaticImprovementEnabled: z.literal(false).optional().describe(
      "False disables automatic instruction changes. Only the owner dashboard can enable this gate after reviewing limits."
    ),
    sharedLearningEnabled: z.literal(false).optional().describe(
      "False revokes company sharing and shadow-learning consent. Only the owner dashboard can enable this gate after reviewing scope."
    ),
    evaluationSpec: EVALUATION_SPEC.optional(),
  },
  path: qualityPath,
  bodyBuilder: ({ tokenId: _, ...body }) => body,
  annotations: UPDATE,
});

const previewWorkerQuality: ToolDescriptor = defineTool({
  name: "worker_quality_preview",
  title: "Check Worker Evaluation Samples",
  description:
    "Check a definition against owner-supplied fixtures without saving, calling models/apps, or running the worker. {{scope}} Returns pass/fail/unknown and owner_supplied_fixture provenance, not a verified run result. Missing/incomplete evidence is unknown; a complete empty result is distinct. Model checks remain unknown. This preview cannot authorize a production action or qualify an improvement.",
  auth: "manager",
  method: "post",
  schema: {
    tokenId: TOKEN_ID,
    spec: EVALUATION_SPEC,
    evidence: z.array(z.object({
      key: z.string().describe("The evidenceKey a criterion names; unique within the request."),
      complete: z.boolean().describe("Whether the value is the whole observation. false yields unknown, never fail."),
      value: z.unknown().describe("The observed JSON value; the criterion's pointer selects within it."),
      reference: z.string().max(300).optional().describe("Where the fixture came from, at most 300 characters; echoed in results."),
    })).max(40).describe("Up to 40 owner-supplied fixtures with unique keys and at most 32000 characters of values in total."),
  },
  path: (params) => `${qualityPath(params)}/preview`,
  bodyBuilder: ({ spec, evidence }) => ({ spec, evidence }),
  annotations: READ_ONLY,
});

export const qualityDescriptors: readonly ToolDescriptor[] = [getWorkerQuality, setWorkerQuality, previewWorkerQuality];
