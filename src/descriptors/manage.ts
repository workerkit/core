// The 42 authenticated fleet-management tools, as pure descriptors. The
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

// A scope added to the product AFTER a key was minted never reaches that key —
// including a key minted with "all", which stored the bitmask of the scopes that
// existed that day. Taught on key_info and on every tool behind a scope that is
// younger than the surface, so a 403 there is read as "re-scope the key", not
// "retry".
const NEW_SCOPE_NOTE =
  " Note this scope is YOUNGER than the manager-key surface: a key minted before it existed does not carry it — including one minted with \"all\" — so a 403 here is fixed by an account admin re-scoping or re-minting the key at https://workerkit.ai, never by retrying. Read key_info's scopes list before planning work that needs it.";

// ─── Key ────────────────────────────────────────────────────────────────────

const getKeyInfo: ToolDescriptor = {
  name: "key_info",
  title: "Key Info",
  description:
    "What the presented manager key IS: accountId, accountTitle, keyName, keyPrefix (a display prefix — never the key itself), scopes, expiresAt, and serverTimeUtc. CALL THIS FIRST, before planning any work: the scopes list is exactly what the other tools on this surface will accept, so read it up front rather than discovering a wall mid-task. Any valid key may ask — this is the one tool that needs NO scope. A call outside the list fails 403 OPERATION_NOT_ALLOWED naming the missing scope, and only an account admin can add one (re-scope or re-mint the key at https://workerkit.ai) — never retry a 403. A scope added to the product AFTER a key was minted does NOT reach that key, INCLUDING a key minted with \"all\" (which stored the bitmask of the scopes that existed that day), so a tool can 403 on a key its owner believes has everything: this list is the only truth about it. Compute expiry and elapsed times against serverTimeUtc, never your own clock.",
  auth: "manager",
  method: "get",
  schema: {},
  path: `${API}/key-info`,
  annotations: READ_ONLY,
};

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

// ─── Fleet-wide run reads ───────────────────────────────────────────────────
// The two calls that watch a WHOLE fleet without fanning out per worker. Both are
// account-scoped by the key itself, so neither takes a worker id, and both are
// deliberately money-free: cost lives on the run receipt.

const runsFeed: ToolDescriptor = {
  name: "runs_feed",
  title: "Account Run Feed",
  description:
    "Every worker's runs in ONE account-wide feed, newest first — THE fleet-watching call. When you are minding many workers, call this instead of looping workers_list or worker_runs per worker. Each row is a scan line: runId, workerId, tokenTitle, status, outcome (running|succeeded|attention|failed|skipped|canceled — 'attention' is a SUCCEEDED run that hit friction, i.e. firewall denials, tool errors or reported issues, so report it apart from a clean success), skipReason, errorCode, triggerKind, scheduleTitle, timings, the friction counts (toolCalls, firewallDenials, toolErrors, issueCount, hasBlockerIssue), and one line of what the run did in summary + summarySource ('distilled' = a condensed record of what the run ACTUALLY did; 'report' = the worker's OWN closing account; 'error'/'skipped'/'activity' = the machine's own words — these are not equally reliable, so say which one you are quoting). Carries NO cost and NO token counts by design: read those from run_get on the one run that matters. Cursor-paged, never page-numbered — scroll by passing the previous response's nextCursor back as cursor (hasMore says whether another page exists), and re-fetch with NO cursor to refresh the head; there is deliberately no total count. A cursor we did not issue is a 400 invalid_cursor — drop it and reload the head. An unknown status is a 400 invalid_status, never a silently ignored filter. Requires the readRuns scope." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    // Closed enum: the feed is STRICT where the older per-worker list is lenient —
    // an unparseable status here is a 400, so a typo can never read as a real
    // subset. These are the WorkerRunStatus names verbatim, plus the feed's own
    // two composite values.
    status: z.enum([
      "pending", "dispatched", "running", "succeeded", "failed",
      "timedOut", "budgetExceeded", "skipped", "canceled",
      "settled", "all",
    ]).optional().describe(
      "Filter to one run status. 'settled' is the composite for every terminal outcome (everything not in flight) — use it for a logbook, and fleet_pulse for what is running. 'all' is an explicit no-op. Omit for all runs."
    ),
    cursor: z.string().optional().describe(
      "Opaque cursor from the previous response's nextCursor — fetches the next (older) page. Omit to read the head of the feed."
    ),
    limit: z.number().int().min(1).max(100).default(20).describe("Rows per page (1–100)."),
  },
  path: `${API}/runs`,
  annotations: READ_ONLY,
};

