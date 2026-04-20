import type { SkillDefinition } from "@smartspec/skills";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateSkillCapabilityActivationGate,
  getInitialSkillCapabilityCoverage,
  loadSkillCapabilityManifests,
  selectSkillCapabilityCandidate,
} from "../skillCapabilityManifestService";
import { getSkillRegistryAsync } from "../skillRegistry";

vi.mock("../skillRegistry", () => ({
  getSkillRegistryAsync: vi.fn(),
}));

function makeSkill(
  id: string,
  overrides: Partial<SkillDefinition> = {}
): SkillDefinition {
  return {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? `${id} description`,
    icon: overrides.icon ?? "sparkles",
    type: overrides.type ?? "chat-assistant",
    category: overrides.category ?? "chat_assistant",
    tags: overrides.tags,
    internalOnly: overrides.internalOnly,
    surfaceScopes: overrides.surfaceScopes,
    interactionModes: overrides.interactionModes,
    teamRunEligible: overrides.teamRunEligible,
    triggers: overrides.triggers ?? [],
    requiresExplicit: overrides.requiresExplicit ?? false,
    creditMultiplier: overrides.creditMultiplier ?? 1,
    models: overrides.models,
    defaultModel: overrides.defaultModel,
    llmModelId: overrides.llmModelId,
    preferredProviderId: overrides.preferredProviderId,
    strictProviderPin: overrides.strictProviderPin,
    enabledByDefault: overrides.enabledByDefault ?? true,
    priority: overrides.priority ?? 50,
    systemPrompt: overrides.systemPrompt,
    skillContent: overrides.skillContent,
    skillFilePath: overrides.skillFilePath,
    executionMode: overrides.executionMode ?? "llm-only",
    sandboxProfileSlug: overrides.sandboxProfileSlug,
    requiresNetwork: overrides.requiresNetwork,
    requiresBrowser: overrides.requiresBrowser,
    maxRuntimeSeconds: overrides.maxRuntimeSeconds,
    maxInputMb: overrides.maxInputMb,
    chainTo: overrides.chainTo,
    dbId: overrides.dbId,
    executionPolicy: overrides.executionPolicy,
    localExecution: overrides.localExecution,
    contentQuality: overrides.contentQuality,
  };
}

const registryFixture: SkillDefinition[] = [
  makeSkill("brainstorm", {
    name: "Brainstorm",
    category: "chat_assistant",
  }),
  makeSkill("general-article-writer", {
    name: "General Article Writer",
    category: "article_generation",
  }),
  makeSkill("documentary-script-writer", {
    name: "Documentary Script Writer",
    category: "article_generation",
  }),
  makeSkill("storyboard-writer", {
    name: "Storyboard Writer",
    category: "video_prompt_generation",
  }),
  makeSkill("video-storyboard-to-prompts", {
    name: "Storyboard To Prompts",
    category: "video_prompt_generation",
  }),
  makeSkill("video-prompt-engineer", {
    name: "Video Prompt Engineer",
    category: "video_prompt_generation",
  }),
  makeSkill("cinematic-video-createprompt", {
    name: "Cinematic Video Create Prompt",
    category: "video_prompt_generation",
  }),
  makeSkill("image_prompt_engineer", {
    name: "Image Prompt Engineer",
    category: "image_prompt_generation",
  }),
  makeSkill("editorial-layout-planner", {
    name: "Editorial Layout Planner",
    category: "slide_generation",
  }),
  makeSkill("workflow-ai-editor", {
    name: "Workflow AI Editor",
    category: "automation",
    executionMode: "python",
  }),
  makeSkill("help-content-writer", {
    name: "Help Content Writer",
    category: "chat_assistant",
  }),
  makeSkill("translation", {
    name: "Translation",
    category: "translation",
  }),
];

