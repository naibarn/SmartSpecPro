import type { WorkCase, WorkRequest } from "../../drizzle/schema";

export type WorkAutomationMode = "manual_assist" | "semi_auto" | "fully_auto";
export type WorkAutomationSurface =
  | "manual"
  | "work_os"
  | "skill"
  | "agency"
  | "browser"
  | "document_management"
  | "media_studio"
  | "video_editor";
export type WorkAutomationRiskTier = "low" | "medium" | "high" | "critical";

export interface WorkAutomationStepBlueprint {
  readonly stepKey: string;
  readonly title: string;
  readonly surface: WorkAutomationSurface;
  readonly allowedSurfaces: readonly WorkAutomationSurface[];
  readonly riskTier: WorkAutomationRiskTier;
  readonly requiresApproval: boolean;
  readonly checkpointKey: string | null;
  readonly evidenceType:
    | "research"
    | "draft"
    | "storyboard"
    | "media"
    | "video"
    | "review"
    | "export"
    | "metadata";
  readonly sideEffectClass:
    | "read_only"
    | "bounded_write"
    | "external_write"
    | "irreversible";
}

export interface WorkAutomationTemplateBlueprint {
  readonly templateKey: string;
  readonly templateFamily: string;
  readonly templateVersion: string;
  readonly title: string;
  readonly sourceSurface:
    | "case_intake"
    | "request_intake"
    | "manual_override"
    | "fallback";
  readonly stepBlueprints: readonly WorkAutomationStepBlueprint[];
}

export interface WorkAutomationModeResolution {
  readonly requestedMode: WorkAutomationMode;
  readonly effectiveMode: WorkAutomationMode;
  readonly recommendedMode: WorkAutomationMode;
  readonly downgraded: boolean;
  readonly reasonCode:
    | "explicit"
    | "risk_downshift"
    | "confidence_downshift"
    | "policy_downshift"
    | "safe_default";
  readonly reason: string;
  readonly confidence: number;
}

export interface WorkAutomationLaunchPolicy {
  readonly templateKey: string;
  readonly templateFamily: string;
  readonly templateVersion: string;
  readonly templateSource: WorkAutomationTemplateBlueprint["sourceSurface"];
  readonly templateTitle: string;
  readonly modeResolution: WorkAutomationModeResolution;
  readonly stepBlueprints: readonly WorkAutomationStepBlueprint[];
  readonly approvalGateStepKeys: readonly string[];
  readonly surfaceAllowlist: readonly WorkAutomationSurface[];
  readonly policyJson: Record<string, unknown>;
}

export interface ResolveAutomationLaunchPolicyInput {
  readonly caseRecord: Pick<
    WorkCase,
    "id" | "title" | "summary" | "riskLevel" | "automationMode" | "currentState"
  >;
  readonly requestRecord?: Pick<
    WorkRequest,
    | "sourceType"
    | "workType"
    | "businessDomain"
    | "urgency"
    | "riskLevel"
    | "classificationConfidence"
    | "title"
    | "objective"
  > | null;
  readonly templateKey?: string | null;
  readonly templateVersion?: string | null;
  readonly mode?: WorkAutomationMode | null;
  readonly preserveRequestedMode?: boolean;
}

export interface ValidateAutomationModeTransitionInput {
  readonly fromMode: WorkAutomationMode;
  readonly toMode: WorkAutomationMode;
  readonly policy: WorkAutomationLaunchPolicy;
  readonly runStatus?: string | null;
  readonly hasOpenCriticalException?: boolean;
  readonly hasUnresolvedCheckpoint?: boolean;
}

export interface ValidateAutomationModeTransitionResult {
  readonly allowed: boolean;
  readonly reasonCode: "downgrade" | "safe_upgrade" | "blocked";
  readonly reason: string;
  readonly suggestedMode: WorkAutomationMode;
  readonly blockedBy: string | null;
}

export interface ResolveAutomationStepRouteInput {
  readonly stepKey: string;
  readonly policy: WorkAutomationLaunchPolicy;
  readonly requestedSurface?: WorkAutomationSurface | null;
}

