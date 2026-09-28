type ChatInferenceSelection =
  | { mode: "explicit"; modelId: string; providerId?: number | null }
  | { mode: "auto-global" }
  | { mode: "auto-provider"; providerId: number };

export async function createChatInferenceIdempotencyKey(input: {
  conversationId: string | number;
  userMessageId: string | number;
  selection: ChatInferenceSelection | null;
}): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  const stableSelection = input.selection
    ? input.selection.mode === "explicit"
      ? {
          mode: input.selection.mode,
          modelId: input.selection.modelId,
          providerId: input.selection.providerId ?? null,
        }
      : input.selection.mode === "auto-provider"
        ? {
            mode: input.selection.mode,
            providerId: input.selection.providerId,
          }
        : { mode: input.selection.mode }
    : null;
  const payload = JSON.stringify({
    contract: "SAH-CHAT-INFERENCE-IDEMPOTENCY-1",
    conversationId: String(input.conversationId),
    userMessageId: String(input.userMessageId),
    selection: stableSelection,
  });

  try {
    const digest = await subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload)
    );
    const hex = Array.from(new Uint8Array(digest), value =>
      value.toString(16).padStart(2, "0")
    ).join("");
    return `chat:${hex}`;
  } catch {
    return null;
  }
}
