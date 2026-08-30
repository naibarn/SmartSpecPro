import { describe, expect, it } from "vitest";
import { resolveExportDownloadTarget } from "./exportDownloadTarget";

describe("resolveExportDownloadTarget", () => {
  it("recognizes managed storage URLs as storage keys", () => {
    expect(resolveExportDownloadTarget("/api/storage/files/tenant%2Fvideo%2Fclip.mp4")).toEqual({
      kind: "storage",
      key: "tenant/video/clip.mp4",
    });
  });

  it("rejects traversal in managed storage URLs", () => {
    expect(resolveExportDownloadTarget("/api/storage/files/tenant/../secret.mp4")).toBeNull();
    expect(resolveExportDownloadTarget("/api/storage/files/tenant/%2E%2E/secret.mp4")).toBeNull();
  });

  it("keeps provider URLs as explicit redirects", () => {
    expect(resolveExportDownloadTarget("https://provider.example/result.mp4")).toEqual({
      kind: "redirect",
      url: "https://provider.example/result.mp4",
    });
  });
});
