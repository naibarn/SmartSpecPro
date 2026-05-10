import { eq } from "drizzle-orm";

import {
  skills,
  skillContractSnapshots,
  skillImprovementRecommendations,
  skillImprovementRuns,
  type Skill,
  type SkillImprovementRecommendation,
  type SkillImprovementRun,
} from "../../drizzle/schema";
import {
  buildSkillContractSnapshot,
  compareSkillContractSnapshots,
  type SkillCompatibilityReport,
} from "./skillCompatibilityGate";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import { launchSkillStudioTask } from "./skillStudioService";
import {
  hasRelativeSkillManifest,
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
  updateSkillManifestFiles,
} from "./skillFiles";
import { refreshSkillCache } from "./skillRegistry";

type DbLike = any;

interface ApplySkillUpgradeParams {
  db: DbLike;
  recommendationId: number;
  requestedBy?: number | null;
  tenantId?: string | null;
  userRole?: string | null;
  userToken?: string | null;
  publicUrl?: string | null;
  sourceRunId?: number | null;
  retryReason?: string | null;
}

export interface ApplySkillUpgradeResult {
  recommendation: SkillImprovementRecommendation;
  run: SkillImprovementRun;
  compatibilityReport: SkillCompatibilityReport | null;
  taskId?: string;
  mode: "applied" | "queued";
  applyStrategy: "direct" | "auto-apply" | "proposal";
}

function getDefaultSandboxProfileSlug(
  executionMode: string | null | undefined,
  category: string,
): string {
  if (executionMode === "sandbox-browser" || executionMode === "sandbox-command") {
    return "browser-default";
  }
  if (executionMode === "sandbox-file") {
    return "file-parser";
  }
  if (executionMode === "sandbox-media") {
    return "media-processing";
  }
  if (category === "slide_generation") {
    return "browser-default";
  }
  return "code-default";
}

function toMaintenanceTarget(skill: Skill) {
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    folderPath: skill.folderPath,
    executionMode: skill.executionMode,
    configJson: (skill.configJson as Record<string, unknown> | null) ?? null,
    sandboxProfileSlug: skill.sandboxProfileSlug,
    requiresNetwork: skill.requiresNetwork,
    requiresBrowser: skill.requiresBrowser,
  };
}

function normalizeVisibility(value: string | null | undefined): "private" | "pending_approval" | "public" {
  if (value === "public" || value === "pending_approval") {
    return value;
  }
  return "private";
}

function stringifyList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return "none";
  }
  return items.map((item) => String(item)).join(", ");
}

function getRecommendationDetails(
  recommendation: SkillImprovementRecommendation,
): {
  recommendationJson: Record<string, unknown>;
  contractDeltaJson: Record<string, unknown>;
  details: Record<string, unknown>;
} {
  const recommendationJson = (recommendation.recommendationJson as Record<string, unknown> | null) ?? {};
  const contractDeltaJson = (recommendation.contractDeltaJson as Record<string, unknown> | null) ?? {};
  const details = recommendationJson.details && typeof recommendationJson.details === "object"
    ? recommendationJson.details as Record<string, unknown>
    : {};
  return { recommendationJson, contractDeltaJson, details };
}

