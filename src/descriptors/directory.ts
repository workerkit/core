// The public kits-directory tools: anonymous, read-only catalog tools over the
// public directory API. Nine tools rather than one per REST endpoint — the about read
// (what WorkerKit is and when an agent should reach for it), one vocabulary
// call, one search, one dossier, one stats read, one publisher profile, and the
// three authoring reads (the guide, the permission vocabulary an author needs,
// and the explorer of what each app lets a worker do).
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

const API = "/api/directory/mcp";
const SITE = "https://workerkit.ai";

// ─── Shared phrasing ────────────────────────────────────────────────────────

const SLUG_HINT = "The kit's URL slug, as returned by kits_search (slug).";

// Appended to every tool: the two facts an agent must never get wrong on a
// public mount — no auth exists, and installing is out of its reach.
const DIRECTORY_NOTE =
  " Public and anonymous: results are identical for everyone, and nothing here installs or publishes. Install: a signed-in human on the kit's workerkit.ai page (offer the URL), or an agent with the installKits scope via kit_install_preview / kit_install on the WorkerKit Manager mount (/workers). Author: kit_authoring_guide + kit_vocabulary here, then kit_validate / kit_publish on /workers (publishKits scope).";

// The two authoring reads share one framing: they are what an agent reads BEFORE
// writing a kit for the manager surface, and they are anonymous so it can draft
// before it holds any credential.
const AUTHORING_NOTE =
  " Public and anonymous, identical for everyone. The kit is validated and published on the WorkerKit Manager mount (/workers): kit_validate (every section's verdict at once), then kit_publish — publishKits scope. Publish PRIVATE first (visibility 'private'): a private kit installs only on its own account (a signed-in human on its workerkit.ai page, or an agent via kit_install), which is also how a worker is created from scratch. A worker uses only apps CONNECTED on its operator (apps_list; app_connect for credential-based ones). An app the platform lacks is added as the account's own custom MCP app: mcp_server_create (credential included), mcp_server_set_tools, then content.mcpServers in the kit.";

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
    "The directory's vocabulary and scale in one call — call this FIRST when you need valid kits_search filter values or a map of what WorkerKit covers. Returns: kitCount (published kits right now); categories grouped as jobFamilies/roles/industries ({slug, name} — slugs feed the category/industry filters); apps ({code, name, categoryCode?, installable} — codes feed the app filter; installable:false means kits can show the app but an install cannot carry it); appCategories ({code, name, members:[{code, name, appCode}]} — codes feed the appCategory filter; members are what an installer picks between, e.g. Slack vs Teams); models ({model, normalized, kitCount} — pass normalized or any substring as the model filter); modelTypes ({code, name, summary} — 'language' | 'decision', each with its one-line summary; codes feed the modelType filter); sortOptions; triggerModes. Vocabulary only — it lists no kits: for 'what is popular', use kits_search with the default downloads sort. Kit pages for humans follow https://workerkit.ai/kit/{slug}." +
    DIRECTORY_NOTE,
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
    "Search and browse the public WorkerKit kits directory. A kit is a pre-built AI worker template — a job instruction plus exact, pre-scoped app permissions (and often schedules) — that a human installs as a working AI worker in one click. All filters AND together; every value is optional (omit everything to browse the whole catalog). Returns {items, totalCount, page, pageSize}; each card: slug (the key for kit_get), name, jobSentence (what the worker does, one line), publisherName/publisherSlug/isOfficialPublisher/verificationTier, apps (app codes it uses) + categorySlots (capability slots where the installer picks the app, e.g. Slack vs Teams), categories, triggerModes, downloadCount, starCount, modelScores (publisher-declared 0-100 fit per model, best first) + recommendedModel, modelType ('language' | 'decision' — see the filter), isProtected (publisher withholds the instruction TEXT; the kit still fully works — not a red flag), isFeatured, publishedAt. An empty result is not an error — see the footer it returns; valid category/app/appCategory/model filter values come from directory_overview. Kit page for humans: https://workerkit.ai/kit/{slug}." +
    DIRECTORY_NOTE,
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
      "Capability-category code, e.g. 'team-collaboration': matches kits that define that install-time slot OR pin one of its member apps — broader than the app filter. Unknown codes error (the error names the fix). Valid codes: directory_overview → appCategories."
    ),
    model: z.string().max(80).optional().describe(
      "Substring match on a scored model name, e.g. 'sonnet' or 'gpt'. Valid names: directory_overview → models."
    ),
    trigger: z.enum(["onDemand", "scheduled", "event"]).optional().describe(
      "How the kit's worker runs: onDemand (a human or agent triggers it), scheduled (ships recurring schedules), event (webhook-triggered)."
    ),
    modelType: z.enum(["language", "decision"]).optional().describe(
      "language = an instruction the installer runs on a model of their choice; decision = a routing table the decision model applies per item (triage, sorting, labelling, filtering — no instruction, no model to pick). Omit for both."
    ),
    publisher: z.string().optional().describe("Publisher slug (publisherSlug on any card) — that publisher's kits only."),
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
    "One kit's full public dossier — what a human, or an agent advising one, evaluates before installing. Fields: description + appDescriptions (the author's per-app / per-tool notes); modelType ('language', the default, or 'decision'); instructionContent — a language kit's job instruction VERBATIM, the core of what you are evaluating (empty when isProtected, with instructionLength still real; startCommand / endCommand / whenToUse are null on a protected kit, indistinguishable from 'none'); on a DECISION kit evaluate decisionNarration instead (what it reads, the questions it asks each item, the rules that route them, what happens below the confidence floor — served on protected kits too) and decisionSetup (the questions its installer answers); permissionsManifest — the EXACT data access an install grants (per-app operations / fields / scopes; the numeric value is authoritative, names are display) — summarize THIS when asked what the kit can touch; requiredInputs + memorySetup — the install form (fields the kit needs, questions whose answers become the worker's memory); memoryProfile ('contextual' = the worker sees its own recent runs) and selfFactsEnabled (it saves durable facts on its own); schedules / triggers / usageWindows; skillResources — reference docs the worker fetches on demand (key / kind / name always; description / contentLength unless protected; bodies via includeResourceBodies); hasExternalMcpShells — TRUE means installing creates an MCP gateway in the installer's account pointing at the publisher's own upstream URL (permissionsManifest.mcpServers.shells): surface it when recommending; scan — the security scan of the text being served: outcome 'cleared' or 'underReview' (both are live, installable listings — 'underReview' means a reviewer has not settled a raised check, never that the kit is unsafe), scannedAtUtc (null = published before the scanner existed, most of the catalog), checks (the families that ran on THIS kit — 'cleared' on ['static'] alone is weaker than on all three) and recommendation ('safe' | 'caution' | 'doNotInstall', the SCANNER's own advice, independent of outcome and possibly disagreeing with it: attribute it to SkillSpector, and read 'caution' as 'worth a look' — it is also emitted when the analysis was incomplete); scan is absent when there is nothing to report and never carries findings; modelScores (with notes), downloadCount / starCount, and pageUrl — the install page to hand to the human. 404 = no published kit with that slug." +
    DIRECTORY_NOTE,
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

