/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLocationGenerateImageTransportFields,
  HERMES_CONNECTION_ID_STORAGE_KEY,
  readStoredHermesConnectionId,
  resolveLocationMutationErrorMessage,
  storeHermesConnectionId,
} from "../VerticalDramaLocationStockPanel";
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
});

describe("buildLocationGenerateImageTransportFields (Feature 135)", () => {
  it("includes hermesConnectionId when imageModelUsesHermes is true and a connection is set", () => {
    const result = buildLocationGenerateImageTransportFields({
      imageModelUsesMcp: false,
      mcpConnectionId: null,
      imageModelUsesHermes: true,
      hermesConnectionId: "conn-hermes-1",
    });
    expect(result).toEqual({ hermesConnectionId: "conn-hermes-1" });
  });

  it("omits hermesConnectionId when imageModelUsesHermes is false", () => {
    const result = buildLocationGenerateImageTransportFields({
      imageModelUsesMcp: false,
      mcpConnectionId: null,
      imageModelUsesHermes: false,
      hermesConnectionId: "conn-hermes-1",
    });
    expect(result).not.toHaveProperty("hermesConnectionId");
  });

  it("omits hermesConnectionId when no connection id is set", () => {
    const result = buildLocationGenerateImageTransportFields({
      imageModelUsesMcp: false,
      mcpConnectionId: null,
      imageModelUsesHermes: true,
      hermesConnectionId: null,
    });
    expect(result).not.toHaveProperty("hermesConnectionId");
  });

  it("never includes both mcpConnectionId and hermesConnectionId simultaneously", () => {
    const result = buildLocationGenerateImageTransportFields({
      imageModelUsesMcp: true,
      mcpConnectionId: "conn-mcp-1",
      sharedGroupId: 7,
      imageModelUsesHermes: true,
      hermesConnectionId: "conn-hermes-1",
    });
    const hasMcp = "mcpConnectionId" in result;
    const hasHermes = "hermesConnectionId" in result;
    expect(hasMcp && hasHermes).toBe(false);
    expect(result).toEqual({ mcpConnectionId: "conn-mcp-1", sharedGroupId: 7 });
  });

  it("regression: mcp fields unaffected when hermes is not in play", () => {
    const result = buildLocationGenerateImageTransportFields({
      imageModelUsesMcp: true,
      mcpConnectionId: "conn-mcp-1",
      sharedGroupId: 7,
      imageModelUsesHermes: false,
      hermesConnectionId: null,
    });
    expect(result).toEqual({ mcpConnectionId: "conn-mcp-1", sharedGroupId: 7 });
  });
});

describe("resolveLocationMutationErrorMessage — hermes-aware presentation (section-10 review fix)", () => {
  it("renders the Thai copy for a [HERMES_X]-prefixed message instead of the raw bracketed string", () => {
    const message = resolveLocationMutationErrorMessage(
      { message: formatHermesErrorMessage("HERMES_ENTITLEMENT_RESTRICTED") },
      "th",
    );
    expect(message).not.toMatch(/^\[HERMES_/);
    expect(message).toContain("เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาต");
  });

  it("appends a retry suffix for a retryable hermes code", () => {
    const message = resolveLocationMutationErrorMessage(
      { message: formatHermesErrorMessage("HERMES_TIMEOUT") },
      "en",
    );
    expect(message).toContain("(retryable)");
  });

  it("regression: returns the error's own message when present (non-hermes)", () => {
    expect(resolveLocationMutationErrorMessage({ message: "Location not found" }, "en")).toBe(
      "Location not found",
    );
    expect(resolveLocationMutationErrorMessage({ message: "ไม่พบสถานที่" }, "th")).toBe("ไม่พบสถานที่");
  });

  it("regression: passes an explicit empty-string message through unmodified (?? not ||)", () => {
    expect(resolveLocationMutationErrorMessage({ message: "" }, "en")).toBe("");
  });

  it("regression: falls back to a localized generic message for null/undefined error objects", () => {
    expect(resolveLocationMutationErrorMessage(null, "en")).toBe("Something went wrong");
    expect(resolveLocationMutationErrorMessage(undefined, "th")).toBe("เกิดข้อผิดพลาด");
  });
});
