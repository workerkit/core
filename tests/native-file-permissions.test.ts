import { expect, it } from "vitest";
import { byName, executeTool, type ApiResult, type PortEdenClient, type ToolDescriptor } from "../src/index.js";

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

it("preserves Drive and SharePoint forwarding grants and revocation", async () => {
  const apps = [
    { code: "drive", operations: ["download_file", "forward_attachments"] },
    { code: "sharePoint", operations: ["download_file", "forward_attachments"] },
  ];
  for (const selected of [apps, apps.map(app => ({ ...app, operations: ["download_file"] }))]) {
    const call = await run(d("worker_permissions_set"), { tokenId: 42, apps: selected }, "synthetic-manager-key");
    expect(call.method).toBe("put");
    expect(call.path).toBe("/api/manage/workers/42/permissions");
    expect(call.opts.body).toEqual({ apps: selected });
  }
});
