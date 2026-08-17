import { describe, expect, it } from "vitest";
import {
  allDescriptors,
  byName,
  directoryDescriptors,
  executeTool,
  manageDescriptors,
  type ApiResult,
  type PortEdenClient,
  type ToolDescriptor,
} from "../src/index.js";

// The wire contract, pinned per descriptor: for all 27 tools, executeTool
// against a recording fake client must produce exactly the {method, path,
// query/opts, body} the live server produces today. Expected values are
// derived from the server suite's manage-tools/directory tests so the two
// suites agree — a change that breaks one must break both.

interface RecordedCall {
  method: string;
  path: string;
  opts: { params?: Record<string, unknown>; body?: unknown; token?: string; signal?: AbortSignal };
}

const OK_RESULT: ApiResult = {
  status: 200,
  data: { ok: true },
  quota: { limit: null, used: null, remaining: null, retryAfter: null },
  requestId: "test",
};

function recordingClient(): { client: PortEdenClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record = (method: string) => async (path: string, opts: RecordedCall["opts"] = {}) => {
    calls.push({ method, path, opts });
    return OK_RESULT;
  };
  const client = {
    get: record("get"),
    post: record("post"),
    patch: record("patch"),
    put: record("put"),
    delete: record("delete"),
  } as unknown as PortEdenClient;
  return { client, calls };
}

async function run(
  descriptor: ToolDescriptor,
  params: Record<string, unknown>,
  token?: string
): Promise<RecordedCall> {
  const { client, calls } = recordingClient();
  await executeTool(client, descriptor, params, token !== undefined ? { token } : {});
  expect(calls).toHaveLength(1);
  return calls[0];
}

function d(name: string): ToolDescriptor {
  const descriptor = byName(name);
  if (!descriptor) throw new Error(`descriptor not found: ${name}`);
  return descriptor;
}

const RUN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OPERATOR_ID = "6e6f6f70-0000-4000-8000-000000000001";
const RESOURCE_ID = "6e6f6f70-0000-4000-8000-000000000002";

describe("registry", () => {
  it("ships exactly 22 manager + 5 anonymous descriptors, names unique, byName agrees", () => {
    expect(manageDescriptors).toHaveLength(22);
    expect(directoryDescriptors).toHaveLength(5);
    expect(allDescriptors).toHaveLength(27);
    const names = allDescriptors.map((x) => x.name);
    expect(new Set(names).size).toBe(27);
    for (const descriptor of allDescriptors) {
      expect(byName(descriptor.name)).toBe(descriptor);
    }
    expect(byName("nonexistent_tool")).toBeUndefined();
    for (const descriptor of manageDescriptors) expect(descriptor.auth).toBe("manager");
    for (const descriptor of directoryDescriptors) expect(descriptor.auth).toBe("anonymous");
  });

  it("pins {auth, method} for every one of the 27 descriptors", () => {
    // The full name → auth/method table. A new/renamed tool or a changed verb
    // must show up here explicitly — no descriptor ships with an unpinned method.
    expect(
      allDescriptors.map((x) => `${x.name} ${x.auth} ${x.method}`).sort()
    ).toEqual(
      [
        "workers_list manager get",
        "worker_get manager get",
        "worker_run manager post",
        "worker_runs manager get",
        "run_get manager get",
        "run_events manager get",
        "run_cancel manager post",
        "run_clear_digest manager delete",
        "run_score manager put",
        "memory_get manager get",
        "memory_add manager post",
        "memory_update manager patch",
        "memory_delete manager delete",
        "schedules_list manager get",
        "schedule_create manager post",
        "schedule_update manager patch",
        "schedule_delete manager delete",
        "instruction_get manager get",
        "instruction_set manager put",
        "worker_set_enabled manager post",
        "kit_install_preview manager get",
        "kit_install manager post",
        "directory_overview anonymous get",
        "kits_search anonymous get",
        "kit_get anonymous get",
        "kit_stats anonymous get",
        "publisher_get anonymous get",
      ].sort()
    );
  });
});

