// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createBrowserVideoEditorPlatformAdapter } from "./videoEditorPlatformAdapter";

describe("browser video editor platform adapter", () => {
  it("does not expose a native file/reveal capability", () => {
    expect(createBrowserVideoEditorPlatformAdapter().canRevealLocalFile).toBe(false);
  });
  it("emits a browser notification event", () => {
    const handler = vi.fn();
    window.addEventListener("video-editor-notice", handler);
    createBrowserVideoEditorPlatformAdapter().notify("saved");
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("video-editor-notice", handler);
  });
  it("resolves an empty selection when the browser picker is canceled", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function () {
      this.dispatchEvent(new Event("cancel"));
    });
    await expect(createBrowserVideoEditorPlatformAdapter().pickMedia()).resolves.toEqual([]);
    click.mockRestore();
  });
});
