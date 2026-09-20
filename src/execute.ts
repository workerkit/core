import type { ApiResult, PortEdenClient } from "./client.js";
import type { ToolDescriptor } from "./descriptors/types.js";

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
  const resolvedPath =
    typeof descriptor.path === "function" ? descriptor.path(params) : descriptor.path;
  // Discovery stays anonymous even when a caller shares its authenticated client context.
  const token = descriptor.auth === "manager" ? opts.token : undefined;

  if (descriptor.method === "get") {
    // Strip path params from query params
    const queryParams = descriptor.paramFilter ? descriptor.paramFilter(params) : { ...params };
    return client.get(resolvedPath, {
      token,
      params: queryParams,
      signal: opts.signal,
    });
  }

  const body = descriptor.bodyBuilder ? descriptor.bodyBuilder(params) : params;
  return client[descriptor.method](resolvedPath, {
    token,
    body: descriptor.method !== "delete" ? body : undefined,
    signal: opts.signal,
  });
}
