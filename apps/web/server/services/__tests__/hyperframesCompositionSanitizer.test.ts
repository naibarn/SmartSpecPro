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
    const redacted = redactHyperframesDiagnostics(
      "failed /tmp/render/x https://cdn.example.com/a.png?X-Amz-Signature=abc token=secret marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_1/output.mp4"
    );

    expect(redacted).not.toContain("abc");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("/tmp/render");
    expect(redacted).not.toContain("marketplace-auto-review/");
    expect(redacted).toContain("[redacted-storage-ref]");
    expect(
      redactHyperframesDiagnostics(
        "failed /tmp/render/x https://cdn.example.com/a.png?X-Amz-Signature=abc token=secret"
      )
    ).not.toContain("abc");
  });

  it("redacts credentialed URLs and common auth secrets from diagnostics", () => {
    const redacted = redactHyperframesDiagnostics(
      "failed https://user:secret@cdn.example.test/final.mp4 password=secret Authorization: Bearer abc.def.ghi refresh_token=refresh id_token=id jwt=jwt Basic dXNlcjpzZWNyZXQ= policy=policy Authorization=plain auth=plain credential=cred AWSAccessKeyId=aws X-Amz-Credential=amz expires=123"
    );

    expect(redacted).not.toContain("user:secret");
    expect(redacted).not.toContain("password=secret");
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("refresh_token=refresh");
    expect(redacted).not.toContain("id_token=id");
    expect(redacted).not.toContain("jwt=jwt");
    expect(redacted).not.toContain("dXNlcjpzZWNyZXQ");
    expect(redacted).not.toContain("policy=policy");
    expect(redacted).not.toContain("Authorization=plain");
    expect(redacted).not.toContain("auth=plain");
    expect(redacted).not.toContain("credential=cred");
    expect(redacted).not.toContain("AWSAccessKeyId=aws");
    expect(redacted).not.toContain("X-Amz-Credential=amz");
    expect(redacted).not.toContain("expires=123");
    expect(redacted).toContain("[redacted-url]");
    expect(redacted).toContain("password=[redacted]");
    expect(redacted).toMatch(/authorization=\[redacted\]/i);
  });
});
