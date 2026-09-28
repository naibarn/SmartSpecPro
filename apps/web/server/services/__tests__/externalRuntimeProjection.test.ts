import { describe, expect, it } from "vitest";
import { buildExternalRuntimeProjection } from "../externalRuntimeProjection";

describe("externalRuntimeProjection", () => {
  it("distinguishes transport accepted from effect completion and provider stop support", () => {
    expect(
      buildExternalRuntimeProjection({
        sessionState: "running",
        transport: "accepted",
        effect: "pending",
        permission: "none",
        backgroundTask: "running",
        stopSupport: "session_only",
        observedAt: "2026-09-19T00:00:00Z",
      })
    ).toMatchObject({
      status: "running",
      transportLabel: "accepted",
      effectLabel: "pending",
      stopLabel: "stop_session",
    });
    expect(
      buildExternalRuntimeProjection({
        sessionState: "permission_required",
        transport: "accepted",
        effect: "unknown",
        permission: "pending",
        backgroundTask: "unsupported",
        stopSupport: "unsupported",
        observedAt: null,
      })
    ).toMatchObject({
      status: "approval",
      stopLabel: "stop_unsupported",
      freshness: "unknown",
    });
  });
});
