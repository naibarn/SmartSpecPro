const SECRET_KEY =
  /(?:token|secret|password|api[_-]?key|authorization|signedurl|signed_url)/i;

export function validateEditorReference(value: string): void {
  if (
    !/^[A-Za-z0-9._:/-]{1,512}$/.test(value) ||
    /(?:^|[\\/])\.\.(?:[\\/])|^https?:\/\/|^(?:file|ftp):/i.test(value) ||
    /(?:^|[.:])(?:127\.0\.0\.1|localhost|169\.254\.169\.254|0\.0\.0\.0)(?:$|[/:])/i.test(
      value
    )
  ) {
    throw new Error("EDITOR_REFERENCE_UNSAFE");
  }
}

export function redactEditorEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEditorEvent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redactEditorEvent(item),
    ])
  );
}

export function boundedEditorRetry(
  attempt: number,
  maxAttempts: number
): { retry: boolean; delayMs: number } {
  if (
    !Number.isSafeInteger(attempt) ||
    !Number.isSafeInteger(maxAttempts) ||
    attempt < 1 ||
    maxAttempts < 1 ||
    attempt >= maxAttempts
  )
    return { retry: false, delayMs: 0 };
  return { retry: true, delayMs: Math.min(30_000, 500 * 2 ** (attempt - 1)) };
}
