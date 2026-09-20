import { z } from "../zod.js";
import { READ_ONLY, type ToolDescriptor } from "./types.js";

export const onboardingDescriptors: readonly ToolDescriptor[] = [
  {
    name: "onboarding_get",
    title: "Check onboarding requirements",
    auth: "manager",
    method: "get",
    path: "/api/manage/onboarding",
    schema: {
      provider: z.string().max(40).optional().describe("Optional model provider to check."),
    },
    annotations: READ_ONLY,
    description: "Read this credential’s scopes/expiry, account model-funding requirements and human-approved spendPolicy with remaining reserved allowance. No additional scope required. Agents cannot raise the account ceiling; it applies to scheduled and manual runs. If humanActionRequired is true, show the returned setup URL. The user enters provider keys on WorkerKit, never in chat. BYOK can still require wallet credits for platform fees and metered apps. After funding, check worker readiness, deploy and run; runtime guards remain authoritative.",
  },
  {
    name: "wallet_get",
    title: "Read wallet",
    auth: "manager",
    method: "get",
    path: "/api/manage/wallet",
    schema: {},
    annotations: READ_ONLY,
    description: "Read spendable wallet balance and checkout fee/amount limits. Requires readWallet. A wallet balance is not evidence that a particular checkout was credited; use wallet_checkout_get for that.",
  },
  {
    name: "wallet_checkout_create",
    title: "Request wallet funding",
    auth: "manager",
    method: "post",
    path: "/api/manage/wallet/checkouts",
    schema: {
      amountUsd: z.number().min(0.01).max(999999.99).multipleOf(0.01)
        .describe("Credit amount in whole cents, before the returned platform fee. Read wallet_get for current purchase limits."),
      idempotencyKey: z.string().min(1).max(200).regex(/^[\x21-\x7E]+$/)
        .describe("Unique printable-ASCII purchase request ID. Reuse only for retries of the same amount."),
    },
    bodyBuilder: (params) => ({ amountUsd: params.amountUsd }),
    headerBuilder: (params) => ({ "Idempotency-Key": String(params.idempotencyKey) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: "Create a Stripe Checkout link for a specific wallet credit purchase. Requires requestWalletTopUp. Show the credit, fee and total and ask the user to open checkout and confirm payment. Never ask for card details or charge a saved card. Poll wallet_checkout_get after payment; only credited confirms funds reached the ledger. Reuse idempotencyKey for retries, never a different amount.",
  },
  {
    name: "wallet_checkout_get",
    title: "Check wallet payment",
    auth: "manager",
    method: "get",
    path: (params) => `/api/manage/wallet/checkouts/${encodeURIComponent(String(params.sessionId))}`,
    paramFilter: () => ({}),
    schema: { sessionId: z.string().min(1).max(255) },
    annotations: READ_ONLY,
    description: "Check pending, paid_pending_credit, credited or expired checkout status. Requires readWallet, or requestWalletTopUp for a checkout created by this credential. Only credited means the wallet ledger has committed. Wait at least five seconds between checks; stop on credited or expired and use bounded waits for delayed payment.",
  },
];
