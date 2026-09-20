# Changelog

All notable changes to `@workerkit/core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.7] - 2026-09-20

### Added

- **`onboarding_get`**, **`wallet_get`**, **`wallet_checkout_create`**, and
  **`wallet_checkout_get`**.
- Checkout uses a required idempotency header and explicit human payment
  confirmation.

### Changed

- Descriptors can provide operation-specific headers; computed client headers,
  including authentication, retain precedence.

## [0.3.6] - 2026-09-20

### Added

- **`decision_worker_create`** with typed questions, source recipes, and an
  output schema; decision-authoring guide and discovery use the existing read
  tools. Creation returns `tokenId` for existing lifecycle commands and rejects
  unknown controls.

### Changed

- Anonymous descriptors discard supplied credentials at the shared execution
  boundary.
- Decision receipts describe source coverage, exact answers and references,
  omitted rows, and separate corpus probability from confidence.
- **`worker_run`** and **`run_get`** remove duplicated structured rows from the
  LLM projection when `decision.decisions` already carries the same rows. Raw
  API receipts remain unchanged.
- Package text and compiler output are pinned to LF so Windows and CI produce
  the same release tarball.

## [0.3.5] - 2026-09-19

### Changed

- A decision run's `decisions[]` rows carry `item`: the fields the model judged,
  as the kit's `state` names them (a subject, a sender, a preview), beside the
  `answers` — the evidence a reader works from, with the `id` still there to
  re-fetch the rest. `openQuestions[]` now lists every escalated item — a
  rule's hit as well as a below-floor call — named by those fields rather than
  by an id. Descriptor text only: no tool or field is added or removed.

### Removed

- **`worker_run.preview`** and **`deployment_update.decisionMode`** — Preview
  mode is gone from the platform: every decision run is live and its routing
  table's actions execute (owner's call, 2026-09-18: production always). The
  server ignores a `preview` sent by an older client, so do not rely on it for
  a dry run; `instruction_get` no longer reports a mode, the per-item rows say
  `executed` / `ok` on every run, and the outcome line opens with "Judged" or
  "Ranked" rather than a mode word. The descriptions that contrasted live with
  preview no longer do: `kit_install_preview` and `worker_deploy` simply say
  the table acts from the worker's first run.

## [0.3.4] - 2026-09-18

### Added

- **`worker_run`** takes `answers` on a decision worker: values laid over the
  worker's stored install answers for THIS run only, never saved. It is how
  one caller names a searcher kit's target without touching the worker's
  setup, so two callers sharing a worker never see each other's. The map is
  validated against the kit's own form the way `instruction_set` validates it
  and bound the way the run will bind it, so a row that cannot bind (a
  category clashing with a built-in option, a ladder outside 2–10 levels) is a
  400 naming it here rather than a run that fails later. A list question takes
  a JSON array string or `;`-separated rows, and a question left unnamed keeps
  its stored answer or the kit's default.

### Changed

- **`worker_run`**'s `sourceArgs` names relative window bounds, `after:
  "-14d"` or `endDate: "+48h"`, which the platform resolves when the read
  runs. That is the form to use for "the last N days" instead of computing a
  date in the caller.
- The `decision` block on **`run_get`** and a waited **`worker_run`** carries
  `model`, the decision-model version that actually answered, worth citing
  when behaviour changes, and `answersOverride`, the per-run answers the run
  was minted with.
- `findings[]` in that block is led by the source's own caveat when a read was
  partial or withheld, a rate-limited mailbox or a firewall rule, so "nothing
  found" is never trusted over a page that was never fully read.
- **`instruction_set`**'s `answers` and **`kit_install`**'s `decisionAnswers`
  take `;`-separated list rows as well as one per line, and say that clearing
  a question falls back to its default where the kit ships one.

## [0.3.3] - 2026-09-18

### Added

Decision workers, reachable outside the dashboard for the first time. A
decision worker judges items with a typed decision model and routes them by a
fixed table — no prose, no model turns; its "instruction" is that table plus
the questions its installer answers, and its run is a receipt of decisions.
It reaches the same verbs a language worker does, in its own shape, so the
registry still ships 79 manager and 9 anonymous descriptors.

- **`worker_run`** takes `preview` (this run reports and acts on nothing,
  whatever the deployment's mode), `sourceArgs` (narrow what is decided about)
  and `maxItems` on a decision worker, and refuses `prompt` / `modelSlug`
  there with `409 not_language_worker` — the mirror refusal, `409
  not_decision_worker`, guards a language worker against the other four.
  `waitSeconds` (0–55) holds the call until the run settles and answers the
  settled receipt; omit it and the answer is the just-minted receipt, exactly
  as before.
- **`run_get`** and a waited **`worker_run`** carry a `decision` block on a
  decision run: outcome, confidence, per-item rows with the rule that fired and
  the action taken, findings and openQuestions. It is run content, so it needs
  `readRuns` and comes back withheld without it.
- **`instruction_get`** answers a decision worker with its routing table as
  sentences, its install questions with their current answers, the ones still
  pending (a pending question blocks both deploy and run) and the live/preview
  mode. `optionsFor` asks one `appPick` question for its live options from the
  worker's own connected app — never a 4xx: an app that cannot answer returns
  an empty list with a warning saying why. The tool sent no query parameters
  before, so it passes them through now.
- **`instruction_set`** takes `answers` instead of `content` there — a partial
  map, where `''` clears one. Same `manageInstructions` scope either way, and
  the two are mutually exclusive.

The authoring and install fields for the kits that carry these workers:

- **`kit_install`** takes `decisionAnswers` (the preview's `decisionSetup`
  questions, by key).
- **`deployment_update`** takes `decisionMode`: `live` (the default — the
  routing table's actions execute) or `preview` (every run reports what it
  would do and acts on nothing).
- **`kits_search`** takes `modelType` (`language` | `decision`) and its cards
  carry it; `directory_overview` answers the `modelTypes` vocabulary.
- `kit_publish` / `kit_validate` / `kit_replace` content names `decisionSpec`
  and `modelType`, and `kit_install_preview`, `kit_get`, `worker_deploy` and
  `models_list` describe the decision-kit fields and refusals
  (`decision_setup_pending`) they already carried.

### Changed

- **`worker_get`** reports `modelType` and, on a decision worker,
  `decisionPendingSetup` — the install questions still blank. It is the field
  that says which of the above a call will accept.
- **`worker_deploy`**'s model refusals are named as the server sends them
  today: `400 invalid_model` and `400 model_tier_gated`, replacing
  `model_unavailable` / `model_tier` in the description.
- **`instruction_set`**'s `content` is now optional, so `jobSentence`,
  `whenToUse` and `description` can be changed on their own without resending
  the whole instruction. It was mandatory before, which the `answers` path also
  needed lifted.
- A description pass across both registries: the shared notes (grading,
  delivery, cloning, deployment, the new-scope note) and the longest tool
  descriptions say the same contract in fewer words. No parameter, path, body
  or annotation changed with it.

## [0.3.2] - 2026-09-12

### Added

Five manager descriptors: the fleet-operations lane. Reading the state of a
fleet took a crawl over `workers_list`, `worker_get` and `runs_feed`; the
account's headroom, a run's raw process log, fan-out and deletion were not
reachable from the toolset at all. The registry now ships 79 manager and 9
anonymous descriptors.

- **`fleet_health`** is the digest to brief from. A fleet operated from a chat
  window rots quietly: workers installed but never deployed while their
  schedules sit enabled, deployments paused with due times drifting into the
  past, runs that ended by asking a question nobody saw, last runs refused at
  the gate. One call returns the counts plus typed sections (`blocked`,
  `notDeployed`, `overdueSchedules`, `awaitingInput`, `lastRunAttention`), each
  row naming the worker and the fix. Paused and expired workers are counted,
  never listed. The question preview inside `awaitingInput` is run content and
  needs `readRuns`; the rest rides `readWorkers`.
- **`account_usage`** is the headroom read: plan tier, worker slots,
  hosted-deployment slots, the wallet's spendable balance with the top-up URL to
  hand a human, the plan's request windows and settled run spend — so a 402 on
  `kit_install`, `worker_deploy` or a scheduled run is something an agent plans
  around rather than discovers. Rides `readWorkers`.
- **`run_transcript`** reads a run's stored LLM process log, the raw record
  behind the digest, which was readable only in the dashboard. It is opt-in per
  deployment (`transcriptRetention`) and kept for 7 days, so the description
  teaches the agent to read the receipt's `transcriptAvailable` first and to
  expect 404 `no_transcript` as the normal answer on a worker that never opted
  in. Rides `readRuns`.
- **`run_bulk`** fans one prompt out across up to 20 workers in one call, each
  named by `workerId` (preferred) or its deprecated `tokenId`, on a window of
  its own (2 calls a minute, 20 an hour per account). Like `worker_clone_bulk`
  it is not atomic and reports per item — and unlike it, a miss never aborts
  the batch: an unknown id, a missing deployment or a cap already hit lands on
  that item and the loop goes on. A Skipped receipt counts as a success (a run
  was minted; its `skipReason` says why it did not start). Rides `runWorkers`.
- **`worker_delete`** removes a worker. Deleting existed only in the WorkerKit
  dashboard, so an agent could create workers — `kit_install`, `worker_clone` —
  and never remove one, which also left `kit_install`'s 402 worker-cap wall
  with no fix an agent could apply. It is permanent and not reversible by any
  call: the key stops working, the schedules stop, and the instruction, memory,
  deployment and delivery destinations go. Two things the description teaches
  because an agent gets them wrong by default: deleting an orchestrator deletes
  its sub-workers too (`subWorkersDeleted` says how many), and
  `worker_set_enabled` with `enabled:false` is the reversible thing to reach
  for when someone says "stop" or "turn off". Run receipts survive; the freed
  slot is the fix for 402 `limit_exceeded`. Requires the new `deleteWorkers`
  scope.

### Changed

- **`workers_list`** takes filters — `status`, `deployed`, `readiness`, `q` —
  and answers `totalWorkers` (the unfiltered count, so an empty page is
  readable). Every row now carries `readiness`, and `lastRun` carries
  `skipReason` and `errorCode`.
- **`runs_feed`** and **`worker_runs`**: `awaitingInput` joined the status
  filter and the outcome vocabulary. The server always accepted it; the closed
  enum here did not, which made the questions a fleet was waiting on
  unreachable from the feed.
- **`budget_get`** and **`budget_set`**: `maxConcurrentRuns` is set by the
  account's plan — Free 5, Pro 20, Team 50, Enterprise uncapped — rather than
  fixed at 1, and stays absent from `budget_set` because raising it is an
  upgrade. It bounds runs started on demand; **`schedule_create`** and
  **`schedule_update`** now say that a schedule never overlaps itself whatever
  the plan allows, and **`worker_run`** points to `run_bulk` for fan-out.
- **`worker_set_enabled`** now names itself as the reversible half of the pair,
  so the permanent one is never picked by accident, and spells out that
  stopping an orchestrator cascades to its sub-workers while re-enabling brings
  back only the parent.
- **`kit_install`** names `worker_delete` as the second way out of the 402
  worker-cap wall, to be proposed only with the person's agreement.

### Note

`worker_delete` needs the new `deleteWorkers` scope. Like every scope younger
than the manager-key surface, a key minted before it existed does not carry
it — including one minted with "all" — so a 403 there is fixed by an account
admin re-scoping the key, never by retrying.

## [0.3.1] - 2026-09-11

### Added

Six manager descriptors: the hosted-deployment lane. Deploying a worker existed
only in the WorkerKit dashboard, so a worker installed through the API, MCP or
the CLI was created fully configured and could never run — its schedules never
fired and `worker_run` answered 409 `not_deployed` with nothing in the toolset
able to fix it. The registry now ships 74 manager and 9 anonymous descriptors.

- **`worker_deploy`** puts a worker on the hosted runtime: pick the model and
  the per-run / per-day spend ceilings, or send nothing and take the kit's
  recommended model with the platform defaults. Its refusals are the deploy
  gauntlet and each names its fix — no instruction, an app still unconnected,
  an unfunded wallet, a model the account's tier cannot reach.
- **`deployment_get`** and **`deployments_list`** read one deployment or every
  deployed worker on the account — the fleet answer to which workers can
  actually run. A worker in `workers_list` but not here is inert.
- **`deployment_update`** changes a live deployment (model, reasoning,
  transcript retention, ceilings) and pauses or resumes it. Pause is the
  reversible stop that keeps the model and the ceilings.
- **`worker_undeploy`** takes a worker off the runtime, keeping the worker, its
  instruction, memory, schedules and its own key.
- **`models_list`** is the model picker the deployment calls need: what this
  account may deploy on, priced per million tokens, with the reasoning
  vocabulary each model accepts and the providers the account holds its own key
  for.

### Changed

- **`kit_install`** takes `deploy` and `deployment`, so installing and deploying
  are one call. A deploy refused after the install still returns 201 with
  `deploymentError` naming what to fix — the worker exists either way, so the
  fix is `worker_deploy`, never a second install.
- **`workers_list`** and **`worker_get`** now describe the `deployment` field
  each worker carries, and that `null` there means the worker will never run
  whatever its readiness says.

### Note

The deployment writes need the new `manageDeployments` scope. Like every scope
younger than the manager-key surface, a key minted before it existed does not
carry it — including one minted with "all" — so a 403 there is fixed by an
account admin re-scoping the key, never by retrying.

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
