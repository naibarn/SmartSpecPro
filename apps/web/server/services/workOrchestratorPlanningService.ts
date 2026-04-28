import crypto from "crypto";

import type { WorkAutomationLaunchPolicy } from "./workAutomationPolicyService";
import type {
  CapabilityCatalogEntry,
  CapabilityPlan,
  CompiledWorkBrief,
  ExecutionBudgetEnvelope,
  PreflightRevisionFingerprint,
  TeamExecutionPlan,
  TeamResolutionDecision,
  WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";
import {
  estimateAutoTeamMediaPipelineCredits,
  estimateAutoTeamVideoClipCount,
} from "./autoTeamBudgetService";

export interface CreatePreflightPlanInput {
  brief: CompiledWorkBrief;
  capabilityCatalog: readonly CapabilityCatalogEntry[];
  preflightRevision: PreflightRevisionFingerprint;
  teamResolution: TeamResolutionDecision;
  policy: WorkAutomationLaunchPolicy;
  createdAt?: Date | string;
}

export interface CreatePreflightPlanResult {
  capabilityPlan: CapabilityPlan;
  executionPlan: TeamExecutionPlan;
  budget: ExecutionBudgetEnvelope;
  blockedAlternatives: Record<string, string[]>;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function deriveBudget(
  policy: WorkAutomationLaunchPolicy,
  brief?: CompiledWorkBrief,
): ExecutionBudgetEnvelope {
  const stepCount = Math.max(1, policy.stepBlueprints.length);
  const mediaStepCount = policy.stepBlueprints.filter(
    step => step.surface === "media_studio" || step.surface === "video_editor",
  ).length;
  const videoStepCount = policy.stepBlueprints.filter(
    step => step.surface === "video_editor",
  ).length;
  const workflowStepCount = policy.stepBlueprints.filter(
    step => String(step.surface) === "workflow",
  ).length;
  const agencyStepCount = policy.stepBlueprints.filter(
    step => step.surface === "agency",
  ).length;
  const hasSideEffects = policy.stepBlueprints.some(
    step =>
      step.sideEffectClass === "bounded_write" ||
      step.sideEffectClass === "external_write" ||
      step.sideEffectClass === "irreversible",
  );
  const videoEstimate = estimateAutoTeamVideoClipCount({
    text: [
      brief?.title,
      brief?.objective,
      brief?.summary,
      ...policy.stepBlueprints.map(step => `${step.stepKey} ${step.title} ${step.evidenceType}`),
    ]
      .filter(Boolean)
      .join(" "),
  });
  const estimatedVideoClipCount = videoStepCount > 0 ? Math.max(1, videoEstimate.clipCount || 6) : 0;
  const estimatedMediaJobs =
    mediaStepCount + Math.max(videoStepCount * 2, estimatedVideoClipCount) + (videoStepCount > 0 ? 2 : 0);
  const mediaPipelineCredits =
    videoStepCount > 0
      ? estimateAutoTeamMediaPipelineCredits({
          mediaType: "video",
          clipCount: estimatedVideoClipCount,
          includeComposition: true,
          includeProbe: true,
          includeFinalReview: true,
        }) + Math.max(0, mediaStepCount - videoStepCount) * estimateAutoTeamMediaPipelineCredits({ mediaType: "image" })
      : mediaStepCount * estimateAutoTeamMediaPipelineCredits({ mediaType: "image" });

  return {
    maxRounds: Math.max(12, stepCount * 3),
    maxTokens: Math.max(24_000, stepCount * (hasSideEffects ? 8_000 : 5_000)),
    maxToolCalls: stepCount * 4,
    maxMediaJobs: estimatedMediaJobs,
    maxWorkflowRuns: workflowStepCount,
    maxAgencyRuns: agencyStepCount,
    maxDurationMinutes: Math.max(30, stepCount * 10),
    maxBudgetCredits: Math.max(
      stepCount * (hasSideEffects ? 120 : 80),
      Math.ceil(mediaPipelineCredits * 1.3),
    ),
    maxRetries: hasSideEffects ? 1 : 2,
    perSurfaceMaxAttempts: {
      skill: 2,
      agency: 2,
      browser: 1,
      document_management: 1,
      media_studio: 1,
      video_editor: 1,
      workflow: 1,
      skill_studio: 1,
      work_os: 1,
      manual: 1,
    },
    mediaRenderQuota: estimatedMediaJobs,
    retryDisposition: hasSideEffects ? "single_attempt" : "safe_retry",
    sideEffectRetryPolicy: hasSideEffects ? "verify_then_retry" : "automatic",
    onExceeded: "pause_for_approval",
  };
}

function normalizePlannerText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function buildCapabilityIndex(
  catalog: readonly CapabilityCatalogEntry[],
): Map<string, CapabilityCatalogEntry> {
  const index = new Map<string, CapabilityCatalogEntry>();
  for (const entry of catalog) {
    if (!index.has(entry.surface)) {
      index.set(entry.surface, entry);
    }
    index.set(entry.id, entry);
  }
  return index;
}

function scoreCapability(entry: CapabilityCatalogEntry, terms: readonly string[]): number {
  const searchable = normalizePlannerText(
    [
      entry.id,
      entry.title,
      entry.description,
      entry.surface,
      JSON.stringify(entry.metadata ?? {}),
    ].join(" "),
  );
  return terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function selectCapability(input: {
  catalog: readonly CapabilityCatalogEntry[];
  surface: WorkOrchestratorSurface;
  terms?: readonly string[];
}): CapabilityCatalogEntry | null {
  const candidates = input.catalog.filter(entry => {
    if (entry.surface !== input.surface) return false;
    if (entry.blockedReason) return false;
    if (entry.contractCompatibility.state !== "compatible") return false;
    return entry.governance.plannerVisible;
  });
  if (candidates.length === 0) {
    return input.catalog.find(entry => entry.surface === input.surface) ?? null;
  }
  const terms = input.terms ?? [];
  return [...candidates].sort((a, b) => {
    const scoreDelta = scoreCapability(b, terms) - scoreCapability(a, terms);
    if (scoreDelta !== 0) return scoreDelta;
    const aSpecific = a.id === a.surface ? 0 : 1;
    const bSpecific = b.id === b.surface ? 0 : 1;
    return bSpecific - aSpecific;
  })[0] ?? null;
}

type PlannedStepDraft = {
  stepKey: string;
  title: string;
  objective: string;
  surface: WorkOrchestratorSurface;
  expectedArtifact: string;
  sideEffectClass: "read_only" | "bounded_write" | "external_side_effect" | "irreversible";
  terms: string[];
  optional?: boolean;
};

function inferDynamicStepDrafts(input: {
  brief: CompiledWorkBrief;
  policy: WorkAutomationLaunchPolicy;
}): PlannedStepDraft[] {
  const text = normalizePlannerText(
    [input.brief.title, input.brief.objective, input.brief.summary].join(" "),
  );
  const wantsVideo = /video|วีดีโอ|วิดีโอ|คลิป|veo|reel|movie|film/.test(text);
  const wantsImage = /image|images|ภาพ|รูป|โปสเตอร์|thumbnail|keyframe|storyboard|สตอรี่บอร์ด/.test(text);
  const wantsResearch = /research|ค้นคว้า|ข้อมูล|ข่าว|อ้างอิง|compare|เปรียบเทียบ|latest|ปัจจุบัน|ปี\s*25|202\d/.test(text);
  const wantsDocument = /document|doc|article|บทความ|รายงาน|brief|copy|script|storyboard|สคริปต์|เนื้อหา/.test(text);

  const drafts: PlannedStepDraft[] = [];
  if (wantsResearch || wantsVideo || wantsDocument) {
    drafts.push({
      stepKey: "research-context",
      title: "Research and context gathering",
      objective: `Gather trusted context for: ${input.brief.objective ?? input.brief.title}`,
      surface: "agency",
      expectedArtifact: "research",
      sideEffectClass: "read_only",
      terms: ["research", "search", "rag", "browser", "agency"],
    });
  }
  drafts.push({
    stepKey: "plan-and-brief",
    title: "Plan and brief synthesis",
    objective: `Turn the request into an executable brief for: ${input.brief.objective ?? input.brief.title}`,
    surface: "skill",
    expectedArtifact: "brief",
    sideEffectClass: "read_only",
    terms: ["planner", "brief", "orchestrator", "article", "writer"],
  });
  if (wantsDocument || wantsVideo) {
    drafts.push({
      stepKey: wantsVideo ? "storyboard-script" : "draft-document",
      title: wantsVideo ? "Storyboard and script" : "Draft document",
      objective: wantsVideo
        ? `Create a scene-by-scene storyboard and script for: ${input.brief.objective ?? input.brief.title}`
        : `Create the requested document output for: ${input.brief.objective ?? input.brief.title}`,
      surface: "document_management",
      expectedArtifact: wantsVideo ? "storyboard" : "document",
      sideEffectClass: "bounded_write",
      terms: wantsVideo
        ? ["storyboard", "script", "scene", "document", "rag", "vector"]
        : ["document", "draft", "writer", "rag", "vector"],
    });
  }
  if (wantsImage || wantsVideo) {
    drafts.push({
      stepKey: "generate-visual-assets",
      title: wantsVideo ? "Generate storyboard keyframes" : "Generate visual assets",
      objective: `Generate visual assets aligned with: ${input.brief.objective ?? input.brief.title}`,
      surface: "media_studio",
      expectedArtifact: "media",
      sideEffectClass: "external_side_effect",
      terms: ["image", "keyframe", "media", "storyboard"],
    });
  }
  if (wantsVideo) {
    drafts.push({
      stepKey: "compose-final-video",
      title: "Generate clips and compose final video",
      objective: `Generate video clips, wait for completion, compose, and verify the final video for: ${input.brief.objective ?? input.brief.title}`,
      surface: "video_editor",
      expectedArtifact: "video",
      sideEffectClass: "external_side_effect",
      terms: ["video", "clip", "compose", "concat", "storyboard", "veo"],
    });
  }
  drafts.push({
    stepKey: "final-quality-review",
    title: "Final quality review",
    objective: `Verify the final result satisfies: ${input.brief.objective ?? input.brief.title}`,
    surface: "skill",
    expectedArtifact: "review",
    sideEffectClass: "read_only",
    terms: ["review", "quality", "critic", "qa"],
  });

  if (drafts.length < 4) {
    for (const step of input.policy.stepBlueprints) {
      if (drafts.some(draft => draft.stepKey === step.stepKey)) continue;
      drafts.splice(Math.max(1, drafts.length - 1), 0, {
        stepKey: step.stepKey,
        title: step.title,
        objective: `${step.title}: ${input.brief.objective ?? input.brief.title}`,
        surface: step.surface as WorkOrchestratorSurface,
        expectedArtifact: step.evidenceType,
        sideEffectClass:
          step.sideEffectClass === "external_write"
            ? "external_side_effect"
            : step.sideEffectClass,
        terms: [step.title.toLowerCase(), step.evidenceType],
      });
      if (drafts.length >= 4) break;
    }
  }

  return drafts.slice(0, 8);
}

function approvalRequiredForDraft(
  draft: PlannedStepDraft,
  capability: CapabilityCatalogEntry | null,
): boolean {
  if (draft.surface === "manual" || draft.surface === "browser" || draft.surface === "workflow" || draft.surface === "skill_studio") {
    return true;
  }
  if (draft.sideEffectClass === "irreversible") {
    return true;
  }
  if (capability?.governance.approvalRequired && draft.sideEffectClass !== "read_only") {
    return draft.surface !== "media_studio" && draft.surface !== "video_editor";
  }
  return false;
}

export function createPreflightPlan(
  input: CreatePreflightPlanInput,
): CreatePreflightPlanResult {
  const createdAt = toIsoDate(input.createdAt);
  const dynamicStepDrafts = inferDynamicStepDrafts({
    brief: input.brief,
    policy: input.policy,
  });
  const dynamicPolicyForBudget: WorkAutomationLaunchPolicy = {
    ...input.policy,
    stepBlueprints: dynamicStepDrafts.map(draft => ({
      stepKey: draft.stepKey,
      title: draft.title,
      surface: draft.surface as never,
      allowedSurfaces: [draft.surface] as never,
      riskTier:
        draft.sideEffectClass === "external_side_effect" ||
        draft.sideEffectClass === "irreversible"
          ? "medium"
          : "low",
      requiresApproval: approvalRequiredForDraft(draft, null),
      checkpointKey: null,
      evidenceType: draft.expectedArtifact as never,
      sideEffectClass:
        draft.sideEffectClass === "external_side_effect"
          ? "external_write"
          : draft.sideEffectClass as never,
    })),
  };
  const budget = deriveBudget(dynamicPolicyForBudget, input.brief);
  const capabilityIndex = buildCapabilityIndex(input.capabilityCatalog);
  const blockedAlternatives: Record<string, string[]> = {};

  const resolvedSteps = dynamicStepDrafts.map(draft => {
    const selectedCapability = selectCapability({
      catalog: input.capabilityCatalog,
      surface: draft.surface,
      terms: draft.terms,
    });
    const approvalRequired = approvalRequiredForDraft(draft, selectedCapability);
    return { ...draft, selectedCapability, approvalRequired };
  });

  const capabilityPlanSteps = resolvedSteps.map(step => {
    const selectedCapability = step.selectedCapability;
    const alternativeCapabilityIds = input.capabilityCatalog
      .filter(entry => entry.surface === step.surface)
      .map(entry => entry.id);

    blockedAlternatives[step.stepKey] = input.capabilityCatalog
      .filter(
        entry =>
          entry.surface === step.surface &&
          entry.blockedReason,
      )
      .map(entry => String(entry.blockedReason));

    return {
      stepId: `${input.preflightRevision.fingerprint}:${step.stepKey}`,
      title: step.title,
      selectedCapabilityId: selectedCapability?.id ?? null,
      selectedSurface: step.surface,
      blockedReasonCodes: selectedCapability?.blockedReason
        ? [selectedCapability.blockedReason]
        : [],
      alternativeCapabilityIds,
    };
  });

  const capabilityPlan: CapabilityPlan = {
    id: crypto.randomUUID(),
    version: "capability-plan.v1",
    selectedCapabilityIds: capabilityPlanSteps
      .map(step => step.selectedCapabilityId)
      .filter((value): value is string => Boolean(value)),
    summary: `Capability-aware plan for ${input.brief.title}`,
    steps: capabilityPlanSteps,
    createdAt,
  };

  const executionPlan: TeamExecutionPlan = {
    id: crypto.randomUUID(),
    version: "team-execution-plan.v1",
    brief: input.brief,
    budget,
    teamResolution: input.teamResolution,
    preflightRevision: input.preflightRevision,
    createdAt,
    steps: resolvedSteps.map(step => {
      const selectedCapability =
        step.selectedCapability ?? capabilityIndex.get(step.surface) ?? null;
      const selectedGovernance = selectedCapability?.governance;
      const governance = {
        ...(selectedGovernance ?? {
          surface: step.surface,
          plannerVisible: true,
          minimumGate: "explicit_approval",
          requiredFeatureFlags: [],
          requiredPermissions: [],
        }),
        surface: step.surface,
        autoExecutableByDefault: !step.approvalRequired,
        approvalRequired: step.approvalRequired,
      };
      return {
        id: `${input.preflightRevision.fingerprint}:${step.stepKey}`,
        stepKey: step.stepKey,
        title: step.title,
        objective: step.objective,
        surface: step.surface,
        action: null,
        capabilityId: selectedCapability?.id ?? null,
        governance,
        contractCompatibility:
          selectedCapability?.contractCompatibility ?? {
            state: "preview_only",
            reasonCode: "missing_capability_catalog_entry",
            migrationRequired: false,
          },
        expectedArtifacts: [step.expectedArtifact],
        optional: step.optional ?? false,
        metadata: {
          stepKey: step.stepKey,
          plannerMode: "capability_aware_dynamic",
          plannerTerms: step.terms,
          riskTier:
            step.sideEffectClass === "external_side_effect" ||
            step.sideEffectClass === "irreversible"
              ? "medium"
              : "low",
          checkpointKey: null,
          requiresApproval: step.approvalRequired,
          allowedSurfaces: [step.surface],
          sideEffectClass: step.sideEffectClass,
          selectedCapabilityTitle: selectedCapability?.title ?? null,
          selectedCapabilityMetadata: selectedCapability?.metadata ?? {},
          planningContract: {
            mode: "capability_catalog_grounded",
            plannerInputSources: [
              "compiled_brief",
              "capability_catalog",
              "launch_policy",
              "team_resolution",
            ],
            llmPlannerEscalation: "available_for_complex_or_low_confidence_objectives",
            repairLoopRequired: true,
            humanIntervention: step.approvalRequired ? "approval_boundary_only" : "exception_only",
          },
          documentManagementRequired:
            step.surface === "document_management"
              ? {
                  rag: true,
                  vectorSearch: true,
                  expectedArtifact: step.expectedArtifact,
                }
              : null,
          mediaPipelineRequired:
            step.surface === "media_studio" || step.surface === "video_editor"
              ? {
                  async: true,
                  finalReviewRequired: step.surface === "video_editor",
                  repairOnFailedReview: true,
                }
              : null,
        },
      };
    }),
  };

  return {
    capabilityPlan,
    executionPlan,
    budget,
    blockedAlternatives,
  };
}