export interface ResolveAutomationStepRouteResult {
  readonly stepKey: string;
  readonly surface: WorkAutomationSurface;
  readonly allowedSurfaces: readonly WorkAutomationSurface[];
  readonly requiresApproval: boolean;
  readonly checkpointKey: string | null;
  readonly riskTier: WorkAutomationRiskTier;
  readonly evidenceType: WorkAutomationStepBlueprint["evidenceType"];
  readonly sideEffectClass: WorkAutomationStepBlueprint["sideEffectClass"];
}

const AUTOMATION_SURFACES: readonly WorkAutomationSurface[] = [
  "manual",
  "work_os",
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
];

const CONTENT_PRODUCTION_TEMPLATE: WorkAutomationTemplateBlueprint = {
  templateKey: "content-production",
  templateFamily: "content-production",
  templateVersion: "content-production.v1",
  title: "Content Production Fabric",
  sourceSurface: "case_intake",
  stepBlueprints: [
    {
      stepKey: "research",
      title: "Research",
      surface: "agency",
      allowedSurfaces: ["agency", "browser", "manual", "work_os"],
      riskTier: "medium",
      requiresApproval: false,
      checkpointKey: null,
      evidenceType: "research",
      sideEffectClass: "read_only",
    },
    {
      stepKey: "brief",
      title: "Brief Synthesis",
      surface: "skill",
      allowedSurfaces: ["skill", "manual", "work_os"],
      riskTier: "low",
      requiresApproval: false,
      checkpointKey: null,
      evidenceType: "draft",
      sideEffectClass: "read_only",
    },
    {
      stepKey: "draft",
      title: "Draft Copy",
      surface: "document_management",
      allowedSurfaces: ["document_management", "skill", "manual", "work_os"],
      riskTier: "low",
      requiresApproval: false,
      checkpointKey: null,
      evidenceType: "draft",
      sideEffectClass: "bounded_write",
    },
    {
      stepKey: "storyboard",
      title: "Storyboard",
      surface: "document_management",
      allowedSurfaces: ["document_management", "skill", "manual", "work_os"],
      riskTier: "low",
      requiresApproval: false,
      checkpointKey: "storyboard-review",
      evidenceType: "storyboard",
      sideEffectClass: "bounded_write",
    },
    {
      stepKey: "media",
      title: "Media Asset Generation",
      surface: "media_studio",
      allowedSurfaces: ["media_studio", "skill", "manual", "work_os"],
      riskTier: "medium",
      requiresApproval: false,
      checkpointKey: "media-review",
      evidenceType: "media",
      sideEffectClass: "external_write",
    },
    {
      stepKey: "video",
      title: "Video Composition",
      surface: "video_editor",
      allowedSurfaces: ["video_editor", "manual", "work_os"],
      riskTier: "medium",
      requiresApproval: true,
      checkpointKey: "video-approval",
      evidenceType: "video",
      sideEffectClass: "external_write",
    },
    {
      stepKey: "review",
      title: "Review Gate",
      surface: "manual",
      allowedSurfaces: ["manual", "work_os"],
      riskTier: "high",
      requiresApproval: true,
      checkpointKey: "review-approval",
      evidenceType: "review",
      sideEffectClass: "read_only",
    },
    {
      stepKey: "export",
      title: "Export Final",
      surface: "work_os",
      allowedSurfaces: ["work_os", "manual"],
      riskTier: "high",
      requiresApproval: true,
      checkpointKey: "final-export",
      evidenceType: "export",
      sideEffectClass: "irreversible",
    },
  ],
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.6;
  return Math.max(0.05, Math.min(0.99, value));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function collectSignals(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" \n ");
}

function detectTemplateSource(
  input: ResolveAutomationLaunchPolicyInput
): WorkAutomationTemplateBlueprint["sourceSurface"] {
  if (input.templateKey?.trim()) return "manual_override";
  if (input.requestRecord?.sourceType?.trim()) return "request_intake";
  if (input.caseRecord.summary?.trim() || input.caseRecord.title.trim())
    return "case_intake";
  return "fallback";
}

