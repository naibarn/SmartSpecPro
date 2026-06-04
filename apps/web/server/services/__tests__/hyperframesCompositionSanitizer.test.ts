import { describe, expect, it } from "vitest";

import {
  isHyperframesSafeAssetRef,
  redactHyperframesDiagnostics,
  sanitizeHyperframesAssetRef,
  sanitizeHyperframesText,
} from "../hyperframesCompositionSanitizer";

describe("hyperframesCompositionSanitizer", () => {
  it("escapes raw marketplace HTML as inert text", () => {
    expect(
      sanitizeHyperframesText(
        '<script>alert(1)</script><b onclick="x()">สินค้า</b> javascript:bad'
      )
    ).toBe("สินค้า blocked:bad");
  });

  it("rejects unsafe URL schemes and private network targets", () => {
    expect(isHyperframesSafeAssetRef("javascript:alert(1)")).toBe(false);
    expect(isHyperframesSafeAssetRef("file:///etc/passwd")).toBe(false);
    expect(isHyperframesSafeAssetRef("http://169.254.169.254/latest")).toBe(false);
    expect(isHyperframesSafeAssetRef("https://cdn.example.com/a.png?sig=secret")).toBe(true);
    expect(sanitizeHyperframesAssetRef("https://cdn.example.com/a.png?sig=secret"))
      .toBe("https://cdn.example.com/a.png");
  });

  it("redacts signed URLs, local paths, and secrets from diagnostics", () => {
    expect(
      redactHyperframesDiagnostics(
        "failed /tmp/render/x https://cdn.example.com/a.png?X-Amz-Signature=abc token=secret"
      )
    ).not.toContain("abc");
  });
});
