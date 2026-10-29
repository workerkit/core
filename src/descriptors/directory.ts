// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
// The public kits-directory tools: anonymous, read-only catalog tools over the
// public directory API. Eight tools rather than one per REST endpoint — the about read
// (what WorkerKit is and when an agent should reach for it), one vocabulary
// call, one search, one dossier, one publisher profile, and the three authoring
// reads (the guide, the permission vocabulary an author needs, and the explorer
// of what each app lets a worker do).
//
// The upstream surface is already agent-shaped (always-anonymous, no
// viewer-scoped fields, opt-in skill-resource bodies, composed overview), so
// these tools stay thin passthroughs. What lives HERE is the pure half of the
// presentation an MCP server (or CLI) should not each reinvent:
// - Empty search results append a broaden-this hint; truncated results append
//   the next page number — the two places agents reliably mis-step.
// - kit_get / publisher_get carry a computed pageUrl: nothing on an anonymous
//   surface can install, so the agent hands over the link — or, when it holds
//   a manager key with the installKits scope, installs via kit_install_preview
//   / kit_install on the authenticated WorkerKit Manager server.

import { z } from "../zod.js";
import { READ_ONLY, type ToolDescriptor } from "./types.js";
import { publicPublisherIdentityPause } from "../guidance.js";

const API = "/api/directory/mcp";
const SITE = "https://workerkit.ai";

// ─── Shared phrasing ────────────────────────────────────────────────────────

const SLUG_HINT = "The kit's URL slug, as returned by kits_search (slug).";

// Appended to every tool: the two facts an agent must never get wrong on a
// public mount — no auth exists, and installing is out of its reach.
const DIRECTORY_NOTE =
  " Public and anonymous, identical for everyone; reads only. Install: signed-in human at pageUrl, or kit_install_preview/kit_install on Manager /workers (installKits).";

// The two authoring reads share one framing: they are what an agent reads BEFORE
// writing a kit for the manager surface, and they are anonymous so it can draft
// before it holds any credential.
const AUTHORING_NOTE =
  " Public and anonymous. On Manager /workers: kit_validate checks all sections, then kit_publish (publishKits). Publish PRIVATE first: only this account can install it via a signed-in human at pageUrl or kit_install, also the create-from-scratch path. Workers need apps connected on their operator (apps_list/app_connect). Add unsupported apps via mcp_server_create (credential), mcp_server_set_tools, then content.mcpServers.";

// ─── Pure data mappers + footers (presentation data, not ToolResult assembly) ─

type Json = Record<string, unknown>;

const SEARCH_EMPTY_HINT =
  "No kits matched. Filters AND together — drop some. query is a plain case-insensitive substring over name + job sentence (one short word beats a phrase), and unknown category/app/publisher values match nothing rather than erroring. directory_overview lists every valid filter value. If nothing fits after broadening, author a kit for the exact job rather than installing a near miss: kit_authoring_guide (index, then schema and rules) and kit_app_tools here, then kit_validate and kit_publish (private) on the /workers mount, then kit_install.";

// publisher_get accepts no search filters, so the search hint above would tell an
// agent to broaden filters it never set. Reachable: the profile 404s only when the
// publisher has no PUBLISHED kits, while the catalog list additionally excludes
// taken-down ones — so a publisher whose only published kit was moderated out
// returns 200 with an empty items array.
const PUBLISHER_EMPTY_HINT =
  "This publisher currently lists no kits (publisher.kitCount can still be non-zero — a published kit can be withheld from the catalog). publisher_get takes no search filters, so there is nothing to broaden; report the profile as-is.";

/**
 * The one footer a {items, totalCount, page, pageSize} list needs: how to
 * broaden when nothing matched, or which page comes next when truncated.
 */
export function listFooter(body: Json, emptyHint: string = SEARCH_EMPTY_HINT): string | undefined {
  const items = Array.isArray(body.items) ? body.items : [];
  const totalCount = typeof body.totalCount === "number" ? body.totalCount : items.length;
  const page = typeof body.page === "number" ? body.page : 1;
  const pageSize = typeof body.pageSize === "number" && body.pageSize > 0 ? body.pageSize : Math.max(items.length, 1);
  if (totalCount === 0) {
    return emptyHint;
  }
  if (page * pageSize < totalCount) {
    return `Showing page ${page} of ${Math.ceil(totalCount / pageSize)} (${totalCount} kits total) — call again with page: ${page + 1} for more`;
  }
  return undefined;
}

