// Pure envelope helpers shared by every presentation layer (MCP server, CLI).
// Transport-format mapping (e.g. MCP ToolResult assembly, OAuth re-auth
// signalling) stays with the consumer — nothing here knows about MCP.

import type { ApiResult, QuotaInfo } from "./client.js";

/** True for a 2xx result — the "HTTP status is the verdict" success check. */
export function isSuccess(result: ApiResult): boolean {
  return result.status >= 200 && result.status < 300;
}

// The manager surface sends no X-Monthly-* quota headers, so this degrades to ""
// on every call today; kept so the client contract stays byte-compatible across
// surfaces and quota headers light up automatically if the backend ever adds them.
export function quotaSuffix(quota: QuotaInfo): string {
  if (quota.remaining !== null && quota.limit !== null && quota.used !== null) {
    return `\n\n[API quota: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining]`;
  }
  return "";
}

// The manager surface rate-limits per account and its auth throttle sends
// Retry-After too. The header is invisible inside the JSON body passthrough,
// so surface it.
export function retryAfterSuffix(result: ApiResult): string {
  if (result.status === 429 && result.quota.retryAfter !== null) {
    return `\n\n[Rate limited: retry after ${result.quota.retryAfter}s]`;
  }
  return "";
}
