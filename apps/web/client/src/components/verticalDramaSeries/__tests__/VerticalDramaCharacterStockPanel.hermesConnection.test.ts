/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCharacterPromptConfirmPayload,
  HERMES_CONNECTION_ID_STORAGE_KEY,
  readStoredHermesConnectionId,
  resolveVdCharacterMutationErrorMessage,
  storeHermesConnectionId,
} from "../VerticalDramaCharacterStockPanel";
import { formatHermesErrorMessage } from "@shared/hermesMedia";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Hermes connection storage helpers (Feature 135, section-10 §4.4)", () => {
  it("persists and reads the hermes connection id under the shared storage key", () => {
    storeHermesConnectionId("conn-hermes-1");
    expect(window.localStorage.getItem(HERMES_CONNECTION_ID_STORAGE_KEY)).toBe("conn-hermes-1");
    expect(readStoredHermesConnectionId()).toBe("conn-hermes-1");
  });

  it("clears the stored value when passed null", () => {
    storeHermesConnectionId("conn-hermes-1");
    storeHermesConnectionId(null);
    expect(readStoredHermesConnectionId()).toBeNull();
  });

  it("does not throw when localStorage.setItem raises QuotaExceededError (state-first ordering holds)", () => {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    try {
      expect(() => storeHermesConnectionId("conn-hermes-2")).not.toThrow();
    } finally {
      window.localStorage.setItem = originalSetItem;
    }
  });

  it("does not throw when localStorage.getItem raises (blocked/sandboxed storage)", () => {
    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = () => {
      throw new DOMException("Storage is blocked.", "SecurityError");
    };
    try {
      expect(() => readStoredHermesConnectionId()).not.toThrow();
      expect(readStoredHermesConnectionId()).toBeNull();
    } finally {
      window.localStorage.getItem = originalGetItem;
    }
  });
});

describe("buildCharacterPromptConfirmPayload — hermesConnectionId spread (Feature 135)", () => {
  const BASE = {
    seriesId: "10",
    characterId: "20",
    originalPrompt: "cinematic portrait of Mali",
    editedPrompt: "cinematic portrait of Mali",
    selectedImageModelId: "hermes-grok/grok-imagine-image",
    imageModelUsesMcp: false,
    mcpConnectionId: null,
    imageModelUsesHermes: true,
    hermesConnectionId: "conn-hermes-1",
  };

  it("includes hermesConnectionId when imageModelUsesHermes is true and a connection is set", () => {
    const result = buildCharacterPromptConfirmPayload(BASE);
    expect(result.payload).toHaveProperty("hermesConnectionId", "conn-hermes-1");
    expect(result.payload).not.toHaveProperty("mcpConnectionId");
  });

  it("omits hermesConnectionId when imageModelUsesHermes is false", () => {
    const result = buildCharacterPromptConfirmPayload({ ...BASE, imageModelUsesHermes: false });
    expect(result.payload).not.toHaveProperty("hermesConnectionId");
  });

  it("omits hermesConnectionId when no connection id is set", () => {
    const result = buildCharacterPromptConfirmPayload({ ...BASE, hermesConnectionId: null });
    expect(result.payload).not.toHaveProperty("hermesConnectionId");
  });

  it("never includes both mcpConnectionId and hermesConnectionId simultaneously", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      imageModelUsesMcp: true,
      mcpConnectionId: "conn-mcp-1",
      imageModelUsesHermes: true,
      hermesConnectionId: "conn-hermes-1",
    });
    // Only one transport's model is ever actually selected in practice
    // (mutually exclusive), but the helper itself must still never emit
    // both fields even if both flags happen to be true.
    const hasMcp = "mcpConnectionId" in result.payload;
    const hasHermes = "hermesConnectionId" in result.payload;
    expect(hasMcp && hasHermes).toBe(false);
  });
});

describe("resolveVdCharacterMutationErrorMessage — hermes-aware presentation (section-10 review fix)", () => {
  it("renders the Thai copy for a [HERMES_X]-prefixed message instead of the raw bracketed string", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      { message: formatHermesErrorMessage("HERMES_ENTITLEMENT_RESTRICTED") },
      "th",
    );
    expect(message).not.toMatch(/^\[HERMES_/);
    expect(message).toContain("เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาต");
  });

  it("renders the English copy for the same message when lang is en", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      { message: formatHermesErrorMessage("HERMES_ENTITLEMENT_RESTRICTED") },
      "en",
    );
    expect(message).not.toMatch(/^\[HERMES_/);
    expect(message).toContain("xAI has not authorized");
  });

  it("appends a retry suffix for a retryable hermes code", () => {
    const message = resolveVdCharacterMutationErrorMessage(
      { message: formatHermesErrorMessage("HERMES_TIMEOUT") },
      "th",
    );
    expect(message).toContain("ลองใหม่ได้");
  });

  it("regression: a non-hermes message passes through completely unchanged", () => {
    expect(
      resolveVdCharacterMutationErrorMessage(
        { message: "ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้" },
        "th",
      ),
    ).toBe("ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้");
    expect(
      resolveVdCharacterMutationErrorMessage(
        { message: "Generate deep story drafts first before detecting character variants/twins" },
        "en",
      ),
    ).toBe("Generate deep story drafts first before detecting character variants/twins");
  });

  it("regression: still falls back to the generic bilingual message when the error has no message", () => {
    expect(resolveVdCharacterMutationErrorMessage(undefined, "th")).toBe("เกิดข้อผิดพลาด");
    expect(resolveVdCharacterMutationErrorMessage(null, "en")).toBe("Something went wrong");
  });
});