describe("skillCapabilityManifestService", () => {
  beforeEach(() => {
    vi.mocked(getSkillRegistryAsync).mockResolvedValue(registryFixture);
  });

  it("loader returns manifests for known skill slugs", async () => {
    const result = await loadSkillCapabilityManifests({
      skillSlugs: ["brainstorm", "general-article-writer"],
    });

    expect(result.candidates.map(candidate => candidate.skillSlug)).toEqual([
      "brainstorm",
      "general-article-writer",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("loader filters by Chat surface", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "chat",
    });

    expect(result.candidates.some(candidate => candidate.skillSlug === "general-article-writer")).toBe(true);
    expect(result.candidates.some(candidate => candidate.skillSlug === "workflow-ai-editor")).toBe(false);
  });

  it("loader filters by Team surface", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "team",
    });

    expect(result.candidates.some(candidate => candidate.skillSlug === "storyboard-writer")).toBe(true);
    expect(result.candidates.some(candidate => candidate.skillSlug === "cinematic-video-createprompt")).toBe(false);
  });

  it("loader filters by Responses surface", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "responses",
    });

    expect(result.candidates.map(candidate => candidate.skillSlug)).toEqual(
      expect.arrayContaining(["editorial-layout-planner", "workflow-ai-editor"])
    );
    expect(result.candidates.some(candidate => candidate.skillSlug === "general-article-writer")).toBe(false);
  });

  it("loader filters by shared skill surface", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "skill",
    });

    expect(result.candidates.some(candidate => candidate.skillSlug === "image_prompt_engineer")).toBe(true);
    expect(result.candidates.some(candidate => candidate.skillSlug === "brainstorm")).toBe(false);
  });

  it("loader filters by Media Studio origin surface and entry point", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "enhance_prompt",
    });

    expect(result.candidates.map(candidate => candidate.skillSlug)).toEqual(
      expect.arrayContaining([
        "image_prompt_engineer",
        "video-prompt-engineer",
        "cinematic-video-createprompt",
      ])
    );
    expect(result.candidates.some(candidate => candidate.skillSlug === "workflow-ai-editor")).toBe(false);
  });

  it("loader filters out missing approval for a mutating skill", async () => {
    const result = await loadSkillCapabilityManifests({
      surface: "responses",
      skillSlugs: ["workflow-ai-editor"],
      approvalGranted: false,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "approval_required")).toBe(true);
  });

  it("diagnostics are produced for an incomplete manifest", async () => {
    const result = await loadSkillCapabilityManifests({
      skillSlugs: ["general-article-writer"],
      manifestOverrides: {
        "general-article-writer": {
          ownerCodeownersPath: "",
        },
      },
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "manifest_incomplete")).toBe(true);
  });

  it("matching task type increases suitability", async () => {
    const result = await selectSkillCapabilityCandidate({
      surface: "team",
      taskType: "storyboard_script",
      skillSlugs: ["general-article-writer", "storyboard-writer"],
      availableContext: ["objective_brief"],
      availableEvidenceKinds: ["objective", "reference_note"],
    });

    expect(result.selected?.skillSlug).toBe("storyboard-writer");
  });

  it("required context mismatch rejects the candidate", async () => {
    const result = await selectSkillCapabilityCandidate({
      surface: "chat",
      taskType: "research_summary",
      skillSlugs: ["documentary-script-writer", "general-article-writer"],
      availableContext: ["objective_brief"],
      availableEvidenceKinds: ["objective", "source_note"],
    });

    expect(result.selected?.skillSlug).toBe("general-article-writer");
    expect(
      result.rejectedAlternatives.some(candidate =>
        candidate.skillSlug === "documentary-script-writer" &&
        candidate.reasons.some(reason => reason.includes("missing required context"))
      )
    ).toBe(true);
  });

  it("doNotUseWhen prevents selection", async () => {
    const result = await selectSkillCapabilityCandidate({
      surface: "chat",
      taskType: "writing_copy",
      skillSlugs: ["general-article-writer"],
      availableContext: ["objective_brief"],
      availableEvidenceKinds: ["objective"],
      avoidConditions: ["structured_json_required"],
    });

    expect(result.selected).toBeNull();
    expect(
      result.rejectedAlternatives[0]?.reasons.some(reason =>
        reason.includes("doNotUseWhen")
      )
    ).toBe(true);
  });

  it("negative signals reduce ranking", async () => {
    const result = await selectSkillCapabilityCandidate({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "enhance_prompt",
      taskType: "video_prompt_generation",
      skillSlugs: ["video-prompt-engineer", "cinematic-video-createprompt"],
      availableContext: ["objective_brief"],
      availableEvidenceKinds: ["objective"],
      negativeSignals: ["submit_generation_job"],
    });

    expect(result.selected?.skillSlug).toBe("cinematic-video-createprompt");
  });

  it("required evidence kinds influence selection", async () => {
    const noStoryboardEvidence = await selectSkillCapabilityCandidate({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "execute_custom_skill",
      taskType: "video_prompt_generation",
      skillSlugs: ["video-prompt-engineer", "video-storyboard-to-prompts"],
      availableContext: ["objective_brief", "storyboard"],
      availableEvidenceKinds: ["objective"],
    });

    const withStoryboardEvidence = await selectSkillCapabilityCandidate({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "execute_custom_skill",
      taskType: "video_prompt_generation",
      skillSlugs: ["video-prompt-engineer", "video-storyboard-to-prompts"],
      availableContext: ["objective_brief", "storyboard"],
      availableEvidenceKinds: ["storyboard"],
    });

    expect(noStoryboardEvidence.selected?.skillSlug).toBe("video-prompt-engineer");
    expect(withStoryboardEvidence.selected?.skillSlug).toBe("video-storyboard-to-prompts");
  });

  it("explanation includes the selected skill and rejected alternatives", async () => {
    const result = await selectSkillCapabilityCandidate({
      surface: "chat",
      taskType: "writing_copy",
      skillSlugs: ["general-article-writer", "help-content-writer"],
      availableContext: ["objective_brief"],
      availableEvidenceKinds: ["objective", "source_note"],
      selectionSignals: ["article", "write"],
    });

    expect(result.selected?.skillSlug).toBe("general-article-writer");
    expect(result.rejectedAlternatives.some(candidate => candidate.skillSlug === "help-content-writer")).toBe(true);
    expect(result.rankedCandidates[0]?.matchedTaskTypes).toEqual(["writing_copy"]);
  });

  it("coverage includes the initial high-priority runtime skills", async () => {
    const result = await getInitialSkillCapabilityCoverage();

    expect(result.covered.map(entry => entry.coverageKey)).toEqual(
      expect.arrayContaining([
        "planning_decomposition",
        "research_and_writing",
        "storyboard_and_script",
        "video_prompt_generation",
        "image_prompt_generation",
        "review_qa",
        "final_handoff_publishing",
        "structured_output",
      ])
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("Media Studio prompt paths are covered before active shared-skill mode can proceed", async () => {
    const result = await evaluateSkillCapabilityActivationGate({
      mode: "active",
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "enhance_prompt",
      skillSlugs: [
        "image_prompt_engineer",
        "video-prompt-engineer",
        "cinematic-video-createprompt",
      ],
    });

    expect(result.allowed).toBe(true);
    expect(result.candidates.length).toBe(3);
  });

  it("active mode blocks a missing manifest", async () => {
    const result = await evaluateSkillCapabilityActivationGate({
      mode: "active",
      surface: "chat",
      skillSlugs: ["translation"],
    });

    expect(result.allowed).toBe(false);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "manifest_missing")).toBe(true);
  });

  it("shadow mode records the missing-manifest diagnostic without blocking", async () => {
    const result = await evaluateSkillCapabilityActivationGate({
      mode: "shadow",
      surface: "chat",
      skillSlugs: ["translation"],
    });

    expect(result.allowed).toBe(true);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "manifest_missing")).toBe(true);
  });
});
