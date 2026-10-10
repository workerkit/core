import { scrubSecrets } from "../redact.js";
import { z } from "../zod.js";
import { CREATE, type ToolDescriptor } from "./types.js";

// The subject and message are stored and emailed to the support inbox, and the
// agent is asked to paste error text and call arguments into them: key-shaped
// strings are redacted before they leave the process, whatever the agent wrote.
const redacted = (value: unknown) => (typeof value === "string" ? scrubSecrets(value) : value);

export const supportDescriptors: readonly ToolDescriptor[] = [
  {
    name: "support_request_create",
    title: "Contact Support",
    auth: "manager",
    method: "post",
    path: "/api/manage/support/requests",
    schema: {
      category: z.enum(["error", "bug", "app_request", "general"])
        .describe("The kind of request. error: a WorkerKit tool or API call failed in a way you cannot fix; bug: something works incorrectly; app_request: an app or integration WorkerKit does not offer yet; general: billing, the account or any other question."),
      subject: z.string().min(3).max(150).describe("One line that summarizes the request."),
      message: z.string().min(10).max(2000)
        .describe("What happened and what was expected. For an error: the tool called, its arguments without secrets, the HTTP status, and the error code and message exactly as returned."),
      runId: z.string().uuid().optional().describe("The runId concerned, when the problem is about a run."),
      workerId: z.string().uuid().optional().describe("The workerId concerned, when the problem is about a worker: the UUID workers_list returns, not the numeric tokenId."),
    },
    bodyBuilder: (params) => ({
      category: params.category,
      subject: redacted(params.subject),
      message: redacted(params.message),
      runId: params.runId,
      workerId: params.workerId,
    }),
    annotations: CREATE,
    description: "Contact WorkerKit support on the user's behalf and receive a PE-XXXXXX reference. Use it when a WorkerKit tool fails in a way you cannot fix: a 5xx, a refusal that does not explain itself, or a result that contradicts the documentation. Also use it when the user reports a bug, asks for an app or integration WorkerKit does not offer (app_request), or wants to reach the team about billing, the account or anything else (general). Do not file refusals that name their own fix, such as a missing scope (403 OPERATION_NOT_ALLOWED), a validation error or insufficient funds; follow the fix instead. For an error, put the tool called, the HTTP status and the error code and message exactly as returned in message, and pass runId or workerId when they apply. Never include API keys, tokens or other secrets. No scope is needed, but the key must belong to an active user of the account, because support replies to that user by email; a key without one is refused with 403 user_not_connected. Tell the user what you filed and give them the returned referenceNumber. File each problem once: send it again only after 503 support_unavailable, or after a 429 once its Retry-After has passed. Limited per account to 2 requests a minute, 5 an hour and 20 a day.",
  },
];
