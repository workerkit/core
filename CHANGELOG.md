# Changelog

All notable changes to `@workerkit/core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Eleven manager tool descriptors, bringing the MCP/CLI surface to parity with
  the Workers Management REST API: `key_info` (what the presented key is and
  which scopes it carries — the call to make first), the two fleet-watching
  reads `runs_feed` (account-wide cursor-paged run feed) and `fleet_pulse`
  (every run in flight, capped at 100, no paging), the instruction-history trio
  `instruction_versions` / `instruction_version_get` / `instruction_restore`
  (restore APPENDS a new current version, so a rollback is itself reversible),
  and the run-result delivery family `delivery_list`, `delivery_channels`,
  `delivery_create`, `delivery_update`, `delivery_delete` (at-most-once,
  platform-level sends detached from the worker's own permissions; availability
  judged at ACCOUNT level; max 5 destinations per worker; `channel` immutable
  after create).
- Nine more manager tool descriptors, covering two-way runs, worker creation by
  cloning, and the spend ceilings: `run_question` / `run_answer` (a run that
  needs something from its owner ENDS by asking — answering does not resume it
  but mints a LINKED follow-on run, so the run id changes, the follow-on passes
  the same pre-flight gauntlet and can still come back Skipped, answering twice
  is idempotent, and a chain at `maxChainDepth` records the answer and refuses
  with `chain_limit`); `worker_clone_preview` / `worker_clone` /
  `worker_clone_bulk` (a clone copies only permissions a human already approved
  on the source; schedules arrive DISABLED, agent-authored facts never travel, a
  webhook destination arrives unarmed, `rawKey` is shown once, bulk is NOT
  atomic — read `items[]`, not the status code — and is capped at 20 per call);
  and `budget_get` / `budget_set` / `fleet_budget_get` / `fleet_budget_set`
  (`maxRunsPerDay` null means the PLATFORM DEFAULT rather than unlimited,
  `maxConcurrentRuns` is fixed at 1, a dollar cap on a worker with no hosted
  deployment is a 400, omitted PATCH fields mean unchanged, a fleet ceiling is
  removed with its `clear…` flag because null cannot mean both, zero means STOP,
  and a breach only refuses runs: nothing is paused and every worker's own API
  key keeps working).
- `delivery_secret_rotate`: mints a new signing secret for a webhook destination
  and returns it once. Also the way a cloned webhook destination is armed, since
  a clone arrives disabled with no secret and `delivery_update` refuses to
  enable it before one exists.
- The `webhook` delivery channel on `delivery_create` (`target.url`, https and
  public only; the response carries `signingSecret` once) and its semantics on
  the delivery hints: refused runs reach webhook destinations as `run.blocked`
  once per worker per reason per day, a run that stopped to ask its owner a
  question (`AwaitingInput`) reaches every channel, and `failureOnly` means
  "needs attention" (failures, questions, and on a webhook, refusals).
- `budget_set` gains the question timeout (`awaitInputTimeoutMinutes`,
  `clearAwaitInputTimeout`; an expired question is closed out and never resumed
  without an answer, though a late answer still starts the run); a zero per-run cap
  is now a 400 rather than a worker that can never start. `run_answer` retries
  after a Skipped resume and reports `answer_in_progress` (409) on a race
  instead of `already_answered`. The registry now ships **43 manager + 5
  anonymous** descriptors.

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
