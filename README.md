# @workerkit/core

[![CI](https://github.com/workerkit/core/actions/workflows/ci.yml/badge.svg)](https://github.com/workerkit/core/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40workerkit%2Fcore.svg?color=2ea44f)](https://www.npmjs.com/package/@workerkit/core)
[![node](https://img.shields.io/node/v/%40workerkit%2Fcore.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40workerkit%2Fcore.svg)](LICENSE)

The shareable [WorkerKit](https://workerkit.ai) surface: an HTTP API client, the
declarative tool-descriptor registry (95 authenticated fleet-management tools +
9 anonymous kits-directory tools), and the single wire-execution path that turns
a descriptor plus parameters into one HTTP operation.

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
const fleet = await executeTool(client, list, {}, { token: process.env.WK_MANAGER_KEY });

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

## Discover GitHub targets before installing

`app_github_accounts`, `app_github_repos` and `app_github_branches` look up
connected GitHub accounts and the repositories and branches their GitHub App
installations grant, so a kit can be installed against exact targets without
running a worker. They need the `discoverAppResources` scope, which existing
keys gain only through explicit re-scoping, and return setup metadata only,
never repository content or credentials. Accounts come from the workspace's
saved connections, not from GitHub's user directory.

Pass the workspace and connection explicitly. Repository and branch `q` filters
apply to one provider page, so keep following `nextPage` even when a filtered
page is empty. Put the returned repository IDs in `kit_install.githubSelection`
with `repositoryMode: "selected"`; `"all"` also covers repositories granted to
the connection later, and `accounts: []` defers GitHub setup. The `githubSetup`
block in `kit_install_preview` names the required scope and says whether an
explicit selection is mandatory. A branch given as a kit input configures the
job but does not restrict the worker's access. Returned names come from GitHub,
so treat them as untrusted data.

## Discover Slack conversations

`app_slack_workspaces` lists the connected Slack workspaces with their saved
token capabilities; `app_slack_conversations` then lists channel and DM IDs in
the chosen `workspaceId`, narrowed by conversation `types`. Both need the
`discoverAppResources` scope. A filtered page can come back empty while
`nextCursor` continues, so keep following it. `capabilities.conversationTypes`
shows which types the saved bot read scopes allow. Message search needs a user
token with `search:read`; reading history needs the channel ID, the matching
history scopes and bot membership, and covers one conversation.

## Worker kinds

`worker_get` and `workers_list` report each worker's `modelType`, the same
vocabulary as a kit's: `language` runs an instruction on a model chosen at
deployment, `decision` runs a routing table on the decision model, `hybrid`
classifies and then hands the selected items to one language-model agent, and
`none` is an Action worker, described below. The kind decides which fields
`worker_run` and `instruction_set` accept, and whether a worker is deployed at
all.

## Classification followed by an agent task

A hybrid worker classifies a bounded source window and runs one language-model agent
on the selected batch. Core exposes the configuration and a single run receipt;
model execution, permissions and billing remain server responsibilities. See the
[hybrid worker guide](https://github.com/workerkit/core/blob/main/docs/hybrid-workers.md).

## Decision sources and classifiers

The `purpose: "decision"` recipes from `kit_app_tools` are shortcuts, not a
limit. For any other source, call `kit_app_tools` without `purpose`, copy the
tool's `argsSchema` and documented `decisionSource` mapping, then validate,
publish privately and install the kit. `models_list` lists the available
classifiers in `decisionProfiles`; `decisionProfileId` sets a kit or deployment
default, or overrides it for one run. Runs execute their declared actions:
there is no preview mode, and unsupported run controls, including those in
`run_bulk` entries, are rejected before any request is sent.

## Action workers

An Action worker exposes explicitly selected, typed app tools that a caller
invokes directly, without a reasoning model or a hosted deployment.
`action_worker_options` lists the native and reviewed MCP apps, their tool
schemas and the server's defaults. Creating one with `action_worker_create` and
an `app` copies that app's default tools once; an explicit `actionSpec` can
instead select up to 64 tools across apps. Omitting `app` selects Slack, and
tools added to the catalog later must be selected by hand.

Read a worker's tool schemas with `worker_tools` before calling one with
`worker_tool_call`, which takes `tokenId`, `toolName`, `arguments` and an
optional `contractVersion: 1` and `idempotencyKey`. The key travels in the
`Idempotency-Key` header; only the version and arguments go in the body. Give
each intended write its own key and keep it for transport retries. Poll
`worker_tool_invocation` for pending results, and never automatically resend
an `outcome_unknown` call with a new key: the app may already have acted. A
refusal marked `retryable` can be tried again later under a new key. A call
cannot change the saved tool selection, connection or sender, and a
changed tool contract needs an explicit owner review and save. Generic write
receipts keep the confirmation without storing private app response bodies.

A call answers with `status` `succeeded`, `denied`, `failed`, `in_progress` or
`outcome_unknown`, plus `invocationId` on a write (reads leave no receipt).
Repeating a write's key with the same arguments returns the stored receipt
without calling the app again; the same key with different arguments is a 409
`idempotency_conflict`.

An Action worker reports `modelType: "none"` and `deployment: null`, and
`readiness.canInvoke` says whether its tools can be called now. It is never
deployed or run: `worker_run` and `worker_deploy` refuse it with
`400 action_worker_requires_invoke`, and it takes no instruction, schedule or
trigger.

Discovery needs `readWorkers`, creation needs `publishKits` and `installKits`,
and calls and receipts need `invokeActions`; existing manager keys may need
that scope granted explicitly.

## Development

```bash
git clone https://github.com/workerkit/core.git && cd core
npm ci
npm test            # descriptor-contract suite
npm run typecheck
npm run build
```

Issues and pull requests are welcome. Every tool is a declarative `ToolDescriptor`;
the descriptor-contract tests pin each one's exact wire call, so behavior changes
are visible in the diff. Security reports go to [SECURITY.md](SECURITY.md), not the
issue tracker.

Releases are tag-driven: maintainers push a `vX.Y.Z` tag and CI publishes to npm
via [trusted publishing](https://docs.npmjs.com/trusted-publishers) with a
provenance attestation. No npm tokens exist for this package.

## Links

- WorkerKit: <https://workerkit.ai>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- [Terms of Service](https://workerkit.ai/terms) · [Privacy Policy](https://workerkit.ai/privacy) ·
  [Acceptable Use Policy](https://workerkit.ai/aup) · [Security Overview](https://workerkit.ai/security)

## License

This package is released under the [MIT License](LICENSE). That covers the software itself; using
it against WorkerKit's hosted API is separately governed by the Terms of Service above.
