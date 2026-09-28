import { describe, expect, it } from "vitest";
import { selectOrchestraSkill } from "../orchestraPlanner";

const manifest = {
  skillSlug: "video-prompt",
  skillName: "Video prompt",
  manifestSchemaVersion: 1,
  purpose: "compose video prompts",
  surfaceSupport: ["media_production" as const],
  supportedOriginSurfaces: ["media_studio_video_shot" as const],
  supportedEntryPoints: ["system" as const],
  taskTypes: ["video_prompt"],
  requiredContext: [],
  preferredContext: [],
  inputs: {},
  outputs: {},
  supportedArtifactTypes: ["prompt"],
  evidenceRequired: ["scene"],
  reviewChecklist: ["identity"],
  failureModes: ["ambiguous"],
  doNotUseWhen: ["missing scene"],
  requiredConnectors: [],
  writeScope: [],
  sideEffectClass: "read_only" as const,
  dataSensitivity: "internal" as const,
  executionMode: "prompt_only" as const,
  isReadOnly: true,
  riskTier: "medium" as const,
  latencyBudget: "interactive" as const,
  tokenBudget: "large" as const,
  defaultToolBudget: 0,
  humanApprovalRequired: false,
  allowedModelFamilies: ["vision"],
  completionSignals: ["prompt"],
  selectionSignals: ["video"],
  negativeSignals: ["audio-only"],
  requiredEvidenceKinds: ["image"],
  reviewerProfile: "video",
  repairStrategy: "targeted",
  supportsRepairLoop: true,
  ownerTeam: "platform",
  ownerCodeownersPath: "@platform",
  ownerReviewCadence: "monthly",
};

describe("orchestra planner", () => {
  it("selects only a caller-compatible active manifest", () => {
    expect(
      selectOrchestraSkill(
        [{ ...manifest, status: "active", signatureVerified: true }],
        {
          taskKind: "video_prompt",
          surface: "media_production",
          originSurface: "media_studio_video_shot",
          entryPoint: "system",
        }
      ).skillSlug
    ).toBe("video-prompt");
  });

  it("rejects unverified manifests", () => {
    expect(() =>
      selectOrchestraSkill(
        [{ ...manifest, status: "active", signatureVerified: false }],
        {
          taskKind: "video_prompt",
          surface: "media_production",
          originSurface: "media_studio_video_shot",
          entryPoint: "system",
        }
      )
    ).toThrow(/manifest_untrusted/);
  });
});
