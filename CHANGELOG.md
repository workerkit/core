# Changelog

All notable changes to `@workerkit/core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-09-10

### Added

Twenty-five manager descriptors and four anonymous ones — the about read, the
kit-authoring lane, the connected-apps lane and the account's own MCP servers.
The registry now ships 68 manager and 9 anonymous descriptors.

- **About WorkerKit (anonymous, on the Directory server).** `workerkit_about`,
  what WorkerKit is and when an agent should reach for it, written for the
  agent and served one section at a time (index, why, operate, access, cost,
  start): the request shapes that call for a worker, how a fleet is operated
  from an agent's seat, the access model, the money rules, and how to connect
  from an MCP host, a REST host or a terminal. First in the directory registry,
  so it is the first tool a client lists.
- **Authoring reads (anonymous, on the Directory server).** `kit_authoring_guide`,
  the guide for writing a kit served one section at a time (schema, rules,
  skill, slots, instruction, example, selfcheck); `kit_vocabulary`, the live
  permission vocabulary — every app's tool keys, fields and axes, the vendor
  tiles, the capability slots, the browse categories and the platform MCP apps a
  kit may bind; `app=<code>` returns one surface with its vendors and tools
  (name, description, whether it writes, and the operation keys that unlock
  it); and `kit_app_tools`, the explorer — every app with the tools a worker
  gets on it, each with its description and the operation key that unlocks it,
  in one read.
- **Connected apps (manager, `manageConnections` scope; the read on
  `readWorkers`).** `apps_list` — which apps an operator can use right now, in
  the kit vocabulary, with a recipe per provider saying how to connect it
  (credential fields, or the dashboard page for an OAuth sign-in) and every
  connection as one uniform row; `app_connect` — connect a provider by
  credential (validated live, stored encrypted, never returned); `app_disconnect`.
- **Model keys (same scope).** `model_keys_list`, `model_key_set`,
  `model_key_delete` — the account's own model-provider API keys.
- **Custom MCP servers (same scope; the reads on `readWorkers`).** How an app
  the platform does not offer reaches a worker: `mcp_server_create` registers
  an MCP server as the account's own custom MCP app, with the credential in the
  same call (probed live, stored encrypted, never returned) and its tools
  discovered; `mcp_server_set_tools` enables the tools a job needs, which
  publishes the server so `apps_list` shows it and a kit can bind it in
  `content.mcpServers`; `mcp_servers_list`, `mcp_server_get`,
  `mcp_server_discover` (with the stored credential) and `mcp_server_delete`.
  A register is atomic: a rejected credential or a URL that does not answer as
  an MCP server leaves nothing behind.
- `worker_get` now returns `apps[]`: every enabled app with its connection state
  and the providers serving it.
- **Kit authoring (manager, `publishKits` scope).** `kit_validate` (the dry run:
  every gate's verdict at once plus the manifest that would publish),
  `kit_publish` (from content or from an owned worker), `kit_update`,
  `kit_replace`, `kit_unpublish`, `kit_relist`, `kit_make_private`,
  `kit_delete`, `kit_scan_get`, `my_kits_list`, `publisher_get_mine`,
  `publisher_set`. A private kit installed with `kit_install` is how a worker
  is created from scratch on this surface.
- **`worker_permissions_get`** (`readWorkers`): what a worker may touch, in the
  same `apps[]` / `categorySlots[]` shape a kit's content takes, with rule
  counts.

### Changed

- The directory tools' shared note now says the mount can neither install nor
  publish, and points at the authoring reads — and at `mcp_server_create` for an
  app the platform does not offer.
- `app_connect` on one of the account's own MCP servers registered with
  `credentialScope: "account"` sets the one shared credential; `app_disconnect`
  removes it. An org-wide platform MCP app still answers `managed_by_admin`.

## [0.2.1] - 2026-09-10

### Fixed

- 0.2.0 was published without the `delivery_secret_rotate` descriptor (42
  manager descriptors instead of 43). 0.2.1 is the complete build; 0.2.0 is
  deprecated.

## [0.2.0] - 2026-09-10

### Added

Twenty-one manager tool descriptors, bringing the MCP and CLI surface to parity
with the Workers Management REST API. The registry now ships 43 manager and
5 anonymous descriptors.

- **Key.** `key_info`: what the presented key is and which scopes it carries.
  The call to make first.
- **Fleet-wide runs.** `runs_feed`, one account-wide cursor-paged feed that
  `wait` turns into a long poll, and `fleet_pulse`, every run in flight (capped
  at 100).
- **Two-way runs.** `run_question` and `run_answer`. A run that needs something
  from its owner ends by asking; answering mints a linked follow-on run, so the
  run id changes. The follow-on passes the same pre-flight checks and can come
  back Skipped, in which case the question can be answered again. A chain at
  `maxChainDepth` records the answer and refuses with `chain_limit`; two
  simultaneous answers resolve with `answer_in_progress`.
- **Run-result deliveries.** `delivery_list`, `delivery_channels`,
  `delivery_create`, `delivery_update`, `delivery_secret_rotate` and
  `delivery_delete`. Sends are platform-level and at most once, availability is
  judged at account level, a worker holds at most five destinations, and
  `channel` is immutable after create. The `webhook` channel takes `target.url`
  (https, public addresses only), returns `signingSecret` once on create and on
  rotate, and receives the typed run event. `failureOnly` covers everything that
  needs attention: failures, a run waiting on an answer, and on a webhook,
  refused runs (delivered as `run.blocked`, once per worker per reason per day).
- **Instruction history.** `instruction_versions`, `instruction_version_get` and
  `instruction_restore`. Restore appends a new current version, so a rollback is
  itself reversible.
- **Creation by cloning.** `worker_clone_preview`, `worker_clone` and
  `worker_clone_bulk`. A clone carries only permissions a human already approved
  on the source; schedules arrive disabled, agent-authored facts stay behind, a
  webhook destination arrives unarmed until its secret is rotated, and the raw
  key is shown once. Bulk is capped at 20 per call and is not atomic: read
  `items[]`.
- **Budgets.** `budget_get`, `budget_set`, `fleet_budget_get` and
  `fleet_budget_set`. Omitted fields are unchanged, a fleet ceiling is removed
  with its `clear…` flag, and zero means stop. A breach refuses runs and pauses
  nothing, so every worker's own key keeps working. `budget_set` also carries the
  question timeout (`awaitInputTimeoutMinutes`, `clearAwaitInputTimeout`).

## [0.1.3] - 2026-08-17

### Changed

- First release published through npm trusted publishing (OIDC from GitHub
  Actions), so this version carries a **provenance attestation** linking the
  published tarball to the commit and workflow that built it. No npm token is
  involved in releases from here on. No code changes.

## [0.1.2] - 2026-08-17

### Changed

- Documentation only: links to the Terms of Service, Privacy Policy, Acceptable
  Use Policy and Security Overview, a note that the MIT licence covers the
  software rather than use of the hosted API, and broader npm keywords. No code
  or API changes.

## [0.1.1] - 2026-08-16

### Fixed

- Documentation: the `baseUrl` examples in the README and `ClientOptions`
  referenced a host that does not exist. They now show the public API host,
  `https://api.workerkit.ai`. No runtime behavior changed — `baseUrl` has always
  been caller-supplied.

## [0.1.0] - 2026-08-16

### Added

- Initial release.
- `WorkerKitClient` (HTTP client): per-attempt timeout under a whole-call
  deadline, bounded retries for idempotent methods, streamed response-size cap
  (`ResponseTooLargeError`), quota/Retry-After header extraction, structured
  logging hooks, request-id correlation.
- Tool-descriptor registry: 22 authenticated fleet-management tools and
  5 anonymous kits-directory tools (`allDescriptors`, `byName`), with zod input
  schemas and MCP-compatible behavior annotations.
- `executeTool`: the single descriptor-to-wire execution path shared by every
  consumer.
- Envelope helpers (`isSuccess`, `quotaSuffix`, `retryAfterSuffix`) and the
  `scrubSecrets` log-redaction helper.