/** kits_search data: the validated list body, or undefined = serve verbatim. */
export function kitListData(data: unknown): Json | undefined {
  const body = data as Json | null;
  if (!body || typeof body !== "object" || !Array.isArray((body as Json).items)) {
    return undefined; // unexpected shape — serve verbatim rather than guess
  }
  return body;
}

/** kit_get data: the dossier with the computed pageUrl, or undefined = verbatim. */
export function kitDetailData(data: unknown, params: Record<string, unknown>): Json | undefined {
  const body = data as Json | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;

  const detail = { ...body };
  const slug = typeof detail.slug === "string" && detail.slug.length > 0 ? detail.slug : String(params.slug ?? "");
  detail.pageUrl = `${SITE}/kit/${encodeURIComponent(slug)}`;
  return detail;
}

/**
 * kit_get footer. Bodies exist upstream but were not requested: each such
 * resource reports a contentLength with no content. A protected kit's resources
 * carry neither (identity-only), so this stays silent there — re-calling would
 * not help.
 */
export function kitDetailFooter(data: unknown, params: Record<string, unknown>): string | undefined {
  const detail = data as Json;
  if (params.includeResourceBodies !== true && Array.isArray(detail.skillResources)) {
    const omitted = detail.skillResources.filter(
      (r) =>
        r !== null && typeof r === "object" && !Array.isArray(r) &&
        typeof (r as Json).contentLength === "number" && ((r as Json).contentLength as number) > 0 &&
        typeof (r as Json).content !== "string"
    ).length;
    if (omitted > 0) {
      return `${omitted} skillResources ${omitted === 1 ? "body" : "bodies"} omitted — call again with includeResourceBodies: true to read them`;
    }
  }
  return undefined;
}

/** publisher_get data: the profile with the computed pageUrl, or undefined = verbatim. */
export function publisherPageData(data: unknown, params: Record<string, unknown>): Json | undefined {
  const body = data as Json | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;

  const page = { ...body };
  const publisher = page.publisher as Json | undefined;
  const slug =
    publisher && typeof publisher.slug === "string" && publisher.slug.length > 0
      ? publisher.slug
      : String(params.slug ?? "");
  page.pageUrl = `${SITE}/publishers/${encodeURIComponent(slug)}`;
  return page;
}