const getKitStats: ToolDescriptor = {
  name: "kit_stats",
  title: "Get Kit Stats",
  description:
    "One kit's adoption over time: downloadCount (lifetime installs), dailyTrend (per-day installs over the trailing 30 days, UTC — sparse, omitted days are 0), lifetimeTrend (the whole history in at most 52 Monday-aligned buckets; buckets widen for older kits; counts sum to downloadCount). Use it to compare traction between shortlisted kits or to tell 'popular lately' from 'popular once' — the cards' downloadCount alone cannot." +
    DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    slug: z.string().min(1).describe(SLUG_HINT),
  },
  path: (params) => `${API}/kits/${encodeURIComponent(String(params.slug))}/stats`,
  paramFilter: () => ({}),
  annotations: READ_ONLY,
};

const getPublisher: ToolDescriptor = {
  name: "publisher_get",
  title: "Get Publisher",
  description:
    "A kit publisher's public profile + their published kits — the 'who is behind this?' trust check. Returns {publisher, kits, pageUrl}: publisher has name, isOfficial (published by WorkerKit itself), verification handles (xHandle → x.com/{handle}, gitHubHandle → github.com/{handle}, linkedInUrl), description, createDate (member since), kitCount and totalDownloads (published kits only); kits is the same paginated card list kits_search returns, scoped to this publisher. 404 = unknown slug OR a publisher with nothing currently published." +
    DIRECTORY_NOTE,
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

const GUIDE_SECTIONS = ["index", "decision", "schema", "rules", "skill", "slots", "instruction", "example", "selfcheck"] as const;

const kitAuthoringGuide: ToolDescriptor = {
  name: "kit_authoring_guide",
  title: "Kit Authoring Guide",
  description:
    "Author a WorkerKit kit or decision worker. For classification, scoring, filtering or triage, read section decision: source recipes, typed questions, creation examples and result handling. For full kit authoring read index, then schema; fetch other sections as needed. Returns one markdown section and a table of contents. Live source capabilities are on kit_app_tools; exact permission keys are on kit_vocabulary." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    section: z.enum(GUIDE_SECTIONS).default("index").describe(
      "Which section to read. index (default) is the table of contents plus how to use the guide; schema and rules are the two an author cannot skip."
    ),
  },
  path: `${API}/authoring/guide`,
  annotations: READ_ONLY,
};

