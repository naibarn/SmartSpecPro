import { useEffect, useMemo, useRef, useState } from "react";

export interface ChatSessionDraftIdentity {
  tenantId?: string | number | null;
  userId?: string | number | null;
  conversationId?: string | number | null;
}

/** Keep unsent text isolated by tenant, account, and conversation in this tab. */
export function chatSessionDraftKey(identity: ChatSessionDraftIdentity): string | null {
  const values = [identity.tenantId, identity.userId, identity.conversationId];
  if (values.some(value => value == null || String(value).trim() === "")) return null;
  return `smarthub:chat-draft:v1:${values.map(value => encodeURIComponent(String(value))).join(":")}`;
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readChatSessionDraft(key: string | null, storage = sessionStorageOrNull()): string {
  if (!key || !storage) return "";
  try {
    return storage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeChatSessionDraft(
  key: string | null,
  draft: string,
  storage = sessionStorageOrNull(),
): void {
  if (!key || !storage) return;
  try {
    if (draft.trim()) storage.setItem(key, draft);
    else storage.removeItem(key);
  } catch {
    // Draft persistence is best effort; storage limits must not interrupt chat.
  }
}

/** Load and persist the composer draft without carrying text across chat sessions. */
export function useChatSessionDraft(identity: ChatSessionDraftIdentity) {
  const key = useMemo(() => chatSessionDraftKey(identity), [
    identity.tenantId,
    identity.userId,
    identity.conversationId,
  ]);
  const [draft, setDraft] = useState("");
  const activeKeyRef = useRef<string | null>(null);
  const skipWriteRef = useRef(false);

  useEffect(() => {
    if (activeKeyRef.current === key) return;
    activeKeyRef.current = key;
    skipWriteRef.current = true;
    setDraft(readChatSessionDraft(key));
  }, [key]);

  useEffect(() => {
    if (activeKeyRef.current !== key) return;
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    writeChatSessionDraft(key, draft);
  }, [key, draft]);

  return [draft, setDraft] as const;
}
