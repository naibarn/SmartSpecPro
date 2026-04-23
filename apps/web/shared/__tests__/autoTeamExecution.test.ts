import { describe, expect, it } from "vitest";
import {
  AUTO_TEAM_CAPABILITY_FAMILIES,
  AUTO_TEAM_FINAL_RESULT_STATUSES,
  AUTO_TEAM_MEDIA_TYPES,
  AUTO_TEAM_ROUTE_CLASSES,
  AUTO_TEAM_STAGE_STATUSES,
  AUTO_TEAM_STAGE_TYPES,
  assertCanonicalArtifactRef,
  getRequiredEvidenceForRoute,
  isFinalResultTerminal,
  isTerminalMediaStatus,
  isTerminalStageStatus,
  routeAllowsCapability,
  routeRequiresMediaJob,
  validateArtifactRef,
} from "../autoTeamExecution";

describe("autoTeamExecution shared contract", () => {
  it("exports canonical route, capability, stage, status, and media constants", () => {
    expect(AUTO_TEAM_ROUTE_CLASSES).toEqual([
      "media.video",
      "media.image",
      "agency.swarm",
      "workflow.automation",
      "research.synthesis",
      "document.writing",
      "unknown.blocked",
    ]);
    expect(AUTO_TEAM_CAPABILITY_FAMILIES).toContain("media.video");
    expect(AUTO_TEAM_CAPABILITY_FAMILIES).toContain("image.prompt");
    expect(AUTO_TEAM_STAGE_TYPES).toContain("media_submit");
    expect(AUTO_TEAM_STAGE_STATUSES).toContain("waiting_provider");
    expect(AUTO_TEAM_FINAL_RESULT_STATUSES).toContain("legacy_unverified");
    expect(AUTO_TEAM_MEDIA_TYPES).toEqual(["image", "video"]);
  });

  it("identifies required evidence for media routes", () => {
    const evidence = getRequiredEvidenceForRoute("media.video");
    expect(evidence.requiresMediaJob).toBe(true);
    expect(evidence.promptOnlyInsufficient).toBe(true);
    expect(routeRequiresMediaJob("media.video")).toBe(true);
    expect(routeAllowsCapability("media.video", "video.prompt")).toBe(true);
    expect(routeAllowsCapability("media.video", "document.writing")).toBe(false);
  });

  it("distinguishes terminal stage/media/final statuses", () => {
    expect(isTerminalStageStatus("completed")).toBe(true);
    expect(isTerminalStageStatus("waiting_provider")).toBe(false);
    expect(isTerminalMediaStatus("succeeded")).toBe(true);
    expect(isTerminalMediaStatus("running")).toBe(false);
    expect(isFinalResultTerminal("completed")).toBe(true);
    expect(isFinalResultTerminal("legacy_unverified")).toBe(true);
  });

  it("validates canonical artifact refs", () => {
    const ref = {
      tenantId: "tenant-1",
      artifactType: "media_result",
      artifactRole: "result",
      storageRef: "s3://bucket/item",
      externalRef: null,
      visibility: "tenant",
      safetyStatus: "safe",
      retentionPolicyJson: { tier: "standard" },
    };
    expect(validateArtifactRef(ref)).toBe(true);
    expect(assertCanonicalArtifactRef(ref)).toEqual(ref);
  });
});
