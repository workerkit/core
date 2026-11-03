import { request } from "undici";
import type { ApiResult, PortEdenClient } from "./client.js";

/** Largest single input file a run accepts: 7 MiB. */
export const MAX_INPUT_FILE_BYTES = 7 * 1024 * 1024;
/** Largest total size of one run's input files: 15 MiB. */
export const MAX_INPUT_RUN_BYTES = 15 * 1024 * 1024;
/** Most input files one run accepts. */
export const MAX_INPUT_FILES = 3;

/** A finalized upload, as `worker_run` and `run_bulk` take it in `inputs`. */
export type FileInput = { kind: "file"; fileId: string };

/**
 * An upload's metadata and lifecycle status, as `worker_file_get` and the finalize step return
 * it. Never the bytes or a download URL.
 */
export type WorkerFileStatus = {
  fileId: string;
  name: string;
  contentType: string;
  size: number;
  status: string;
  failureCode?: string;
};

/**
 * What the WorkerKit API answered when reserving or finalizing an upload failed. Storage
 * responses are never included.
 */
export interface FileUploadFailure {
  status: number;
  error?: string;
  message?: string;
}

export type FileUploadErrorCode =
  | "invalid_file_metadata"
  | "file_prepare_failed"
  | "invalid_upload_destination"
  | "invalid_upload_ticket"
  | "file_upload_failed"
  | "file_finalize_failed";

export class FileUploadError extends Error {
  constructor(
    public readonly code: FileUploadErrorCode,
    public readonly upstream?: FileUploadFailure,
  ) {
    super(code);
    this.name = "FileUploadError";
  }
}

const SUPPORTED_CONTENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_HOST = "storage.googleapis.com";
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_UPSTREAM_TEXT = 300;

interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

/**
 * Upload one file for a worker and return the reference `worker_run` takes in `inputs`.
 *
 * This is for your own code (a CLI, a dashboard, a server), not for a model: it reserves the
 * upload with the WorkerKit API, sends the bytes straight to private storage over a short-lived
 * signed URL, finalizes the file and returns only an opaque reference. The signed URL and the
 * bytes never belong in tool results, prompts or logs, and the manager key is never sent to
 * storage. When any step after the reservation fails, the reservation is revoked so that a late
 * upload cannot complete.
 */
export async function uploadWorkerFile(
  client: PortEdenClient,
  token: string,
  tokenId: number,
  file: { name: string; contentType: string; bytes: Uint8Array },
  signal?: AbortSignal,
): Promise<FileInput> {
  if (!validMetadata(tokenId, file)) throw new FileUploadError("invalid_file_metadata");
  const root = `/api/manage/workers/${tokenId}/files`;
  const size = file.bytes.byteLength;
  const prepared = await client.post<UploadTicket>(root, {
    token,
    signal,
    body: { name: file.name, contentType: file.contentType, size },
  });
  if (prepared.status !== 200 || !UUID.test(prepared.data?.fileId ?? "")) {
    throw new FileUploadError("file_prepare_failed", upstreamFailure(prepared));
  }
  const ticket = prepared.data;
  try {
    const destination = uploadDestination(ticket.uploadUrl);
    const headers = signedHeaders(ticket.headers, file.contentType, size);
    const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
    // undici.request never follows redirects: the bytes reach the verified destination or nothing.
    const response = await request(destination, {
      method: "PUT",
      headers,
      body: file.bytes,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headersTimeout: UPLOAD_TIMEOUT_MS,
      bodyTimeout: UPLOAD_TIMEOUT_MS,
    });
    response.body.destroy(); // Storage response bodies are never read, surfaced or logged.
    if (response.statusCode !== 200 && response.statusCode !== 201) {
      throw new FileUploadError("file_upload_failed");
    }
    const finalized = await client.post<WorkerFileStatus>(`${root}/${ticket.fileId}/finalize`, { token, signal });
    if (finalized.status !== 200 || finalized.data?.status !== "ready") {
      throw new FileUploadError("file_finalize_failed", upstreamFailure(finalized));
    }
    return { kind: "file", fileId: ticket.fileId };
  } catch (error) {
    // Revoke even after an uncertain upload: the tombstone rejects a late PUT.
    await client.delete(`${root}/${ticket.fileId}`, { token }).catch(() => undefined);
    throw error instanceof FileUploadError ? error : new FileUploadError("file_upload_failed");
  }
}

function validMetadata(tokenId: number, file: { name: string; contentType: string; bytes: Uint8Array }): boolean {
  return Number.isSafeInteger(tokenId) && tokenId >= 1
    && SUPPORTED_CONTENT_TYPES.has(file.contentType)
    && file.bytes.byteLength >= 1 && file.bytes.byteLength <= MAX_INPUT_FILE_BYTES
    && file.name.trim().length > 0 && file.name.length <= 240
    && !/[\x00-\x1f\x7f/\\]/.test(file.name);
}

/** Only HTTPS to the storage host, without a port, credentials or a fragment, may receive the bytes. */
function uploadDestination(uploadUrl: string): URL {
  let url: URL;
  try {
    url = new URL(uploadUrl);
  } catch {
    throw new FileUploadError("invalid_upload_destination");
  }
  if (url.protocol !== "https:" || url.hostname !== STORAGE_HOST || url.port || url.username || url.password || url.hash) {
    throw new FileUploadError("invalid_upload_destination");
  }
  return url;
}

/** Exactly the three headers the signature covers, with the values this file needs. Nothing else is sent. */
function signedHeaders(headers: Record<string, string> | undefined, contentType: string, size: number): Record<string, string> {
  const valid = headers !== undefined && typeof headers === "object"
    && Object.keys(headers).length === 3
    && headers["Content-Type"] === contentType
    && headers["x-goog-if-generation-match"] === "0"
    && headers["x-goog-content-length-range"] === `${size},${size}`;
  if (!valid) throw new FileUploadError("invalid_upload_ticket");
  return headers;
}

function upstreamFailure(result: ApiResult<unknown>): FileUploadFailure {
  const body = result.data !== null && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 && value.length <= MAX_UPSTREAM_TEXT ? value : undefined;
  const failure: FileUploadFailure = { status: result.status };
  const error = text(body.error) ?? text(body.failureCode);
  const message = text(body.message);
  if (error !== undefined) failure.error = error;
  if (message !== undefined) failure.message = message;
  return failure;
}