function isBreakingMaintenanceChange(recommendation: SkillImprovementRecommendation): boolean {
  const { recommendationJson, contractDeltaJson, details } = getRecommendationDetails(recommendation);
  const proposedRuntime = typeof recommendation.proposedRuntime === "string" ? recommendation.proposedRuntime.trim() : "";
  const currentRuntime = typeof recommendation.currentRuntime === "string" ? recommendation.currentRuntime.trim() : "";
  const runtimeChanged = Boolean(proposedRuntime && currentRuntime && proposedRuntime !== currentRuntime);
  const recommendationType = (recommendation.recommendationType || "").toLowerCase();
  const topologySignals = details["topologySignals"] && typeof details["topologySignals"] === "object"
    ? details["topologySignals"] as Record<string, unknown>
    : null;
  const explicitBreaking = Boolean(
    recommendationJson["breakingChange"]
    || recommendationJson["requiresApproval"]
    || contractDeltaJson["breakingChange"]
    || contractDeltaJson["requiresApproval"]
    || details["breakingChange"]
    || details["requiresApproval"],
  );
  const typeSignalsBreaking = (
    recommendationType.includes("breaking")
    || recommendationType.includes("migrate")
    || recommendationType.includes("runtime")
    || recommendationType.includes("topology-widen")
    || recommendationType.includes("scope-widen")
  );
  const topologyWidening = Boolean(
    topologySignals?.["widenScope"]
    || topologySignals?.["pathBoundaryChanged"]
    || topologySignals?.["executionContractChanged"]
  );
  return runtimeChanged || explicitBreaking || typeSignalsBreaking || topologyWidening;
}

function buildUpgradeBrief(skill: Skill, recommendation: SkillImprovementRecommendation): string {
  const { recommendationJson, contractDeltaJson, details } = getRecommendationDetails(recommendation);
  const breakingChange = isBreakingMaintenanceChange(recommendation);

  const lines = [
    `Improve the existing SmartAIHub skill "${skill.name}" (${skill.slug}).`,
    `Recommendation type: ${recommendation.recommendationType}.`,
    `Primary goal: ${recommendation.title}.`,
    recommendation.summary ? `Summary: ${recommendation.summary}` : "",
    recommendation.rationale ? `Rationale: ${recommendation.rationale}` : "",
    "",
    "Hard compatibility rules:",
    "- Preserve current input and output behavior for existing callers.",
    "- Do not remove required input fields or required output fields.",
    "- Do not change field types for existing structured inputs/outputs.",
    "- Keep existing trigger behavior unless the recommendation explicitly needs an internal runtime upgrade.",
    "- Add or improve tests/fixtures so the contract stays verifiable.",
    "",
    "Maintenance facts:",
    `- Current runtime: ${recommendation.currentRuntime ?? "unknown"}`,
    `- Proposed runtime: ${recommendation.proposedRuntime ?? "unchanged"}`,
    `- Proposed action: ${recommendation.proposedAction ?? "unspecified"}`,
    `- Change classification: ${breakingChange ? "breaking" : "non-breaking"}`,
    `- Affected files: ${stringifyList(recommendationJson.affectedFiles)}`,
    `- Input required fields: ${stringifyList(contractDeltaJson.inputRequiredFields)}`,
    `- Output required fields: ${stringifyList(contractDeltaJson.outputRequiredFields)}`,
    "",
    "Implementation guidance:",
    "- Prefer modular, reviewable changes over one large rewrite.",
    "- If this is a GenJS migration, create or update skill.manifest.json, package.json, src/index.mjs, pipeline modules, and fixture coverage while preserving the public contract.",
    "- If tools/dependencies are needed, declare them explicitly in package.json and keep the bundle runnable in the existing Node.js sandbox flow.",
    "- If this recommendation touches subagent topology, preserve the existing orchestrator boundary, keep specialist paths under agents/specialists/, and do not widen routing beyond the current manifest.",
    "- Update docs only where they help future maintenance or runtime clarity.",
    "",
    "Recommendation-specific details:",
    JSON.stringify(details, null, 2),
  ];

  return lines.filter(Boolean).join("\n");
}

function extractSavedProposalFiles(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = Array.isArray(metadata?.savedProposals)
    ? metadata.savedProposals
    : Array.isArray(metadata?.saved_proposals)
      ? metadata.saved_proposals
      : [];

  return raw
    .map((value) => String(value || "").trim())
    .filter((value) => Boolean(value) && !value.endsWith(".meta.json"));
}