/** The body as it leaves the process: JSON.stringify drops undefined-valued keys. */
function wireBody(body: unknown): unknown {
  return JSON.parse(JSON.stringify(body));
}

describe("manager wire contract (mirrors the server manage-tools suite)", () => {
  it("workers_list GETs the fleet root", async () => {
    const c = await run(d("workers_list"), {}, "pe_mgr_unit_test");
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers");
    expect(c.opts.params).toEqual({});
    expect(c.opts.token).toBe("pe_mgr_unit_test");
  });

  it("worker_get embeds tokenId in the path and sends no query", async () => {
    const c = await run(d("worker_get"), { tokenId: 7 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/7");
    expect(c.opts.params).toEqual({});
  });

  it("worker_run POSTs prompt/modelSlug only (tokenId stays in the path)", async () => {
    const c = await run(d("worker_run"), { tokenId: 7, prompt: "do the thing" });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/7/run");
    expect(c.opts.body).toEqual({ prompt: "do the thing", modelSlug: undefined });
  });

  it("worker_runs strips tokenId from the query but keeps the filters", async () => {
    const c = await run(d("worker_runs"), { tokenId: 7, status: "failed", page: 2, pageSize: 10 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/7/runs");
    expect(c.opts.params).toEqual({ status: "failed", page: 2, pageSize: 10 });
  });

  it("run_get / run_cancel / run_clear_digest address runs by UUID", async () => {
    const g = await run(d("run_get"), { runId: RUN_ID });
    expect(g.method).toBe("get");
    expect(g.path).toBe(`/api/manage/workers/runs/${RUN_ID}`);
    expect(g.opts.params).toEqual({});

    const c = await run(d("run_cancel"), { runId: RUN_ID });
    expect(c.method).toBe("post");
    expect(c.path).toBe(`/api/manage/workers/runs/${RUN_ID}/cancel`);
    expect(c.opts.body).toEqual({});

    const del = await run(d("run_clear_digest"), { runId: RUN_ID });
    expect(del.method).toBe("delete");
    expect(del.path).toBe(`/api/manage/workers/runs/${RUN_ID}/digest`);
    // DELETE sends no body (executeTool contract).
    expect(del.opts.body).toBeUndefined();
  });

  it("run_score PUTs the grade, and null (clear) survives as null rather than being dropped", async () => {
    const set = await run(d("run_score"), { runId: RUN_ID, score: 40 });
    expect(set.method).toBe("put");
    expect(set.path).toBe(`/api/manage/workers/runs/${RUN_ID}/score`);
    expect(set.opts.body).toEqual({ score: 40 });

    const cleared = await run(d("run_score"), { runId: RUN_ID, score: null });
    expect(cleared.opts.body).toEqual({ score: null });
  });

  it("run_events strips runId from the query, keeps afterSeq/limit", async () => {
    const c = await run(d("run_events"), { runId: RUN_ID, afterSeq: 41, limit: 100 });
    expect(c.method).toBe("get");
    expect(c.path).toBe(`/api/manage/workers/runs/${RUN_ID}/events`);
    expect(c.opts.params).toEqual({ afterSeq: 41, limit: 100 });
  });

  it("memory_get GETs the memory block with an empty query", async () => {
    const c = await run(d("memory_get"), { tokenId: 3 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/3/memory");
    expect(c.opts.params).toEqual({});
  });

  it("memory_add routes kind=rule and kind=fact to their endpoints with a text-only body", async () => {
    const rule = await run(d("memory_add"), { tokenId: 3, kind: "rule", text: "Always CC finance." });
    expect(rule.method).toBe("post");
    expect(rule.path).toBe("/api/manage/workers/3/memory/rules");
    expect(rule.opts.body).toEqual({ text: "Always CC finance." });

    const fact = await run(d("memory_add"), { tokenId: 3, kind: "fact", text: "Fiscal year starts in Feb." });
    expect(fact.path).toBe("/api/manage/workers/3/memory/facts");
    expect(fact.opts.body).toEqual({ text: "Fiscal year starts in Feb." });
  });

  it("memory_update PATCHes the item with only the mutable fields", async () => {
    const c = await run(d("memory_update"), { tokenId: 3, itemId: 12, status: "retired" });
    expect(c.method).toBe("patch");
    expect(c.path).toBe("/api/manage/workers/3/memory/items/12");
    expect(c.opts.body).toEqual({ text: undefined, status: "retired", scope: undefined });
  });

  it("memory_delete / schedule_delete DELETE by path only", async () => {
    const m = await run(d("memory_delete"), { tokenId: 3, itemId: 12 });
    expect(m.method).toBe("delete");
    expect(m.path).toBe("/api/manage/workers/3/memory/items/12");
    expect(m.opts.body).toBeUndefined();

    const s = await run(d("schedule_delete"), { tokenId: 3, scheduleId: 5 });
    expect(s.method).toBe("delete");
    expect(s.path).toBe("/api/manage/workers/3/schedules/5");
    expect(s.opts.body).toBeUndefined();
  });

  it("schedules_list GETs the schedule list with an empty query", async () => {
    const c = await run(d("schedules_list"), { tokenId: 3 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/3/schedules");
    expect(c.opts.params).toEqual({});
  });

  it("schedule_create posts the schedule body without tokenId", async () => {
    const c = await run(d("schedule_create"), {
      tokenId: 3, scheduleType: "DailyAtTime", timeOfDayMinutes: 540, isEnabled: true,
    });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/3/schedules");
    expect(c.opts.body).toEqual({
      title: undefined,
      scheduleType: "DailyAtTime",
      intervalValue: undefined,
      timeOfDayMinutes: 540,
      timeZoneId: undefined,
      anchorUtc: undefined,
      isEnabled: true,
    });
  });

  it("schedule_update PATCHes without tokenId/scheduleId in the body and passes '' to clear the zone", async () => {
    const c = await run(d("schedule_update"), { tokenId: 3, scheduleId: 5, timeZoneId: "", isEnabled: false });
    expect(c.method).toBe("patch");
    expect(c.path).toBe("/api/manage/workers/3/schedules/5");
    const body = c.opts.body as Record<string, unknown>;
    expect(body.timeZoneId).toBe("");
    expect(body.isEnabled).toBe(false);
    expect(body).not.toHaveProperty("tokenId");
    expect(body).not.toHaveProperty("scheduleId");
    // The exact JSON that reaches the wire — nothing beyond the two edited fields.
    expect(wireBody(body)).toEqual({ timeZoneId: "", isEnabled: false });
  });

  it("instruction_get GETs by path; instruction_set PUTs the lean body without tokenId", async () => {
    const g = await run(d("instruction_get"), { tokenId: 3 });
    expect(g.method).toBe("get");
    expect(g.path).toBe("/api/manage/workers/3/instruction");
    expect(g.opts.params).toEqual({});

    const p = await run(d("instruction_set"), {
      tokenId: 3, content: "Do the weekly digest.", memoryProfile: "contextual",
    });
    expect(p.method).toBe("put");
    expect(p.path).toBe("/api/manage/workers/3/instruction");
    const body = p.opts.body as Record<string, unknown>;
    expect(body.content).toBe("Do the weekly digest.");
    expect(body.memoryProfile).toBe("contextual");
    expect(body).not.toHaveProperty("tokenId");
    expect(wireBody(body)).toEqual({ content: "Do the weekly digest.", memoryProfile: "contextual" });
  });

  it("worker_set_enabled POSTs {enabled} only", async () => {
    const c = await run(d("worker_set_enabled"), { tokenId: 3, enabled: false });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/3/enabled");
    expect(c.opts.body).toEqual({ enabled: false });
  });

  it("kit_install_preview GETs the kits route with the slug stripped from the query", async () => {
    const c = await run(d("kit_install_preview"), { slug: "inbox-triage", operatorId: OPERATOR_ID });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/kits/inbox-triage/install-preview");
    expect(c.opts.params).toEqual({ operatorId: OPERATOR_ID });
    expect(c.opts.params).not.toHaveProperty("slug");
  });

  it("kit_install POSTs the install form without the slug in the body", async () => {
    const c = await run(d("kit_install"), {
      slug: "inbox-triage",
      title: "My Triage Worker",
      categoryChoices: [{ categoryCode: "email", memberCode: "gmail", resourceId: RESOURCE_ID }],
      inputs: { "customer-name": "Acme" },
      memoryAnswers: { tone: "formal" },
    });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/kits/inbox-triage/install");
    const body = c.opts.body as Record<string, unknown>;
    expect(body.title).toBe("My Triage Worker");
    expect(body.categoryChoices).toEqual([
      { categoryCode: "email", memberCode: "gmail", resourceId: RESOURCE_ID },
    ]);
    expect(body.inputs).toEqual({ "customer-name": "Acme" });
    expect(body.memoryAnswers).toEqual({ tone: "formal" });
    expect(body).not.toHaveProperty("slug");
    expect(wireBody(body)).toEqual({
      title: "My Triage Worker",
      categoryChoices: [{ categoryCode: "email", memberCode: "gmail", resourceId: RESOURCE_ID }],
      inputs: { "customer-name": "Acme" },
      memoryAnswers: { tone: "formal" },
    });
  });

  it("kit slug schemas refuse dot segments and anything off the slug alphabet", () => {
    // encodeURIComponent leaves dots intact and the URL parser collapses "."/".."
    // segments before the request leaves the process — the schema is the guard.
    for (const name of ["kit_install_preview", "kit_install"]) {
      const slugSchema = d(name).schema.slug as { safeParse(v: unknown): { success: boolean } };
      for (const bad of ["..", ".", "a..b", "Inbox Triage", "UPPER", "-leading", ""]) {
        expect(slugSchema.safeParse(bad).success, `${name} should refuse "${bad}"`).toBe(false);
      }
      expect(slugSchema.safeParse("inbox-triage").success, name).toBe(true);
    }
  });

  it("forwards the caller's token on every manager call", async () => {
    for (const descriptor of manageDescriptors) {
      // Minimal params satisfying each path builder.
      const params: Record<string, unknown> = {
        tokenId: 1, runId: RUN_ID, itemId: 1, scheduleId: 1, kind: "rule",
        text: "x", slug: "a", content: "x", enabled: true, score: 1,
      };
      const c = await run(descriptor, params, "pe_mgr_token_pin");
      expect(c.opts.token, descriptor.name).toBe("pe_mgr_token_pin");
    }
  });
});

describe("anonymous wire contract (mirrors the server directory-tools suite)", () => {
  it("directory_overview GETs the composed overview endpoint once, with an empty query", async () => {
    const c = await run(d("directory_overview"), {});
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/directory/mcp/overview");
    expect(c.opts.params).toEqual({});
  });

  it("kits_search GETs the MCP wrapper list with query renamed to q and nothing else added", async () => {
    const c = await run(d("kits_search"), { query: "invoice", app: "email", page: 2, pageSize: 20 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/directory/mcp/kits");
    expect(c.opts.params).toEqual({ q: "invoice", app: "email", page: 2, pageSize: 20 });
    expect(c.opts.params).not.toHaveProperty("query");
  });

  it("kit_get builds the slug path, URL-encoding it, and forwards includeResourceBodies only", async () => {
    const c = await run(d("kit_get"), { slug: "a b", includeResourceBodies: true });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/directory/mcp/kits/a%20b");
    expect(c.opts.params).toEqual({ includeResourceBodies: true });
  });

  it("kit_stats builds the stats path with no query params", async () => {
    const c = await run(d("kit_stats"), { slug: "inbox-triage" });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/directory/mcp/kits/inbox-triage/stats");
    expect(c.opts.params).toEqual({});
  });

  it("publisher_get builds the publisher path and keeps slug out of the query", async () => {
    const c = await run(d("publisher_get"), { slug: "porteden", sort: "new", page: 1, pageSize: 20 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/directory/mcp/publishers/porteden");
    expect(c.opts.params).toEqual({ sort: "new", page: 1, pageSize: 20 });
  });

  it("passes no token through executeTool when none is given", async () => {
    for (const descriptor of directoryDescriptors) {
      const c = await run(descriptor, { slug: "a" });
      expect(c.opts.token, descriptor.name).toBeUndefined();
    }
  });
});

describe("pure presentation transforms (mapData / footer)", () => {
  it("kit_get mapData injects the SINGULAR /kit/ pageUrl and footer counts omitted bodies", () => {
    const descriptor = d("kit_get");
    const mapped = descriptor.mapData!(
      {
        slug: "inbox-triage",
        skillResources: [
          { key: "a", kind: "reference", name: "A", description: "d", contentLength: 120 },
          { key: "b", kind: "script", name: "B", description: "d", contentLength: 80 },
        ],
      },
      { slug: "inbox-triage", includeResourceBodies: false }
    ) as Record<string, unknown>;
    expect(mapped.pageUrl).toBe("https://workerkit.ai/kit/inbox-triage");
    expect(
      descriptor.footer!(mapped, { slug: "inbox-triage", includeResourceBodies: false })
    ).toBe("2 skillResources bodies omitted — call again with includeResourceBodies: true to read them");
    // Bodies requested and served — silent.
    const served = descriptor.mapData!(
      { slug: "s", skillResources: [{ key: "a", contentLength: 5, content: "hello" }] },
      { slug: "s", includeResourceBodies: true }
    ) as Record<string, unknown>;
    expect(descriptor.footer!(served, { slug: "s", includeResourceBodies: true })).toBeUndefined();
  });

  it("kits_search footer paginates and hints on empty; mapData refuses unexpected shapes", () => {
    const descriptor = d("kits_search");
    const truncated = { items: [{}], totalCount: 45, page: 1, pageSize: 20 };
    expect(descriptor.mapData!(truncated, {})).toBe(truncated);
    expect(descriptor.footer!(truncated, {})).toBe(
      "Showing page 1 of 3 (45 kits total) — call again with page: 2 for more"
    );
    const empty = { items: [], totalCount: 0, page: 1, pageSize: 20 };
    expect(descriptor.footer!(empty, {})).toContain("No kits matched.");
    const lastPage = { items: [{}], totalCount: 45, page: 3, pageSize: 20 };
    expect(descriptor.footer!(lastPage, {})).toBeUndefined();
    expect(descriptor.mapData!(null, {})).toBeUndefined();
    expect(descriptor.mapData!({ not: "a list" }, {})).toBeUndefined();
  });

  it("publisher_get mapData injects the /publishers/ pageUrl and footer uses the publisher-shaped empty hint", () => {
    const descriptor = d("publisher_get");
    const mapped = descriptor.mapData!(
      {
        publisher: { slug: "porteden", name: "PortEden", kitCount: 3 },
        kits: { items: [], totalCount: 0, page: 1, pageSize: 20 },
      },
      { slug: "porteden" }
    ) as Record<string, unknown>;
    expect(mapped.pageUrl).toBe("https://workerkit.ai/publishers/porteden");
    const footer = descriptor.footer!(mapped, { slug: "porteden" });
    expect(footer).toContain("currently lists no kits");
    expect(footer).not.toContain("No kits matched.");
  });
});
