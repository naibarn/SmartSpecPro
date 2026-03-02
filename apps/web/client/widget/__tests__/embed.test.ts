/**
 * Tests for the embed.js loader script.
 *
 * Covers:
 * - Creates iframe element pointing to /widget/v1/chat?token=...
 * - postMessage origin validation (rejects messages from unexpected origins)
 * - Applies position from data attributes
 * - Prevents duplicate iframe creation on re-initialization
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests run in jsdom environment which simulates browser APIs.
// The embed.ts module is designed to run in a browser context.

describe("Embed Script", () => {
  beforeEach(() => {
    // Clean up DOM
    document.body.innerHTML = "";
    // Remove any cached module state
  });

  it("isValidOrigin returns true for allowed origins", async () => {
    const { isValidOrigin } = await import("../embed");
    expect(isValidOrigin("https://smartaihub.app")).toBe(true);
  });

  it("isValidOrigin returns false for unexpected origins", async () => {
    const { isValidOrigin } = await import("../embed");
    expect(isValidOrigin("https://evil.com")).toBe(false);
    expect(isValidOrigin("http://smartaihub.app")).toBe(false); // http not https
    expect(isValidOrigin("")).toBe(false);
  });

  it("builds iframe src with token query parameter", async () => {
    const { buildIframeSrc } = await import("../embed");
    const src = buildIframeSrc("widget-123", "mytoken");
    expect(src).toContain("/widget/v1/chat");
    expect(src).toContain("token=mytoken");
    expect(src).toContain("widget-123");
  });

  it("prevents duplicate iframe creation on re-initialization", async () => {
    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");

    // First call creates iframe
    createWidgetIframe("widget-abc", "https://smartaihub.app", "bottom-right");
    const firstContainer = document.getElementById(WIDGET_CONTAINER_ID);
    expect(firstContainer).not.toBeNull();

    // Second call should not create duplicate
    createWidgetIframe("widget-abc", "https://smartaihub.app", "bottom-right");
    const containers = document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`);
    expect(containers).toHaveLength(1);
  });

  it("applies position bottom-right via inline style", async () => {
    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");
    document.body.innerHTML = ""; // fresh DOM

    createWidgetIframe("widget-pos", "https://smartaihub.app", "bottom-right");
    const container = document.getElementById(WIDGET_CONTAINER_ID);
    expect(container?.style.position).toBe("fixed");
    expect(container?.style.bottom).toBeTruthy();
    expect(container?.style.right).toBeTruthy();
  });

  it("applies position bottom-left via inline style", async () => {
    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");
    document.body.innerHTML = "";

    createWidgetIframe("widget-left", "https://smartaihub.app", "bottom-left");
    const container = document.getElementById(WIDGET_CONTAINER_ID);
    expect(container?.style.left).toBeTruthy();
  });
});
