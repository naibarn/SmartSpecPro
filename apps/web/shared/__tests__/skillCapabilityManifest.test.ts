import { describe, expect, it } from "vitest";
import {
  SkillCapabilityManifestSchema,
  toAgentCapabilityManifest,
} from "../agentRuntime/skillManifest";

function makeValidManifest() {
  return {
    skillSlug: "demo-skill",
    skillName: "Demo Skill",
    manifestSchemaVersion: 1,
    purpose: "Demo runtime skill manifest",
    surfaceSupport: ["chat", "team"],
    supportedOriginSurfaces: [],
    supportedEntryPoints: [],
    taskTypes: ["writing_copy"],
    requiredContext: ["objective_brief"],
    preferredContext: ["retrieved_sources"],
    inputs: { request: "text" },
    outputs: { draft: "markdown" },
    supportedArtifactTypes: ["article_draft"],
    evidenceRequired: ["objective"],
    reviewChecklist: ["Output matches the requested deliverable."],
    failureModes: ["hallucinated_claims"],
    doNotUseWhen: ["structured_json_required"],
    requiredConnectors: [],
    writeScope: [],
    sideEffectClass: "read_only",
    dataSensitivity: "internal",
    executionMode: "llm_only",
    isReadOnly: true,
    riskTier: "low",
    latencyBudget: "interactive",
    tokenBudget: "medium",
    defaultToolBudget: 1,
    humanApprovalRequired: false,
    allowedModelFamilies: ["general_reasoning"],
    completionSignals: ["draft_ready"],
    selectionSignals: ["article", "write"],
    negativeSignals: ["prompt_package"],
    requiredEvidenceKinds: ["objective"],
    reviewerProfile: "editorial_reviewer",
    repairStrategy: "Tighten the structure and grounding notes.",
    supportsRepairLoop: true,
    ownerTeam: "content-platform",
    ownerCodeownersPath: "apps/web/skills/demo-skill/skill.md",
    ownerReviewCadence: "monthly",
  } as const;
}

describe("SkillCapabilityManifestSchema", () => {
  it("accepts a valid runtime skill manifest", () => {
    const parsed = SkillCapabilityManifestSchema.safeParse(makeValidManifest());
    expect(parsed.success).toBe(true);
  });

  it("fails when failureModes are missing", () => {
    const manifest = {
      ...makeValidManifest(),
      failureModes: [],
    };
    expect(SkillCapabilityManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("fails when doNotUseWhen are missing", () => {
    const manifest = {
      ...makeValidManifest(),
      doNotUseWhen: [],
    };
    expect(SkillCapabilityManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("fails when a mutating skill omits a usable sideEffectClass", () => {
    const manifest = {
      ...makeValidManifest(),
      isReadOnly: false,
      sideEffectClass: "read_only",
      writeScope: ["workflow_graph"],
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when a connector-dependent skill omits requiredConnectors", () => {
    const manifest = {
      ...makeValidManifest(),
      isReadOnly: false,
      sideEffectClass: "connector_write",
      writeScope: ["crm_record"],
      requiredConnectors: [],
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when surfaceSupport contains an invalid value", () => {
    const manifest = {
      ...makeValidManifest(),
      surfaceSupport: ["chat", "desk"],
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when riskTier is invalid", () => {
    const manifest = {
      ...makeValidManifest(),
      riskTier: "dangerous",
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when ownerTeam is missing", () => {
    const manifest = {
      ...makeValidManifest(),
      ownerTeam: "",
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when ownerCodeownersPath is missing", () => {
    const manifest = {
      ...makeValidManifest(),
      ownerCodeownersPath: "",
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("fails when a Media Studio prompt skill omits origin support or entry points", () => {
    const manifest = {
      ...makeValidManifest(),
      surfaceSupport: ["skill"],
      supportedOriginSurfaces: [],
      supportedEntryPoints: [],
    };
    const parsed = SkillCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("converts a valid runtime manifest into the compact agent capability shape", () => {
    const compact = toAgentCapabilityManifest(makeValidManifest());
    expect(compact.slug).toBe("demo-skill");
    expect(compact.supportedSurfaces).toEqual(["chat", "team"]);
    expect(compact.reviewChecklist).toEqual([
      "Output matches the requested deliverable.",
    ]);
  });
});
