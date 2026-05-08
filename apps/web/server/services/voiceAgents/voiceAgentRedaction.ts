const SECRET_KEY_RE = /(api[_-]?key|authorization|token|secret|signature|conversationToken|signedUrl)/i;

export function redactVoiceAgentPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactVoiceAgentPayload(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactVoiceAgentPayload(nested);
    }
    return out as T;
  }
  return value;
}