function getLatestProposalInfo(metadata: Record<string, unknown> | null | undefined): {
  savedProposals: string[];
  latestProposal: string | null;
} {
  const savedProposals = extractSavedProposalFiles(metadata);
  return {
    savedProposals,
    latestProposal: savedProposals.length > 0 ? savedProposals[savedProposals.length - 1] ?? null : null,
  };
}

function hasNoChangeCompletionEvidence(
  resultMessage: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (metadata?.completionMode === "no_changes") {
    return true;
  }
  if (metadata?.proposalCount === 0) {
    return true;
  }
  const savedProposals = extractSavedProposalFiles(metadata);
  const combined = [
    resultMessage,
    typeof metadata?.resultMessage === "string" ? metadata.resultMessage : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return savedProposals.length === 0 && [
    "no patches generated",
    "no changes required",
    "completed without code changes",
  ].some((signal) => combined.includes(signal));
}

function hasWorkspaceRootPollutionEvidence(
  resultMessage: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (metadata?.workspaceRootPolluted === true) {
    return true;
  }
  const combined = [
    resultMessage,
    typeof metadata?.resultError === "string" ? metadata.resultError : null,
    typeof metadata?.errorMessage === "string" ? metadata.errorMessage : null,
    typeof metadata?.workspaceRoot === "string" ? metadata.workspaceRoot : null,
    typeof metadata?.entrypointRoot === "string" ? metadata.entrypointRoot : null,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\\/g, "/")
    .toLowerCase();
  return combined.includes("/runs/workspaces/")
    && combined.includes("/skills/intelligence-skill-creator/");
}

function buildFailureMetadata(
  metadata: Record<string, unknown> | null | undefined,
  resultMessage: string | null | undefined,
  fallbackError: string,
): Record<string, unknown> {
  const resultError = fallbackError || resultMessage || "Unknown apply error";
  const workspaceRootPolluted = hasWorkspaceRootPollutionEvidence(resultMessage, metadata);
  return {
    ...(metadata ?? {}),
    resultMessage,
    resultError,
    ...(workspaceRootPolluted
      ? {
          failureCode: "isc_workspace_root_pollution",
          workspaceRootPolluted: true,
        }
      : {}),
  };
}

async function fetchSkillRecommendation(
  db: DbLike,
  recommendationId: number,
): Promise<{ recommendation: SkillImprovementRecommendation; skill: Skill }> {
  const [recommendation] = await db
    .select()
    .from(skillImprovementRecommendations)
    .where(eq(skillImprovementRecommendations.id, recommendationId))
    .limit(1);

  if (!recommendation) {
    throw new Error(`Recommendation ${recommendationId} not found`);
  }

  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.id, recommendation.skillId))
    .limit(1);

  if (!skill) {
    throw new Error(`Skill ${recommendation.skillId} not found`);
  }

  return { recommendation, skill };
}

function assertRecommendationApplyAllowed(recommendation: SkillImprovementRecommendation): void {
  if (recommendation.status === "dismissed") {
    throw new Error("This recommendation was dismissed and cannot be applied.");
  }
  if (recommendation.status === "applied") {
    throw new Error("This recommendation has already been applied.");
  }
}

async function insertBaselineSnapshot(params: {
  db: DbLike;
  skill: Skill;
  recommendation: SkillImprovementRecommendation;
  run: SkillImprovementRun;
}) {
  const baselineSnapshot = buildSkillContractSnapshot(toMaintenanceTarget(params.skill));

  await params.db.insert(skillContractSnapshots).values({
    skillId: params.skill.id,
    tenantId: params.skill.tenantId,
    recommendationId: params.recommendation.id,
    runId: params.run.id,
    snapshotType: "baseline",
    executionMode: baselineSnapshot.executionMode,
    runtimeProfile: baselineSnapshot.runtimeProfile,
    manifestPath: baselineSnapshot.manifestPath,
    manifestHash: baselineSnapshot.manifestHash,
    inputSchemaHash: baselineSnapshot.inputSchemaHash,
    outputSchemaHash: baselineSnapshot.outputSchemaHash,
    fixtureHash: baselineSnapshot.fixtureHash,
    testsHash: baselineSnapshot.testsHash,
    contractHash: baselineSnapshot.contractHash,
    schemaSummaryJson: baselineSnapshot.schemaSummary,
    sampleInputsJson: [],
    sampleOutputsJson: [],
    compatibilityNotesJson: {
      fileInventory: baselineSnapshot.fileInventory,
    },
    snapshotJson: {
      fileInventory: baselineSnapshot.fileInventory,
    },
    capturedAt: new Date(),
    createdAt: new Date(),
  });

  return baselineSnapshot;
}

