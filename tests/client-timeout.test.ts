import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import { PortEdenClient } from "../src/index.js";

it("an explicit wait extends only its request and never retries a trigger", async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    setTimeout(() => { response.writeHead(request.url === "/failure" ? 503 : 200, { "content-type": "application/json" }); response.end('{"runId":"one-run"}'); }, 60);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  const client = new PortEdenClient({ baseUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 20 });
  try {
    expect((await client.post("/run", { timeoutMs: 500 })).status).toBe(200);
    expect(calls).toBe(1);
    expect((await client.post("/failure", { timeoutMs: 500 })).status).toBe(503);
    expect(calls).toBe(2);
    expect((await client.post("/normal", {})).status).toBe(504);
    expect(calls).toBe(3);
  } finally { await client.close(); server.close(); await once(server, "close"); }
});