/** publisher_get footer: pages the embedded kit list with the publisher-shaped empty hint. */
export function publisherPageFooter(data: unknown): string | undefined {
  const page = data as Json;
  const kits = page.kits;
  if (kits && typeof kits === "object" && !Array.isArray(kits) && Array.isArray((kits as Json).items)) {
    return listFooter(kits as Json, PUBLISHER_EMPTY_HINT);
  }
  return undefined;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

const directoryOverview: ToolDescriptor = {
  name: "directory_overview",
  title: "Directory Overview",
  description:
    "Read directory vocabulary before choosing kits_search filters. kitCount counts published kits; categories.jobFamilies/roles/industries supplies slug/name for category/industry. apps code/name/categoryCode/installable supplies app (installable:false can appear in kits but cannot be installed). appCategories code/name/members[{code,name,appCode}] supplies appCategory and installer choices (e.g. Slack/Teams). models model/normalized/kitCount supplies model (normalized or substring). modelTypes code/name/summary supplies none(Action)|language|decision|hybrid. Also sortOptions/triggerModes. No kits here: for popularity use kits_search's default downloads sort. Human pages: https://workerkit.ai/kit/{slug}." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {},
  path: `${API}/overview`,
  annotations: READ_ONLY,
};

const searchKits: ToolDescriptor = {
  name: "kits_search",
  title: "Search Kits",
  description:
    publicPublisherIdentityPause +
    "Search public worker templates: instructions, decision routing or Action tools, with pre-scoped app permissions and often schedules. All optional filters AND; omit to browse. Returns {items,totalCount,page,pageSize}. Cards: slug(kit_get key), name/jobSentence, publisherName/publisherSlug/isOfficialPublisher/verificationTier, apps/categorySlots(installer chooses member), categories/triggerModes, starCount, modelScores(publisher-declared 0-100 fit, best first)/recommendedModel, modelType(language|decision|hybrid|none), isProtected,isFeatured,publishedAt. Protected instruction TEXT is intentionally withheld; kit still works, not a red flag. Empty is not an error; read its footer and directory_overview for valid filters. Human page: https://workerkit.ai/kit/{slug}." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    query: z.string().max(200).optional().describe(
      "Free-text search: case-insensitive SUBSTRING match over kit name + job sentence — not keyword or semantic search, so one short stem ('invoice') beats a phrase ('help with my invoices'). Omit to browse by filters alone."
    ),
    category: z.string().optional().describe(
      "Job-category slug (any kind — job family, role, or industry). Valid slugs: directory_overview → categories. Unknown slugs match nothing."
    ),
    industry: z.string().optional().describe(
      "Industry-kind category slug ONLY (a role/job-family slug here matches nothing). ANDs with category."
    ),
    app: z.string().optional().describe(
      "Exact app code the kit must use, e.g. 'email', 'slack', 'crm'. Valid codes: directory_overview → apps."
    ),
    appCategory: z.string().optional().describe(
      "Capability category from directory_overview.appCategories: matches an install slot OR a pinned member app, broader than app. Unknown code errors with the fix."
    ),
    model: z.string().max(80).optional().describe(
      "Substring match on a scored model name, e.g. 'sonnet' or 'gpt'. Valid names: directory_overview → models."
    ),
    trigger: z.enum(["onDemand", "scheduled", "event"]).optional().describe(
      "How the kit's worker runs: onDemand (a human or agent triggers it), scheduled (ships recurring schedules), event (webhook-triggered)."
    ),
    modelType: z.enum(["none", "language", "decision", "hybrid"]).optional().describe(
      "Worker type: none=direct Action tools; language=prose with installer-chosen model; decision=per-item routing without prose/model choice; hybrid=bounded classification then one language agent. Omit for all."
    ),
    publisher: z.string().optional().describe("Temporarily unavailable: publisher identity is hidden, so every publisher filter returns an empty page. Omit to browse kits."),
    sort: z.enum(["downloads", "new", "name", "stars"]).default("downloads").describe(
      "downloads = most installed (the popularity signal), new = latest published, name = A-Z, stars = most starred."
    ),
    page: z.number().int().min(1).default(1).describe("1-based page number."),
    pageSize: z.number().int().min(1).max(200).default(20).describe(
      "Cards per page (max 200). 20 keeps responses lean; totalCount always reports the full match count."
    ),
  },
  path: `${API}/kits`,
  paramFilter: (params) => {
    // The wire param is `q`; `query` is the agent-facing name.
    const { query, ...rest } = params;
    return { ...rest, q: query };
  },
  annotations: READ_ONLY,
  mapData: (data) => kitListData(data),
  footer: (data) => listFooter(data as Json),
};

