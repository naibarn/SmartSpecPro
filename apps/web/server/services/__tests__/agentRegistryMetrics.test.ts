import { beforeEach, describe, expect, it } from "vitest";

import {
  getAgentRegistryMetricSnapshot,
  recordRegistryPromotionMetrics,
  recordRegistryResolutionMetrics,
  renderAgentRegistryMetrics,
  resetAgentRegistryMetricsForTests,
} from "../agentRegistryMetrics";

describe("agentRegistryMetrics", () => {
  beforeEach(() => {
    resetAgentRegistryMetricsForTests();
  });

  it("records resolution and promotion counters", () => {
    recordRegistryResolutionMetrics({
      selectedVersionId: "agv_1",
      reason: "eligible and selected",
      usedEvidencePreference: true,
    });
    recordRegistryPromotionMetrics({
      action: "published",
      decision: "published",
    });

    const snapshot = getAgentRegistryMetricSnapshot();
    expect(snapshot["agent_registry_resolution_total:outcome=selected,reason_bucket=other"]).toBe(1);
    expect(snapshot["agent_registry_evidence_preference_total:used=true"]).toBe(1);
    expect(snapshot["agent_registry_promotion_total:action=published,decision=published"]).toBe(1);
  });

  it("renders Prometheus text output", () => {
    recordRegistryResolutionMetrics({
      selectedVersionId: null,
      reason: "registry not found",
      usedEvidencePreference: false,
    });

    const output = renderAgentRegistryMetrics();
    expect(output).toContain("# HELP agent_registry_resolution_total");
    expect(output).toContain('agent_registry_resolution_total{outcome="rejected",reason_bucket="registry_not_found"} 1');
  });
});
