// The 22 authenticated fleet-management tools, as pure descriptors. The
// descriptions ARE the product surface: they are served verbatim to MCP
// clients (and any future CLI help), so every contract nuance an agent must
// not get wrong is taught here.

import { z } from "../zod.js";
import { CREATE, DELETE, READ_ONLY, TRIGGER, UPDATE, type ToolDescriptor } from "./types.js";

// The graded-outcome vocabulary, taught wherever a score can be read or written.
// The null-vs-zero line is the one an agent gets wrong by default: absent means
// nobody judged the run, and reporting that as a zero would invent a failure.
const SCORE_NOTE =
  " Success grading: selfScore (0-100) is the run's OWN assessment of how much of its task it accomplished, written by a grading pass over what it actually did — a self-report, not a measurement. ownerScore (0-100) is the human's grade and OVERRIDES selfScore wherever both exist. selfScoreReason is a one-line explainer for selfScore. All three are null when the run was never assessed (stateless workers and very short runs are never graded) — null means NOT ASSESSED, never zero: do not report an unassessed run as scoring 0, and do not average nulls into a success rate.";

const API = "/api/manage/workers";

// ─── Shared phrasing ────────────────────────────────────────────────────────

const TOKEN_ID_HINT =
  "The worker's numeric token ID, as returned by workers_list. A 404 not_found means the worker does not exist OR belongs to another account — the two are indistinguishable by design.";

const RUN_ID_HINT =
  "The run's UUID, as returned by worker_run (runId), workers_list (currentRunId / lastRun.runId), or worker_runs.";

// The whole runs family shares this degradation mode; teach it once per tool so
// agents never retry-loop a 422.
const RUNTIME_NOTE =
  " When hosted runs are not enabled for this environment the call returns 422 RUNTIME_NOT_ENABLED — an environment capability switch, not a transient error: do not retry, and note that every non-run tool keeps working.";

const UTC_HINT = "ISO 8601 UTC datetime, e.g. '2026-08-01T00:00:00Z'.";

// ─── Fleet ──────────────────────────────────────────────────────────────────

const listWorkers: ToolDescriptor = {
  name: "workers_list",
  title: "List Workers",
  description:
    "List every AI worker on this account with live status: title, avatar, status (active|paused|expired), isEnabled, expiresAt, lastRun (the newest SETTLED run — in-flight runs never appear here), schedule rollup (total/enabled/nextRunUtc), and live state (isRunning, inFlightRuns, currentRunId — poll run_get with currentRunId to watch it). Compute elapsed/next-run times against the response's serverTimeUtc, never your own clock. IMPORTANT: lastRun.resultText is the report the worker itself wrote and requires the manager key to hold the readRuns scope IN ADDITION to readWorkers — with readWorkers only it is null, which does NOT mean the run produced no report; check your key's scopes before concluding anything from a null. Scope model for every tool here: a 403 OPERATION_NOT_ALLOWED names the missing scope — the key must be re-minted with broader scopes by an account admin at https://workerkit.ai (do not retry the call).",
  auth: "manager",
  method: "get",
  schema: {},
  path: API,
  annotations: READ_ONLY,
};

