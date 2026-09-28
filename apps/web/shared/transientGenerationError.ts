/**
 * Provider/transport failures that are safe to retry without changing the
 * user's request. Structural, ownership, validation, and credit errors must
 * stay visible to the caller instead.
 */
export function isTransientSafetyReviewError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /image prompt safety review was unavailable for a sensitive prompt/i.test(
    message,
  );
}

export function isTransientGenerationError(error: unknown): boolean {
  const messages: string[] = [];
  const collect = (value: unknown, depth = 0): void => {
    if (value == null || depth > 4) return;
    if (typeof value === "string") {
      messages.push(value);
      return;
    }
    if (value instanceof Error) messages.push(value.message);
    if (typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === "message" ||
        key === "detail" ||
        key === "error" ||
        key === "errorMessage" ||
        key === "responsePayload" ||
        key === "data" ||
        key === "cause"
      ) {
        collect(nested, depth + 1);
      }
    }
  };

  collect(error);
  const text = messages.join(" ").replace(/\s+/g, " ").trim();
  return isTransientSafetyReviewError(text) || /empty response|no assistant text|expected one complete json|image fetch failed|failed to fetch|fetch failed|network|econnreset|econnrefused|socket hang up|temporarily unavailable|provider capacity|no healthy provider|all providers failed|in[- ]flight requests|rate[ -]?limit|too many requests|quota exceeded|\b429\b|\b408\b|\b5\d{2}\b|timed? out|timeout|aborted|upstream|gateway/i.test(
    text
  );
}
