import { z } from "../zod.js";

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

/**
 * MCP-style behavior hints. Kept structurally identical to the MCP spec's
 * ToolAnnotations (minus display title, which is presentation) so an MCP
 * server can spread these straight into a tool registration — but this module
 * has no MCP dependency; a CLI can read them as plain capability flags.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// ─── Annotation presets ──────────────────────────────────────────────────────
// Every tool carries one. Clients read them to decide what may run unattended, and
// MCP directory listings expect them to be present.

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export const CREATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
export const UPDATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
// Triggering a worker run causes real-world side effects through the worker's own
// tools (it may send email, edit CRM rows, …) — openWorld, but not destructive to
// WorkerKit state itself.
export const TRIGGER: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

/**
 * One tool, described declaratively: what it is called, what it teaches the
 * agent, and exactly how its parameters map onto one upstream HTTP request.
 * This is the single source of truth consumed by the MCP server (inputSchema,
 * annotations, wire call via executeTool) and by any future surface (CLI
 * flags, docs) — wire construction exists exactly once, in executeTool.
 */
export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  /** "manager" tools require a bearer; "anonymous" tools must never forward one. */
  auth: "manager" | "anonymous";
  method: HttpMethod;
  /** Single source for the MCP inputSchema AND future CLI flags. */
  schema: z.ZodRawShape;
  /** Reject unknown top-level inputs instead of silently dropping unsupported controls. */
  strictInput?: boolean;
  /** Structured success result. MCP adapters retain a serialized text fallback. */
  outputSchema?: z.ZodRawShape;
  /** Upstream path, or a builder over the validated params. */
  path: string | ((params: Record<string, unknown>) => string);
  /**
   * GET only: maps tool params to query params (typically stripping the ones
   * already consumed by the path builder). Omitted = all params pass through.
   */
  paramFilter?: (params: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Mutations only: builds the JSON body from the params. Omitted = the raw
   * params object is the body. DELETE requests never send a body either way.
   */
  bodyBuilder?: (params: Record<string, unknown>) => unknown;
  /** Headers derived from typed inputs, e.g. a checkout idempotency key. */
  headerBuilder?: (params: Record<string, unknown>) => Record<string, string>;
  /** Mutations: message served on an empty (204) success body. */
  successMessage?: string;
  annotations: ToolAnnotations;
  /**
   * Pure success-data transform (e.g. computed pageUrl injection). Returning
   * `undefined` means "unexpected shape — serve the upstream body verbatim";
   * the consumer then falls back to its plain formatting path.
   */
  mapData?: (data: unknown, params: Record<string, unknown>) => unknown;
  /**
   * Agent-guidance footer for a successful result (empty-result hints,
   * next-page pointers, omitted-bodies notes). Receives the mapData output.
   * How the footer is rendered (e.g. bracketed, appended) is the consumer's
   * presentation decision.
   */
  footer?: (data: unknown, params: Record<string, unknown>) => string | undefined;
}
