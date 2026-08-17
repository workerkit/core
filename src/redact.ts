// Path-based log redaction cannot reach substrings inside free-text fields
// (upstream error bodies, error messages, stack traces). Run those through this
// scrubber before logging. The pe_ pattern covers every WorkerKit key family
// (pe_mgr_ manager keys, pe_mgr_mcp_ OAuth bearers, pe_mgr_rt_ refresh tokens,
// pe_ worker keys), plus any inline bearer credential.
export const SECRET_PATTERNS: readonly RegExp[] = [
  /\bpe_[A-Za-z0-9_]{4,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}
