# Changelog

All notable changes to `@workerkit/core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package adheres to [Semantic Versioning](https://semver.org/).

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