async function finalizeStudioApply(params: {
  db: DbLike;
  recommendationId: number;
  runId: number;
  skillId: number;
  baselineSnapshot: ReturnType<typeof buildSkillContractSnapshot>;
  requestedBy?: number | null;
  success: boolean;
  resultMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const {
    db,
    recommendationId,
    runId,
    skillId,
    baselineSnapshot,
    requestedBy = null,
    success,
    resultMessage,
    metadata,
    errorMessage,
  } = params;

  if (!success) {
    const failureMetadata = buildFailureMetadata(
      metadata,
      resultMessage,
      errorMessage || resultMessage || "Unknown generator-backed apply error",
    );
    await db
      .update(skillImprovementRecommendations)
      .set({
        status: "failed",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendationId));

    await db
      .update(skillImprovementRuns)
      .set({
        status: "failed",
        summary: resultMessage || "Generator-backed upgrade failed",
        errorMessage: errorMessage || resultMessage || "Unknown generator-backed apply error",
        logsJson: failureMetadata,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, runId));
    return;
  }

  if (hasNoChangeCompletionEvidence(resultMessage, metadata)) {
    await db
      .update(skillImprovementRecommendations)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        approvedAt: new Date(),
        approvedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendationId));

    await db
      .update(skillImprovementRuns)
      .set({
        status: "completed",
        summary: "Generator-backed upgrade completed without code changes",
        errorMessage: null,
        logsJson: {
          ...(metadata ?? {}),
          savedProposals: [],
          latestProposal: null,
          resultMessage,
          resultError: null,
          completionMode: "no_changes",
        },
        diffSummaryJson: {
          savedProposals: [],
          latestProposal: null,
          completionMode: "no_changes",
        },
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, runId));
    return;
  }

  const [latestSkill] = await db
    .select()
    .from(skills)
    .where(eq(skills.id, skillId))
    .limit(1);

  if (!latestSkill) {
    await db
      .update(skillImprovementRecommendations)
      .set({
        status: "failed",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendationId));

    await db
      .update(skillImprovementRuns)
      .set({
        status: "failed",
        summary: "Upgrade completed but skill record could not be reloaded",
        errorMessage: `Skill ${skillId} was not found after upgrade`,
        logsJson: {
          ...(metadata ?? {}),
          resultMessage,
          resultError: `Skill ${skillId} was not found after upgrade`,
        },
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, runId));
    return;
  }

  const candidateSnapshot = buildSkillContractSnapshot(toMaintenanceTarget(latestSkill));
  const compatibilityReport = compareSkillContractSnapshots(baselineSnapshot, candidateSnapshot);

  await db.insert(skillContractSnapshots).values({
    skillId: latestSkill.id,
    tenantId: latestSkill.tenantId,
    recommendationId,
    runId,
    snapshotType: "post_apply",
    executionMode: candidateSnapshot.executionMode,
    runtimeProfile: candidateSnapshot.runtimeProfile,
    manifestPath: candidateSnapshot.manifestPath,
    manifestHash: candidateSnapshot.manifestHash,
    inputSchemaHash: candidateSnapshot.inputSchemaHash,
    outputSchemaHash: candidateSnapshot.outputSchemaHash,
    fixtureHash: candidateSnapshot.fixtureHash,
    testsHash: candidateSnapshot.testsHash,
    contractHash: candidateSnapshot.contractHash,
    schemaSummaryJson: candidateSnapshot.schemaSummary,
    sampleInputsJson: [],
    sampleOutputsJson: [],
    compatibilityNotesJson: {
      status: compatibilityReport.status,
      issues: compatibilityReport.issues,
    },
    snapshotJson: {
      fileInventory: candidateSnapshot.fileInventory,
      metadata: metadata ?? {},
    },
    capturedAt: new Date(),
    createdAt: new Date(),
  });

  await db
    .update(skillImprovementRecommendations)
    .set({
      status: compatibilityReport.status === "blocked" ? "blocked" : "applied",
      reviewedAt: new Date(),
      reviewedBy: requestedBy,
      approvedAt: new Date(),
      approvedBy: requestedBy,
      appliedAt: compatibilityReport.status === "blocked" ? null : new Date(),
      compatibilityStatus: compatibilityReport.status,
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRecommendations.id, recommendationId));

  await db
    .update(skillImprovementRuns)
    .set({
      status: compatibilityReport.status === "blocked" ? "failed" : "completed",
      summary: compatibilityReport.status === "blocked"
        ? "Upgrade applied but compatibility gate reported a blocked contract change"
        : "Generator-backed upgrade applied successfully",
      errorMessage: compatibilityReport.status === "blocked"
        ? compatibilityReport.issues.map((issue) => issue.message).join(" ")
        : null,
      verificationJson: {
        status: compatibilityReport.status,
        issues: compatibilityReport.issues,
      },
      logsJson: {
        ...(metadata ?? {}),
        resultMessage,
        resultError: errorMessage || null,
      },
      endedAt: new Date(),
      updatedAt: new Date(),
    })
      .where(eq(skillImprovementRuns.id, runId));
}

