import { describe, expect, it } from "vitest";
import { evaluateVerticalDramaAssuranceReleaseGate } from "../verify-vertical-drama-assurance-release-gate";

const gateNames = ["node_contract", "python_contract", "focused_tests", "replay_fault", "browser_harness", "migration_static", "diff_clean", "review_loops"];

describe("Vertical Drama assurance release gate", () => {
  it("fails closed when evidence is pending or missing", () => {
    const result = evaluateVerticalDramaAssuranceReleaseGate({ tier: "implementation", manifest: { releaseId: "r1", gates: {} } });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(gateNames);
  });

  it("requires production-only proof in addition to implementation proof", () => {
    const gates = Object.fromEntries([...gateNames, "staging_migration", "staging_restart", "live_provider", "deployed_browser", "canary", "observability", "rollback"].map(name => [name, { status: "pass", evidenceRefs: [`evidence:${name}`] }]));
    const result = evaluateVerticalDramaAssuranceReleaseGate({ tier: "production", expectedReleaseId: "r2", manifest: { releaseId: "r1", gates } });
    expect(result.ok).toBe(false);
    expect(result.invalid).toContain("release_id_mismatch");
  });
});
