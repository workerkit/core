// @workerkit/core — the shareable WorkerKit surface: the HTTP client, the
// tool-descriptor registry (22 manager + 5 anonymous directory tools), the
// single wire-execution path, and the pure formatting/redaction helpers.
// Deliberately MCP-free: MCP (or CLI) presentation lives with the consumer.

export {
  PortEdenClient,
  WorkerKitClient,
  ResponseTooLargeError,
} from "./client.js";
export type {
  ApiResult,
  ClientLogger,
  ClientOptions,
  QuotaInfo,
  RequestOpts,
} from "./client.js";

export * from "./descriptors/index.js";

export { executeTool } from "./execute.js";
export type { ExecuteToolOpts } from "./execute.js";

export { isSuccess, quotaSuffix, retryAfterSuffix } from "./errors.js";

export { SECRET_PATTERNS, scrubSecrets } from "./redact.js";

export { z } from "./zod.js";