function resolveRequestedMode(
  input: ResolveAutomationLaunchPolicyInput,
  confidence: number
): WorkAutomationMode {
  if (input.mode) return input.mode;
  const risk = normalizeText(
    input.caseRecord.riskLevel ?? input.requestRecord?.riskLevel ?? "medium"
  );
  if (risk === "critical" || risk === "high" || confidence < 0.5)
    return "manual_assist";
  if (confidence >= 0.85 && risk !== "high" && risk !== "critical")
    return "fully_auto";
  return "semi_auto";
}

function inferRecommendedMode(
  input: ResolveAutomationLaunchPolicyInput,
  confidence: number
): WorkAutomationMode {
  const risk = normalizeText(
    input.caseRecord.riskLevel ?? input.requestRecord?.riskLevel ?? "medium"
  );
  if (risk === "critical" || risk === "high" || confidence < 0.55)
    return "manual_assist";
  if (confidence >= 0.85 && risk !== "high" && risk !== "critical")
    return "fully_auto";
  return "semi_auto";
}

function chooseSaferMode(
  requested: WorkAutomationMode,
  safe: WorkAutomationMode
): WorkAutomationMode {
  const order: Record<WorkAutomationMode, number> = {
    manual_assist: 0,
    semi_auto: 1,
    fully_auto: 2,
  };
  return order[safe] < order[requested] ? safe : requested;
}

function buildModeResolution(
  input: ResolveAutomationLaunchPolicyInput,
  confidence: number,
  templateSource: WorkAutomationTemplateBlueprint["sourceSurface"]
): WorkAutomationModeResolution {
  const requestedMode = resolveRequestedMode(input, confidence);
  const recommendedMode = inferRecommendedMode(input, confidence);
  const explicitRequestedMode = Boolean(input.mode);
  const effectiveMode =
    input.preserveRequestedMode && explicitRequestedMode
      ? requestedMode
      : chooseSaferMode(requestedMode, recommendedMode);
  const downgraded = effectiveMode !== requestedMode;
  const riskLevel = normalizeText(
    input.caseRecord.riskLevel ?? input.requestRecord?.riskLevel ?? "medium"
  );
  const reasonCode =
    input.preserveRequestedMode && explicitRequestedMode
      ? "explicit"
      : downgraded
        ? confidence < 0.55 || riskLevel === "critical" || riskLevel === "high"
          ? "risk_downshift"
          : "confidence_downshift"
        : input.mode
          ? "explicit"
          : "safe_default";
  const reason = downgraded
    ? `Requested ${requestedMode} was downshifted to ${effectiveMode} for safety`
    : input.mode
      ? input.preserveRequestedMode && explicitRequestedMode
        ? `Explicit mode ${requestedMode} preserved for user-initiated automation`
        : `Explicit mode ${requestedMode} accepted`
      : `Resolved ${effectiveMode} from ${templateSource} signals`;

  return {
    requestedMode,
    effectiveMode,
    recommendedMode,
    downgraded,
    reasonCode,
    reason,
    confidence,
  };
}

export function resolveContentProductionTemplate(
  input: ResolveAutomationLaunchPolicyInput
): WorkAutomationTemplateBlueprint {
  const templateKey =
    input.templateKey?.trim() || CONTENT_PRODUCTION_TEMPLATE.templateKey;
  const templateVersion =
    input.templateVersion?.trim() ||
    CONTENT_PRODUCTION_TEMPLATE.templateVersion;
  if (templateKey !== CONTENT_PRODUCTION_TEMPLATE.templateKey) {
    return {
      ...CONTENT_PRODUCTION_TEMPLATE,
      templateKey,
      templateVersion,
      sourceSurface: detectTemplateSource(input),
    };
  }

  return {
    ...CONTENT_PRODUCTION_TEMPLATE,
    templateVersion,
    sourceSurface: detectTemplateSource(input),
  };
}

