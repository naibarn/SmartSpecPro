import { describe, expect, it } from "vitest";
import { cloudflareApprovalFailureCode } from "./cloudflareApprovalFailure";

describe("cloudflareApprovalFailureCode", () => {
  it("preserves a safe backend error code", () => {
    expect(
      cloudflareApprovalFailureCode(
        { detail: "CLOUDFLARE_STAGING_POLICY_SCOPE_DENIED" },
        403
      )
    ).toBe("CLOUDFLARE_STAGING_POLICY_SCOPE_DENIED");
  });

  it("returns validation field paths but never reflects rejected input", () => {
    expect(
      cloudflareApprovalFailureCode(
        {
          detail: [
            {
              loc: ["body", "rollbackConfigurationDigest"],
              msg: "invalid digest",
              input: "private-value-must-not-appear",
            },
            { loc: ["body", "expiresAt"], msg: "invalid date" },
          ],
        },
        422
      )
    ).toBe(
      "STAGING_APPROVAL_VALIDATION_FAILED:rollbackConfigurationDigest,expiresAt"
    );
  });

  it("uses an HTTP-scoped fallback for unstructured failures", () => {
    expect(
      cloudflareApprovalFailureCode(
        { detail: "private provider response" },
        502
      )
    ).toBe("STAGING_APPROVAL_REJECTED_HTTP_502");
  });

  it("identifies the failed approval stage and status without reflecting rejected values", () => {
    expect(
      cloudflareApprovalFailureCode(
        { detail: [{ loc: ["body", "expiresAt"], input: "private-value" }] },
        422,
        "GRANT_CREATE",
      )
    ).toBe("STAGING_GRANT_CREATE_HTTP_422:STAGING_APPROVAL_VALIDATION_FAILED:expiresAt");
  });
});
