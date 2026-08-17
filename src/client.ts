import { Agent, request as undiciRequest } from "undici";
import { randomUUID } from "node:crypto";

/**
 * Minimal structured-logging surface the client emits into. Matches pino's
 * object-first calling convention (`logger.info({ msg, ... })`) so a pino
 * instance satisfies it directly; defaults to a no-op when omitted.
 */
export interface ClientLogger {
  info(o: object, msg?: string): void;
  warn(o: object, msg?: string): void;
  error(o: object, msg?: string): void;
}

export interface ClientOptions {
  /** Upstream API base URL, e.g. "https://api.workerkit.ai". */
  baseUrl: string;
  /** Per-attempt request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Streamed response body cap in bytes. Default 10 MiB. */
  maxResponseBodyBytes?: number;
  /** Connection-pool size. Default 16. */
  maxConnections?: number;
  /** Emitted as the User-Agent header on every request when set. */
  userAgent?: string;
  /** Structured logger; defaults to a no-op. */
  logger?: ClientLogger;
  /**
   * Supplies the current correlation id (e.g. from AsyncLocalStorage in a
   * server). When it returns a value, each attempt's X-Request-Id is derived
   * from it (`<id>-aN`); otherwise a fresh UUID is minted per attempt.
   */
  requestIdProvider?: () => string | undefined;
}

export interface RequestOpts {
  /** Bearer forwarded upstream. Omit for anonymous endpoints. */
  token?: string;
  params?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Extra request headers. Every computed header (Authorization, X-Request-Id,
   * User-Agent, Accept, Content-Type) is assigned AFTER this spread and wins,
   * so these can never override one.
   */
  headers?: Record<string, string>;
}

export interface QuotaInfo {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  retryAfter: number | null;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  quota: QuotaInfo;
  requestId: string;
  /**
   * Set to false when the failure is deterministic and re-issuing the identical request cannot
   * change the outcome. Overrides RETRYABLE_STATUSES, which classifies by status alone and so
   * can't tell a transport blip (status 0, worth retrying) from a local failure that happens to
   * report the same status. Absent means "decide by status", the normal path.
   */
  retryable?: boolean;
}

/**
 * The upstream response was well-formed but larger than the configured read budget, so we
 * abandoned it mid-stream. Typed because it must not be retried: the response is deterministic,
 * so the next two attempts re-download the same oversized body, burn the same seconds, and fail
 * identically.
 */
