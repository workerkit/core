# @workerkit/core

[![CI](https://github.com/workerkit/core/actions/workflows/ci.yml/badge.svg)](https://github.com/workerkit/core/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40workerkit%2Fcore.svg?color=2ea44f)](https://www.npmjs.com/package/@workerkit/core)
[![node](https://img.shields.io/node/v/%40workerkit%2Fcore.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40workerkit%2Fcore.svg)](LICENSE)

The [WorkerKit](https://workerkit.ai) API client and tool registry for Node.js.
It provides 121 authenticated management tools, 8 anonymous directory tools,
and a shared execution engine for their HTTP requests.

Descriptors include agent guidance, annotations and Zod input schemas. MCP
servers, CLIs and documentation tools can use the same registry without an
MCP SDK dependency.

## Contract ownership

Tool definitions, schemas, HTTP mappings and agent guidance are authored by the WorkerKit backend. Core distributes a generated, versioned copy to MCP and CLI consumers. Live catalog and account data comes from backend endpoints.

To update the contract, import the reviewed backend `Data/AgentContract.json` with `npm run import:contract -- <artifact-path>`. Commit the pinned artifact and generated modules together. `npm run check:contract` and every build reject manual changes to generated modules. Core owns the HTTP client and execution engine; tool-specific behavior is part of the backend contract.

Adapters advertise each descriptor's `description` and render its `footer` with applicable results. For full offline help or REST documentation, use `toolDocumentation(descriptor)`: it includes result interpretation without requiring an API call. Raw JSON response bodies remain unchanged.

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

## Kit publishing

Public kit publishing is temporarily paused, including promotion of a private
kit, public replacement and relisting. Send `visibility: "private"` explicitly
to `kit_validate`, `kit_publish` and `kit_replace`; an omitted visibility
means public and is refused. Private kits publish and install as before.
Public publisher identity is also hidden: catalog entries carry no publisher
attribution and public publisher profiles return 404. Owners still manage
their own publisher profile.

## Author API apps

`api_app_validate` checks a `{ definition }` offline, and `api_app_create`
saves it as an account-private draft from `{ name, definition, enabled: false }`.
Use `api_apps_list` / `api_app_get` to inspect saved state, `api_app_update`
with its reviewed revision to edit it, and `api_app_publish` with
`{ appId, revision }` to publish an immutable version. Version reads and
revocation use `api_app_version_get` and `api_app_version_revoke`.

Authoring requires a live account Admin and the `managePrivateApiApps` scope,
which existing keys gain only through explicit re-scoping. Publishing does not
create a public listing or upgrade worker bindings. Definitions declare named
authentication slots, never credentials; credentials and worker bindings are
configured separately on the dashboard. A revision conflict requires re-reading
the app.

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
`action_worker_options` without `app` returns the app inventory only; with an
`app` it returns that app's reviewed tool schemas, defaults and connection
requirements. There is no implicit app: `action_worker_create` needs either an
`app`, which copies that app's reviewed defaults once, or an explicit
`actionSpec` that selects up to 64 tools across apps. Private API operations
are not selectable through `app` or `actionSpec`; their bindings are managed
in the dashboard. Tools added to the catalog later must be selected by hand.

Read a worker's tool schemas with `worker_tools` before calling one with
`worker_tool_call`, which takes `tokenId`, `toolName`, `arguments` and an
optional `contractVersion: 1` and `idempotencyKey`. Each tool reports
`invocationSource`, `effect`, `idempotencyRequired` and `keyFormat`; follow
those rather than inferring from `readOnly`. The key travels in the
`Idempotency-Key` header; only the version and arguments go in the body.
Native and MCP writes need a unique key per intended write and their reads
need none; every private API operation, including reads, needs a
`v1:<Unix timestamp>:<32-hex UUID>` key. Keep a key for transport retries. Poll
`worker_tool_invocation` for pending results, and never automatically resend
an `outcome_unknown` call with a new key: the app may already have acted. A
refusal marked `retryable` can be tried again later under a new key. A call
cannot change the saved tool selection, connection or sender, and a
changed tool contract needs an explicit owner review and save. Native and MCP
write receipts keep the confirmation without storing private app response
bodies.

A call answers with `status` `succeeded`, `denied`, `failed`, `in_progress` or
`outcome_unknown`, plus `invocationId` on a native or MCP write and on every
private API call; native and MCP reads leave no receipt.
Repeating a key with the same arguments returns the stored receipt
without calling the app again; the same key with different arguments is a 409
`idempotency_conflict`.

An Action worker reports `modelType: "none"` and `deployment: null`, and
`readiness.canInvoke` says whether its tools can be called now. It is never
deployed or run: `worker_run` and `worker_deploy` refuse it with
`400 action_worker_requires_invoke`, and it takes no instruction, schedule or
trigger.

Discovery needs `readWorkers`, creation needs `createWorkers`, and calls and
receipts need `invokeActions`; existing manager keys may need those scopes
granted explicitly.

## Workers that call other workers

A hosted language, decision or hybrid worker can call another worker it has
been explicitly bound to and wait for that worker's bounded result. The kit
declares the need; the installer decides which worker fills it.

A kit declares up to ten `workerSlots` in its content. Each slot has a portable
alias, the target's `modelType`, the operations it may use (trigger, trigger
with a prompt, trigger with typed input, or call an Action tool) and whether it
is required. Slots never contain worker UUIDs, account IDs or keys. Read
`kit_authoring_guide` with `section: "workers"` before declaring them;
`kit_validate` returns `workerTools`, the exact tool names and schemas the slots
expose to the worker's instruction.

`kit_install_preview` and `kit_get` (`permissionsManifest.workerSlots`) list the
slots a kit declares. Pass `workerBindings`, a map from alias to the UUID of an
installed worker, to `kit_install`. The target must be in the same account and
within the installer's authority and fleet-key selection, and its kind,
operations and pinned contracts must match the slot. An install without
bindings succeeds, but an unbound required slot reports the readiness issue
`worker_slots_pending` and runs are skipped until it is bound.

After install, `worker_bindings_get` lists a worker's grants, the slots its
kit declares, the required slots still missing and the workers that could
fill them. `worker_bindings_set` fills, re-points or clears aliases in one
atomic map (`manageAppsAndWorkers`): a declared slot takes the slot's
operations and Action tools when they are omitted, a free alias names its
operations, and an unchanged live grant is left alone. Both follow the
caller's authority and fleet-key selection.

A binding shares the target's bounded result with the caller, not its full
receipt or transcript. The target keeps its own permissions, budget, model and
charges. `run_get` shows `initiator`, `origin`, `relationship`
(`questionContinuation` or `workerCall`) and `workerCalls`, each child with its
run or Action invocation reference and `canReadReceipt`; `includeContent: false`
returns the metadata and `contentReferences` without copying reports. A fleet
key appears as an id, name and prefix snapshot, never a credential. Core only
describes these fields; the server owns execution, waiting and billing.

## Change an existing worker's apps

`worker_permissions_set` (account Admin, `manageAppsAndWorkers`) replaces an
existing worker's app set in the vocabulary `worker_permissions_get` returns.
An app left out is switched off, and a stance changes only when the call sends
`allowAll`: a deny-by-default app switched on reads nothing until the owner
writes rules or the call sends `allowAll: true`. Rules, identities and MCP tool
bindings stay on the dashboard.

`manageAppsAndWorkers` also covers `worker_bindings_set`. Keys that held every
earlier scope when it was introduced carry it; other existing keys need an
account admin to add it.

## Worker quality

`worker_quality_get` reads a worker's acceptance criteria, settings revision,
three quality gates and the reason any capability is unavailable.
`worker_quality_set` saves reviewed criteria or changes gates and needs the
current `expectedRevision`; `worker_quality_preview` checks a definition
against supplied evidence without saving anything, calling a model or running
the worker. Missing evidence is unknown, not a pass.

A kit's `content.evaluationSpec` carries public acceptance criteria, and
`kit_install` copies them with all three gates off. A manager key can switch
on Quality and suggestions where the account allows it and can switch any
gate off. Automatic improvement and shared learning are enabled only in the
owner dashboard, which also holds paid comparisons, diagnosis, monitoring and
apply/rollback. Improvements change instruction text only; shadow learning
does not train model weights. These tools are on the full profile.

## Company knowledge

The Knowledge descriptors expose source discovery, lexical search/browse, complete versioned content reads and change reconciliation. `toolsForProfile("knowledge")` returns the six of them for the dedicated Knowledge MCP mount; the workers and decision profiles do not carry them. Use `knowledge_sources`, `knowledge_search`, `knowledge_get` and `knowledge_changes` with `readKnowledge`. The service enforces current account, publication, audience and credential limits. `knowledge_configuration_get` and `knowledge_configuration_set` require `manageKnowledge`, account administrator authority and an unrestricted credential.

Query planning and synthesis belong to the consuming agent. Empty queries browse; changed or revoked evidence requires citation/cache reconciliation. Retrieval does not invoke a model or grant live source-app access.

## Development

```bash
git clone https://github.com/workerkit/core.git && cd core
npm ci
npm test            # descriptor-contract suite
npm run typecheck
npm run build
npm run check:descriptions # rebuild, then report size and guidance warnings
```

`check:release` includes the fresh description report. For the complete per-tool
report, run `npm run build` then `node scripts/check-descriptions.mjs --json`.
An optional `--baseline <report.json>` compares reports made with the same
projection and tokenizer. This is a transport-neutral core projection; the MCP
repository separately checks real SDK metadata and reviewed growth budgets.
Size, uppercase and unattributed repeated-clause findings are review warnings,
never truncation instructions. Generated shared guidance is attributed by its
canonical identifier; other repeated text still needs contextual review.
Publishing also runs `check:provenance`: the pinned backend artifact must name
its reviewed 40-character source commit and match the generated modules.
Local `working-tree-*` artifacts remain usable for development and package
smoke tests, but cannot pass this publication gate.

Issues and pull requests are welcome. Every tool is a declarative `ToolDescriptor`;
the descriptor-contract tests pin each one's exact wire call, so behavior changes
are visible in the diff. Security reports go to [SECURITY.md](SECURITY.md), not the
issue tracker.

Releases are tag-driven: the `workerkit` account pushes a `vX.Y.Z` tag and CI publishes to npm
via [trusted publishing](https://docs.npmjs.com/trusted-publishers) with a
provenance attestation. Publication reruns also require the `workerkit` account.

## Links

- WorkerKit: <https://workerkit.ai>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- [Terms of Service](https://workerkit.ai/terms) · [Privacy Policy](https://workerkit.ai/privacy) ·
  [Acceptable Use Policy](https://workerkit.ai/aup) · [Security Overview](https://workerkit.ai/security)

## License

This package is released under the [MIT License](LICENSE). That covers the software itself; using
it against WorkerKit's hosted API is separately governed by the Terms of Service above.
