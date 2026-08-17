# @workerkit/core

The shareable [WorkerKit](https://workerkit.ai) surface: an HTTP API client, the
declarative tool-descriptor registry (22 authenticated fleet-management tools +
5 anonymous kits-directory tools), and the single wire-execution path that turns
a descriptor plus parameters into exactly one upstream request.

Deliberately MCP-free: descriptors carry MCP-shaped annotations and zod schemas,
but nothing here depends on an MCP SDK, so an MCP server, a CLI, or docs tooling
can all consume the same registry.

## Install

```bash
npm install @workerkit/core
```

Requires Node.js >= 22.

## Use

```ts
import {
  WorkerKitClient,
  allDescriptors,
  byName,
  executeTool,
  isSuccess,
} from "@workerkit/core";

const client = new WorkerKitClient({
  baseUrl: "https://api.workerkit.ai",
});

// Anonymous: search the public kits directory.
const search = byName("kits_search")!;
const result = await executeTool(client, search, { query: "invoice" });
if (isSuccess(result)) {
  console.log(result.data);
}

// Authenticated: list your worker fleet with a manager key.
const list = byName("workers_list")!;
const fleet = await executeTool(client, list, {}, { token: process.env.WORKERKIT_MANAGER_KEY });

await client.close();
```

Each `ToolDescriptor` declares its name, agent-facing description, zod input
schema, auth mode (`manager` | `anonymous`), and how its parameters map onto one
HTTP request; `executeTool` is the only place that mapping is interpreted, so
every consumer produces an identical wire call.

The client ships sensible production defaults: per-attempt timeouts under a
whole-call deadline, bounded retries for idempotent methods only, a streamed
response-size cap, and quota/rate-limit header extraction. `scrubSecrets` helps
keep credentials out of logs.

## Links

- WorkerKit: <https://workerkit.ai>
- [Terms of Service](https://workerkit.ai/terms) · [Privacy Policy](https://workerkit.ai/privacy) ·
  [Acceptable Use Policy](https://workerkit.ai/aup) · [Security Overview](https://workerkit.ai/security)

## License

This package is released under the [MIT License](LICENSE). That covers the software itself; using
it against WorkerKit's hosted API is separately governed by the Terms of Service above.