async function finalizeStudioProposal(params: {
  db: DbLike;
  recommendationId: number;
  runId: number;
  requestedBy?: number | null;
  success: boolean;
  resultMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const {
    db,
    recommendationId,
    runId,
    requestedBy = null,
    success,
    resultMessage,
    metadata,
    errorMessage,
  } = params;

  if (!success) {
    const failureMetadata = buildFailureMetadata(
      metadata,
      resultMessage,
      errorMessage || resultMessage || "Unknown proposal generation error",
    );
    await db
      .update(skillImprovementRecommendations)
      .set({
        status: "failed",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendationId));

    await db
      .update(skillImprovementRuns)
      .set({
        status: "failed",
        summary: resultMessage || "Proposal generation failed",
        errorMessage: errorMessage || resultMessage || "Unknown proposal generation error",
        logsJson: failureMetadata,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, runId));
    return;
  }

  const proposalInfo = getLatestProposalInfo(metadata);
  if (!proposalInfo.latestProposal) {
    await db
      .update(skillImprovementRecommendations)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        approvedAt: new Date(),
        approvedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendationId));

    await db
      .update(skillImprovementRuns)
      .set({
        status: "completed",
        summary: "Proposal generation completed without code changes",
        errorMessage: null,
        logsJson: {
          ...(metadata ?? {}),
          savedProposals: [],
          latestProposal: null,
          resultMessage,
          resultError: null,
          completionMode: "no_changes",
        },
        diffSummaryJson: {
          savedProposals: [],
          latestProposal: null,
          completionMode: "no_changes",
        },
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, runId));
    return;
  }

  await db
    .update(skillImprovementRecommendations)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: requestedBy,
      approvedAt: new Date(),
      approvedBy: requestedBy,
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRecommendations.id, recommendationId));

  await db
    .update(skillImprovementRuns)
    .set({
      status: "completed",
      summary: "Proposal generated and ready for admin review",
      logsJson: {
        ...(metadata ?? {}),
        savedProposals: proposalInfo.savedProposals,
        latestProposal: proposalInfo.latestProposal,
        resultMessage,
        resultError: null,
      },
      diffSummaryJson: {
        latestProposal: proposalInfo.latestProposal,
        savedProposals: proposalInfo.savedProposals,
      },
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRuns.id, runId));
}

