import { describe, expect, it } from "vitest";
import { cloudflareStagingAssetContentType } from "./cloudflareStagingAssetMetadata";

describe("staging asset HTTP metadata", () => {
  it("preserves parameterized types produced by the canonical packager", () => {
    expect(cloudflareStagingAssetContentType("index.html", "text/html; charset=utf-8")).toBe("text/html; charset=utf-8");
    expect(cloudflareStagingAssetContentType("app.css", "text/css; charset=utf-8")).toBe("text/css; charset=utf-8");
  });
  it("repairs older generic manifests from the filename without rewriting immutable bytes", () => {
    expect(cloudflareStagingAssetContentType("index.html", "application/octet-stream")).toBe("text/html; charset=utf-8");
    expect(cloudflareStagingAssetContentType("app.css", "application/octet-stream")).toBe("text/css; charset=utf-8");
    expect(cloudflareStagingAssetContentType("installer.exe", "application/octet-stream")).toBe("application/octet-stream");
    expect(cloudflareStagingAssetContentType("icon.webp", null)).toBe("image/webp");
  });
  it("rejects line breaks and malformed HTTP metadata", () => {
    expect(cloudflareStagingAssetContentType("data.bin", "text/plain\r\nx-extra: injected")).toBe("application/octet-stream");
    expect(cloudflareStagingAssetContentType("data.bin", { type: "text/plain" })).toBe("application/octet-stream");
  });
});
