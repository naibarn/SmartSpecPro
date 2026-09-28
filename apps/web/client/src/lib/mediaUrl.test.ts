import { describe, expect, it } from "vitest";

import { normalizeMediaSourceUrl } from "./mediaUrl";

describe("normalizeMediaSourceUrl", () => {
  it("converts Cloudflare R2 path-style object URLs to the storage proxy", () => {
    expect(
      normalizeMediaSourceUrl(
        "https://f3fb0b6858e186fcc36be105bfa00243.r2.cloudflarestorage.com/smartspec/audio/generated/1/example.mp3",
      ),
    ).toBe("/api/storage/files/audio/generated/1/example.mp3");
  });

  it("keeps ordinary public URLs unchanged", () => {
    expect(normalizeMediaSourceUrl("https://cdn.example.com/audio.mp3")).toBe(
      "https://cdn.example.com/audio.mp3",
    );
  });

  it("does not fabricate storage URLs from missing API values", () => {
    expect(normalizeMediaSourceUrl("undefined")).toBe("");
    expect(normalizeMediaSourceUrl("null")).toBe("");
    expect(normalizeMediaSourceUrl("[object Object]")).toBe("");
  });
});