async function applySandboxProfileFix(params: {
  db: DbLike;
  recommendation: SkillImprovementRecommendation;
  skill: Skill;
  run: SkillImprovementRun;
  requestedBy?: number | null;
}): Promise<ApplySkillUpgradeResult> {
  const { db, recommendation, skill, run, requestedBy = null } = params;
  const baselineSnapshot = await insertBaselineSnapshot({ db, skill, recommendation, run });

  const effectiveExecutionMode = skill.executionMode ?? "sandbox-code";
  const effectiveCategory = String(skill.category);
  const profileSlug = skill.sandboxProfileSlug ?? getDefaultSandboxProfileSlug(effectiveExecutionMode, effectiveCategory);
  const requiresNetwork = skill.requiresNetwork ?? (
    effectiveExecutionMode === "sandbox-command"
    || effectiveExecutionMode === "sandbox-browser"
    || effectiveCategory === "slide_generation"
  );
  const requiresBrowser = skill.requiresBrowser ?? (effectiveExecutionMode === "sandbox-browser");
  const maxRuntimeSeconds = skill.maxRuntimeSeconds ?? (effectiveCategory === "slide_generation" ? 600 : 300);
  const maxInputMb = skill.maxInputMb ?? (effectiveCategory === "slide_generation" ? 50 : 25);

  const [updatedSkill] = await db
    .update(skills)
    .set({
      sandboxProfileSlug: profileSlug,
      requiresNetwork,
      requiresBrowser,
      maxRuntimeSeconds,
      maxInputMb,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skill.id))
    .returning();

  if (updatedSkill.folderPath && hasRelativeSkillManifest(updatedSkill.folderPath)) {
    const skillDir = resolveSkillDirCandidates(updatedSkill.folderPath)
      .find((candidate) => !!resolveSkillManifestPath(candidate));
    if (skillDir) {
      updateSkillManifestFiles(skillDir, {
        sandbox_profile: profileSlug,
        requires_network: requiresNetwork,
        requires_browser: requiresBrowser,
        max_runtime_seconds: maxRuntimeSeconds,
        max_input_mb: maxInputMb,
      });
    }
  }

  await refreshSkillCache();

  const candidateSnapshot = buildSkillContractSnapshot(toMaintenanceTarget(updatedSkill));
  const compatibilityReport = compareSkillContractSnapshots(baselineSnapshot, candidateSnapshot);

  await db.insert(skillContractSnapshots).values({
    skillId: updatedSkill.id,
    tenantId: updatedSkill.tenantId,
    recommendationId: recommendation.id,
    runId: run.id,
    snapshotType: "post_apply",
    executionMode: candidateSnapshot.executionMode,
    runtimeProfile: candidateSnapshot.runtimeProfile,
    manifestPath: candidateSnapshot.manifestPath,
    manifestHash: candidateSnapshot.manifestHash,
    inputSchemaHash: candidateSnapshot.inputSchemaHash,
    outputSchemaHash: candidateSnapshot.outputSchemaHash,
    fixtureHash: candidateSnapshot.fixtureHash,
    testsHash: candidateSnapshot.testsHash,
    contractHash: candidateSnapshot.contractHash,
    schemaSummaryJson: candidateSnapshot.schemaSummary,
    sampleInputsJson: [],
    sampleOutputsJson: [],
    compatibilityNotesJson: {
      status: compatibilityReport.status,
      issues: compatibilityReport.issues,
    },
    snapshotJson: {
      fileInventory: candidateSnapshot.fileInventory,
    },
    capturedAt: new Date(),
    createdAt: new Date(),
  });

  if (compatibilityReport.status === "blocked") {
    const [failedRun] = await db
      .update(skillImprovementRuns)
      .set({
        status: "failed",
        summary: `Apply blocked for ${skill.slug}`,
        errorMessage: compatibilityReport.issues.map((issue) => issue.message).join(" "),
        verificationJson: {
          status: compatibilityReport.status,
          issues: compatibilityReport.issues,
        },
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, run.id))
      .returning();

    const [blockedRecommendation] = await db
      .update(skillImprovementRecommendations)
      .set({
        status: "blocked",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        approvedAt: new Date(),
        approvedBy: requestedBy,
        compatibilityStatus: compatibilityReport.status,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendation.id))
      .returning();

    return {
      recommendation: blockedRecommendation,
      run: failedRun,
      compatibilityReport,
      mode: "applied",
      applyStrategy: "direct",
    };
  }

  const [updatedRecommendation] = await db
    .update(skillImprovementRecommendations)
    .set({
      status: "applied",
      reviewedAt: new Date(),
      reviewedBy: requestedBy,
      approvedAt: new Date(),
      approvedBy: requestedBy,
      appliedAt: new Date(),
      compatibilityStatus: compatibilityReport.status,
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRecommendations.id, recommendation.id))
    .returning();

  const [completedRun] = await db
    .update(skillImprovementRuns)
    .set({
      status: "completed",
      summary: `Applied ${recommendation.recommendationType} to ${skill.slug}`,
      verificationJson: {
        status: compatibilityReport.status,
        issues: compatibilityReport.issues,
      },
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRuns.id, run.id))
    .returning();

  return {
    recommendation: updatedRecommendation,
    run: completedRun,
    compatibilityReport,
    mode: "applied",
    applyStrategy: "direct",
  };
}

