import { describe, expect, it } from "vitest";

import {
  redactPreflightDiagnostics,
  resolvePreflightPreviewAccess,
} from "../preflightAccessPolicyService";

describe("preflightAccessPolicyService", () => {
  it("allows requesters to see a redacted preview", () => {
    const access = resolvePreflightPreviewAccess({
      actorUserId: 42,
      actorRole: "member",
      requesterId: "42",
    });

    expect(access).toEqual({
      allowed: true,
      view: "requester_safe",
      reasonCode: "requester_safe",
      redacted: true,
    });
    expect(redactPreflightDiagnostics({ secretPolicy: "hidden" }, access)).toEqual({
      redacted: true,
      visibleReasonCodes: [],
    });
  });

  it("allows admins to see diagnostic preview", () => {
    const access = resolvePreflightPreviewAccess({
      actorUserId: 7,
      actorRole: "domain_admin",
      requesterId: "42",
    });

    expect(access.view).toBe("admin_diagnostic");
    expect(redactPreflightDiagnostics({ secretPolicy: "visible" }, access)).toEqual({
      secretPolicy: "visible",
    });
  });

  it("blocks unrelated users", () => {
    expect(resolvePreflightPreviewAccess({
      actorUserId: 7,
      actorRole: "member",
      requesterId: "42",
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasonCode: "not_requester_or_admin",
    }));
  });
});