const fleetPulse: ToolDescriptor = {
  name: "fleet_pulse",
  title: "Fleet Pulse",
  description:
    "Every run IN FLIGHT on the account right now, in one call — the other fleet-watching call, and the single authority for \"who is working\". Use it instead of sweeping workers_list for isRunning, or worker_runs per worker. Returns serverTimeUtc plus activeRuns[]: runId, workerId, tokenTitle, status (Pending | Dispatched | Running — a QUEUED run is not yet working, so never say \"running for 3m\" about one), createDate, startedAtUtc (null while Pending/Dispatched, so render elapsed from startedAtUtc ?? createDate and label the queued case differently), triggerKind, scheduleTitle, activitySummary, lastTool + toolActive (true = the run is INSIDE that tool — 'using X'; false = that call has ended and the name is the trailing record — 'last used X'), recentToolCalls[] (newest first, ≤25, each with a seq: accumulate across polls by appending anything whose seq beats the highest you kept for that run), toolCallCount (every call the run has made — if your kept list is shorter, the run out-ran the window and the rest is in run_events), activityUpdatedAtUtc, and liveness (live|stalled while Running). ALWAYS compute elapsed times against the response's serverTimeUtc, never your own clock. Capped at 100 rows with NO paging — truncated:true says the cap bit; an empty activeRuns[] is the normal, healthy answer, not an error or a failure to look. No cost fields: money lives on the run receipt (run_get). Requires the readRuns scope." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {},
  path: `${API}/fleet/pulse`,
  annotations: READ_ONLY,
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

// ─── Two-way runs (ask / answer) ────────────────────────────────────────────
// A run that needs something from its owner ENDS by asking (status AwaitingInput)
// rather than blocking on a human while holding a request slot and a wallet
// reserve. The one fact an agent must carry away: answering does not resume that
// run, it starts a linked new one, so the run id changes.

const getRunQuestion: ToolDescriptor = {
  name: "run_question",
  title: "Get Run Question",
  description:
    "The question a run stopped to ask, and everything needed to answer it. A run whose status is AwaitingInput neither failed nor finished — it ENDED BY ASKING, settling its usage and releasing its wallet reserve, because a run cannot hold a request slot and money open across a human's reply. Returns questionId, runId, question, options (the closed set the run offered, when it offered one — free text otherwise), askedAtUtc, expiresAtUtc (null = it waits indefinitely), chainDepth, maxChainDepth, and once answered also answer, answeredAtUtc and resumeRunId. READ chainDepth AGAINST maxChainDepth: it is the only thing that says whether another exchange is possible — a chain already AT the limit still records an answer but starts no run, so run_answer there comes back chain_limit. Take maxChainDepth from this response rather than assuming a number. resumeRunId names the run an answer started, and THE RUN ID CHANGES across that boundary: follow resumeRunId instead of expecting this run to come back to life. expiresAtUtc is a real deadline — once it passes the platform closes the question out itself (it never resumes a run with no answer); a late answer still starts the run, but answer before it rather than after. A 404 not_found means this run is not waiting on a question (it never asked, or the runId is wrong) — a normal answer, not an error. Requires the readRuns scope." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
  },
  path: (params) => `${API}/runs/${params.runId}/question`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const answerRunQuestion: ToolDescriptor = {
  name: "run_answer",
  title: "Answer Run Question",
  description:
    "Answer the question a suspended run asked. THE SUSPENDED RUN DOES NOT RESUME: answering mints a LINKED FOLLOW-ON RUN carrying your answer and the parent's context, and what comes back is THAT run's receipt — a DIFFERENT runId. Plan for a CHAIN of receipts rather than one long-lived run: watch the new runId with run_get / run_events, and note that the only link you can READ is forward — run_question on the parent carries resumeRunId, while the follow-on's own receipt has no pointer back — so keep the chain yourself as you walk it. It rides runWorkers rather than readRuns because it STARTS A RUN and costs money. Answering twice is IDEMPOTENT — the second call returns the run the first answer started instead of minting another. The follow-on goes through THE SAME GAUNTLET as any other run, so a 200 can still carry status Skipped with a skipReason (wallet credits, the worker's daily run or spend cap, the account's fleet ceiling, concurrency, readiness): that is a normal receipt, not an error, and because a Skipped resume is deliberately NOT linked to the question you may answer again once the reason clears. A chain already at maxChainDepth (read it from run_question) RECORDS the answer and refuses with 400 chain_limit rather than looping, on every retry — terminal: start a fresh run with what you have learned instead of retrying. Two simultaneous answers race: the second gets 409 answer_in_progress and should re-read run_question, whose resumeRunId will name the run the first one started. A late answer to a question that already timed out still starts the run. The one other refusal uses the {error, message} envelope where error IS the snake_case code: 404 not_found (that run is not waiting on a question). Requires the runWorkers scope." +
    RUNTIME_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    runId: z.string().uuid().describe(RUN_ID_HINT),
    answer: z.string().min(1).max(4000).describe(
      "The answer, 1–4000 chars. Empty or whitespace is refused: resuming a run with nothing is what the worker's own timeout policy is for, and doing it by hand would hide which of the two happened."
    ),
  },
  path: (params) => `${API}/runs/${params.runId}/input`,
  bodyBuilder: (params) => ({ answer: params.answer }),
  // Idempotent: a repeated answer returns the run the first one started rather
  // than minting a second. openWorld like every other run trigger — the run it
  // starts acts on the world through the worker's own tools.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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

// ─── Run-result deliveries ──────────────────────────────────────────────────
// Where the PLATFORM sends a worker's report when a run finishes. The two facts an
// agent gets wrong by default: availability is judged at ACCOUNT level (never from
// the worker's own apps), and a receipt is not a guarantee.

const DELIVERY_NOTE =
  " How delivery works: the send is PLATFORM-level and detached from the worker's own permissions — the destination row you configure IS the permission, so a worker with no email app still delivers to email. The ONE hard configuration refusal is 400 CHANNEL_NOT_CONNECTED, judged at ACCOUNT level (the operator's connected apps), so NEVER infer availability from worker_get's apps — call delivery_channels. A worker holds at most 5 destinations. Canceled runs never deliver on any channel. Skipped runs (refused at the gate) deliver to WEBHOOK destinations only, as a run.blocked event, once per worker per skip reason per UTC day. A run that ended by ASKING its owner a question (status AwaitingInput) delivers everywhere: the question is the message. Sends are AT-MOST-ONCE — never double-sent, but a crash at the wrong moment can lose one, so the run receipt's deliveries[] is a RECEIPT of what happened, not a guarantee that it did.";

const DELIVERY_TARGET_HINT =
  "The destination. ONE shape serves every channel — set only the fields YOUR channel needs; anything else is dropped. email: to[1–10 addresses] (+ optional connectionId OR sendFrom to choose the mailbox on a multi-mailbox account). slack: channelId (+ optional workspaceId). msTeams: EITHER teamId+channelId (post to a channel) OR chatId (post to a chat) — exactly one form; both or neither is a 400. telegram: chatId, a numeric id or an @username (+ optional botId). notion: boardId — the board/database that gets one item per run with the report as its content. discord: channelId (+ optional applicationId). messaging: provider (e.g. 'TWILIO'), messagingChannel ('sms' | 'whatsapp'), to[EXACTLY ONE phone number] (+ optional from; omit for the connection's default sender). webhook: url — an absolute https URL that resolves to a PUBLIC address (private, loopback and metadata ranges are a 400 at configuration and refused again at send time; redirects are never followed).";

const DELIVERY_TARGET_SHAPE = {
  to: z.array(z.string()).optional().describe(
    "email: 1–10 recipient addresses. messaging: exactly one phone number. Unused by every other channel."
  ),
  connectionId: z.number().int().optional().describe(
    "email only: send from this provider connection (multi-mailbox operators). Omit for the default mailbox."
  ),
  sendFrom: z.string().optional().describe(
    "email only: send-from address — the alternative to connectionId. Omit for the default mailbox."
  ),
  channelId: z.string().optional().describe(
    "slack / discord: the channel to post in. msTeams channel form: the channel inside teamId."
  ),
  workspaceId: z.string().optional().describe("slack only: which workspace to post into (multi-workspace operators)."),
  applicationId: z.string().optional().describe("discord only: which application/bot to send as (multi-bot operators)."),
  teamId: z.string().optional().describe("msTeams channel form: the team that owns channelId."),
  chatId: z.string().optional().describe(
    "msTeams chat form: the chat to post in. telegram: the chat — a numeric id or an @username."
  ),
  botId: z.number().int().optional().describe("telegram only: which bot to send as (multi-bot operators)."),
  boardId: z.string().optional().describe("notion only: the board/database that gets one item per run."),
  provider: z.string().optional().describe("messaging only: the provider code, e.g. 'TWILIO'."),
  messagingChannel: z.enum(["sms", "whatsapp"]).optional().describe("messaging only: which messaging channel to send over."),
  from: z.string().optional().describe("messaging only: sender number/id. Omit for the connection's default sender."),
  url: z.string().url().optional().describe(
    "webhook only: the absolute https URL that receives the signed run event. Must resolve to a public address; redirects are not followed."
  ),
};

const DELIVERY_CONDITION_HINT =
  "Which terminal outcomes fire this destination: always, successOnly (Succeeded), or failureOnly — everything that needs attention: Failed / TimedOut / BudgetExceeded, a run waiting on an answer (AwaitingInput), and on a webhook a refused run (Skipped). Canceled never delivers on any condition; Skipped never reaches a chat or email destination.";

const DELIVERY_CONTENT_MODE_HINT =
  "What the message carries: full = the run's finalDigest, its OWN closing report (falls back to the distilled summary); summary = the distilled summary of what the run actually did (falls back to finalDigest) — the right choice for short-form channels like SMS.";

const listDeliveries: ToolDescriptor = {
  name: "delivery_list",
  title: "List Delivery Destinations",
  description:
    "The worker's run-result delivery destinations — where the platform sends this worker's report when a run finishes. Each row: id, title, channel, condition (always|successOnly|failureOnly), contentMode (full|summary), target (only the fields that channel uses), targetDisplay (the pretty name, e.g. '#briefings'), isEnabled, createDate, updatedAt. An empty list means this worker's results go nowhere — that is a configuration fact, not an error. Requires the readWorkers scope." +
    DELIVERY_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const deliveryChannels: ToolDescriptor = {
  name: "delivery_channels",
  title: "List Delivery Channels",
  description:
    "Which delivery channels this worker's operator can send through RIGHT NOW: {email, slack, msTeams, telegram, notion, discord, messaging, webhook}, each true or false (webhook is always true: a URL you supply needs no connected app). Call this BEFORE delivery_create and pick a channel that is true — creating on a false one is a guaranteed 400 CHANNEL_NOT_CONNECTED. Availability is ACCOUNT-level (the operator's connected apps) and deliberately independent of the worker's own app bindings, so it is NOT derivable from worker_get: a worker with no email app still reports email:true when the account has a mailbox connected, and a worker that uses Slack all day reports slack:false if nobody connected Slack for the account. These are the same predicates the create/update gate applies, with ONE exception: messaging is reported true when the account has ANY messaging provider connected, while the gate checks the specific provider you name in target.provider — so messaging:true can still 400 if the account's connected provider is not the one you ask for. Only a human can connect a missing app (at https://workerkit.ai → Connections) — agents cannot. Requires the readWorkers scope." +
    DELIVERY_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries/channels`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const createDelivery: ToolDescriptor = {
  name: "delivery_create",
  title: "Add Delivery Destination",
  description:
    "Add one run-result delivery destination to the worker (201 with the created row). Call delivery_channels first and choose a channel it reports as true. Two failure classes, both 400 and both terminal for the body you sent: CHANNEL_NOT_CONNECTED means the channel's app is not connected on the ACCOUNT — the send could never succeed, so a human must connect it at https://workerkit.ai → Connections; INVALID_REQUEST means the target is structurally wrong for the channel, and its message names the fix. A worker holds at most 5 destinations — the 6th is a 400 saying so, so retire or delete one first. NOT idempotent: calling twice makes two destinations that both send. channel is fixed at creation — see delivery_update. Requires the manageDeliveries scope." +
    NEW_SCOPE_NOTE +
    DELIVERY_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    channel: z.enum(["email", "slack", "msTeams", "telegram", "notion", "discord", "messaging", "webhook"]).describe(
      "Where to send. IMMUTABLE after creation — to change it, delete this destination and create another. Check delivery_channels first: a channel that reports false is a guaranteed 400 CHANNEL_NOT_CONNECTED. webhook needs no connected app: the response carries signingSecret ONCE (verify X-PortEden-Signature with it — v1=hex(HMAC-SHA256 of '{X-PortEden-Timestamp}.{raw body}'); dedupe on X-PortEden-Event-Id), and the body is the typed run event, not rendered text."
    ),
    title: z.string().max(120).optional().describe("Optional display title for the destination (≤120 chars)."),
    condition: z.enum(["always", "successOnly", "failureOnly"]).default("always").describe(DELIVERY_CONDITION_HINT),
    contentMode: z.enum(["full", "summary"]).default("full").describe(DELIVERY_CONTENT_MODE_HINT),
    target: z.object(DELIVERY_TARGET_SHAPE).describe(DELIVERY_TARGET_HINT),
    targetLabel: z.string().max(200).optional().describe(
      "Pretty name for the destination ('#general', 'Ops board'), stored as targetDisplay. Omit and one is computed from the target."
    ),
    isEnabled: z.boolean().default(true).describe("Whether the destination starts enabled. false = configured but silent."),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries`,
  bodyBuilder: (params) => ({
    channel: params.channel,
    title: params.title,
    condition: params.condition,
    contentMode: params.contentMode,
    target: params.target,
    targetLabel: params.targetLabel,
    isEnabled: params.isEnabled,
  }),
  annotations: CREATE,
};

const updateDelivery: ToolDescriptor = {
  name: "delivery_update",
  title: "Update Delivery Destination",
  description:
    "Edit one delivery destination (partial — omitted fields stay unchanged). THE CHANNEL IS IMMUTABLE: there is no channel parameter, and changing where a destination sends means deleting this one and creating another with delivery_create. target is a FULL REPLACE of the destination's address, validated against the row's EXISTING channel — a target shaped for a different channel is a 400 INVALID_REQUEST — and re-checked against the account's connections, so it can also come back 400 CHANNEL_NOT_CONNECTED if the app was disconnected since. To silence a destination without losing it, send isEnabled:false rather than deleting it. Requires the manageDeliveries scope." +
    NEW_SCOPE_NOTE +
    DELIVERY_NOTE,
  auth: "manager",
  method: "patch",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    deliveryId: z.number().int().min(1).describe("The destination's id, as returned by delivery_list or delivery_create."),
    title: z.string().max(120).optional().describe("New display title (≤120 chars). Omit to keep."),
    condition: z.enum(["always", "successOnly", "failureOnly"]).optional().describe(
      DELIVERY_CONDITION_HINT + " Omit to keep."
    ),
    contentMode: z.enum(["full", "summary"]).optional().describe(DELIVERY_CONTENT_MODE_HINT + " Omit to keep."),
    target: z.object(DELIVERY_TARGET_SHAPE).optional().describe(
      "Replace the destination's address, in the shape of its EXISTING channel (the channel cannot change here). Omit to keep. " +
      DELIVERY_TARGET_HINT
    ),
    targetLabel: z.string().max(200).optional().describe(
      "New pretty name (≤200 chars). Omit to keep — but note that sending target WITHOUT targetLabel recomputes the label from the new target."
    ),
    isEnabled: z.boolean().optional().describe("Enable or silence the destination. Omit to keep."),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries/${params.deliveryId}`,
  bodyBuilder: (params) => ({
    title: params.title,
    condition: params.condition,
    contentMode: params.contentMode,
    target: params.target,
    targetLabel: params.targetLabel,
    isEnabled: params.isEnabled,
  }),
  annotations: UPDATE,
};

const rotateDeliverySecret: ToolDescriptor = {
  name: "delivery_secret_rotate",
  title: "Rotate Webhook Signing Secret",
  description:
    "Mint a NEW signing secret for a WEBHOOK destination and get it back ONCE, in signingSecret (400 for any other channel — only webhooks sign). The previous secret stops verifying immediately, so update the receiver first or accept a gap. Every read (delivery_list) carries only signingSecretPrefix, never the secret: a caller that loses it rotates again. This is also how a CLONED webhook destination is armed — a clone arrives disabled with no secret, and delivery_update refuses to enable it until one is minted here. Requires the manageDeliveries scope." +
    NEW_SCOPE_NOTE +
    DELIVERY_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    deliveryId: z.number().int().min(1).describe("The destination's id, as returned by delivery_list or delivery_create."),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries/${params.deliveryId}/secret/rotate`,
  annotations: UPDATE,
};

const deleteDelivery: ToolDescriptor = {
  name: "delivery_delete",
  title: "Delete Delivery Destination",
  description:
    "Delete a delivery destination outright (204). Permanent, and it frees one of the worker's 5 slots — this is also the only way to change a destination's channel (delete, then delivery_create with the new one). To stop the sends but keep the configuration, use delivery_update with isEnabled:false instead. Already-sent reports are unaffected: the run receipts that record them stay as they are. Requires the manageDeliveries scope." +
    NEW_SCOPE_NOTE,
  auth: "manager",
  method: "delete",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    deliveryId: z.number().int().min(1).describe("The destination's id, as returned by delivery_list."),
  },
  path: (params) => `${API}/${params.tokenId}/deliveries/${params.deliveryId}`,
  successMessage: "Delivery destination deleted.",
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

// Instruction history. The list is metadata and stays readable for a protected
// kit's worker; the BODIES are the publisher's text, so reading one and restoring
// one are both refused there. Only content is versioned — jobSentence, whenToUse
// and the rest are edited in place and have no history.

const getInstructionVersions: ToolDescriptor = {
  name: "instruction_versions",
  title: "List Instruction Versions",
  description:
    "The worker's instruction history, newest first — METADATA only: versionNumber, contentLength, editedByUserId, restoredFromVersion (set when that version was itself a restore, so you can see a rollback in the history), createDate. No instruction text here; read one version's content with instruction_version_get, or roll one back with instruction_restore. Readable EVEN for a protected kit's worker — history is metadata, the text is what belongs to the publisher — which is why this list can be non-empty while instruction_version_get returns 403 on the same worker. Only the instruction's content is versioned: jobSentence, whenToUse, description, memoryProfile and selfFactsEnabled are edited in place and never appear here, so a version count that has not moved does not mean nothing changed. An empty list means the worker has no instruction at all (instruction_get says so with a 204). Requires the readWorkers scope.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/instruction/versions`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const getInstructionVersion: ToolDescriptor = {
  name: "instruction_version_get",
  title: "Get Instruction Version",
  description:
    "One historical instruction version IN FULL — its content, plus versionNumber, editedByUserId, restoredFromVersion and createDate. Take the versionNumber from instruction_versions; diff two of them to see exactly what a past edit changed before deciding whether to roll it back. Every version row is a complete snapshot of the content as of that version (including the current one), not a patch. Returns 403 OPERATION_NOT_ALLOWED for a protected kit's worker — that text belongs to its publisher; do not retry, and note the version LIST stays readable. 404 when this worker has no such version number. Requires the readWorkers scope.",
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    versionNumber: z.number().int().min(1).describe(
      "The version to read, as listed by instruction_versions. A number this worker has never had is a 404."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/instruction/versions/${params.versionNumber}`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const restoreInstructionVersion: ToolDescriptor = {
  name: "instruction_restore",
  title: "Restore Instruction Version",
  description:
    "Roll the worker's instruction back: restore a historical version's content as a NEW current version. It APPENDS — nothing is deleted or overwritten in the history, the text you are replacing keeps its own version row, and the restore's new row carries restoredFromVersion so the rollback is legible later. That also makes the rollback itself reversible: restore the version you just moved away from and you are back. Returns the instruction as it now stands, with currentVersion bumped. Returns 403 OPERATION_NOT_ALLOWED for a protected kit's worker, like every other instruction write — do not retry. A version number this worker does not have is a 400 INVALID_REQUEST (a refused write, not a 404), and so is a worker with no instruction at all: call instruction_versions first. NOT idempotent — calling it twice appends two versions with identical content. Requires the manageInstructions scope.",
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    versionNumber: z.number().int().min(1).describe(
      "The version to restore, as listed by instruction_versions. Its content becomes the new current version."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/instruction/versions/${params.versionNumber}/restore`,
  bodyBuilder: () => ({}),
  annotations: CREATE,
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

// ─── Creation (clone) ───────────────────────────────────────────────────────
// The other creation path, next to kit install, and deliberately the only one
// that is not a kit: a clone can produce ONLY permissions a human already
// approved on the source worker, whereas authoring arbitrary permissions from a
// chat message is a different power and stays on the dashboard and the kit
// pipeline, where a manifest gets reviewed. All three need the createWorkers
// scope.

const CLONE_NOTE =
  " What a clone is: a copy of the source's PERMISSIONS (so it can never hold access a human did not already approve on the source) plus, by flag, the instruction, owner-authored memory, schedules, delivery destinations and the hosted deployment. Three things are deliberately NOT straight copies — schedules arrive DISABLED so a new worker never starts firing by itself (enable them with schedule_update once you are satisfied), AGENT-AUTHORED FACTS ARE NOT COPIED (only owner-authored rules and facts travel: what a worker learned about itself stays with the worker that learned it), and a webhook delivery destination arrives DISABLED WITH NO SIGNING SECRET so revoking the clone can never break its source (mint one with delivery_secret_rotate, then enable it with delivery_update; enabling it before that is refused). The clone also inherits the SAME per-run and per-day spend ceilings, so cloning multiplies the fleet's ceiling — read fleet_budget_get before a bulk clone. Instruction history does not travel: the clone starts at version 1 with the text it was given. A source whose instruction came from a PROTECTED kit is refused while includeInstruction is true — that text belongs to the kit's publisher, so install the kit again or clone with includeInstruction:false.";

const CLONE_TITLE_HINT =
  "The new worker's title, 1–120 chars. Required: a clone is never silently named after its source.";

// One shape, three tools: worker_clone and worker_clone_preview take it as their
// body, worker_clone_bulk takes an array of it. Every include flag defaults to
// true EXCEPT that run history is never copied at all — it belongs to the worker
// that earned it, so there is no flag for it.
const CLONE_REQUEST_SHAPE = {
  title: z.string().min(1).max(120).describe(CLONE_TITLE_HINT),
  includeInstruction: z.boolean().default(true).describe(
    "Copy the standing instruction. A protected kit's instruction is never copied — that source is refused (400) while this is true, so send false to clone everything else."
  ),
  includeMemory: z.boolean().default(true).describe(
    "Copy the ACTIVE OWNER-authored rules and facts. Agent-authored facts never travel, whatever this is set to."
  ),
  includeSchedules: z.boolean().default(true).describe(
    "Copy the schedules. They ALWAYS arrive disabled, and with no anchor or next-run time, so a bulk create cannot start a fleet running."
  ),
  includeDeliveries: z.boolean().default(true).describe(
    "Copy the run-result delivery destinations. A webhook destination arrives disabled and unarmed (no signing secret)."
  ),
  includeDeployment: z.boolean().default(true).describe(
    "Copy the hosted deployment — model plus the per-run and per-day spend ceilings. false = the clone has no hosted runs until a human sets it up, and budget_set will refuse its dollar caps until then."
  ),
  resourceId: z.string().uuid().optional().describe(
    "Bind the clone to a DIFFERENT identity: an operator resource id (as listed in kit_install_preview's operatorResources). Omit to keep the source's identity — the usual case."
  ),
};

const clonePreview: ToolDescriptor = {
  name: "worker_clone_preview",
  title: "Preview Worker Clone",
  description:
    "What cloning this worker WOULD produce. CREATES NOTHING — this is the rail to run before worker_clone, and before worker_clone_bulk especially. It takes the same body as worker_clone (which is the only reason it is a POST) and answers with sourceWorkerId/sourceTitle, the title the clone would carry, apps[] (every app the clone would hold, each with whether the operator can actually serve it today — this is where you learn a clone would be born unable to run), wouldCopyInstruction, memoryItemCount, scheduleCount, deliveryCount, the deployment it would inherit (modelSlug, maxUsdPerRun, maxUsdPerDay), and the two lists that carry the verdict: BLOCKERS — reasons the clone WOULD BE REFUSED, so an empty list is what 'it would succeed' looks like — and NOTES, things that would succeed but are worth knowing (schedules landing disabled, only owner-authored memory travelling, a webhook destination arriving unarmed, the fleet's spend ceiling being multiplied). Read blockers before committing: it is a verdict, not advice. Requires the createWorkers scope." +
    NEW_SCOPE_NOTE +
    CLONE_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    ...CLONE_REQUEST_SHAPE,
  },
  path: (params) => `${API}/${params.tokenId}/clone/preview`,
  bodyBuilder: (params) => ({
    title: params.title,
    includeInstruction: params.includeInstruction,
    includeMemory: params.includeMemory,
    includeSchedules: params.includeSchedules,
    includeDeliveries: params.includeDeliveries,
    includeDeployment: params.includeDeployment,
    resourceId: params.resourceId,
  }),
  // A POST that creates nothing: read-only in effect, and safe to run unattended.
  annotations: READ_ONLY,
};

const cloneWorker: ToolDescriptor = {
  name: "worker_clone",
  title: "Clone Worker",
  description:
    "Copy this worker into a NEW one (201 with the created worker). NOT IDEMPOTENT: every successful call creates another worker — never retry a success, and after a timeout check workers_list (needs readWorkers) before trying again. CRITICAL — the key is shown ONCE: the response's rawKey is the new worker's pe_ API key and can NEVER be read again, so hand it to the human immediately and do not discard the response before doing so. The response identifies the new worker by workerId, a UUID; every other tool on this surface addresses workers by their numeric tokenId, so look the clone up in workers_list to get one. Call worker_clone_preview first — its blockers list is the same refusal you would otherwise discover as a 400, whose message names the cause (a protected kit's instruction is the common one); 404 is an unknown or other-account source worker. The new worker starts ENABLED but with its schedules off, so nothing runs until you enable a schedule or call worker_run. Rate limit: 20 create CALLS per hour per ACCOUNT, shared with worker_clone_bulk (a bulk call of twenty workers costs one). Requires the createWorkers scope." +
    NEW_SCOPE_NOTE +
    CLONE_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    ...CLONE_REQUEST_SHAPE,
  },
  path: (params) => `${API}/${params.tokenId}/clone`,
  bodyBuilder: (params) => ({
    title: params.title,
    includeInstruction: params.includeInstruction,
    includeMemory: params.includeMemory,
    includeSchedules: params.includeSchedules,
    includeDeliveries: params.includeDeliveries,
    includeDeployment: params.includeDeployment,
    resourceId: params.resourceId,
  }),
  annotations: CREATE,
};

const cloneWorkerBulk: ToolDescriptor = {
  name: "worker_clone_bulk",
  title: "Clone Worker in Bulk",
  description:
    "Clone this worker several times in ONE call — how a fleet of eighteen becomes a fleet of a hundred. IT IS NOT ATOMIC AND DOES NOT ROLL BACK: PARTIAL SUCCESS IS THE NORMAL OUTCOME, because a per-item report is more useful than discarding nineteen good workers over the twentieth's bad title, and creating-then-deleting workers is worse than never creating them. So READ items[] RATHER THAN THE STATUS CODE — a 200 with created:17 of requested:20 is a success and a failure at once; each item carries index, title, success, workerId and either rawKey or error. KEEP EVERY rawKey: each is that worker's pe_ API key, shown once and never again, and a partial-success response you discard has stranded real workers whose keys nobody has. Capped at 20 workers per call (the 21st is a 400) and rate limited to 20 create calls per hour per ACCOUNT, shared with worker_clone, because a typo here creates workers. Run worker_clone_preview once for the shape you are about to repeat — the blockers that would refuse one item will refuse all of them. Requires the createWorkers scope." +
    NEW_SCOPE_NOTE +
    CLONE_NOTE,
  auth: "manager",
  method: "post",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    workers: z.array(z.object(CLONE_REQUEST_SHAPE)).min(1).max(20).describe(
      "One entry per worker to create, 1–20 of them; each needs its own unique title. Same shape as worker_clone's body, and every entry clones the SAME source worker."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/clone/bulk`,
  bodyBuilder: (params) => ({ workers: params.workers }),
  annotations: CREATE,
};

// ─── Budgets ────────────────────────────────────────────────────────────────
// The ceilings were always enforced at mint; what they had was no surface. Read
// and write ride ONE scope (manageBudgets) because visibility without control is
// trivia and control without visibility is anxiety. Nothing here is gated on the
// hosted-runtime switch — a worker with no deployment still has a run-count cap.

const BUDGET_WINDOW_NOTE =
  " Windows differ, deliberately: maxUsdPerDay and both fleet ceilings roll at UTC midnight (the month on the 1st), while maxRunsPerDay is counted over the WORKER'S OWN day — its timeZoneId, UTC only when it has none — because the scheduler that fires those runs is already zone-aware.";

const getWorkerBudget: ToolDescriptor = {
  name: "budget_get",
  title: "Get Worker Budget",
  description:
    "One worker's spend and rate ceilings: maxUsdPerRun, maxUsdPerDay, maxRunsPerDay, maxConcurrentRuns, modelSlug, hasDeployment (plus workerId and its deprecated alias tokenId). Four readings an agent gets wrong by default. (1) maxRunsPerDay NULL MEANS THE PLATFORM DEFAULT, NOT UNLIMITED — the gate substitutes the platform's own number, so never report a null as 'no limit'. (2) maxUsdPerRun is the amount RESERVED from the wallet at dispatch, so it is also what a run must be able to AFFORD before it starts; and the day cap is counted against those RESERVATIONS rather than settled cost, so a worker reserving $0.50 under a $2/day cap is skipped on its fifth run of the day even if each one really cost a cent (the reservation is refunded when a later gate skips the run). (3) maxConcurrentRuns is enforced at mint but is CURRENTLY FIXED AT 1 rather than configurable — it is reported so the number you see is the number the gate uses, and budget_set has no parameter for it. (4) hasDeployment FALSE means hosted runs are not set up for this worker, and then the dollar figures come back as 0 because there is no deployment to read them from — that 0 means 'no deployment', NOT 'capped at zero', so check hasDeployment before quoting any ceiling. Per-worker caps do not compose; the ceiling above them is fleet_budget_get. Requires the manageBudgets scope — reading a ceiling rides the same scope as changing it." +
    BUDGET_WINDOW_NOTE +
    NEW_SCOPE_NOTE,
  auth: "manager",
  method: "get",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
  },
  path: (params) => `${API}/${params.tokenId}/budget`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const setWorkerBudget: ToolDescriptor = {
  name: "budget_set",
  title: "Set Worker Budget",
  description:
    "Change one worker's ceilings, and get the whole budget back as it now stands. PARTIAL: every field is optional and an OMITTED FIELD MEANS UNCHANGED, so you can raise one ceiling without restating the rest and without racing another writer's edit to a different field. Three traps. Setting maxUsdPerRun or maxUsdPerDay on a worker with NO HOSTED DEPLOYMENT is a 400 — there is nothing for a dollar cap to bind to, and budget_get's hasDeployment says which workers those are; maxRunsPerDay, by contrast, can be set on any worker. There is NO way to clear maxRunsPerDay back to the platform default here, because null already means 'leave it alone': send an explicit number instead. And LOWERING maxUsdPerRun below what a run needs does not fail loudly — it makes that worker's next run a Skipped receipt with a skipReason, which is a receipt an agent must go and read. maxConcurrentRuns is not settable (fixed at 1) and is absent from this call by design. A ZERO per-run cap is REFUSED (400), as is a day cap below the per-run cap: a zero reserve is a run that cannot start, not a worker that spends nothing — to stop a worker, use worker_set_enabled. maxRunsPerDay is clamped to the organization policy ceiling when one is enforced. The same call sets the question timeout: awaitInputTimeoutMinutes (how long a question the worker asks stays open; clearAwaitInputTimeout removes the bound). When it passes the question is closed out, never resumed with no answer, and a late answer still starts the run. Requires the manageBudgets scope." +
    BUDGET_WINDOW_NOTE +
    NEW_SCOPE_NOTE,
  auth: "manager",
  method: "patch",
  schema: {
    tokenId: z.number().int().min(1).describe(TOKEN_ID_HINT),
    maxUsdPerRun: z.number().min(0.01).max(1000).optional().describe(
      "Hard per-run ceiling in USD, 0.01–1000 — also the amount a platform-billed run reserves from the wallet at dispatch. Must stay at or below maxUsdPerDay. Needs a hosted deployment. Omit to keep."
    ),
    maxUsdPerDay: z.number().min(0.01).max(100000).optional().describe(
      "Ceiling on this worker's RESERVED spend per UTC day, 0.01–100000 (each dispatch charges the full maxUsdPerRun against it). Must be at least maxUsdPerRun. Needs a hosted deployment. Omit to keep."
    ),
    maxRunsPerDay: z.number().int().min(1).max(10000).optional().describe(
      "Runs per the worker's own day, 1–10000. Omit to keep — there is no value here that restores the platform default."
    ),
    awaitInputTimeoutMinutes: z.number().int().min(1).max(43200).optional().describe(
      "Minutes a question the worker asks (status AwaitingInput) stays open before the platform closes it out, 1–43200. Omit to keep; use clearAwaitInputTimeout to remove the bound (it then waits indefinitely). Needs a hosted deployment."
    ),
    clearAwaitInputTimeout: z.boolean().optional().describe(
      "true = REMOVE the question timeout so a question waits indefinitely. Wins over awaitInputTimeoutMinutes if both are sent."
    ),
  },
  path: (params) => `${API}/${params.tokenId}/budget`,
  bodyBuilder: (params) => ({
    maxUsdPerRun: params.maxUsdPerRun,
    maxUsdPerDay: params.maxUsdPerDay,
    maxRunsPerDay: params.maxRunsPerDay,
    awaitInputTimeoutMinutes: params.awaitInputTimeoutMinutes,
    clearAwaitInputTimeout: params.clearAwaitInputTimeout,
  }),
  annotations: UPDATE,
};

const getFleetBudget: ToolDescriptor = {
  name: "fleet_budget_get",
  title: "Get Fleet Budget",
  description:
    "The ACCOUNT-WIDE spend ceiling and what has been spent against it — the brake above the per-worker caps, which exists because per-worker caps DO NOT COMPOSE: eighteen workers each capped at a dollar a day is an eighteen-dollar-a-day fleet. Returns maxUsdPerDay and maxUsdPerMonth (each ABSENT when no ceiling of that kind is set — and note that a ceiling of ZERO MEANS STOP, not unlimited), spentTodayUsd, spentThisMonthUsd, reservedInFlightUsd, lastBreachAtUtc, lastBreachScope ('fleet.day' | 'fleet.month') and serverTimeUtc — compute headroom and when a window rolls against serverTimeUtc, never your own clock. The spend figures are SETTLED run spend (model cost on platform-billed runs, the platform fee on BYOK runs), read from run receipts rather than the wallet ledger: top-ups, worker-assistant spend and app-usage billing are neither counted here nor governed by this ceiling, so this number will not match a wallet balance. reservedInFlightUsd is what runs in flight currently hold, and the ceiling compares against settled PLUS reserved, so headroom is the ceiling minus both. A run is refused once that committed total REACHES the ceiling (>=, not >), arriving as a Skipped receipt whose skipReason is FleetSpendCap and errorCode fleet_spend_cap. Account-scoped by the key itself, so it takes no worker id. Requires the manageBudgets scope." +
    NEW_SCOPE_NOTE,
  auth: "manager",
  method: "get",
  schema: {},
  path: `${API}/fleet/budget`,
  annotations: READ_ONLY,
};

const setFleetBudget: ToolDescriptor = {
  name: "fleet_budget_set",
  title: "Set Fleet Budget",
  description:
    "Set or clear the account-wide ceiling, and get the fleet budget back with fresh spend figures. ABSENT MEANS UNCHANGED, so REMOVING a ceiling needs the matching CLEAR FLAG — clearMaxUsdPerDay / clearMaxUsdPerMonth — because null cannot mean both 'leave it alone' and 'none'. Sending a value and its clear flag together is contradictory and CLEAR WINS: dropping a ceiling is the safer reading of a confused request than raising one. ZERO IS NOT UNLIMITED — a ceiling of 0 stops the whole fleet, because a run is refused once spend reaches it. The ceiling counts SETTLED spend PLUS the reserves of runs in flight (reservedInFlightUsd on fleet_budget_get), so a burst of runs admitted together cannot overshoot it. A breach only REFUSES runs: each is a Skipped receipt with skipReason FleetSpendCap and errorCode fleet_spend_cap — NOT DailySpendCap, which is one worker's own cap — nothing is paused, every worker's own API key keeps working, and the fleet runs again by itself when the window rolls or the ceiling is raised. Webhook destinations receive the breach as run.blocked carrying the ceiling under budget, once per worker per day; lastBreachAtUtc/lastBreachScope on the response are how you see that it happened. Requires the manageBudgets scope." +
    NEW_SCOPE_NOTE,
  auth: "manager",
  method: "patch",
  schema: {
    maxUsdPerDay: z.number().min(0).max(1000000).optional().describe(
      "Account-wide ceiling on settled run spend per UTC day, 0–1000000. Omit to keep; use clearMaxUsdPerDay to remove it."
    ),
    clearMaxUsdPerDay: z.boolean().optional().describe(
      "true = REMOVE the daily ceiling (no account-wide day limit). Wins over maxUsdPerDay if both are sent."
    ),
    maxUsdPerMonth: z.number().min(0).max(1000000).optional().describe(
      "Account-wide ceiling per UTC month, 0–1000000. Omit to keep; use clearMaxUsdPerMonth to remove it."
    ),
    clearMaxUsdPerMonth: z.boolean().optional().describe(
      "true = REMOVE the monthly ceiling. Wins over maxUsdPerMonth if both are sent."
    ),
  },
  path: `${API}/fleet/budget`,
  bodyBuilder: (params) => ({
    maxUsdPerDay: params.maxUsdPerDay,
    clearMaxUsdPerDay: params.clearMaxUsdPerDay,
    maxUsdPerMonth: params.maxUsdPerMonth,
    clearMaxUsdPerMonth: params.clearMaxUsdPerMonth,
  }),
  annotations: UPDATE,
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const manageDescriptors: readonly ToolDescriptor[] = [
  getKeyInfo,
  listWorkers,
  getWorker,
  runWorker,
  runsFeed,
  fleetPulse,
  listRuns,
  getRun,
  getRunEvents,
  getRunQuestion,
  answerRunQuestion,
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
  listDeliveries,
  deliveryChannels,
  createDelivery,
  updateDelivery,
  rotateDeliverySecret,
  deleteDelivery,
  getInstruction,
  setInstruction,
  getInstructionVersions,
  getInstructionVersion,
  restoreInstructionVersion,
  setWorkerEnabled,
  kitInstallPreview,
  kitInstall,
  clonePreview,
  cloneWorker,
  cloneWorkerBulk,
  getWorkerBudget,
  setWorkerBudget,
  getFleetBudget,
  setFleetBudget,
];
