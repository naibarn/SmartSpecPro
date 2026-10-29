/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { chatSessionDraftKey, readChatSessionDraft, useChatSessionDraft, writeChatSessionDraft } from "./chatSessionDraft";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("chat session drafts", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("scopes drafts independently to tenant, account, and conversation", () => {
    const key = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21 });
    const otherConversation = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 22 });
    const otherTenant = chatSessionDraftKey({ tenantId: "tenant-b", userId: 7, conversationId: 21 });
    expect(key).not.toBeNull();
    expect(new Set([key, otherConversation, otherTenant]).size).toBe(3);
    expect(chatSessionDraftKey({ tenantId: "tenant a", userId: 7, conversationId: 21 })).toContain("tenant%20a");
    expect(chatSessionDraftKey({ userId: 7, conversationId: 21 })).toBeNull();
  });

  it("isolates child thread drafts while preserving the legacy main-chat key", () => {
    const mainKey = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21 });
    const explicitMainKey = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21, threadId: null });
    const firstThread = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21, threadId: "thread-1" });
    const secondThread = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21, threadId: "thread-2" });
    expect(explicitMainKey).toBe(mainKey);
    expect(new Set([mainKey, firstThread, secondThread]).size).toBe(3);
  });

  it("restores the exact draft and removes it after the composer is cleared", () => {
    const storage = memoryStorage();
    const key = chatSessionDraftKey({ tenantId: "tenant-a", userId: 7, conversationId: 21 });
    writeChatSessionDraft(key, "  finish the second phase  ", storage);
    expect(readChatSessionDraft(key, storage)).toBe("  finish the second phase  ");
    writeChatSessionDraft(key, "   ", storage);
    expect(readChatSessionDraft(key, storage)).toBe("");
  });

  it("restores the right draft when switching sessions and never saves the old text into the new session", async () => {
    const firstIdentity = { tenantId: "tenant-a", userId: 7, conversationId: 21 };
    const secondIdentity = { ...firstIdentity, conversationId: 22 };
    const firstKey = chatSessionDraftKey(firstIdentity)!;
    const secondKey = chatSessionDraftKey(secondIdentity)!;
    window.sessionStorage.setItem(firstKey, "draft for first chat");
    window.sessionStorage.setItem(secondKey, "draft for second chat");

    const { result, rerender } = renderHook(
      ({ identity }) => useChatSessionDraft(identity),
      { initialProps: { identity: firstIdentity } },
    );
    await waitFor(() => expect(result.current[0]).toBe("draft for first chat"));
    act(() => result.current[1]("updated first chat"));
    await waitFor(() => expect(window.sessionStorage.getItem(firstKey)).toBe("updated first chat"));

    rerender({ identity: secondIdentity });
    await waitFor(() => expect(result.current[0]).toBe("draft for second chat"));
    expect(window.sessionStorage.getItem(secondKey)).toBe("draft for second chat");
    expect(window.sessionStorage.getItem(firstKey)).toBe("updated first chat");
  });
});
