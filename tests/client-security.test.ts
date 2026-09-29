import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import { WorkerKitClient, executeTool, byName } from "../src/index.js";

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

it("reserves computed headers case-insensitively and keeps discovery anonymous", async () => {
  const headers: IncomingMessage["headers"][] = [];
  await withServer((req, res) => { headers.push(req.headers); res.end("{}"); }, async baseUrl => {
    const client = new WorkerKitClient({ baseUrl, userAgent: "workerkit-test" });
    const extra = { authorization: "Bearer injected", AUTHORIZATION: "Bearer duplicate", "Proxy-Authorization": "proxy-secret",
      hOsT: "elsewhere.invalid", "x-request-id": "injected", accept: "text/plain", "content-type": "text/plain", "user-agent": "injected",
      "Idempotency-Key": "checkout-once" };
    try {
      expect((await client.post("/test", { token: "manager-key", headers: extra, body: {} })).status).toBe(200);
      const descriptor = { ...byName("kits_search")!, headerBuilder: () => extra };
      expect((await executeTool(client, descriptor, {}, { token: "manager-key" })).status).toBe(200);
      expect(headers[0]).toMatchObject({ authorization: "Bearer manager-key", accept: "application/json",
        "content-type": "application/json", "user-agent": "workerkit-test", "idempotency-key": "checkout-once" });
      expect(headers[0]?.host).toBe(new URL(baseUrl).host);
      expect(headers[0]?.["x-request-id"]).not.toBe("injected");
      expect(headers[0]?.["proxy-authorization"]).toBeUndefined();
      expect(headers[1]?.authorization).toBeUndefined();
      expect(headers[1]?.["proxy-authorization"]).toBeUndefined();
    } finally { await client.close(); }
  });
});

it("does not put credentials or query strings in structured request logs", async () => {
  const logs: object[] = [];
  const logger = { info: (entry: object) => logs.push(entry), warn: (entry: object) => logs.push(entry), error: (entry: object) => logs.push(entry) };
  await withServer((_req, res) => res.end("{}"), async baseUrl => {
    const client = new WorkerKitClient({ baseUrl, logger });
    try {
      await client.get("/pe_mgr_testcredential?secret=query-secret", { token: "arbitrary-secret" });
      const result = await client.post("/test", { token: "invalid-secret\nheader", body: {} });
      expect(result.status).toBe(0);
      const serialized = JSON.stringify(logs);
      for (const secret of ["pe_mgr_testcredential", "query-secret", "arbitrary-secret", "invalid-secret"]) {
        expect(serialized).not.toContain(secret);
      }
      expect(serialized).toContain("request_failed");
    } finally { await client.close(); }
  });
});

it("cancels in-flight requests and retry delays without retrying", async () => {
  let calls = 0;
  const controller = new AbortController();
  await withServer((_req, res) => { calls++; controller.abort(); res.end("{}"); }, async baseUrl => {
    const client = new WorkerKitClient({ baseUrl });
    try {
      expect(await client.get("/test", { signal: controller.signal })).toMatchObject({ status: 0, retryable: false });
      expect(calls).toBe(1);
      expect(await client.get("/test", { signal: controller.signal })).toMatchObject({ status: 0, retryable: false });
      expect(calls).toBe(1);
    } finally { await client.close(); }
  });

  const backoffController = new AbortController();
  calls = 0;
  await withServer((_req, res) => { calls++; res.writeHead(503).end("{}"); }, async baseUrl => {
    const client = new WorkerKitClient({ baseUrl, logger: {
      info: (entry: object) => { if ((entry as { msg?: string }).msg === "api_retry") backoffController.abort(); },
      warn() {}, error() {},
    } });
    try {
      expect(await client.get("/test", { signal: backoffController.signal })).toMatchObject({ status: 0, retryable: false });
      expect(calls).toBe(1);
    } finally { await client.close(); }
  });
});

it("rejects credential-bearing origins and invalid resource budgets", () => {
  expect(() => new WorkerKitClient({ baseUrl: "https://user:password@example.invalid" })).toThrow("without embedded credentials");
  for (const value of [0, -1, 0.5, NaN, Infinity]) {
    expect(() => new WorkerKitClient({ baseUrl: "https://example.invalid", timeoutMs: value })).toThrow("timeoutMs");
    expect(() => new WorkerKitClient({ baseUrl: "https://example.invalid", maxConnections: value })).toThrow("maxConnections");
  }
});
