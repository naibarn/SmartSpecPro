import { describe, expect, it, beforeEach } from "vitest";
import { recordVerticalDramaAssuranceAdmission, renderVerticalDramaAssuranceMetrics, resetVerticalDramaAssuranceMetricsForTests } from "../verticalDramaAssuranceObservability";

describe("Vertical Drama assurance observability", () => {
  beforeEach(() => resetVerticalDramaAssuranceMetricsForTests());

  it("uses bounded labels and never emits tenant/private identifiers", () => {
    recordVerticalDramaAssuranceAdmission({ taskKind: "attacker-task", profileId: "tenant-secret-123", assuranceMode: "unknown", outcome: "accepted", release: "commit-sha" });
    const output = renderVerticalDramaAssuranceMetrics();
    expect(output).toContain('task_kind="other"');
    expect(output).toContain('profile_id="unknown"');
    expect(output).not.toContain("tenant-secret-123");
    expect(output).not.toContain("commit-sha");
  });
});