export function resolveAutomationLaunchPolicy(
  input: ResolveAutomationLaunchPolicyInput
): WorkAutomationLaunchPolicy {
  const combinedText = normalizeText(
    collectSignals([
      input.caseRecord.title,
      input.caseRecord.summary,
      input.requestRecord?.title,
      input.requestRecord?.objective,
      input.requestRecord?.workType,
      input.requestRecord?.businessDomain,
      input.requestRecord?.sourceType,
    ])
  );
  const confidenceBase = input.requestRecord?.classificationConfidence ?? 0.6;
  const keywordSignals = [
    "research",
    "brief",
    "prompt",
    "storyboard",
    "article",
    "copy",
    "content",
    "creative",
    "campaign",
    "media",
    "image",
    "video",
    "presentation",
    "deck",
    "launch",
  ];
  const matchedKeywords = keywordSignals.filter(term =>
    combinedText.includes(term)
  );
  const riskLevel = normalizeText(
    input.caseRecord.riskLevel ?? input.requestRecord?.riskLevel ?? "medium"
  );
  const keywordBoost =
    matchedKeywords.length > 0
      ? Math.min(0.25, matchedKeywords.length * 0.04)
      : 0;
  const riskPenalty =
    riskLevel === "critical" ? 0.35 : riskLevel === "high" ? 0.2 : 0;
  const confidence = clampConfidence(
    confidenceBase + keywordBoost - riskPenalty
  );
  const template = resolveContentProductionTemplate(input);
  const modeResolution = buildModeResolution(
    input,
    confidence,
    template.sourceSurface
  );
  const approvalGateStepKeys = template.stepBlueprints
    .filter(step => step.requiresApproval)
    .map(step => step.stepKey);

  return {
    templateKey: template.templateKey,
    templateFamily: template.templateFamily,
    templateVersion: template.templateVersion,
    templateSource: template.sourceSurface,
    templateTitle: template.title,
    modeResolution,
    stepBlueprints: template.stepBlueprints,
    approvalGateStepKeys,
    surfaceAllowlist: [...AUTOMATION_SURFACES],
    policyJson: {
      templateKey: template.templateKey,
      templateFamily: template.templateFamily,
      templateVersion: template.templateVersion,
      templateSource: template.sourceSurface,
      templateTitle: template.title,
      preserveRequestedMode: Boolean(input.preserveRequestedMode),
      requestedMode: modeResolution.requestedMode,
      effectiveMode: modeResolution.effectiveMode,
      recommendedMode: modeResolution.recommendedMode,
      downgraded: modeResolution.downgraded,
      modeReasonCode: modeResolution.reasonCode,
      modeReason: modeResolution.reason,
      confidence,
      matchedKeywords,
      riskLevel,
      approvalGateStepKeys,
      surfaceAllowlist: AUTOMATION_SURFACES,
    },
  };
}

