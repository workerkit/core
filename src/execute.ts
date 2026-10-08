import type { ApiResult, PortEdenClient } from "./client.js";
import type { ToolDescriptor } from "./descriptors/types.js";
import { z } from "./zod.js";

export interface ExecuteToolOpts {
  /** Bearer forwarded upstream. Omit for anonymous descriptors. */
  token?: string;
  signal?: AbortSignal;
}

/**
 * The ONE place a descriptor becomes a wire call: resolves the path, applies
 * paramFilter (GET query) or bodyBuilder (mutations), and dispatches to the
 * client. Every consumer (MCP server, CLI) goes through here, so the wire
 * contract each tool produces exists exactly once.
 */
export async function executeTool(
  client: PortEdenClient,
  descriptor: ToolDescriptor,
  params: Record<string, unknown>,
  opts: ExecuteToolOpts = {}
): Promise<ApiResult> {
  // Direct core consumers bypass MCP's input parser. Reject unsupported execution controls
  // before a bodyBuilder can drop them and start a real run (notably legacy preview:true).
  if (descriptor.strictInput) params = z.object(descriptor.schema).strict().parse(params);
  const resolvedPath =
    typeof descriptor.path === "function" ? descriptor.path(params) : descriptor.path;
  // Discovery stays anonymous even when a caller shares its authenticated client context.
  const token = descriptor.auth === "manager" ? opts.token : undefined;
  const timeoutMs = descriptor.requestTimeoutMs?.(params);
  const extra = {
    ...(descriptor.headerBuilder ? { headers: descriptor.headerBuilder(params) } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };

  if (descriptor.method === "get") {
    // Strip path params from query params
    const queryParams = descriptor.paramFilter ? descriptor.paramFilter(params) : { ...params };
    return client.get(resolvedPath, {
      ...extra,
      token,
      params: queryParams,
      signal: opts.signal,
    });
  }

  const body = descriptor.bodyBuilder ? descriptor.bodyBuilder(params) : params;
  return client[descriptor.method](resolvedPath, {
    ...extra,
    token,
    body: descriptor.method !== "delete" ? body : undefined,
    signal: opts.signal,
  });
}
