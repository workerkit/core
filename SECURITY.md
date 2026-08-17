# Security

## Reporting a vulnerability

Email **security@workerkit.ai**.
Please do not open public issues for security reports.

This document covers the `@workerkit/core` library specifically. For the platform, see the
[Security Overview](https://workerkit.ai/security), [Privacy Policy](https://workerkit.ai/privacy),
and [Terms of Service](https://workerkit.ai/terms).

## Scope

`@workerkit/core` is a client library. It stores no credentials and keeps no state: bearer
tokens are supplied per call by the consumer and forwarded on the one request they authorize,
never logged or persisted. The `scrubSecrets` helper exists so consumers can redact key
material (`pe_mgr_` prefixes and bearer headers) from their own logs.

Properties relevant to a security review:

- Descriptors marked `anonymous` never forward an Authorization header, even when the caller
  supplies a token.
- The HTTP client pins its origin at construction; descriptor paths cannot redirect a request
  to another host.
- Responses are read through a hard size cap and per-attempt timeouts under a whole-call
  deadline; retries apply to idempotent methods only and never to 429s.
- The package has two runtime dependencies (`undici`, `zod`), both exact-pinned.

## Supported versions

The latest published version. Releases are tag-driven from
[github.com/workerkit/core](https://github.com/workerkit/core) via npm trusted publishing, and
every version carries a provenance attestation linking the tarball to the commit and workflow
that built it.