const getWorker: ToolDescriptor = {
  name: "worker_get",
  title: "Get Worker",
  description:
    "One worker in full: everything workers_list shows plus timeZoneId, maxRunsPerDay, kit provenance (templateId/slug/name), hasInstruction, isProtected, jobSentence, readiness (status ready|blocked with actionable issues — worker_inactive, no_identity, app_not_connected incl. candidateProviders, no_instruction), and 30-day activity (runs by outcome, success rate, cost; null while hosted runs are not enabled for the environment).",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

// ─── Runs ───────────────────────────────────────────────────────────────────

const runWorker: ToolDescriptor = {
  name: "worker_run",
  title: "Run Worker Now",
  description:
    "Trigger the worker to run now (recorded as an API-triggered run, attributed to the manager key's minter). The response is the minted run's RECEIPT — read status before assuming it ran: policy rejections (kill switch, usage window, daily run/spend cap, concurrency, wallet credits, readiness, or a rejected BYOK provider key) come back as HTTP 200 with status Skipped and a skipReason telling the story; that is a normal receipt, NOT an error. Most skips clear on their own (a cap resets, concurrency frees up, credits top up) — but skipReason 'ByokKeyInvalid' / errorCode 'byok_key_invalid' means the ACCOUNT's own model-provider API key was rejected by the provider, arrives with errorDetail null (no prose), and is owner-fixable ONLY: never retry it, report it to the human so they can re-add or remove the key. Structural refusals are 409 (not_deployed, deployment_paused, deployment_suspended, model_unavailable) and 404 for an unknown worker; run-endpoint errors use the {error, message} envelope where error IS the snake_case code. prompt = what to do THIS run; omit it and the worker runs on its standing instructions. Rate limit: 30 run-triggers per minute per ACCOUNT (all of this account's keys and clients share it; other accounts do not affect you). On a 429 back off for the Retry-After — never tighten a loop in response." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    prompt: z.string().max(8000).optional().describe(
      "What to do on THIS run (≤8000 chars). Omit to run the worker's standing instructions unchanged."
    ),
    modelSlug: z.string().max(64).optional().describe(
      "One-off model override for this run (≤64 chars). Omit to use the worker's configured model."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/run`,
  bodyBuilder: (params) => ({ prompt: params.prompt, modelSlug: params.modelSlug }),
  annotations: TRIGGER,
};

const listRuns: ToolDescriptor = {
  name: "worker_runs",
  title: "List Worker Runs",
  description:
    "The worker's run history, newest first, paginated ({runs, page, pageSize, totalCount}). Each entry: runId, status, skipReason, triggerKind, modelSlug, timings, turns, modelCostUsd, billingMode, byokFeeUsd, toolCalls, firewallDenials, issue counts, and the grades (selfScore, ownerScore). billingMode ('Platform' | 'Byok') says whose provider key paid: on a Byok run modelCostUsd is the provider's LIST price and was NOT charged to the wallet — the wallet impact is byokFeeUsd alone (often $0.00). Never sum modelCostUsd as spend without checking billingMode. Requires the readRuns scope." +
    SCORE_NOTE +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    // Closed enum on purpose: the backend silently DROPS an unparseable status
    // filter and returns the full unfiltered history — "cancelled"/"error" would
    // read as the real subset. These are the WorkerRunStatus names verbatim.
    status: z.enum([
      "pending", "dispatched", "running", "succeeded", "failed",
      "timedOut", "budgetExceeded", "skipped", "canceled",
    ]).optional().describe("Filter by run status. Omit for all runs."),
    page: z.number().int().min(1).default(1).describe("1-based page number."),
    pageSize: z.number().int().min(1).max(100).default(20).describe("Results per page (max 100)."),
    fromUtc: z.string().optional().describe(`Only runs started at/after this time. ${UTC_HINT}`),
    toUtc: z.string().optional().describe(`Only runs started at/before this time. ${UTC_HINT}`),
  },
  path: (params) => `${API}/${params.tokenId}/runs`,
  paramFilter: (params) => {
    const { tokenId: _tokenId, ...query } = params;
    return query;
  },
  annotations: READ_ONLY,
};

const getRun: ToolDescriptor = {
  name: "run_get",
  title: "Get Run",
  description:
    "One run's full receipt: status, trigger, timings, token/cost metering (including billingMode 'Platform'|'Byok' and byokFeeUsd — on a Byok run modelCostUsd is the provider's list price and was NOT charged to the wallet), finalDigest (the worker's report), runPrompt/runContext, liveness (live|stalled) and lastActivity while in flight, errorCode/errorDetail, issues, and the grades (selfScore, selfScoreReason, ownerScore — set or change ownerScore with run_score). Note: footprint, turnsTimeline, issues, and priceSnapshot arrive as raw JSON strings — parse them before reasoning over their contents. Requires readRuns." +
    SCORE_NOTE +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
  },
  path: (params) => `${API}/runs/${params.runId}`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const getRunEvents: ToolDescriptor = {
  name: "run_events",
  title: "Get Run Events",
  description:
    "The run's live step feed ({events, lastSeq, status, finishedAtUtc}). To watch a run: call with afterSeq=0, then repeat with afterSeq=<the lastSeq you received> while status is non-terminal; stop once the run settles. WAIT AT LEAST 3-5 SECONDS BETWEEN POLLS — a run's events advance at turn speed, not faster. Polling has its own per-account window (120/min; watching many runs at once shares it), separate from the rest of the surface, so a paced watch loop never starves your other calls. Each event: seq, atUtc, kind, turn, label, ok, ms, detail (raw JSON string). Requires readRuns." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
    afterSeq: z.number().int().min(0).default(0).describe(
      "Return only events with seq greater than this. Pass the previous response's lastSeq to poll incrementally — with at least 3-5s between polls (the poll window is 120/min per account)."
    ),
    limit: z.number().int().min(1).max(500).default(200).describe("Maximum events to return."),
  },
  path: (params) => `${API}/runs/${params.runId}/events`,
  paramFilter: (params) => {
    const { runId: _runId, ...query } = params;
    return query;
  },
  annotations: READ_ONLY,
};

const cancelRun: ToolDescriptor = {
  name: "run_cancel",
  title: "Cancel Run",
  description:
    "Cancel a run. In-flight runs stop at their next heartbeat; an already-settled run refuses with 409 run_not_cancelable — that is a normal outcome meaning there is nothing left to cancel, not a retry signal. Requires the runWorkers scope." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
  },
  path: (params) => `${API}/runs/${params.runId}/cancel`,
  bodyBuilder: () => ({}),
  annotations: CREATE,
};

const clearRunDigest: ToolDescriptor = {
  name: "run_clear_digest",
  title: "Clear Run Report",
  description:
    "Scrub a settled run's report so the worker stops being handed it — a SCRUB, not a delete: finalDigest and distilledDigest are nulled and the surviving receipt is returned (status, timings, counts, cost and metering all stay — the wallet ledger references them). The run still appears in the worker's previous-runs block reading \"(that run left no report)\", and agent-reported issues are NOT cleared. Use when a contextual worker keeps carrying something wrong forward from a past run. Requires manageMemory (not readRuns) — this mutates what the worker remembers. 409 run_not_settled while the run is in flight; idempotent once settled." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "delete",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
  },
  path: (params) => `${API}/runs/${params.runId}/digest`,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

const scoreRun: ToolDescriptor = {
  name: "run_score",
  title: "Grade Run",
  description:
    "Set the OWNER's success grade on a settled run: score 0-100, or null to withdraw a grade you set earlier. Numbers only — there is no text lane, by design. The grade overrides the run's own selfScore everywhere both appear, INCLUDING the previous-runs block a contextual worker reads before its next run, which is why this needs the manageMemory scope rather than readRuns: grading changes what the worker is told about itself. Anchors to grade against: 100 = everything asked was done; 75 = core done, minor parts missing; 50 = about half, or done but unverified; 25 = attempted, little achieved; 0 = nothing achieved. 409 run_not_settled while the run is still in flight — grade it after it finishes. Idempotent: re-sending the same score changes nothing." +
    SCORE_NOTE +
    RUNTIME_NOTE,
  auth: "manager",
  method: "put",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
    score: z.number().int().min(0).max(100).nullable().describe(
      "The grade, 0-100. Pass null to clear YOUR grade and fall back to the run's own selfScore. Required — there is no 'leave unchanged' value, so read the current grade with run_get first if you need it."
    ),
  },
  path: (params) => `${API}/runs/${params.runId}/score`,
  bodyBuilder: (params) => ({ score: params.score }),
  annotations: UPDATE,
};

// ─── Memory ─────────────────────────────────────────────────────────────────

const getMemory: ToolDescriptor = {
  name: "memory_get",
  title: "Get Worker Memory",
  description:
    "The worker's memory: memoryProfile (stateless|contextual), selfFactsEnabled, rules (what the worker must DO — injected into every run), facts (what IS true — injected), recallFacts (searchable tier), pendingProposalCount, and a usage meter with every cap (rules, injected facts, char pools, recall) including recallFull — the only signal that the worker can no longer save new facts on its own.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/memory`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const addMemoryItem: ToolDescriptor = {
  name: "memory_add",
  title: "Add Memory Rule or Fact",
  description:
    "Add a rule or a fact to the worker's memory. kind='rule' = something the worker must DO, phrased as an instruction; kind='fact' = something TRUE about this worker's world. Single line, ≤300 chars. Items land owner-authored and are injected into every run. Caps are enforced at write time (15 rules; 25 injected facts within a 4,000-char pool) — a cap violation is a 400 whose message names the fix (retire or delete something first). Requires the manageMemory scope.",
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    kind: z.enum(["rule", "fact"]).describe(
      "rule = what the worker must DO (injected instruction). fact = what IS true about the worker's world."
    ),
    text: z.string().min(1).max(300).describe("The rule/fact text. Single line, 1–300 chars."),
  },
  path: (params) => `${API}/${params.tokenId}/memory/${params.kind === "rule" ? "rules" : "facts"}`,
  bodyBuilder: (params) => ({ text: params.text }),
  annotations: CREATE,
};

const updateMemoryItem: ToolDescriptor = {
  name: "memory_update",
  title: "Update Memory Item",
  description:
    "Edit a rule/fact's text, retire or reactivate it (status), or move a FACT between the injected and searchable tiers (scope). Omitted fields stay unchanged. Prefer retiring (status='retired') over deleting — it keeps provenance. Promoting a fact to 'injected' is charged against the injected pool and can 400 on a full pool; rules are always injected — sending scope='recall' for a rule is a 400. Requires manageMemory.",
  auth: "manager",
  method: "patch",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    itemId: z.number().int().min(1).describe("The memory item's id, as returned by memory_get or memory_add."),
    text: z.string().min(1).max(300).optional().describe("New text (single line, 1–300 chars). Omit to keep."),
    status: z.enum(["active", "retired"]).optional().describe("Retire or reactivate. Omit to keep."),
    scope: z.enum(["injected", "recall"]).optional().describe(
      "Facts only: injected (every run) or recall (searchable). Omit to keep."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/memory/items/${params.itemId}`,
  bodyBuilder: (params) => ({ text: params.text, status: params.status, scope: params.scope }),
  annotations: UPDATE,
};

const deleteMemoryItem: ToolDescriptor = {
  name: "memory_delete",
  title: "Delete Memory Item",
  description:
    "Delete a rule/fact outright. Permanent — prefer memory_update with status='retired' to keep provenance. Requires manageMemory.",
  auth: "manager",
  method: "delete",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    itemId: z.number().int().min(1).describe("The memory item's id, as returned by memory_get."),
  },
  path: (params) => `${API}/${params.tokenId}/memory/items/${params.itemId}`,
  successMessage: "Memory item deleted.",
  annotations: DELETE,
};

// ─── Schedules ──────────────────────────────────────────────────────────────

const listSchedules: ToolDescriptor = {
  name: "schedules_list",
  title: "List Schedules",
  description:
    "The worker's schedules. Each row: id, title, scheduleType (EveryNMinutes|EveryNHours|DailyAtTime|OneShot), intervalValue, timeOfDayMinutes, timeZoneId, effectiveTimeZoneId (the schedule's own zone, else the worker's, else UTC), anchorUtc, computed nextRunUtc, isEnabled.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/schedules`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const SCHEDULE_TYPE_HINT =
  "EveryNMinutes (intervalValue 1–1440), EveryNHours (intervalValue 1–168), DailyAtTime (timeOfDayMinutes required — wall-clock minutes past midnight in the effective time zone, DST-correct), or OneShot (anchorUtc required, must be in the future). Input is parsed case-insensitively; responses always return the PascalCase form.";

// Plan walls, not transient errors. Note the envelope: the machine-readable code
// is in `feature`, while `error` holds the literal string "feature_gated" — the
// one place on this surface where `error` is not the code.
const SCHEDULE_GATE_HINT =
  " Two plan walls return 402 {error:'feature_gated', feature, upgradeTrigger, message}: feature 'schedule_cadence' means minute-based schedules are not in this plan (use EveryNHours or DailyAtTime), and 'schedule_count' means the worker is at its recurring-schedule cap (a OneShot is never counted). Both are terminal — do NOT retry; either pick an allowed cadence or tell the human to upgrade.";

const createSchedule: ToolDescriptor = {
  name: "schedule_create",
  title: "Create Schedule",
  description:
    "Create a schedule for the worker. Per-type required fields: " + SCHEDULE_TYPE_HINT +
    " Omit timeZoneId to follow the worker's own time zone (the normal case). Requires the manageSchedules scope." +
    SCHEDULE_GATE_HINT,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    scheduleType: z.enum(["EveryNMinutes", "EveryNHours", "DailyAtTime", "OneShot"]).describe(SCHEDULE_TYPE_HINT),
    title: z.string().max(120).optional().describe(
      "Optional display title, ≤120 chars (the column's own limit; a longer title is truncated upstream, not rejected)."
    ),
    intervalValue: z.number().int().min(1).optional().describe(
      "EveryNMinutes: 1–1440. EveryNHours: 1–168. Required for those types, ignored otherwise."
    ),
    timeOfDayMinutes: z.number().int().min(0).max(1439).optional().describe(
      "DailyAtTime only: wall-clock minutes past midnight in the effective time zone (e.g. 540 = 09:00). DST-correct."
    ),
    timeZoneId: z.string().optional().describe(
      "IANA time zone (e.g. 'America/New_York') overriding the worker's zone. Omit to follow the worker."
    ),
    anchorUtc: z.string().optional().describe(`OneShot only: when to fire, must be in the future. ${UTC_HINT}`),
    isEnabled: z.boolean().default(true).describe("Whether the schedule starts enabled."),
  },
  path: (params) => `${API}/${params.tokenId}/schedules`,
  bodyBuilder: (params) => ({
    title: params.title,
    scheduleType: params.scheduleType,
    intervalValue: params.intervalValue,
    timeOfDayMinutes: params.timeOfDayMinutes,
    timeZoneId: params.timeZoneId,
    anchorUtc: params.anchorUtc,
    isEnabled: params.isEnabled,
  }),
  annotations: CREATE,
};

const updateSchedule: ToolDescriptor = {
  name: "schedule_update",
  title: "Update Schedule",
  description:
    "Edit a schedule (partial — omitted fields stay unchanged; timeZoneId='' clears the override so the schedule follows the worker's zone again). nextRunUtc is recomputed on every edit. Per-type field rules: " +
    SCHEDULE_TYPE_HINT + " Requires manageSchedules." + SCHEDULE_GATE_HINT,
  auth: "manager",
  method: "patch",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    scheduleId: z.number().int().min(1).describe("The schedule's id, as returned by schedules_list."),
    scheduleType: z.enum(["EveryNMinutes", "EveryNHours", "DailyAtTime", "OneShot"]).optional().describe(
      "Change the schedule type. " + SCHEDULE_TYPE_HINT
    ),
    title: z.string().max(120).optional().describe(
      "New display title, ≤120 chars (truncated upstream, not rejected)."
    ),
    intervalValue: z.number().int().min(1).optional().describe("New interval (see type rules)."),
    timeOfDayMinutes: z.number().int().min(0).max(1439).optional().describe("DailyAtTime: new wall-clock minutes past midnight."),
    timeZoneId: z.string().optional().describe("IANA zone override; empty string '' clears it (follow the worker)."),
    anchorUtc: z.string().optional().describe(`OneShot: new fire time. ${UTC_HINT}`),
    isEnabled: z.boolean().optional().describe("Enable or disable the schedule."),
  },
  path: (params) => `${API}/${params.tokenId}/schedules/${params.scheduleId}`,
  bodyBuilder: (params) => ({
    title: params.title,
    scheduleType: params.scheduleType,
    intervalValue: params.intervalValue,
    timeOfDayMinutes: params.timeOfDayMinutes,
    timeZoneId: params.timeZoneId,
    anchorUtc: params.anchorUtc,
    isEnabled: params.isEnabled,
  }),
  annotations: UPDATE,
};

const deleteSchedule: ToolDescriptor = {
  name: "schedule_delete",
  title: "Delete Schedule",
  description:
    "Delete a schedule. To pause it instead, use schedule_update with isEnabled=false. Requires manageSchedules.",
  auth: "manager",
  method: "delete",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    scheduleId: z.number().int().min(1).describe("The schedule's id, as returned by schedules_list."),
  },
  path: (params) => `${API}/${params.tokenId}/schedules/${params.scheduleId}`,
  successMessage: "Schedule deleted.",
  annotations: DELETE,
};

// ─── Instruction ────────────────────────────────────────────────────────────

const getInstruction: ToolDescriptor = {
  name: "instruction_get",
  title: "Get Instruction",
  description:
    "The worker's standing instruction: content, jobSentence, whenToUse, description, memoryProfile, selfFactsEnabled, isProtected, currentVersion, timestamps. A bare \"Operation completed successfully.\" response means the worker has NO instruction yet (HTTP 204) — use instruction_set to create one. For a worker installed from a protected kit, metadata is returned but the instruction text is REDACTED (it belongs to the kit's publisher) — that is not an error.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/instruction`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const setInstruction: ToolDescriptor = {
  name: "instruction_set",
  title: "Set Instruction",
  description:
    "Create or replace the worker's standing instruction (the prompt/workflow text handed to every run). A changed body snapshots the prior version. Omitted optional fields stay unchanged; empty string clears. Returns 403 OPERATION_NOT_ALLOWED for a protected kit's worker — that text belongs to its publisher; do not retry. Requires the manageInstructions scope.",
  auth: "manager",
  method: "put",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    content: z.string().min(1).max(100000).describe("The instruction text (1–100,000 chars). Required — this replaces the whole content."),
    jobSentence: z.string().max(200).optional().describe("The worker's one-liner (≤200). Omit = unchanged; '' = clear."),
    whenToUse: z.string().max(500).optional().describe("Trigger text: when this worker should be used (≤500). Omit = unchanged; '' = clear."),
    description: z.string().max(2000).optional().describe("Longer display-only description (≤2000). Omit = unchanged; '' = clear."),
    memoryProfile: z.enum(["stateless", "contextual"]).optional().describe(
      "Worker class: stateless (fresh each run) or contextual (carries prior-run reports). Omit = unchanged."
    ),
    selfFactsEnabled: z.boolean().optional().describe(
      "Whether the worker may save its own facts during runs. Set true when the content tells the worker to save facts. Omit = unchanged."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/instruction`,
  bodyBuilder: (params) => ({
    content: params.content,
    jobSentence: params.jobSentence,
    whenToUse: params.whenToUse,
    description: params.description,
    memoryProfile: params.memoryProfile,
    selfFactsEnabled: params.selfFactsEnabled,
  }),
  annotations: UPDATE,
};

// ─── Start / stop ───────────────────────────────────────────────────────────

const setWorkerEnabled: ToolDescriptor = {
  name: "worker_set_enabled",
  title: "Start or Stop Worker",
  description:
    "Start (enabled=true) or stop (enabled=false) a worker. Stopping pauses the WHOLE worker: its own API key stops working AND its schedules stop firing; re-enabling restores both. Returns {tokenId, isEnabled}. Idempotent. Requires the manageState scope.",
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    enabled: z.boolean().describe("true = start the worker; false = stop it (key + schedules pause together)."),
  },
  path: (params) => `${API}/${params.tokenId}/enabled`,
  bodyBuilder: (params) => ({ enabled: params.enabled }),
  annotations: UPDATE,
};

// ─── Kit install ────────────────────────────────────────────────────────────
// The one place on this surface an agent can CREATE a worker: install a kit from
// the public directory. Both tools need the installKits scope (keys minted
// before the scope existed — including old "all" keys — lack it until an
// account admin re-scopes them).

const KITS_API = "/api/manage/kits";

const KIT_SLUG_HINT =
  "The kit's slug, as returned by kits_search / kit_get on the public WorkerKit Directory server. 404 not_found = no such kit (or another account's private kit — indistinguishable by design).";

// Pinned to the backend's slug alphabet ([a-z0-9-], ≤120). Not cosmetic: encodeURIComponent
// leaves dots intact and the WHATWG URL parser collapses "." / ".." segments client-side, so
// an unpinned slug could walk the request off /api/manage/kits before it ever leaves this
// process. No real slug can contain a dot, so nothing legitimate is refused.
const KIT_SLUG = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/, "not a valid kit slug");

const kitInstallPreview: ToolDescriptor = {
  name: "kit_install_preview",
  title: "Preview Kit Install",
  description:
    "The kit's install form plus this account's current ability to satisfy it — call this BEFORE kit_install and gather every answer it demands. Creates nothing. Requires the installKits scope (403 names it). Returns: requiredInputs (EVERY key is mandatory at install — collect a value for each from the human, keys are exact), memorySetup (questions whose answers become the worker's first memory; only required:true entries are mandatory), categorySlots (pick ONE member per slot via categoryChoices; each member carries connection — prefer a connected one — and connectionProvider, which when set means also pass categoryChoices[].resourceId picked from operatorResources, ideally one with hasActiveConnection and a matching provider), apps + appsNeedingConnection (the connection state the new worker would START with; installing anyway is allowed — the worker starts blocked and a human finishes at connectAppsUrl), operator (which operator the install targets), limits (currentWorkers/maxWorkers — at the cap the install returns 402), kitPageUrl (the human install page). Preview is advisory: the install response's readiness block is the verdict. For the kit's full permissions manifest and instruction use kit_get on the public Directory server.",
  auth: "manager",
  method: "get",
  schema: {
    slug: KIT_SLUG.describe(KIT_SLUG_HINT),
    operatorId: z.string().uuid().optional().describe(
      "Operator (workspace) to install into. Omit to use the account's default operator."
    ),
  },
  path: (params) => `${KITS_API}/${encodeURIComponent(String(params.slug))}/install-preview`,
  paramFilter: (params) => {
    const { slug: _slug, ...query } = params;
    return query;
  },
  annotations: READ_ONLY,
};

const kitInstall: ToolDescriptor = {
  name: "kit_install",
  title: "Install Kit",
  description:
    "Install a directory kit as a NEW worker on this account. NOT idempotent: every successful call creates another worker — never retry a success, and on a timeout check workers_list (needs the readWorkers scope) before trying again. Requires the installKits scope. Call kit_install_preview first and supply every requiredInputs key in inputs (a missing or unknown key is a 400 naming it), answers to required memorySetup questions in memoryAnswers, and one categoryChoices entry per slot (member with connectionProvider set → also pass resourceId from the preview's operatorResources). CRITICAL — secrets shown ONCE: the response's install.rawKey (the worker's pe_ API key) and install.triggers[].signingSecret can NEVER be read again; deliver them to the human immediately and do not discard the response before doing so. The response also carries readiness (status ready|blocked with actionable issues, e.g. app_not_connected + candidateProviders; null means the readiness check itself failed AFTER the install succeeded — do not retry the install, read readiness via worker_get), workerUrl (the worker's dashboard page — hand it to the human), and connectAppsUrl (where the human connects missing apps in the browser; agents cannot connect apps). A 402 {error:'limit_exceeded'} is the plan's worker cap — terminal, do not retry; tell the human to upgrade or free a slot. Rate: 10 installs/hour per account.",
  auth: "manager",
  method: "post",
  schema: {
    slug: KIT_SLUG.describe(KIT_SLUG_HINT),
    operatorId: z.string().uuid().optional().describe(
      "Operator (workspace) to install into. Omit to use the account's default operator."
    ),
    title: z.string().max(100).optional().describe(
      "Name for the new worker (≤100 chars). Omit to use the kit's name."
    ),
    avatar: z.string().max(40).optional().describe(
      "Avatar slug for the new worker. Omit for the default."
    ),
    categoryChoices: z.array(z.object({
      categoryCode: z.string().describe("The slot's categoryCode from the preview."),
      memberCode: z.string().describe("The chosen member's code (e.g. 'gmail')."),
      resourceId: z.string().uuid().optional().describe(
        "For members with connectionProvider set: the identity to bind, from the preview's operatorResources."
      ),
    })).optional().describe(
      "One entry per categorySlots slot. Omitted slots resolve to the kit's first offered member on safe defaults."
    ),
    inputs: z.record(z.string(), z.string()).optional().describe(
      "Answers to requiredInputs, keyed EXACTLY by each entry's key. Every key is mandatory; values are single-line, 1-200 chars."
    ),
    memoryAnswers: z.record(z.string(), z.string()).optional().describe(
      "Answers to memorySetup questions by key. Entries with required:true are mandatory. Keep this separate from inputs — mixing the two maps is a 400."
    ),
  },
  path: (params) => `${KITS_API}/${encodeURIComponent(String(params.slug))}/install`,
  bodyBuilder: (params) => ({
    operatorId: params.operatorId,
    title: params.title,
    avatar: params.avatar,
    categoryChoices: params.categoryChoices,
    inputs: params.inputs,
    memoryAnswers: params.memoryAnswers,
  }),
  annotations: CREATE,
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const manageDescriptors: readonly ToolDescriptor[] = [
  listWorkers,
  getWorker,
  runWorker,
  listRuns,
  getRun,
  getRunEvents,
  cancelRun,
  clearRunDigest,
  scoreRun,
  getMemory,
  addMemoryItem,
  updateMemoryItem,
  deleteMemoryItem,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getInstruction,
  setInstruction,
  setWorkerEnabled,
  kitInstallPreview,
  kitInstall,
];
