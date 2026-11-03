// Generated from the backend agent contract. Edit the backend source and re-import; do not edit here.
import { z } from "../zod.js";
import { defineTool, READ_ONLY, UPDATE, DELETE, type ToolDescriptor } from "./types.js";

const worker = { tokenId: z.number().int().min(1).describe("Worker numeric token ID from worker_get.") };
const root = (p: Record<string, unknown>) => `/api/manage/workers/${p.tokenId}/files`;

export const fileDescriptors: ToolDescriptor[] = [
  defineTool({
    name: "worker_file_storage_get", title: "Read Worker File Storage", auth: "manager", method: "get",
    description: "Read this worker's file-intake storage selection. {{scope}} Platform storage deletes original content after confirmed runtime handoff. Customer storage needs a private GCS bucket and account-bound delegated service account. Storage selection grants no receive, model-forwarding or export permission; edit Files through worker_permissions_set.",
    schema: worker, path: p => `${root(p)}/storage`, paramFilter: () => ({}), annotations: READ_ONLY,
  }),
  defineTool({
    name: "worker_file_storage_set", title: "Set Worker File Storage", auth: "manager", method: "put", strictInput: true,
    description: "Choose file-intake storage for this worker; requires an account Admin. {{scope}} Platform uses the configured private delivery buffer. Customer requires a dedicated GCS service account with WorkerKit delegation, named wk- plus the account UUID's first 24 hex characters. No private keys or arbitrary storage URLs. Existing uploads keep their original binding for cleanup; new uploads use this selection. This does not grant Files permissions.",
    schema: { ...worker, ownership: z.enum(["platform", "customer"]), bucket: z.string().min(3).max(63).optional(), serviceAccount: z.string().max(254).optional() },
    path: p => `${root(p)}/storage`, bodyBuilder: p => ({ ownership: p.ownership, bucket: p.bucket, serviceAccount: p.serviceAccount }), annotations: UPDATE,
  }),
  defineTool({
    name: "worker_file_get", title: "Read Uploaded File Status", auth: "manager", method: "get", strictInput: true,
    description: "Read one worker upload's metadata and lifecycle status, never its bytes or a download URL. {{scope}} Use dashboard or wk run --file for local uploads; plain MCP cannot read local attachments. Only finalized file IDs can be submitted in worker_run.inputs. Deleted platform originals cannot be replayed; upload again for another run.",
    schema: { ...worker, fileId: z.string().uuid() }, path: p => `${root(p)}/${p.fileId}`, paramFilter: () => ({}), annotations: READ_ONLY,
  }),
  defineTool({
    name: "worker_file_delete", title: "Delete Uploaded File", auth: "manager", method: "delete", strictInput: true,
    description: "Revoke an upload and remove its stored content. {{scope}} Blocks subsequent reads/exports; cannot recall bytes already disclosed. Cleanup may fail if storage access was revoked: check worker_file_get before claiming deletion. Does not delete a saved destination file or extracted results.",
    schema: { ...worker, fileId: z.string().uuid() }, path: p => `${root(p)}/${p.fileId}`, paramFilter: () => ({}), annotations: DELETE,
  }),
];
