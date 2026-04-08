export function shouldPreserveLocalMessages(params: {
  currentConversationId: number | null;
  lastLocalAddConversationId: number | null;
  lastLocalAddAt: number;
  now?: number;
  cooldownMs?: number;
}): boolean {
  const {
    currentConversationId,
    lastLocalAddConversationId,
    lastLocalAddAt,
    now = Date.now(),
    cooldownMs = 3000,
  } = params;

  if (
    currentConversationId == null ||
    lastLocalAddConversationId == null ||
    currentConversationId !== lastLocalAddConversationId
  ) {
    return false;
  }

  return now - lastLocalAddAt < cooldownMs;
}