const kitVocabulary: ToolDescriptor = {
  name: "kit_vocabulary",
  title: "Kit Authoring Vocabulary",
  description:
    "The live vocabulary a kit's permission manifest accepts — read it before writing content.apps / content.categorySlots / categorySlugs: every key is validated strictly and there is no 'all' shorthand. Without app: apps[] (per surface: code, name, summary, operations = the tool KEYS you grant, fields, and every axis it supports — readOperations, masterAccessLevels, writableFields, providers, channels, objectTypes, scopePolicies, contentTypeScopes, capabilities, supportsAllowAll, supportsWriteEnabled, subApps, installable), concreteApps[] (vendor tiles such as Gmail, Monday or Google Sheets, kind standalone | provider | slotMember | subApp — how each lands in content), appCategories[] (the capability slots: members, labelAlias, genericName), categories {jobFamilies, roles, industries} (the ONLY valid categorySlugs), models[], mcpApps[] (platform MCP apps a kit binds via content.mcpServers — id is the gatewayId, tools[].toolId the toolIds; the account's OWN servers are mcp_servers_list on /workers) and note. With app=<code>: that ONE surface as {app, vendors, tools, note}, tools being what an installed worker sees — each {name (cite it in the instruction), description, readOnly, requires (grant one of these keys under operations to get the tool)}; toolsNote replaces tools where no catalog covers the surface. The full read is large: take it once per authoring task, then per-app reads for the surfaces you use; kit_app_tools is the one-call view of what every app can do. Unknown app = 400 naming every valid code." +
    AUTHORING_NOTE,
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
    "Discover what connected-app tools a worker can use. For classification, categorization, scoring or triage, set purpose:decision: returns supported source recipes, evidence fields, argument schemas, read permissions, limitations and a ready-to-edit decision_worker_create example. Optional app narrows results (email, calendar, drive for decision recipes). Public capabilities only; apps_list checks account connections. Without purpose returns app tools and permission keys; use kit_vocabulary for detailed permission axes." + DIRECTORY_NOTE,
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
    "What WorkerKit does and when to use it. Workers run classification, scoring, triage, monitoring and other jobs with their own app access, budget and receipts. Read one section: index, why, operate, access, cost or start. For a custom classifier start with kit_app_tools(purpose:decision) and kit_authoring_guide(section:decision), then decision_worker_create. Existing templates are on kits_search; use modelType:decision for classifiers. Account scopes are on key_info." + DIRECTORY_NOTE,
  auth: "anonymous",
  method: "get",
  schema: {
    section: z.enum(ABOUT_SECTIONS).default("index").describe(
      "Which section to read. index (default) is the one-read summary plus the table of contents; why and start are the two to read before recommending WorkerKit to a user."
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
  getKitStats,
  getPublisher,
  kitAuthoringGuide,
  kitVocabulary,
  kitAppTools,
];
