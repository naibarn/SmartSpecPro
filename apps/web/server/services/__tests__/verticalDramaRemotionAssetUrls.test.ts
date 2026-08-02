import { describe, expect, it } from "vitest";

import { absoluteVdAssetUrl } from "../verticalDramaRemotionRender";

/**
 * Field incident 2026-07-30 — series 21 / episode 124. Every Vertical Drama
 * Remotion submission was rejected before it reached the queue with nine
 * copies of
 *
 *   {"validation":"url","code":"invalid_string","message":"Invalid url",
 *    "path":["layers",N,"src"]}
 *
 * and silently fell back to the ffmpeg renderer. `RemotionTemplateConfig`'s
 * layer `src` is `z.string().url()`, but VD stores clip/banner/audio/watermark
 * URLs app-RELATIVE (`/api/storage/files/...`); they were only ever resolved
 * at download time, never for the template itself.
 */
describe("absoluteVdAssetUrl", () => {
  it("resolves an app-relative asset path against the public base", () => {
    expect(
      absoluteVdAssetUrl("/api/storage/files/clip-1.mp4", "https://smartaihub.app")
    ).toBe("https://smartaihub.app/api/storage/files/clip-1.mp4");
  });

  it("leaves an already-absolute https URL untouched", () => {
    expect(
      absoluteVdAssetUrl("https://cdn.test/clip.mp4", "https://smartaihub.app")
    ).toBe("https://cdn.test/clip.mp4");
  });

  it("leaves an absolute http URL untouched", () => {
    expect(absoluteVdAssetUrl("http://cdn.test/a.mp4", "https://x.test")).toBe(
      "http://cdn.test/a.mp4"
    );
  });

  it("handles a base that carries a trailing slash without doubling it", () => {
    expect(absoluteVdAssetUrl("/a/b.mp4", "https://smartaihub.app/")).toBe(
      "https://smartaihub.app/a/b.mp4"
    );
  });

  it("returns the input unchanged when no base is available", () => {
    // Better to hand the original value to the schema and get a precise
    // validation error than to invent a bogus origin.
    expect(absoluteVdAssetUrl("/a/b.mp4", "")).toBe("/a/b.mp4");
  });

  it("returns the input unchanged when the base is unparseable", () => {
    expect(absoluteVdAssetUrl("/a/b.mp4", "not a url")).toBe("/a/b.mp4");
  });

  it("passes empty/blank input straight through", () => {
    expect(absoluteVdAssetUrl("", "https://x.test")).toBe("");
    expect(absoluteVdAssetUrl("   ", "https://x.test")).toBe("");
  });
});
