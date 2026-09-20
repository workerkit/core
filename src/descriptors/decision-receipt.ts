/** Keep exact decision rows once in LLM-facing receipts. The API remains unchanged. */
export function compactDecisionReceipt(data: unknown): unknown {
  if (!isObject(data) || !isObject(data.decision) || !Array.isArray(data.decision.decisions)
    || !isObject(data.digestStructured) || !Array.isArray(data.digestStructured.items)) return data;
  // Only remove an actual duplicate; older or unexpected server shapes remain readable.
  if (JSON.stringify(data.decision.decisions) !== JSON.stringify(data.digestStructured.items)) return data;
  const { items: _items, ...digestStructured } = data.digestStructured;
  return { ...data, digestStructured };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