const getKit: ToolDescriptor = {
  name: "kit_get",
  title: "Get Kit",
  description:
    "Inspect a kit before installation: description/appDescriptions (author app/tool notes), modelType, exact permissions, content and setup. none exposes actionSpec without a model; hybrid combines prose/classification; language is default. instructionContent is verbatim prose, empty if isProtected while instructionLength remains real; protected startCommand/endCommand/whenToUse are null, indistinguishable from absent. For decision, evaluate decisionNarration (sources/questions/routes/confidence fallback, also served when protected) and decisionSetup. permissionsManifest is EXACT installed access: operations/fields/scopes; numeric values are authoritative, names display-only; its workerSlots name other workers the kit calls, bound explicitly at install. Summarize this for access questions. requiredInputs/memorySetup is the install form. memoryProfile stateless omits recent-run summaries, contextual includes bounded summaries; owner rules/injected facts apply to both. selfFactsEnabled permits unreviewed recall-only saves that later runs must search to use. Also schedules/triggers/usageWindows, modelScores with notes/starCount/pageUrl. skillResources always has key/kind/name; description/contentLength withheld when protected; includeResourceBodies fetches bodies. Surface hasExternalMcpShells when recommending: install creates account gateways to publisher URLs in permissionsManifest.mcpServers.shells. scan.outcome cleared|underReview are BOTH live/installable; underReview is an unsettled raised check, not unsafe. scannedAtUtc:null means pre-scanner publication. checks lists families run; static-only cleared is weaker than all three. Attribute recommendation safe|caution|doNotInstall to SkillSpector; independent of outcome and may disagree. caution means worth reviewing, including incomplete analysis. scan is absent with nothing to report, never includes findings. 404:no published kit for slug." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    slug: z.string().min(1).describe(SLUG_HINT),
    includeResourceBodies: z.boolean().default(false).describe(
      "true = include each skill resource's full text (can be up to 20k chars each). Default false returns key/kind/name/description/contentLength — enough to describe the kit; fetch bodies only when their content is the question."
    ),
  },
  path: (params) => `${API}/kits/${encodeURIComponent(String(params.slug))}`,
  paramFilter: (params) => {
    const { slug: _slug, ...queryParams } = params;
    return queryParams;
  },
  annotations: READ_ONLY,
  mapData: kitDetailData,
  footer: kitDetailFooter,
};

const getPublisher: ToolDescriptor = {
  name: "publisher_get",
  title: "Get Publisher",
  description:
    publicPublisherIdentityPause +
    "Inspect a publisher and its published kits for the 'who is behind this?' check. Returns {publisher,kits,pageUrl}. publisher: name,isOfficial(WorkerKit), xHandle(x.com),gitHubHandle(github.com),linkedInUrl,description,createDate(member since),kitCount(published only). kits uses the paginated kits_search card shape, scoped to this publisher. 404:unknown publisher or none currently published." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    slug: z.string().min(1).describe("The publisher's slug, as returned on any kit card (publisherSlug)."),
    sort: z.enum(["downloads", "new", "name", "stars"]).default("downloads").describe("Sort for the publisher's kit list."),
    page: z.number().int().min(1).default(1).describe("1-based page of the publisher's kit list."),
    pageSize: z.number().int().min(1).max(200).default(20).describe("Kits per page (max 200)."),
  },
  path: (params) => `${API}/publishers/${encodeURIComponent(String(params.slug))}`,
  paramFilter: (params) => {
    const { slug: _slug, ...queryParams } = params;
    return queryParams;
  },
  annotations: READ_ONLY,
  mapData: publisherPageData,
  footer: (data) => publisherPageFooter(data),
};

// ─── Authoring reads ────────────────────────────────────────────────────────

const GUIDE_SECTIONS = ["index", "decision", "schema", "rules", "skill", "state", "slots", "workers", "instruction", "example", "selfcheck"] as const;

const kitAuthoringGuide: ToolDescriptor = {
  name: "kit_authoring_guide",
  title: "Kit Authoring Guide",
  description:
    "Read kit authoring guidance one Markdown section at a time, with table of contents. Classification/scoring/filtering/triage: decision has recipes, typed questions, creation examples/results. Action(modelType none): index/schema; quickest create path is action_worker_options then action_worker_create on Manager. Full kit authoring: index, then schema/rules; state covers Records, memory and context hygiene; workers covers kits that call other workers (workerSlots, bindings, waiting, receipts); fetch other sections as needed. Unknown section:400 with valid names. Live sources:kit_app_tools; exact permission keys:kit_vocabulary. On Manager /workers, kit_validate the exact body then kit_publish (publishKits). Publish private, install and prove a run (Action:tool call) before public promotion with kit_replace." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    section: z.enum(GUIDE_SECTIONS).default("index").describe(
      "Which section to read. index (default) is the table of contents plus how to use the guide; schema and rules are the two an author cannot skip; workers is required before declaring workerSlots."
    ),
  },
  path: `${API}/authoring/guide`,
  annotations: READ_ONLY,
};