export async function applySkillUpgradeRecommendation(
  params: ApplySkillUpgradeParams,
): Promise<ApplySkillUpgradeResult> {
  const {
    db,
    recommendationId,
    requestedBy = null,
    tenantId = null,
    userRole = "admin",
    userToken = null,
    publicUrl = null,
    sourceRunId = null,
    retryReason = null,
  } = params;

  const { recommendation, skill } = await fetchSkillRecommendation(db, recommendationId);
  assertRecommendationApplyAllowed(recommendation);

  const existingRuns = await db
    .select()
    .from(skillImprovementRuns)
    .where(eq(skillImprovementRuns.recommendationId, recommendation.id))
    .limit(20);

  if (existingRuns.some((row: SkillImprovementRun) => row.runType === "apply" && row.status === "running")) {
    throw new Error("An apply run for this recommendation is already in progress.");
  }

  const [run] = await db
    .insert(skillImprovementRuns)
    .values({
      skillId: skill.id,
      tenantId: skill.tenantId,
      recommendationId: recommendation.id,
      scheduleId: recommendation.scheduleId,
      runType: "apply",
      status: "running",
      triggerSource: recommendation.scheduleId ? "schedule" : "manual",
      requestedBy,
      summary: `Applying ${recommendation.recommendationType} to ${skill.slug}`,
      scopeJson: {
        recommendationType: recommendation.recommendationType,
      },
      logsJson: {},
      metricsJson: {},
      verificationJson: {},
      diffSummaryJson: {},
      startedAt: new Date(),
    })
    .returning();

  if (recommendation.recommendationType === "sandbox-profile-fix") {
    return applySandboxProfileFix({
      db,
      recommendation,
      skill,
      run,
      requestedBy,
    });
  }

  const baselineSnapshot = await insertBaselineSnapshot({ db, skill, recommendation, run });
  const brief = buildUpgradeBrief(skill, recommendation);
  const isBreakingChange = isBreakingMaintenanceChange(recommendation);
  const useProposalFirst = isBreakingChange || !recommendation.isAutoApplySafe;
  const resolvedLlmModelId = await resolveEnabledLlmModelId();

  const [approvedRecommendation] = await db
    .update(skillImprovementRecommendations)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: requestedBy,
      approvedAt: new Date(),
      approvedBy: requestedBy,
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRecommendations.id, recommendation.id))
    .returning();

  try {
    let launchTaskId: string | null = null;
    const onCompleteMetadataBase = {
      resolvedLlmModelId,
      sourceRunId,
      retryReason,
    };
    const launch = await launchSkillStudioTask(
      {
        userId: requestedBy ?? 0,
        userRole,
        userToken,
        publicUrl,
      },
      {
        mode: "improve",
        brief,
        targetSkillId: skill.id,
        allowTestExpansion: true,
        askUser: false,
        rounds: recommendation.recommendationType === "migrate-to-genjs" ? 4 : 3,
        desiredVisibility: normalizeVisibility(skill.visibility),
        autoApplyProposal: !useProposalFirst,
        llmModelSearch: resolvedLlmModelId || undefined,
      },
      {
        onCompleted: async (result) => {
          const completionMessage = result.message ?? result.error ?? null;
          const completionMetadata = {
            ...(result.metadata && typeof result.metadata === "object" ? result.metadata as Record<string, unknown> : {}),
            ...onCompleteMetadataBase,
            taskId: launchTaskId,
          };
          if (useProposalFirst) {
            await finalizeStudioProposal({
              db,
              recommendationId: recommendation.id,
              runId: run.id,
              requestedBy,
              success: Boolean(result.success),
              resultMessage: completionMessage,
              metadata: completionMetadata,
              errorMessage: result.success ? null : completionMessage,
            });
            return;
          }

          await finalizeStudioApply({
            db,
            recommendationId: recommendation.id,
            runId: run.id,
            skillId: skill.id,
            baselineSnapshot,
            requestedBy,
            success: Boolean(result.success),
            resultMessage: completionMessage,
            metadata: completionMetadata,
            errorMessage: result.success ? null : completionMessage,
          });
        },
      },
    );
    launchTaskId = launch.taskId;

    const [queuedRun] = await db
      .update(skillImprovementRuns)
      .set({
        summary: `Upgrade task queued for ${skill.slug}`,
        logsJson: {
          taskId: launch.taskId,
          studioMode: launch.mode,
          studioSummary: launch.summary,
          tenantId,
          applyStrategy: useProposalFirst ? "proposal" : "auto-apply",
          maintenanceClassification: isBreakingChange ? "breaking" : "non-breaking",
          resolvedLlmModelId,
          sourceRunId,
          retryReason,
        },
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, run.id))
      .returning();

    return {
      recommendation: approvedRecommendation,
      run: queuedRun,
      compatibilityReport: null,
      taskId: launch.taskId,
      mode: "queued",
      applyStrategy: useProposalFirst ? "proposal" : "auto-apply",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown apply error";

    const [failedRecommendation] = await db
      .update(skillImprovementRecommendations)
      .set({
        status: "failed",
        reviewedAt: new Date(),
        reviewedBy: requestedBy,
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRecommendations.id, recommendation.id))
      .returning();

    const [failedRun] = await db
      .update(skillImprovementRuns)
      .set({
        status: "failed",
        summary: `Failed to queue ${recommendation.recommendationType} for ${skill.slug}`,
        errorMessage: message,
        logsJson: {
          sourceRunId,
          retryReason,
          resolvedLlmModelId,
          resultMessage: message,
          errorMessage: message,
          resultError: message,
        },
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillImprovementRuns.id, run.id))
      .returning();

    void failedRecommendation;
    void failedRun;
    throw new Error(message);
  }
}

export function isWorkpackImprovementAutoApplyEligible(input: {
  risk: "low" | "medium" | "high";
  trustTags: string[];
  actionType: string;
}): boolean {
  if (input.risk !== "low") return false;
  if (input.trustTags.some((tag) => tag !== "verified" && tag !== "tenant_local_only")) {
    return false;
  }
  return input.actionType === "skill_improvement" || input.actionType === "fixture_update";
}
