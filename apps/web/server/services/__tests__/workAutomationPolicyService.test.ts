import { describe, expect, it } from "vitest";
import {
  resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute,
  validateAutomationModeTransition,
} from "../workAutomationPolicyService";

describe("workAutomationPolicyService", () => {
  it("resolves a content-production plan and promotes confident content work to fully auto", () => {
    const policy = resolveAutomationLaunchPolicy({
      caseRecord: {
        id: "case-1",
        title: "Launch campaign assets",
        summary: "Research, draft, storyboard, media, and video for the launch",
        riskLevel: "medium",
        automationMode: "manual_assist",
        currentState: "new",
      },
      requestRecord: {
        sourceType: "chat",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.93,
        title: "Launch campaign assets",
        objective:
          "Research, draft, storyboard, media, and video for the launch",
      },
      mode: "fully_auto",
    });

    expect(policy.templateKey).toBe("content-production");
    expect(policy.templateFamily).toBe("content-production");
    expect(policy.modeResolution.requestedMode).toBe("fully_auto");
    expect(policy.modeResolution.effectiveMode).toBe("fully_auto");
    expect(policy.modeResolution.downgraded).toBe(false);
    expect(policy.approvalGateStepKeys).toContain("review");
    expect(policy.stepBlueprints.map(step => step.stepKey)).toEqual([
      "research",
      "brief",
      "draft",
      "storyboard",
      "media",
      "video",
      "review",
      "export",
    ]);
  });

  it("falls back to manual assist when confidence is too low", () => {
    const policy = resolveAutomationLaunchPolicy({
      caseRecord: {
        id: "case-2",
        title: "Unclear request",
        summary: "Need some help with something",
        riskLevel: "medium",
        automationMode: "manual_assist",
        currentState: "new",
      },
      requestRecord: {
        sourceType: "webhook",
        workType: "misc",
        businessDomain: "ops",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.22,
        title: "Unclear request",
        objective: "Need some help with something",
      },
      mode: "fully_auto",
    });

    expect(policy.modeResolution.requestedMode).toBe("fully_auto");
    expect(policy.modeResolution.effectiveMode).toBe("manual_assist");
    expect(policy.modeResolution.downgraded).toBe(true);
  });

  it("preserves an explicit fully_auto mode for user-initiated automation", () => {
    const policy = resolveAutomationLaunchPolicy({
      caseRecord: {
        id: "case-2a",
        title: "Unclear request",
        summary: "Need some help with something",
        riskLevel: "medium",
        automationMode: "manual_assist",
        currentState: "new",
      },
      requestRecord: {
        sourceType: "webhook",
        workType: "misc",
        businessDomain: "ops",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.22,
        title: "Unclear request",
        objective: "Need some help with something",
      },
      mode: "fully_auto",
      preserveRequestedMode: true,
    });

    expect(policy.modeResolution.requestedMode).toBe("fully_auto");
    expect(policy.modeResolution.effectiveMode).toBe("fully_auto");
    expect(policy.modeResolution.downgraded).toBe(false);
    expect(policy.modeResolution.reason).toContain("preserved");
  });

  it("blocks unsafe mode upgrades when a checkpoint is unresolved", () => {
    const policy = resolveAutomationLaunchPolicy({
      caseRecord: {
        id: "case-3",
        title: "Launch campaign assets",
        summary: "Research, draft, storyboard, media, and video for the launch",
        riskLevel: "medium",
        automationMode: "semi_auto",
        currentState: "running",
      },
      requestRecord: {
        sourceType: "chat",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.9,
        title: "Launch campaign assets",
        objective:
          "Research, draft, storyboard, media, and video for the launch",
      },
      mode: "semi_auto",
    });

    const transition = validateAutomationModeTransition({
      fromMode: "semi_auto",
      toMode: "fully_auto",
      policy,
      runStatus: "running",
      hasUnresolvedCheckpoint: true,
    });

    expect(transition.allowed).toBe(false);
    expect(transition.blockedBy).toBe("unresolved_checkpoint");
    expect(transition.suggestedMode).toBe("semi_auto");
  });

  it("rejects a step surface that is outside the template allowlist", () => {
    const policy = resolveAutomationLaunchPolicy({
      caseRecord: {
        id: "case-4",
        title: "Launch campaign assets",
        summary: "Research, draft, storyboard, media, and video for the launch",
        riskLevel: "medium",
        automationMode: "semi_auto",
        currentState: "running",
      },
      requestRecord: {
        sourceType: "chat",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.86,
        title: "Launch campaign assets",
        objective:
          "Research, draft, storyboard, media, and video for the launch",
      },
      mode: "semi_auto",
    });

    const route = resolveAutomationStepRoute({
      stepKey: "research",
      policy,
      requestedSurface: "agency",
    });

    expect(route.surface).toBe("agency");
    expect(
      resolveAutomationStepRoute({
        stepKey: "research",
        policy,
        requestedSurface: "browser",
      }).surface
    ).toBe("browser");
    expect(() =>
      resolveAutomationStepRoute({
        stepKey: "research",
        policy,
        requestedSurface: "media_studio",
      })
    ).toThrow("Surface media_studio is not allowed for step research");
  });
});
