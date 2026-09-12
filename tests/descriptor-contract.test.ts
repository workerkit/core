import { describe, expect, it } from "vitest";
import {
  allDescriptors,
  byName,
  directoryDescriptors,
  executeTool,
  manageDescriptors,
  z,
  type ApiResult,
  type PortEdenClient,
  type ToolDescriptor,
} from "../src/index.js";

// The wire contract, pinned per descriptor: for all 88 tools, executeTool
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
  it("ships exactly 79 manager + 9 anonymous descriptors, names unique, byName agrees", () => {
    expect(manageDescriptors).toHaveLength(79);
    expect(directoryDescriptors).toHaveLength(9);
    expect(allDescriptors).toHaveLength(88);
    const names = allDescriptors.map((x) => x.name);
    expect(new Set(names).size).toBe(88);
    for (const descriptor of allDescriptors) {
      expect(byName(descriptor.name)).toBe(descriptor);
    }
    expect(byName("nonexistent_tool")).toBeUndefined();
    for (const descriptor of manageDescriptors) expect(descriptor.auth).toBe("manager");
    for (const descriptor of directoryDescriptors) expect(descriptor.auth).toBe("anonymous");
  });

  it("pins {auth, method} for every one of the 88 descriptors", () => {
    // The full name → auth/method table. A new/renamed tool or a changed verb
    // must show up here explicitly — no descriptor ships with an unpinned method.
    expect(
      allDescriptors.map((x) => `${x.name} ${x.auth} ${x.method}`).sort()
    ).toEqual(
      [
        "key_info manager get",
        "workers_list manager get",
        "worker_get manager get",
        "worker_run manager post",
        "run_bulk manager post",
        "runs_feed manager get",
        "fleet_pulse manager get",
        "fleet_health manager get",
        "account_usage manager get",
        "worker_runs manager get",
        "run_get manager get",
        "run_events manager get",
        "run_transcript manager get",
        "run_question manager get",
        "run_answer manager post",
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
        "delivery_list manager get",
        "delivery_channels manager get",
        "delivery_create manager post",
        "delivery_update manager patch",
        "delivery_secret_rotate manager post",
        "delivery_delete manager delete",
        "instruction_get manager get",
        "instruction_set manager put",
        "instruction_versions manager get",
        "instruction_version_get manager get",
        "instruction_restore manager post",
        "worker_set_enabled manager post",
        "worker_delete manager delete",
        "kit_install_preview manager get",
        "kit_install manager post",
        "worker_clone_preview manager post",
        "worker_clone manager post",
        "worker_clone_bulk manager post",
        "budget_get manager get",
        "budget_set manager patch",
        "fleet_budget_get manager get",
        "fleet_budget_set manager patch",
        "worker_permissions_get manager get",
        "models_list manager get",
        "deployments_list manager get",
        "deployment_get manager get",
        "worker_deploy manager post",
        "deployment_update manager patch",
        "worker_undeploy manager delete",
        "publisher_get_mine manager get",
        "publisher_set manager put",
        "my_kits_list manager get",
        "kit_validate manager post",
        "kit_publish manager post",
        "kit_update manager patch",
        "kit_replace manager put",
        "kit_scan_get manager get",
        "kit_unpublish manager post",
        "kit_relist manager post",
        "kit_make_private manager post",
        "kit_delete manager delete",
        "apps_list manager get",
        "app_connect manager post",
        "app_disconnect manager delete",
        "model_keys_list manager get",
        "model_key_set manager put",
        "model_key_delete manager delete",
        "mcp_servers_list manager get",
        "mcp_server_get manager get",
        "mcp_server_create manager post",
        "mcp_server_discover manager post",
        "mcp_server_set_tools manager put",
        "mcp_server_delete manager delete",
        "workerkit_about anonymous get",
        "directory_overview anonymous get",
        "kits_search anonymous get",
        "kit_get anonymous get",
        "kit_stats anonymous get",
        "kit_authoring_guide anonymous get",
        "kit_vocabulary anonymous get",
        "kit_app_tools anonymous get",
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
  it("workers_list GETs the fleet root, filters straight through as query", async () => {
    const c = await run(d("workers_list"), {}, "pe_mgr_unit_test");
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers");
    expect(c.opts.params).toEqual({});
    expect(c.opts.token).toBe("pe_mgr_unit_test");

    const f = await run(d("workers_list"), { status: "active", deployed: false, readiness: "blocked", q: "invoice" });
    expect(f.path).toBe("/api/manage/workers");
    expect(f.opts.params).toEqual({ status: "active", deployed: false, readiness: "blocked", q: "invoice" });
  });

  it("fleet_health and account_usage GET their account-wide routes with an empty query", async () => {
    const h = await run(d("fleet_health"), {});
    expect(h.method).toBe("get");
    expect(h.path).toBe("/api/manage/workers/fleet/health");
    expect(h.opts.params).toEqual({});

    const u = await run(d("account_usage"), {});
    expect(u.method).toBe("get");
    expect(u.path).toBe("/api/manage/workers/account/usage");
    expect(u.opts.params).toEqual({});
  });

  it("runs_feed and worker_runs both accept awaitingInput as a status", () => {
    for (const name of ["runs_feed", "worker_runs"]) {
      const status = d(name).schema.status as z.ZodTypeAny;
      expect(status.safeParse("awaitingInput").success).toBe(true);
      expect(status.safeParse("cancelled").success).toBe(false);
    }
  });

  it("key_info GETs the key-info route with an empty query", async () => {
    const c = await run(d("key_info"), {}, "pe_mgr_unit_test");
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/key-info");
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

  it("runs_feed is account-wide: no worker id in the path, filters straight through as query", async () => {
    const c = await run(d("runs_feed"), { status: "settled", cursor: "opaque-cursor", limit: 50 });
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/runs");
    expect(c.opts.params).toEqual({ status: "settled", cursor: "opaque-cursor", limit: 50 });
  });

  it("fleet_pulse GETs the account pulse with an empty query", async () => {
    const c = await run(d("fleet_pulse"), {});
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/fleet/pulse");
    expect(c.opts.params).toEqual({});
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

  it("run_transcript GETs the run's transcript with an empty query", async () => {
    const c = await run(d("run_transcript"), { runId: RUN_ID });
    expect(c.method).toBe("get");
    expect(c.path).toBe(`/api/manage/workers/runs/${RUN_ID}/transcript`);
    expect(c.opts.params).toEqual({});
  });

  it("run_bulk POSTs the workers array to the account-wide bulk route and nothing else", async () => {
    const WORKER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const workers = [
      { workerId: WORKER_ID, prompt: "chase invoices" },
      { tokenId: 7, modelSlug: "gemini-2.5-flash" },
    ];
    const c = await run(d("run_bulk"), { workers });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/runs/bulk");
    expect(wireBody(c.opts.body)).toEqual({ workers });
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

  it("run_question GETs the question route with an empty query; run_answer POSTs {answer} to /input", async () => {
    const q = await run(d("run_question"), { runId: RUN_ID });
    expect(q.method).toBe("get");
    expect(q.path).toBe(`/api/manage/workers/runs/${RUN_ID}/question`);
    expect(q.opts.params).toEqual({});

    const a = await run(d("run_answer"), { runId: RUN_ID, answer: "Use the Acme account." });
    expect(a.method).toBe("post");
    // The answer route is /input, NOT /question — reading and answering are different paths.
    expect(a.path).toBe(`/api/manage/workers/runs/${RUN_ID}/input`);
    expect(a.opts.body).toEqual({ answer: "Use the Acme account." });
    // runId stays in the path; the body carries the answer alone.
    expect(a.opts.body).not.toHaveProperty("runId");
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

  it("delivery_list / delivery_channels GET their routes with an empty query", async () => {
    const list = await run(d("delivery_list"), { tokenId: 3 });
    expect(list.method).toBe("get");
    expect(list.path).toBe("/api/manage/workers/3/deliveries");
    expect(list.opts.params).toEqual({});

    const channels = await run(d("delivery_channels"), { tokenId: 3 });
    expect(channels.method).toBe("get");
    expect(channels.path).toBe("/api/manage/workers/3/deliveries/channels");
    expect(channels.opts.params).toEqual({});
  });

  it("delivery_create POSTs the destination without tokenId, target nested verbatim", async () => {
    const c = await run(d("delivery_create"), {
      tokenId: 3,
      channel: "slack",
      condition: "failureOnly",
      contentMode: "summary",
      target: { channelId: "C0123", workspaceId: "T0456" },
      isEnabled: true,
    });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/3/deliveries");
    const body = c.opts.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("tokenId");
    expect(wireBody(body)).toEqual({
      channel: "slack",
      condition: "failureOnly",
      contentMode: "summary",
      target: { channelId: "C0123", workspaceId: "T0456" },
      isEnabled: true,
    });
  });

  it("delivery_update PATCHes by id and carries NO channel — the channel is immutable", async () => {
    const c = await run(d("delivery_update"), { tokenId: 3, deliveryId: 9, isEnabled: false });
    expect(c.method).toBe("patch");
    expect(c.path).toBe("/api/manage/workers/3/deliveries/9");
    const body = c.opts.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("channel");
    expect(body).not.toHaveProperty("tokenId");
    expect(body).not.toHaveProperty("deliveryId");
    expect(wireBody(body)).toEqual({ isEnabled: false });
    // No channel parameter exists to send in the first place.
    expect(d("delivery_update").schema).not.toHaveProperty("channel");
  });

  it("delivery_delete DELETEs by path only", async () => {
    const c = await run(d("delivery_delete"), { tokenId: 3, deliveryId: 9 });
    expect(c.method).toBe("delete");
    expect(c.path).toBe("/api/manage/workers/3/deliveries/9");
    expect(c.opts.body).toBeUndefined();
  });

  it("the instruction-history trio addresses versions by number; restore POSTs an empty body", async () => {
    const list = await run(d("instruction_versions"), { tokenId: 3 });
    expect(list.method).toBe("get");
    expect(list.path).toBe("/api/manage/workers/3/instruction/versions");
    expect(list.opts.params).toEqual({});

    const one = await run(d("instruction_version_get"), { tokenId: 3, versionNumber: 4 });
    expect(one.method).toBe("get");
    expect(one.path).toBe("/api/manage/workers/3/instruction/versions/4");
    expect(one.opts.params).toEqual({});

    const restored = await run(d("instruction_restore"), { tokenId: 3, versionNumber: 4 });
    expect(restored.method).toBe("post");
    expect(restored.path).toBe("/api/manage/workers/3/instruction/versions/4/restore");
    expect(restored.opts.body).toEqual({});
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

  it("worker_clone_preview and worker_clone POST the same body to /clone/preview and /clone", async () => {
    const params = {
      tokenId: 7,
      title: "Triage — EMEA",
      includeInstruction: true,
      includeMemory: true,
      includeSchedules: true,
      includeDeliveries: false,
      includeDeployment: true,
      resourceId: RESOURCE_ID,
    };

    const preview = await run(d("worker_clone_preview"), params);
    expect(preview.method).toBe("post");
    expect(preview.path).toBe("/api/manage/workers/7/clone/preview");

    const clone = await run(d("worker_clone"), params);
    expect(clone.method).toBe("post");
    expect(clone.path).toBe("/api/manage/workers/7/clone");

    // One body shape serves both, and tokenId never leaves the path.
    const expected = {
      title: "Triage — EMEA",
      includeInstruction: true,
      includeMemory: true,
      includeSchedules: true,
      includeDeliveries: false,
      includeDeployment: true,
      resourceId: RESOURCE_ID,
    };
    expect(wireBody(preview.opts.body)).toEqual(expected);
    expect(wireBody(clone.opts.body)).toEqual(expected);
    expect(clone.opts.body).not.toHaveProperty("tokenId");
  });

  it("worker_clone_bulk nests the entries under workers[] and sends nothing else", async () => {
    const c = await run(d("worker_clone_bulk"), {
      tokenId: 7,
      workers: [
        { title: "Triage — EMEA", includeSchedules: false },
        { title: "Triage — APAC" },
      ],
    });
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/workers/7/clone/bulk");
    expect(wireBody(c.opts.body)).toEqual({
      workers: [
        { title: "Triage — EMEA", includeSchedules: false },
        { title: "Triage — APAC" },
      ],
    });
    expect(c.opts.body).not.toHaveProperty("tokenId");
  });

  it("budget_get GETs with an empty query; budget_set PATCHes only the fields sent", async () => {
    const g = await run(d("budget_get"), { tokenId: 7 });
    expect(g.method).toBe("get");
    expect(g.path).toBe("/api/manage/workers/7/budget");
    expect(g.opts.params).toEqual({});

    const s = await run(d("budget_set"), { tokenId: 7, maxRunsPerDay: 25 });
    expect(s.method).toBe("patch");
    expect(s.path).toBe("/api/manage/workers/7/budget");
    const body = s.opts.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("tokenId");
    // Omitted = unchanged: the untouched ceilings must not reach the wire at all.
    expect(wireBody(body)).toEqual({ maxRunsPerDay: 25 });
  });

  it("fleet_budget_get/set are account-wide: no worker id, and the clear flags survive", async () => {
    const g = await run(d("fleet_budget_get"), {});
    expect(g.method).toBe("get");
    expect(g.path).toBe("/api/manage/workers/fleet/budget");
    expect(g.opts.params).toEqual({});

    const s = await run(d("fleet_budget_set"), {
      maxUsdPerMonth: 250,
      clearMaxUsdPerDay: true,
      clearMaxUsdPerMonth: false,
    });
    expect(s.method).toBe("patch");
    expect(s.path).toBe("/api/manage/workers/fleet/budget");
    // clearMaxUsdPerDay:true and clearMaxUsdPerMonth:false are both meaningful —
    // false must survive as false, and an absent ceiling must stay absent.
    expect(wireBody(s.opts.body)).toEqual({
      maxUsdPerMonth: 250,
      clearMaxUsdPerDay: true,
      clearMaxUsdPerMonth: false,
    });
  });

  it("models_list GETs the catalog and passes kitSlug through as query; deployments_list takes no worker id", async () => {
    const m = await run(d("models_list"), { kitSlug: "inbox-triage" });
    expect(m.method).toBe("get");
    expect(m.path).toBe("/api/manage/workers/models");
    expect(m.opts.params).toEqual({ kitSlug: "inbox-triage" });

    const l = await run(d("deployments_list"), {});
    expect(l.method).toBe("get");
    expect(l.path).toBe("/api/manage/workers/deployments");
    expect(l.opts.params).toEqual({});
  });

  it("the deployment lane is four verbs on one route: get, post, patch, delete", async () => {
    // One resource path carries the whole lifecycle, so the verb is the only thing
    // separating a read from a deploy from a teardown — pin all four.
    const g = await run(d("deployment_get"), { tokenId: 7 });
    expect(g.method).toBe("get");
    expect(g.path).toBe("/api/manage/workers/7/deployment");
    // tokenId addresses the path; it must not also leak into the query.
    expect(g.opts.params).toEqual({});

    const p = await run(d("worker_deploy"), {
      tokenId: 7,
      modelSlug: "some-model",
      maxUsdPerRun: 0.5,
      thinking: "1024",
    });
    expect(p.method).toBe("post");
    expect(p.path).toBe("/api/manage/workers/7/deployment");
    const deployBody = p.opts.body as Record<string, unknown>;
    expect(deployBody).not.toHaveProperty("tokenId");
    // Everything is optional: an unsent ceiling must stay off the wire so the
    // platform default applies rather than a null overwriting it.
    expect(wireBody(deployBody)).toEqual({
      modelSlug: "some-model",
      maxUsdPerRun: 0.5,
      thinking: "1024",
    });

    const u = await run(d("deployment_update"), { tokenId: 7, action: "pause" });
    expect(u.method).toBe("patch");
    expect(u.path).toBe("/api/manage/workers/7/deployment");
    // Omitted = unchanged: pausing must not restate (and so reset) the model or ceilings.
    expect(wireBody(u.opts.body)).toEqual({ action: "pause" });

    const x = await run(d("worker_undeploy"), { tokenId: 7 });
    expect(x.method).toBe("delete");
    expect(x.path).toBe("/api/manage/workers/7/deployment");
    expect(x.opts.body).toBeUndefined();
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
        deliveryId: 1, versionNumber: 1, channel: "slack", target: { channelId: "C1" },
        answer: "x", title: "x", workers: [{ title: "x" }], kitRef: "my-kit",
      };
      const c = await run(descriptor, params, "pe_mgr_token_pin");
      expect(c.opts.token, descriptor.name).toBe("pe_mgr_token_pin");
    }
  });
});

describe("kit authoring wire contract (the publishKits lane + the permissions read)", () => {
  const body = {
    name: "Standup Digest",
    jobSentence: "Compiles the standup digest.",
    categorySlugs: ["reporting"],
    visibility: "private",
    content: { instructionContent: "You are [worker-name].", appCodes: ["email"] },
  };

  it("worker_permissions_get GETs the worker's permissions with an empty query", async () => {
    const c = await run(d("worker_permissions_get"), { tokenId: 42 }, "t");
    expect(c.method).toBe("get");
    expect(c.path).toBe("/api/manage/workers/42/permissions");
    expect(c.opts.params).toEqual({});
  });

  it("publisher_get_mine / publisher_set / my_kits_list hit the literal routes beside {slug}", async () => {
    expect((await run(d("publisher_get_mine"), {}, "t")).path).toBe("/api/manage/kits/publisher");
    expect((await run(d("my_kits_list"), {}, "t")).path).toBe("/api/manage/kits/mine");
    const c = await run(d("publisher_set"), { name: "Acme", isListed: false }, "t");
    expect(c.method).toBe("put");
    expect(c.path).toBe("/api/manage/kits/publisher");
    expect(wireBody(c.opts.body)).toEqual({ name: "Acme", isListed: false });
  });

  it("kit_publish POSTs the body verbatim to the kits root", async () => {
    const c = await run(d("kit_publish"), body, "t");
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/kits");
    expect(wireBody(c.opts.body)).toEqual(body);
  });

  it("kit_validate POSTs the same body, with kitRef promoted to the query and kept out of the body", async () => {
    const fresh = await run(d("kit_validate"), body, "t");
    expect(fresh.path).toBe("/api/manage/kits/validate");
    expect(wireBody(fresh.opts.body)).toEqual(body);

    const replacing = await run(d("kit_validate"), { ...body, kitRef: "my kit" }, "t");
    expect(replacing.method).toBe("post");
    expect(replacing.path).toBe("/api/manage/kits/validate?kitRef=my%20kit");
    expect(wireBody(replacing.opts.body)).toEqual(body);
  });

  it("kit_update PATCHes and kit_replace PUTs the slug route, both without kitRef in the body", async () => {
    const u = await run(d("kit_update"), { kitRef: "my-kit", name: "Renamed", contactAllowAll: false }, "t");
    expect(u.method).toBe("patch");
    expect(u.path).toBe("/api/manage/kits/my-kit");
    expect(wireBody(u.opts.body)).toEqual({ name: "Renamed", contactAllowAll: false });

    const r = await run(d("kit_replace"), { kitRef: "my-kit", ...body }, "t");
    expect(r.method).toBe("put");
    expect(r.path).toBe("/api/manage/kits/my-kit");
    expect(wireBody(r.opts.body)).toEqual(body);
  });

  it("the lifecycle POSTs send an empty body and kit_delete sends none", async () => {
    for (const [name, suffix] of [["kit_unpublish", "/unpublish"], ["kit_relist", "/relist"], ["kit_make_private", "/make-private"]]) {
      const c = await run(d(name), { kitRef: "my-kit" }, "t");
      expect(c.method, name).toBe("post");
      expect(c.path, name).toBe(`/api/manage/kits/my-kit${suffix}`);
      expect(wireBody(c.opts.body), name).toEqual({});
    }
    const del = await run(d("kit_delete"), { kitRef: "my-kit" }, "t");
    expect(del.method).toBe("delete");
    expect(del.path).toBe("/api/manage/kits/my-kit");
    expect(del.opts.body).toBeUndefined();

    const scan = await run(d("kit_scan_get"), { kitRef: "my-kit" }, "t");
    expect(scan.path).toBe("/api/manage/kits/my-kit/scan");
    expect(scan.opts.params).toEqual({});
  });
});

describe("connected apps + model keys wire contract (the manageConnections lane)", () => {
  const OPERATOR = "6e6f6f70-0000-4000-8000-00000000000a";

  it("apps_list GETs the apps root, with operatorId as the only query param", async () => {
    const all = await run(d("apps_list"), {}, "t");
    expect(all.method).toBe("get");
    expect(all.path).toBe("/api/manage/apps");
    expect(all.opts.params).toEqual({});
    const one = await run(d("apps_list"), { operatorId: OPERATOR }, "t");
    expect(one.opts.params).toEqual({ operatorId: OPERATOR });
  });

  it("app_connect POSTs the provider route with the credential, label and operator in the body — never the provider", async () => {
    const c = await run(d("app_connect"), { provider: "mcp:apify", credential: { token: "x" }, label: "ops", operatorId: OPERATOR }, "t");
    expect(c.method).toBe("post");
    expect(c.path).toBe("/api/manage/apps/mcp%3Aapify/connect");
    expect(wireBody(c.opts.body)).toEqual({ credential: { token: "x" }, label: "ops", operatorId: OPERATOR });
    const bare = await run(d("app_connect"), { provider: "telegram", credential: { botToken: "1:a" } }, "t");
    expect(wireBody(bare.opts.body)).toEqual({ credential: { botToken: "1:a" } });
  });

  it("app_disconnect DELETEs the connection route, promoting the optional operator to the query", async () => {
    const c = await run(d("app_disconnect"), { provider: "telegram", connectionId: "123 456" }, "t");
    expect(c.method).toBe("delete");
    expect(c.path).toBe("/api/manage/apps/telegram/connections/123%20456");
    expect(c.opts.body).toBeUndefined();
    const scoped = await run(d("app_disconnect"), { provider: "telegram", connectionId: "5", operatorId: OPERATOR }, "t");
    expect(scoped.path).toBe(`/api/manage/apps/telegram/connections/5?operatorId=${OPERATOR}`);
  });

  it("model keys: list GETs with includeRevoked, set PUTs {apiKey, label} to the provider route, delete sends no body", async () => {
    const list = await run(d("model_keys_list"), { includeRevoked: true }, "t");
    expect(list.path).toBe("/api/manage/model-keys");
    expect(list.opts.params).toEqual({ includeRevoked: true });

    const set = await run(d("model_key_set"), { provider: "Anthropic", apiKey: "sk-ant-12345678", label: "prod" }, "t");
    expect(set.method).toBe("put");
    expect(set.path).toBe("/api/manage/model-keys/Anthropic");
    expect(wireBody(set.opts.body)).toEqual({ apiKey: "sk-ant-12345678", label: "prod" });

    const del = await run(d("model_key_delete"), { provider: "google" }, "t");
    expect(del.method).toBe("delete");
    expect(del.path).toBe("/api/manage/model-keys/google");
    expect(del.opts.body).toBeUndefined();
  });
});

describe("custom MCP servers wire contract (the account's own MCP apps, same lane)", () => {
  const GATEWAY = "6e6f6f70-0000-4000-8000-00000000000b";
  const OPERATOR = "6e6f6f70-0000-4000-8000-00000000000a";

  it("mcp_servers_list GETs the root with no query; mcp_server_get GETs the handle", async () => {
    const list = await run(d("mcp_servers_list"), {}, "t");
    expect(list.method).toBe("get");
    expect(list.path).toBe("/api/manage/mcp-servers");
    expect(list.opts.params).toEqual({});

    const one = await run(d("mcp_server_get"), { gatewayId: GATEWAY }, "t");
    expect(one.method).toBe("get");
    expect(one.path).toBe(`/api/manage/mcp-servers/${GATEWAY}`);
    expect(one.opts.params).toEqual({});
  });

  it("mcp_server_create POSTs the root with only what was given (the server defaults the rest) and the credential in the body", async () => {
    const bare = await run(d("mcp_server_create"), { name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp" }, "t");
    expect(bare.method).toBe("post");
    expect(bare.path).toBe("/api/manage/mcp-servers");
    expect(wireBody(bare.opts.body)).toEqual({ name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp" });

    const full = await run(d("mcp_server_create"), {
      name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp", authType: "Bearer", credentialScope: "account",
      credential: { token: "x" }, operatorId: OPERATOR, connectionInstructions: "Settings → API", oauthScopes: "read", callTimeoutSeconds: 30,
    }, "t");
    expect(wireBody(full.opts.body)).toEqual({
      name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp", authType: "Bearer", credentialScope: "account",
      credential: { token: "x" }, operatorId: OPERATOR, connectionInstructions: "Settings → API", oAuthScopes: "read", callTimeoutSeconds: 30,
    });
  });

  it("mcp_server_create's schema pins the auth types and credential scopes the server accepts", () => {
    const schema = z.object(d("mcp_server_create").schema);
    const ok = schema.safeParse({ name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ authType: "None", credentialScope: "operator" });
    expect(schema.safeParse({ name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp", authType: "Magic" }).success).toBe(false);
    expect(schema.safeParse({ name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp", credentialScope: "team" }).success).toBe(false);
    for (const authType of ["None", "Bearer", "ApiKeyHeader", "ApiKeyQuery", "Basic", "CustomHeaders", "McpOAuth"]) {
      expect(schema.safeParse({ name: "Acme", upstreamUrl: "https://mcp.acme.test/mcp", authType }).success, authType).toBe(true);
    }
  });

  it("mcp_server_discover and mcp_server_set_tools address the handle and carry only their body", async () => {
    const discover = await run(d("mcp_server_discover"), { gatewayId: GATEWAY, operatorId: OPERATOR }, "t");
    expect(discover.method).toBe("post");
    expect(discover.path).toBe(`/api/manage/mcp-servers/${GATEWAY}/discover`);
    expect(wireBody(discover.opts.body)).toEqual({ operatorId: OPERATOR });
    const bareDiscover = await run(d("mcp_server_discover"), { gatewayId: GATEWAY }, "t");
    expect(wireBody(bareDiscover.opts.body)).toEqual({});

    const tools = await run(d("mcp_server_set_tools"), { gatewayId: GATEWAY, enabledToolIds: [12, 34] }, "t");
    expect(tools.method).toBe("put");
    expect(tools.path).toBe(`/api/manage/mcp-servers/${GATEWAY}/tools`);
    expect(wireBody(tools.opts.body)).toEqual({ enabledToolIds: [12, 34] });
  });

  it("mcp_server_delete DELETEs the handle with no body", async () => {
    const del = await run(d("mcp_server_delete"), { gatewayId: GATEWAY }, "t");
    expect(del.method).toBe("delete");
    expect(del.path).toBe(`/api/manage/mcp-servers/${GATEWAY}`);
    expect(del.opts.body).toBeUndefined();
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

  it("kit_authoring_guide and kit_vocabulary GET the authoring routes with their one query param", async () => {
    const guide = await run(d("kit_authoring_guide"), { section: "schema" });
    expect(guide.method).toBe("get");
    expect(guide.path).toBe("/api/directory/mcp/authoring/guide");
    expect(guide.opts.params).toEqual({ section: "schema" });

    const all = await run(d("kit_vocabulary"), {});
    expect(all.path).toBe("/api/directory/mcp/authoring/vocabulary");
    expect(all.opts.params).toEqual({});
    const one = await run(d("kit_vocabulary"), { app: "email" });
    expect(one.opts.params).toEqual({ app: "email" });

    const tools = await run(d("kit_app_tools"), {});
    expect(tools.method).toBe("get");
    expect(tools.path).toBe("/api/directory/mcp/authoring/tools");
    expect(tools.opts.params).toEqual({});
    expect((await run(d("kit_app_tools"), { app: "slack" })).opts.params).toEqual({ app: "slack" });
  });

  it("workerkit_about GETs the about route, first in the registry, with its one query param", async () => {
    expect(directoryDescriptors[0].name).toBe("workerkit_about");

    const index = await run(d("workerkit_about"), {});
    expect(index.method).toBe("get");
    expect(index.path).toBe("/api/directory/mcp/about");
    expect(index.opts.params).toEqual({});
    expect((await run(d("workerkit_about"), { section: "why" })).opts.params).toEqual({ section: "why" });
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
