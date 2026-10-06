import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { WorkerKitClient, byName, executeTool, z } from "../src/index.js";

describe("decision profile selection", () => {
  for (const name of ["worker_deploy", "deployment_update", "worker_run"]) {
    it(`${name} preserves the independent classifier and language-model selections`, () => {
      const descriptor = byName(name)!;
      const parsed = z.object(descriptor.schema).parse({ tokenId: 7, decisionProfileId: "openai-luna", modelSlug: "sol" });
      expect(descriptor.bodyBuilder!(parsed)).toMatchObject({ decisionProfileId: "openai-luna", modelSlug: "sol" });
      expect(z.object(descriptor.schema).safeParse({ tokenId: 7, decisionProfileId: "" }).success).toBe(false);
    });
  }

  for (const name of ["kit_publish", "kit_replace", "kit_update", "kit_validate"]) {
    it(`${name} accepts the kit classifier default`, () => {
      const field = byName(name)!.schema.decisionProfileId;
      expect(field.parse("openai-luna")).toBe("openai-luna");
      expect(field.safeParse("").success).toBe(false);
    });
  }

  it("discovers classifiers with the existing models read", () => {
    expect(byName("models_list")!.description).toContain("decisionProfiles");
    expect(byName("models_list")!.annotations?.readOnlyHint).toBe(true);
  });

  it("carries profile selections and per-run inputs over authenticated HTTP without forcing a default", async () => {
    const calls: Array<{ url?: string; auth?: string; body: Record<string, unknown> }> = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.setHeader("content-type", "application/json");
      res.end("{}");
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    const client = new WorkerKitClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    try {
      for (const name of ["worker_deploy", "deployment_update", "worker_run", "kit_update"]) {
        const descriptor = byName(name)!;
        for (const profile of ["openai-luna", "jev-default", undefined]) {
          const params = z.object(descriptor.schema).parse({ tokenId: 42, kitRef: "triage", decisionProfileId: profile,
            sourceArgs: { query: "support" }, answers: { category: "returns" } });
          expect((await executeTool(client, descriptor, params, { token: "test-manager" })).status).toBe(200);
          expect(calls.at(-1)?.auth).toBe("Bearer test-manager");
          expect(calls.at(-1)?.body.decisionProfileId).toBe(profile);
          if (profile === undefined) expect(calls.at(-1)?.body).not.toHaveProperty("decisionProfileId");
          if (name === "worker_run") expect(calls.at(-1)?.body).toMatchObject({ sourceArgs: { query: "support" }, answers: { category: "returns" } });
        }
      }
      const bulk = byName("run_bulk")!;
      const params = z.object(bulk.schema).parse({ workers: [{ tokenId: 42, decisionProfileId: "openai-luna", maxItems: 3 }] });
      await executeTool(client, bulk, params, { token: "test-manager" });
      expect(calls.at(-1)?.body).toEqual(params);
    } finally {
      await client.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