export function validateAutomationModeTransition(
  input: ValidateAutomationModeTransitionInput
): ValidateAutomationModeTransitionResult {
  const order: Record<WorkAutomationMode, number> = {
    manual_assist: 0,
    semi_auto: 1,
    fully_auto: 2,
  };
  const fromRank = order[input.fromMode];
  const toRank = order[input.toMode];
  if (toRank < fromRank) {
    return {
      allowed: true,
      reasonCode: "downgrade",
      reason: `Downgrade from ${input.fromMode} to ${input.toMode} is allowed`,
      suggestedMode: input.toMode,
      blockedBy: null,
    };
  }

  const confidence =
    typeof input.policy.modeResolution.confidence === "number"
      ? input.policy.modeResolution.confidence
      : 0.6;
  const criticalException = input.hasOpenCriticalException === true;
  const unresolvedCheckpoint = input.hasUnresolvedCheckpoint === true;
  const blockedBy = criticalException
    ? "open_critical_exception"
    : unresolvedCheckpoint
      ? "unresolved_checkpoint"
      : null;

  if (input.toMode === "semi_auto") {
    if (criticalException || unresolvedCheckpoint || confidence < 0.55) {
      return {
        allowed: false,
        reasonCode: "blocked",
        reason: criticalException
          ? "Open critical exception prevents semi-auto upgrade"
          : unresolvedCheckpoint
            ? "Unresolved checkpoint prevents semi-auto upgrade"
            : "Confidence is too low for semi-auto upgrade",
        suggestedMode: "manual_assist",
        blockedBy: blockedBy ?? "low_confidence",
      };
    }
    return {
      allowed: true,
      reasonCode: "safe_upgrade",
      reason: "Semi-auto upgrade accepted",
      suggestedMode: "semi_auto",
      blockedBy: null,
    };
  }

  if (input.toMode === "fully_auto") {
    if (input.fromMode !== "semi_auto") {
      return {
        allowed: false,
        reasonCode: "blocked",
        reason: "Fully-auto upgrades must come from semi-auto",
        suggestedMode: "semi_auto",
        blockedBy: "mode_hop",
      };
    }
    if (criticalException || unresolvedCheckpoint || confidence < 0.82) {
      return {
        allowed: false,
        reasonCode: "blocked",
        reason: criticalException
          ? "Open critical exception prevents fully-auto upgrade"
          : unresolvedCheckpoint
            ? "Unresolved checkpoint prevents fully-auto upgrade"
            : "Confidence is too low for fully-auto upgrade",
        suggestedMode: "semi_auto",
        blockedBy: blockedBy ?? "low_confidence",
      };
    }
    return {
      allowed: true,
      reasonCode: "safe_upgrade",
      reason: "Fully-auto upgrade accepted",
      suggestedMode: "fully_auto",
      blockedBy: null,
    };
  }

  return {
    allowed: true,
    reasonCode: "downgrade",
    reason: "Manual assist is always a safe fallback",
    suggestedMode: "manual_assist",
    blockedBy: null,
  };
}

export function resolveAutomationStepRoute(
  input: ResolveAutomationStepRouteInput
): ResolveAutomationStepRouteResult {
  const step = input.policy.stepBlueprints.find(
    candidate => candidate.stepKey === input.stepKey
  );
  if (!step) {
    const requestedSurface = input.requestedSurface ?? "manual";
    if (!["manual", "work_os"].includes(requestedSurface)) {
      throw new Error(
        `Step ${input.stepKey} is not defined by the active automation template`
      );
    }
    return {
      stepKey: input.stepKey,
      surface: requestedSurface,
      allowedSurfaces: ["manual", "work_os"],
      requiresApproval: true,
      checkpointKey: null,
      riskTier: "medium",
      evidenceType: "metadata",
      sideEffectClass: "read_only",
    };
  }

  const requestedSurface = input.requestedSurface ?? step.surface;
  if (!step.allowedSurfaces.includes(requestedSurface)) {
    throw new Error(
      `Surface ${requestedSurface} is not allowed for step ${step.stepKey}`
    );
  }

  return {
    stepKey: step.stepKey,
    surface: requestedSurface,
    allowedSurfaces: step.allowedSurfaces,
    requiresApproval: step.requiresApproval,
    checkpointKey: step.checkpointKey,
    riskTier: step.riskTier,
    evidenceType: step.evidenceType,
    sideEffectClass: step.sideEffectClass,
  };
}

export function buildAutomationPolicySnapshot(
  policy: WorkAutomationLaunchPolicy
): Record<string, unknown> {
  return {
    templateKey: policy.templateKey,
    templateFamily: policy.templateFamily,
    templateVersion: policy.templateVersion,
    templateSource: policy.templateSource,
    templateTitle: policy.templateTitle,
    modeResolution: policy.modeResolution,
    approvalGateStepKeys: policy.approvalGateStepKeys,
    surfaceAllowlist: policy.surfaceAllowlist,
    stepBlueprints: policy.stepBlueprints,
  };
}