export class ResponseTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Response body exceeded ${limitBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

// Retry policy — only applied to idempotent HTTP methods on transient upstream failures.
// POST/PATCH are excluded because retrying a non-idempotent write could duplicate side
// effects. Status 0 = transport error, 504 = local timeout (see doRequest).
//
// 429 must NEVER join RETRYABLE_STATUSES: upstream's Retry-After on a QUOTA_EXCEEDED 429
// is secondsUntilReset (weeks, not seconds), MAX_BACKOFF_MS would clamp it to 2s, and a
// billing-period quota wall would become a tight retry loop. It is surfaced to the
// caller, which branches on errorCode, and never retried here.
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE"]);
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [200, 500]; // between attempts 1→2 and 2→3
// Ceiling on any Retry-After honoured below. Dormant today: no RETRYABLE_STATUS carries
// one, so quota.retryAfter is always null there. Read the 429 note above before changing.
const MAX_BACKOFF_MS = 2_000;

const NOOP_LOGGER: ClientLogger = {
  info() {
    /* no-op */
  },
  warn() {
    /* no-op */
  },
  error() {
    /* no-op */
  },
};

export class PortEdenClient {
  private agent: Agent;
  private baseUrl: string;
  private baseOrigin: string;
  private timeoutMs: number;
  private maxResponseBodyBytes: number;
  private userAgent: string | undefined;
  private logger: ClientLogger;
  private requestIdProvider: (() => string | undefined) | undefined;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl;
    this.baseOrigin = new URL(options.baseUrl).origin;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxResponseBodyBytes = options.maxResponseBodyBytes ?? 10 * 1024 * 1024;
    this.userAgent = options.userAgent;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.requestIdProvider = options.requestIdProvider;
    this.agent = new Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      pipelining: 1,
      connections: options.maxConnections ?? 16,
      connect: { rejectUnauthorized: true },
      // Defence in depth: the per-attempt AbortSignal below already bounds each
      // call, but undici's own limits default to ~300s — pin them to the same
      // budget so a hung upstream can never outlive the request either way.
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
    });
  }

  async get<T = unknown>(path: string, opts: RequestOpts): Promise<ApiResult<T>> {
    return this.doRequest<T>("GET", path, opts);
  }

  async post<T = unknown>(path: string, opts: RequestOpts): Promise<ApiResult<T>> {
    return this.doRequest<T>("POST", path, opts);
  }

  async patch<T = unknown>(path: string, opts: RequestOpts): Promise<ApiResult<T>> {
    return this.doRequest<T>("PATCH", path, opts);
  }

  async put<T = unknown>(path: string, opts: RequestOpts): Promise<ApiResult<T>> {
    return this.doRequest<T>("PUT", path, opts);
  }

  async delete<T = unknown>(path: string, opts: RequestOpts): Promise<ApiResult<T>> {
    return this.doRequest<T>("DELETE", path, opts);
  }

  private async doRequest<T>(
    method: string,
    path: string,
    opts: RequestOpts
  ): Promise<ApiResult<T>> {
    const isIdempotent = IDEMPOTENT_METHODS.has(method);
    const maxAttempts = isIdempotent ? MAX_ATTEMPTS : 1;

    // Total deadline across ALL attempts and backoff delays. Without it, the
    // worst case against a slow-then-failing upstream is ~3 x timeoutMs plus
    // backoff, holding a concurrency slot for ~90s. Two timeout budgets is
    // enough for one slow attempt plus a meaningful retry.
    const totalDeadlineAt = performance.now() + this.timeoutMs * 2;

    let result: ApiResult<T> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (opts.signal?.aborted) {
        return {
          status: 0,
          data: null as T,
          quota: { limit: null, used: null, remaining: null, retryAfter: null },
          requestId: randomUUID(),
        };
      }

      result = await this.singleAttempt<T>(method, path, opts, attempt, totalDeadlineAt);

      if (
        result.retryable === false ||
        !RETRYABLE_STATUSES.has(result.status) ||
        attempt === maxAttempts
      ) {
        return result;
      }

      const baseDelay = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      const retryAfterMs = (result.quota.retryAfter ?? 0) * 1000;
      const delayMs = Math.min(Math.max(baseDelay, retryAfterMs), MAX_BACKOFF_MS);

      // Skip the retry when the remaining budget can't fit the backoff plus a
      // useful slice of the next attempt — return the transient failure instead
      // of holding the slot past the deadline.
      if (performance.now() + delayMs + 1_000 > totalDeadlineAt) {
        this.logger.info({
          msg: "api_retry_budget_exhausted",
          method,
          path,
          status: result.status,
          attempt,
          requestId: result.requestId,
        });
        return result;
      }

      this.logger.info({
        msg: "api_retry",
        method,
        path,
        status: result.status,
        attempt,
        nextDelayMs: delayMs,
        requestId: result.requestId,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    return result!;
  }

  private async singleAttempt<T>(
    method: string,
    path: string,
    opts: RequestOpts,
    attempt: number,
    totalDeadlineAt: number
  ): Promise<ApiResult<T>> {
    // Derive from the inbound correlation id so the caller's request log, the
    // api_call lines and the upstream API's own logs all join on one key; the
    // -aN suffix keeps each retry attempt distinguishable while staying unique
    // per upstream request.
    const correlationId = this.requestIdProvider?.();
    const requestId = correlationId ? `${correlationId}-a${attempt}` : randomUUID();
    const url = this.buildUrl(path, opts.params);
    const start = performance.now();

    const headers: Record<string, string> = {
      ...opts.headers,
      "X-Request-Id": requestId,
      Accept: "application/json",
    };
    if (this.userAgent) {
      headers["User-Agent"] = this.userAgent;
    }
    if (opts.token) {
      headers.Authorization = `Bearer ${opts.token}`;
    }

    const hasBody = opts.body !== undefined && method !== "GET";
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }

    // Compose the caller's cancellation signal with a per-attempt timeout.
    // Using only opts.signal would let a long upstream call hang indefinitely;
    // using only the timeout would ignore client cancellation.
    //
    // The per-attempt budget is CLAMPED to what is left of the whole-call
    // deadline. Without the clamp, totalDeadlineAt gated only the DECISION to
    // start another attempt: the final attempt then got a fresh full timeoutMs
    // and the call could run ~3 x timeoutMs (~90s on defaults), holding a
    // concurrency slot and an upstream connection long after the caller had
    // given up.
    //
    // Order matters: floor at 1s (doRequest's gate already guarantees roughly
    // that much budget at attempt start, so this only guards arithmetic edges),
    // THEN cap at timeoutMs. Flooring last would hand a 1s budget to a
    // deployment configured with a shorter timeout.
    const remainingMs = totalDeadlineAt - performance.now();
    const timeoutSignal = AbortSignal.timeout(
      Math.min(this.timeoutMs, Math.max(1_000, remainingMs))
    );
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await undiciRequest(url, {
        method: method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
        headers,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal,
        dispatcher: this.agent,
      });

      const status = response.statusCode;
      const responseBody = await this.readBodyWithLimit(response.body);
      const elapsed = Math.round(performance.now() - start);

      let data: T;
      try {
        data = JSON.parse(responseBody) as T;
      } catch {
        data = (responseBody || null) as T;
      }

      const quota = this.extractQuota(response.headers as Record<string, string>);

      // An upstream 5xx is a service-level error: the request reached the API and
      // it failed to serve it. It goes through this success branch (undici resolved),
      // so without bumping the level here it would be logged at INFO — buried among
      // healthy 200s and invisible to log-based WARNING/ERROR views and alerts.
      // WARN (not ERROR): "something is wrong with the service", but often transient
      // and retried. 4xx stays at INFO — those are client/auth/quota/validation
      // outcomes, not outages.
      const logAtWarn = status >= 500;
      this.logger[logAtWarn ? "warn" : "info"]({
        msg: "api_call",
        method,
        path,
        status,
        elapsed,
        requestId,
        attempt,
        quotaRemaining: quota.remaining,
      });

      return { status, data, quota, requestId };
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      // Distinguish caller-cancel from local timeout: timeoutSignal aborts when the
      // per-attempt budget is exhausted; opts.signal aborts when the caller
      // gave up. Treat caller-cancel as a non-retryable transport failure.
      const callerAborted = opts.signal?.aborted === true;
      const timedOut = !callerAborted && timeoutSignal.aborted;
      const isTransport =
        err instanceof Error &&
        "code" in err &&
        (err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT");
      const tooLarge = err instanceof ResponseTooLargeError;

      this.logger.error({
        msg: "api_error",
        method,
        path,
        elapsed,
        requestId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
        callerAborted,
        timedOut,
        isTransport,
        tooLarge,
      });

      return {
        status: timedOut ? 504 : 0,
        data: null as T,
        quota: { limit: null, used: null, remaining: null, retryAfter: null },
        requestId,
        // An oversized response reports status 0 like a transport error, but re-requesting it is
        // guaranteed to fail the same way — mark it so the retry loop doesn't spend two more
        // attempts (and both backoffs) proving that.
        ...(tooLarge ? { retryable: false } : {}),
      };
    }
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    // SSRF defence: reject absolute URLs and ensure the resolved origin matches the
    // configured upstream. Tool paths are hard-coded today, but this is a cheap guard
    // against future bugs (typo, unencoded user input flowing into path) that could
    // pivot the proxy into making requests to an attacker-controlled host.
    if (!path.startsWith("/")) {
      throw new Error(`Invalid upstream path: must start with '/' (got ${path.slice(0, 64)})`);
    }
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseOrigin) {
      throw new Error(`Upstream origin mismatch: ${url.origin} != ${this.baseOrigin}`);
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        // Array params repeat the key (?userIds=a&userIds=b) — that is what the
        // backend's [FromQuery] List<T> binding expects. The scalar String(value)
        // path below would comma-join an array into ONE value ("a,b"), which binds
        // as a single-element list and silently matches nothing upstream. Params
        // the backend takes as a comma-separated string instead are typed
        // z.string() by their tools and never reach this branch.
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
          }
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  // Anchored rather than a bare parseInt, which is lenient: it takes the leading digit
  // run and ignores the rest, so an ISO-8601 timestamp (the shape of the resetsAt that
  // rides the QUOTA_EXCEEDED body) would parse to 2026 and read as a plausible 33-minute
  // backoff, with no NaN to catch it. Anchoring fails closed on that and on the HTTP-date
  // form alike. `-?` keeps any negative X-Monthly-* sentinel; a negative Retry-After is
  // rejected at the use site.
  private extractQuota(headers: Record<string, string | string[] | undefined>): QuotaInfo {
    const toNum = (key: string): number | null => {
      const val = headers[key];
      const str = (Array.isArray(val) ? val[0] : val)?.trim();
      if (!str || !/^-?\d+$/.test(str)) return null;
      const n = Number(str);
      return Number.isSafeInteger(n) ? n : null;
    };

    return {
      limit: toNum("x-monthly-limit"),
      used: toNum("x-monthly-used"),
      remaining: toNum("x-monthly-remaining"),
      retryAfter: toNum("retry-after"),
    };
  }

  private async readBodyWithLimit(body: import("undici").Dispatcher.ResponseData["body"]): Promise<string> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of body) {
      totalBytes += chunk.length;
      if (totalBytes > this.maxResponseBodyBytes) {
        // Consume remaining to avoid connection leaks, then throw
        body.destroy();
        throw new ResponseTooLargeError(this.maxResponseBodyBytes);
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

/** Brand-facing alias — the same client, published under the WorkerKit name. */
export { PortEdenClient as WorkerKitClient };
