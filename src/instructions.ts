// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { guidance as g, publicKitPublishingPause, publicPublisherIdentityPause } from "./guidance.js";

const firstWorkerEntry = "workerkit_about(index/start) if needed. Lead authorized creation; connect missing apps afterward where supported. Report returned facts; wallet balance is not readiness; deployment requests no manual run.";

export const workersInstructions = [
  "WorkerKit Manager. Call key_info before management; requests add no scopes or worker reach.",
  g.authority, g.skipped, g.uncertainWrite, g.sourceEvidence,
  firstWorkerEntry,
  "\n- Public publishing, promotion and relisting are paused; use visibility:'private' to publish/replace/validate.",
  "\n- " + g.scopeSnapshot + " " + g.workerReach,
  "\n- " + g.creation,
  "\n- Advice: fetch relevant facts. Simple creation: use its setup tool. Custom drafting: kit_authoring_guide(index/schema), then relevant sections. Reuse unchanged help; kit_app_tools(app) discovers business tools. Manager tools/list is management.",
  "\n- " + g.action + " " + g.actionReplay,
  "\n- " + g.runtimeOff,
  "\n- " + g.time + " Watch with runs_feed/fleet_pulse. " + g.eventPolling + " run_get reports results/cost.",
  "\n- " + g.secrets,
  "\n- " + g.support,
].join(" ");

export const decisionInstructions = [
  "WorkerKit Manager decision profile: configure/run Decision or Hybrid workers. Call key_info before management: the user's request adds no scopes or worker reach.",
  g.authority,g.skipped,g.uncertainWrite,g.sourceEvidence,
  firstWorkerEntry,
  "\n- " + g.scopeSnapshot + " " + g.workerReach,
  "\n- Reuse fitting workers. workers_list supplies IDs; follow the input schema. " + g.creation,
  "\n- worker_get shows modelType/readiness. Decision takes sourceArgs/answers/maxItems, not prompt/modelSlug; hybrid accepts both. run_get reports coverage/committed cost. Unknown coverage is not complete.",
  "\n- kit_app_tools(app) discovers sources; omit purpose beyond recipes. Manager tools/list is not the app inventory. Use the decision guide for creation; read schema/relevant sections for custom drafts. Reuse help. instruction_get reads setup; instruction_set saves answers. Kit edits never update workers.",
  "\n- " + g.runtimeOff + " " + g.time,
  "\n- " + g.secrets,
  "\n- " + g.support,
  "\n- Quality settings, worker access and binding changes, Action tools, fleet monitoring, scheduling, publishing and connection administration are on the full profile.",
].join(" ");

export const directoryInstructions = [
  "WorkerKit Directory: " + g.directory + " Nothing on this mount installs or publishes. " + g.sourceEvidence,
  "\n- " + publicPublisherIdentityPause + publicKitPublishingPause,
  "\n- Use directory_overview for filter vocabulary, kits_search to shortlist and kit_get to inspect exact permissions and content. Protected text is intentionally withheld.",
  "\n- Advice needs relevant capability facts only. Custom drafting: kit_authoring_guide(index/schema), relevant sections and per-app vocabulary/tools; reuse unchanged reads. Validate/publish with publishKits on Manager. Publish private and prove the worker; public publishing is paused.",
  "\n- Language kits contain instructions; decision kits contain classification rules; hybrid combines them. Action kits expose selected tools without a model and are never deployed or run.",
  "\n- Use workerkit_about for missing product context or first-job examples; lead into a kit or authenticated Workers creation. Fetch only needed sections.",
].join(" ");

export const knowledgeInstructions = [
  "WorkerKit Knowledge: discover, search and read the reports your company's workers have already produced, and reconcile what changed. " + g.sourceEvidence,
  g.authority,
  "\n- " + g.scopeSnapshot + " Reads need readKnowledge; configuration needs manageKnowledge with account administrator authority and an unrestricted credential. Only retained reports are retrieved: no app data, transcripts, worker runs or worker management.",
  "\n- Start with knowledge_sources, search or browse with knowledge_search, then read complete evidence with knowledge_get and cite its version. Search is lexical: try wording variants or browse by source and date before concluding that nothing exists.",
  "\n- knowledge_changes is the incremental scan: process a page, then save nextCursor. Restart on cursor_invalid or cursor_stale and discard evidence that is no longer readable.",
  "\n- Fleet operations, kit authoring and worker identifiers are on the Workers mount; workers_list there names the workerId UUIDs an administrator enrolls or grants.",
].join(" ");

export type ToolProfile = "workers" | "decision" | "directory" | "knowledge";
export const instructionsByProfile = {
  workers:workersInstructions, decision:decisionInstructions, directory:directoryInstructions, knowledge:knowledgeInstructions,
} as const;

