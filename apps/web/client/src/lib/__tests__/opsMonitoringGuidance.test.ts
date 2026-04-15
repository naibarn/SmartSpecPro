import { describe, expect, it } from "vitest";
import { getOpsIncidentGuidance } from "../opsMonitoringGuidance";

describe("getOpsIncidentGuidance", () => {
  it("returns localized monitoring stale guidance in English", () => {
    const guidance = getOpsIncidentGuidance({
      locale: "en",
      title: "Monitoring signal is stale",
      message: "No fresh monitoring check has landed for 15h.",
      groupKey: "ops-overview:monitoring:monitoring_stale",
      signal: "last check 15h ago",
      category: "monitoring",
      severity: "critical",
    });

    expect(guidance.kind).toBe("monitoring_stale");
    expect(guidance.headline).toMatch(/Monitoring data/i);
    expect(guidance.checkNow.length).toBeGreaterThan(0);
    expect(guidance.helpHref).toBe("/help/admin-monitoring-incident-response");
  });

  it("returns localized alert backlog guidance in Thai", () => {
    const guidance = getOpsIncidentGuidance({
      locale: "th",
      title: "Critical monitoring alerts are still unacknowledged",
      message: "3 high-severity alerts are pending acknowledgement.",
      groupKey: "ops-overview:monitoring:alert_backlog",
      category: "monitoring",
      severity: "critical",
    });

    expect(guidance.kind).toBe("alert_backlog");
    expect(guidance.headline).toContain("critical alerts");
    expect(guidance.faqItems[0]?.question).toBeTruthy();
    expect(guidance.helpTopicSlug).toBe("admin-monitoring-incident-response");
  });

  it("surface detailed backlog context when the alert message already contains the root cause", () => {
    const guidance = getOpsIncidentGuidance({
      locale: "th",
      title: "Critical monitoring alerts are still unacknowledged",
      message: "1 high-severity alerts are pending acknowledgement. Latest unresolved alert: LLM error rate spiked - 8 of 26 recent LLM calls failed. Top failures: OpenRouter/openai/gpt-5.4-mini -> HTTP 400 (7); Kie AI/claude-sonnet-4-6 -> HTTP 404 (1).",
      groupKey: "ops-overview:monitoring:alert_backlog",
      category: "monitoring",
      severity: "critical",
    });

    expect(guidance.summary).toContain("LLM error rate spiked");
    expect(guidance.summary).toContain("OpenRouter");
  });
});