const kitVocabulary: ToolDescriptor = {
  name: "kit_vocabulary",
  title: "Kit Authoring Vocabulary",
  description:
    "Read the exact live keys before writing content.apps/categorySlots/categorySlugs; strict validation, no 'all' shorthand. Without app: apps[] code/name/summary, operations(tool KEYS), fields, supported axes(readOperations,masterAccessLevels,writableFields,providers,channels,objectTypes,scopePolicies,contentTypeScopes,capabilities,supportsAllowAll,supportsWriteEnabled,subApps,installable); concreteApps[] vendor tiles with standalone|provider|slotMember|subApp kind and content mapping; appCategories[] members/labelAlias/genericName; categories.jobFamilies/roles/industries(the valid categorySlugs); models; mcpApps(id=gatewayId,tools[].toolId=toolIds); note. Own MCP servers: mcp_servers_list on Manager. With app: {app,vendors,tools,note}; tools describes installed-worker tools: name(use in prose),description,readOnly,argsSchema,decisionSource result mapping where known,requires(grant one listed operations key). toolsNote replaces an unavailable catalog. Full response is large: read once/task, then per-app; kit_app_tools explores all app capabilities in one call. Unknown app:400 with valid codes." + AUTHORING_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    app: z.string().max(40).optional().describe(
      "One app code (from apps[].code) to read just that surface with its vendors and tools. Omit for the whole vocabulary."
    ),
  },
  path: `${API}/authoring/vocabulary`,
  annotations: READ_ONLY,
};

const kitAppTools: ToolDescriptor = {
  name: "kit_app_tools",
  title: "Kit App Tools",
  description:
    "Discover app tool capabilities. purpose:decision returns convenience source recipes, evidence fields, argument schemas, read permissions, limits and editable decision_worker_create examples; app narrows email/calendar/drive recipes. Public capability data only; apps_list checks account connections. Without purpose: apps[] in catalog order with operations and tools[{name,title,description,readOnly,argsSchema,decisionSource,requires,provider,scope,hosted}]. requires grants one listed operations key; absent means the tool comes with the app. provider pins a vendor, scope a Drive content family; hosted:false excludes hosted runs. toolsNote replaces unavailable catalogs. Platform MCP tools:kit_vocabulary.mcpApps; unsupported apps:mcp_server_create. Unknown app:400 with valid codes. Responses are cacheable public capability data; connectionStatus:not_checked is not live authorization. Recipes are not an allowlist: arbitrary sources/routed actions use the general catalog, argsSchema/result mapping, then kit_validate -> kit_publish(private) -> kit_install. Validation checks structure/grants, not live access. Action tool selection: action_worker_options. Detailed permission axes:kit_vocabulary." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    purpose: z.enum(["decision"]).optional().describe("Supported classification source recipes, with schemas and creation examples."),
    app: z.string().max(40).optional().describe(
      "One app code to read just that app's tools. Omit for every app."
    ),
  },
  path: `${API}/authoring/tools`,
  annotations: READ_ONLY,
};

// ─── About ──────────────────────────────────────────────────────────────────
//
// The one read that is not about kits: what WorkerKit is and when an agent
// should reach for it, written for the agent. First in the registry on purpose:
// a model reads tools/list top-down, and this is the tool that tells it whether
// the rest of the list applies to the request in front of it.

const ABOUT_SECTIONS = ["index", "why", "operate", "access", "cost", "start"] as const;

const workerkitAbout: ToolDescriptor = {
  name: "workerkit_about",
  title: "About WorkerKit",
  description:
    "Explain WorkerKit and lead the user into a first worker. index gives examples; start guides creation, missing-app setup and a first result. Covers Decision classification, Language work, permissioned Action calls and workflows of bound workers. Ask only missing choices; create before connecting apps where supported, then prompt setup from readiness/links. Other sections: why/operate/access/cost. Public anonymous read; creation uses authenticated Workers tools.",
  auth: "anonymous",
  method: "get",
  schema: {
    section: z.enum(ABOUT_SECTIONS).default("index").describe(
      "index (default): explain and choose a job. start: create the first worker. Fetch why/operate/access/cost only as needed."
    ),
  },
  path: `${API}/about`,
  annotations: READ_ONLY,
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const directoryDescriptors: readonly ToolDescriptor[] = [
  workerkitAbout,
  directoryOverview,
  searchKits,
  getKit,
  getPublisher,
  kitAuthoringGuide,
  kitVocabulary,
  kitAppTools,
];