// REST has its own identity, authentication and wire conventions. These blocks
// are not MCP initialization instructions and do not add to tools/list.
export const restTransportGuidance = {
  workerId: "The worker: stable workerId GUID (preferred) or deprecated sequential numeric tokenId. Both are accepted. A 404 can mean nonexistent, another account or outside key selection; check key_info.",
  runs_feed: "REST wait (0-60 seconds) long-polls until an account run is minted, starts or settles, or the deadline. Prefer one held fleet request over tight polling. A restricted key may wake for another worker, but its returned page stays restricted. At the concurrent-waiter cap it returns immediately. Supplying cursor ignores wait: backlog pages never wait. This wait input is REST-only.",
  memory_add_rule: "This REST operation adds a rule; kind is encoded in the route, not sent in the body.",
  memory_add_fact: "This REST operation adds a fact; kind is encoded in the route, not sent in the body.",
  managerKey: "Manager key. Minted once by an account admin at {appUrl}/fleet-access; sent as Authorization: Bearer pe_mgr_….",
  oauth: "OAuth 2.1 authorization code with PKCE (S256). Dynamic client registration at the registration endpoint; discovery at /.well-known/oauth-authorization-server. Request the scopes your job needs — an account admin picks or mints the manager key at consent, and that key's own scopes are the contract.",
  postBody: "Always send a request body on POST, at least {}. Without Content-Length the edge can return HTML 411 before the API; that page is not an API error.",
  rateLimits: "Limits are per account: 120 surface calls/min and 1,200/hour; 30 run triggers/min; run_bulk 2 calls/min and 20/hour, up to 20 workers/call; 120 run-event polls/min in a separate window. Action options/create/tools/call/invocation share 120 calls/min outside the surface window; worker_tool_call also counts toward the worker's daily request cap and plan request windows. Per-hour limits: 10 kit installs, 20 kit publishes, 30 app connects, 20 MCP-server registrations and 20 model-key sets. Support: 5/hour and 20/day. A 429 carries Retry-After; credential throttles have a JSON envelope, account-window throttles can be plain text. Branch on status and header, not the body.",
  errors: "Run and deployment errors use {error,message}, with the snake_case machine code in error. Admitted worker_tool_call results use status and error:{code,message,retryable}; pre-invocation refusals use {error,message,code}. Other manager errors normally use {error,message,code}; wallet and authorization endpoints also have their documented error/code shapes. Branch on the endpoint's documented envelope and HTTP status, not merely which field is present.",
} as const;

const productPurpose = "WorkerKit gives jobs persistent workers with app grants, budgets and records. Decision workers classify/route; Language workers investigate/write; Action workers call exact permitted tools without a model. Chain specialists into workflows. workerkit_about gives examples and the first-worker path.";
export const restInstructions = {
  workers: [
    productPurpose,
    firstWorkerEntry,
    "This Workers API manages fleet, runs, memory, schedules, instructions, state, clones, budgets, kits, app connections, custom MCP servers and model-provider keys. Call key_info first for this credential's scopes and worker reach.",
    "Company Knowledge uses the same key: readKnowledge discovers, searches and reads published worker reports (knowledge_sources, knowledge_search, knowledge_get, knowledge_changes); manageKnowledge replaces publication and audience settings as an account administrator. Its MCP tools are served on the separate Knowledge mount.",
    g.authority, g.scopeSnapshot, g.workerReach, g.skipped, g.uncertainWrite, g.sourceEvidence,
    "Authenticate with a manager key or OAuth 2.1. " + restTransportGuidance.managerKey + " " + restTransportGuidance.oauth,
    "A private kit plus kit_install creates a worker, alongside action_worker_create and decision_worker_create. Language kits contain prose, decision kits contain classification/routing rules, hybrid combines both, and Action kits contain selected tools without a model. This spec includes the anonymous discovery reads: kit_authoring_guide (index, then relevant sections), kit_app_tools and kit_vocabulary; validate the exact body before publishing. " + g.creation,
    "apps_list reports each operator's availability and connection method. app_connect validates a credential live and never returns it; OAuth sign-in uses the dashboard. For an app the platform lacks, register an account custom MCP server with mcp_server_create (including its credential) and select tools with mcp_server_set_tools.",
    restTransportGuidance.rateLimits, restTransportGuidance.postBody, restTransportGuidance.errors,
    g.runtimeOff,
    "Watch the reachable fleet with runs_feed and fleet_pulse rather than per-worker polling. " + g.eventPolling + " " + g.time,
    "Receipt modelCostUsd is settled provider-list cost, not necessarily the wallet debit. Use walletChargeUsd when present, including hybrid classification on BYOK; otherwise interpret billingMode and byokFeeUsd. FreeRun uses its allowance. costSoFarUsd is a live Running estimate; null on a finished run is expected. dispatch_lost means never picked up and no charge. Read run_get for the full receipt and coverage.",
    g.action + " For writes, send Idempotency-Key and reuse it to recover a transport failure; inspect worker_tool_invocation after uncertainty. Never resend outcome_unknown. worker_run and worker_deploy refuse Action workers with 400 action_worker_requires_invoke.",
    g.secrets, g.support,
    restTransportGuidance.workerId + " Both forms work wherever a worker path uses tokenId. OperationIds match MCP tools except memory_add_fact and memory_add_rule, whose kind is encoded in the REST route; auth_request_* operations are REST-only.",
  ].join("\n\n"),
  directory: [
    productPurpose,
    "Public, anonymous, read-only kit discovery; responses are identical for every caller. Use workerkit_about when product context is needed. Kits combine exact pre-scoped permissions and schedules with language instructions, decision routing, both for hybrid, or selected Action tools with no model. directory_overview.modelTypes supplies the kinds and kits_search filters by them.",
    "Use directory_overview for filter vocabulary, kits_search to shortlist and kit_get to inspect permissions and content. Protected text is intentionally withheld. Nothing in this API installs or publishes: hand the human pageUrl ({siteUrl}/kit/{slug}), or use the authenticated Workers API with installKits.",
    g.sourceEvidence,
  ].join("\n\n"),
} as const;
