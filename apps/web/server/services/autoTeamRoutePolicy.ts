import crypto from "crypto";
import {
  AUTO_TEAM_ROUTE_CLASSES,
  type AutoTeamCapabilityFamily,
  type AutoTeamRouteClass,
  type AutoTeamRouteDecision,
  type AutoTeamStageType,
} from "../../shared/autoTeamExecution";

export interface AutoTeamRoutePolicyInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  workRequestId?: string | null;
  workCaseId?: string | null;
  objective?: string | null;
  requestTitle?: string | null;
  requestSummary?: string | null;
  workType?: string | null;
  language?: "en" | "th" | null;
  requestedProvider?: string | null;
  requestedModel?: string | null;
  availableCapabilities?: readonly string[] | null;
  teamPersonas?: ReadonlyArray<{
    id: string;
    memberRole?: string | null;
    isLead?: boolean | null;
    displayName?: string | null;
  }> | null;
}

export interface AutoTeamRoutePolicyResult {
  routeClass: AutoTeamRouteClass;
  routeConfidence: number;
  allowedCapabilityFamilies: AutoTeamCapabilityFamily[];
  selectedOrchestratorPersonaId: string | null;
  language: "en" | "th";
  blockedReason: string | null;
  decisionReason: string;
  selectedPolicyJson: Record<string, unknown>;
  providerHint: {
    requestedProvider: string | null;
    requestedModel: string | null;
    normalizedProvider: string | null;
    normalizedModel: string | null;
  };
}

export interface AutoTeamStagePlanEntry {
  stageType: AutoTeamStageType;
  requiresHumanApproval: boolean;
  reason: string;
}

export interface AutoTeamCapabilityGateInput {
  routeClass: AutoTeamRouteClass;
  stageType: AutoTeamStageType;
  candidateCapabilityFamily: string | null | undefined;
  routeDecision?: Pick<
    AutoTeamRouteDecision,
    "idempotencyKey" | "routeClass" | "language"
  > | null;
}

export interface AutoTeamCapabilityGateResult {
  allowed: boolean;
  routeClass: AutoTeamRouteClass;
  stageType: AutoTeamStageType;
  expectedCapabilityFamilies: AutoTeamCapabilityFamily[];
  actualCapabilityFamily: string | null;
  blockedReason: string | null;
  userMessage: string;
}

const SAFE_EMPTY_REASON = "auto_team_route_unclassified";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function extractProviderModelHints(input: AutoTeamRoutePolicyInput): {
  requestedProvider: string | null;
  requestedModel: string | null;
  normalizedProvider: string | null;
  normalizedModel: string | null;
} {
  const text = [
    input.objective,
    input.requestTitle,
    input.requestSummary,
    input.workType,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" \n");

  const requestedProvider =
    normalizeText(input.requestedProvider) ||
    (text.match(/\b(veo|runway|kling|pika|sora|flux|nano banana|gpt image)\b/i)?.[1] ??
      "");
  const requestedModel =
    normalizeText(input.requestedModel) ||
    (text.match(/\bveo\s*3(?:\.\s*1|\.1)?\b/i)?.[0] ??
      text.match(/\b(?:flux|sora|kling|pika)[\s-]?\w+/i)?.[0] ??
      "");

  const normalizedProvider = requestedProvider
    ? requestedProvider.toLowerCase().replace(/\s+/g, "-")
    : null;
  const normalizedModel = requestedModel
    ? requestedModel
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[.]/g, "-")
    : null;

  return {
    requestedProvider: requestedProvider || null,
    requestedModel: requestedModel || null,
    normalizedProvider,
    normalizedModel,
  };
}

export function classifyAutoTeamRoute(
  input: AutoTeamRoutePolicyInput,
): AutoTeamRoutePolicyResult {
  const objective = [
    input.objective,
    input.requestTitle,
    input.requestSummary,
    input.workType,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" \n");
  const text = objective.toLowerCase();
  const providerHint = extractProviderModelHints(input);
  const language = input.language === "th" ? "th" : "en";

  if (!text || /^(?:n\/a|na|none|unknown)$/i.test(text)) {
    return {
      routeClass: "unknown.blocked",
      routeConfidence: 0,
      allowedCapabilityFamilies: [],
      selectedOrchestratorPersonaId: null,
      language,
      blockedReason: "empty_or_unsafe_objective",
      decisionReason: "Objective missing or not safe enough to classify confidently.",
      selectedPolicyJson: {
        providerHint,
      },
      providerHint,
    };
  }

  const hasVideoHint = matchesAny(text, [
    /\bvideo\b/i,
    /\bclip\b/i,
    /\bveo\b/i,
    /\bstoryboard\b/i,
    /\breel\b/i,
    /\bmovie\b/i,
    /\bfilm\b/i,
    /สร้าง(วี|วิดีโอ|คลิป)/i,
    /\b\d+\s*-\s*\d+\s*(?:second|seconds|sec|วินาที)\b/i,
  ]);
  const hasImageHint = matchesAny(text, [
    /\bimage\b/i,
    /\bpicture\b/i,
    /\billustration\b/i,
    /\bposter\b/i,
    /\bthumbnail\b/i,
    /\bcover\b/i,
    /\blogo\b/i,
    /สร้าง(ภาพ|รูป|โปสเตอร์|ปก|หน้าปก)/i,
  ]);
  const hasAgencyHint = matchesAny(text, [
    /\bagency\b/i,
    /\bswarm\b/i,
    /\bmulti[- ]?team\b/i,
    /\bmulti[- ]?agent\b/i,
    /\bcoordinate\b/i,
    /\bหลายทีม\b/i,
    /\bหลายบทบาท\b/i,
    /\bหลายฝ่าย\b/i,
  ]);
  const hasResearchHint = matchesAny(text, [
    /\bresearch\b/i,
    /\bsummar/i,
    /\banalyze\b/i,
    /\bcompare\b/i,
    /\bsynthesize\b/i,
    /\bค้นหา\b/i,
    /\bสรุป\b/i,
    /\bวิเคราะห์\b/i,
  ]);
  const hasDocumentHint = matchesAny(text, [
    /\bwrite\b/i,
    /\barticle\b/i,
    /\breport\b/i,
    /\bdocument\b/i,
    /\bproposal\b/i,
    /\bdoc\b/i,
    /\bเอกสาร\b/i,
    /\bรายงาน\b/i,
    /\bเรียบเรียง\b/i,
  ]);
  const hasWorkflowHint = matchesAny(text, [
    /\bworkflow\b/i,
    /\bautomation\b/i,
    /\bintegration\b/i,
    /\bapi\b/i,
    /\bhandoff\b/i,
    /\btrigger\b/i,
    /\bprocess\b/i,
  ]);

  let routeClass: AutoTeamRouteClass = "unknown.blocked";
  let routeConfidence = 0.35;
  let decisionReason = SAFE_EMPTY_REASON;

  if (hasVideoHint) {
    routeClass = "media.video";
    routeConfidence = 0.98;
    decisionReason = providerHint.normalizedModel
      ? `video_generation_requested:${providerHint.normalizedModel}`
      : "video_generation_requested";
  } else if (hasImageHint) {
    routeClass = "media.image";
    routeConfidence = 0.95;
    decisionReason = "image_generation_requested";
  } else if (hasAgencyHint) {
    routeClass = "agency.swarm";
    routeConfidence = 0.88;
    decisionReason = "multi_agent_orchestration_requested";
  } else if (hasWorkflowHint) {
    routeClass = "workflow.automation";
    routeConfidence = 0.84;
    decisionReason = "workflow_automation_requested";
  } else if (hasResearchHint) {
    routeClass = "research.synthesis";
    routeConfidence = 0.8;
    decisionReason = "research_and_synthesis_requested";
  } else if (hasDocumentHint) {
    routeClass = "document.writing";
    routeConfidence = 0.78;
    decisionReason = "document_writing_requested";
  }

  const selectedOrchestratorPersonaId =
    input.teamPersonas?.find((persona) =>
      Boolean(persona.isLead) ||
      /orchestrator/i.test(persona.memberRole ?? "") ||
      /orchestrator/i.test(persona.displayName ?? ""),
    )?.id ?? null;

  const allowedCapabilityFamilies = getAllowedCapabilityFamilies(routeClass);
  const blockedReason =
    routeClass === "unknown.blocked"
      ? "route_classification_failed"
      : null;

  return {
    routeClass,
    routeConfidence,
    allowedCapabilityFamilies,
    selectedOrchestratorPersonaId,
    language,
    blockedReason,
    decisionReason,
    selectedPolicyJson: {
      routeClass,
      allowedCapabilityFamilies,
      providerHint,
      language,
      decisionReason,
    },
    providerHint,
  };
}

export function getAllowedCapabilityFamilies(
  routeClass: AutoTeamRouteClass,
): AutoTeamCapabilityFamily[] {
  switch (routeClass) {
    case "media.video":
      return ["video.prompt", "research.synthesis", "writing.review", "media.video"];
    case "media.image":
      return ["image.prompt", "research.synthesis", "writing.review", "media.image"];
    case "agency.swarm":
      return ["agency.swarm", "research.synthesis", "writing.review"];
    case "workflow.automation":
      return ["workflow.automation", "document.writing", "research.synthesis", "writing.review"];
    case "research.synthesis":
      return ["research.synthesis", "writing.review"];
    case "document.writing":
      return ["document.writing", "research.synthesis", "writing.review"];
    case "unknown.blocked":
    default:
      return [];
  }
}

export function getAllowedCapabilityFamiliesForStage(
  routeClass: AutoTeamRouteClass,
  stageType: AutoTeamStageType,
): AutoTeamCapabilityFamily[] {
  const routeFamilies = getAllowedCapabilityFamilies(routeClass);

  switch (routeClass) {
    case "media.video":
      if (stageType === "prompt" || stageType === "storyboard" || stageType === "plan" || stageType === "research") {
        return ["video.prompt", "research.synthesis", "writing.review"];
      }
      if (stageType === "media_submit" || stageType === "media_poll") {
        return ["media.video"];
      }
      if (stageType === "review") {
        return ["writing.review", "research.synthesis", "media.video"];
      }
      if (stageType === "human_approval" || stageType === "finalize") {
        return ["writing.review", "media.video"];
      }
      return routeFamilies;
    case "media.image":
      if (stageType === "prompt" || stageType === "plan") {
        return ["image.prompt", "research.synthesis", "writing.review"];
      }
      if (stageType === "media_submit" || stageType === "media_poll") {
        return ["media.image"];
      }
      if (stageType === "review") {
        return ["writing.review", "research.synthesis", "media.image"];
      }
      if (stageType === "human_approval" || stageType === "finalize") {
        return ["writing.review", "media.image"];
      }
      return routeFamilies;
    case "agency.swarm":
      if (stageType === "agency_delegate") {
        return ["agency.swarm"];
      }
      return routeFamilies;
    case "workflow.automation":
      if (stageType === "route" || stageType === "plan" || stageType === "research") {
        return ["workflow.automation", "research.synthesis", "document.writing", "writing.review"];
      }
      return routeFamilies;
    case "research.synthesis":
      return stageType === "review" ? ["writing.review", "research.synthesis"] : routeFamilies;
    case "document.writing":
      if (stageType === "prompt" || stageType === "plan") {
        return ["document.writing", "research.synthesis", "writing.review"];
      }
      return routeFamilies;
    case "unknown.blocked":
    default:
      return [];
  }
}

export function getRequiredStagePlan(
  routeClass: AutoTeamRouteClass,
): AutoTeamStagePlanEntry[] {
  const commonFinalize: AutoTeamStagePlanEntry = {
    stageType: "finalize",
    requiresHumanApproval: false,
    reason: "route_finalization",
  };
  switch (routeClass) {
    case "media.video":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "plan", requiresHumanApproval: false, reason: "plan_generation" },
        { stageType: "research", requiresHumanApproval: false, reason: "source_research" },
        { stageType: "storyboard", requiresHumanApproval: false, reason: "storyboard" },
        { stageType: "prompt", requiresHumanApproval: false, reason: "video_prompt" },
        { stageType: "media_submit", requiresHumanApproval: false, reason: "video_submit" },
        { stageType: "media_poll", requiresHumanApproval: false, reason: "video_poll" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        { stageType: "human_approval", requiresHumanApproval: true, reason: "final_approval" },
        commonFinalize,
      ];
    case "media.image":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "prompt", requiresHumanApproval: false, reason: "image_prompt" },
        { stageType: "media_submit", requiresHumanApproval: false, reason: "image_submit" },
        { stageType: "media_poll", requiresHumanApproval: false, reason: "image_poll" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        { stageType: "human_approval", requiresHumanApproval: false, reason: "optional_approval" },
        commonFinalize,
      ];
    case "agency.swarm":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "plan", requiresHumanApproval: false, reason: "plan_generation" },
        { stageType: "agency_delegate", requiresHumanApproval: false, reason: "agency_delegation" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        { stageType: "human_approval", requiresHumanApproval: true, reason: "final_approval" },
        commonFinalize,
      ];
    case "workflow.automation":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "plan", requiresHumanApproval: false, reason: "plan_generation" },
        { stageType: "research", requiresHumanApproval: false, reason: "workflow_research" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        commonFinalize,
      ];
    case "research.synthesis":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "research", requiresHumanApproval: false, reason: "research" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        commonFinalize,
      ];
    case "document.writing":
      return [
        { stageType: "route", requiresHumanApproval: false, reason: "route_decision" },
        { stageType: "plan", requiresHumanApproval: false, reason: "outline" },
        { stageType: "prompt", requiresHumanApproval: false, reason: "draft_prompt" },
        { stageType: "review", requiresHumanApproval: false, reason: "review" },
        commonFinalize,
      ];
    case "unknown.blocked":
    default:
      return [{ stageType: "route", requiresHumanApproval: false, reason: "blocked" }];
  }
}

export function assertCapabilityAllowedForStage(
  input: AutoTeamCapabilityGateInput,
): AutoTeamCapabilityGateResult {
  const expected = getAllowedCapabilityFamiliesForStage(
    input.routeClass,
    input.stageType,
  );
  const actual = input.candidateCapabilityFamily ? input.candidateCapabilityFamily.trim() : null;
  const allowed = Boolean(actual && expected.includes(actual as AutoTeamCapabilityFamily));

  if (allowed) {
    return {
      allowed: true,
      routeClass: input.routeClass,
      stageType: input.stageType,
      expectedCapabilityFamilies: expected,
      actualCapabilityFamily: actual,
      blockedReason: null,
      userMessage: "",
    };
  }

  return {
    allowed: false,
    routeClass: input.routeClass,
    stageType: input.stageType,
    expectedCapabilityFamilies: expected,
    actualCapabilityFamily: actual,
    blockedReason: "route_skill_family_mismatch",
    userMessage:
      input.routeClass === "media.video"
        ? "This video request must use the video route, storyboard/prompt work, or a media executor."
        : input.routeClass === "media.image"
          ? "This image request must use image prompt or image generation capabilities."
          : "This request was routed to a different capability family.",
  };
}

export function normalizeCapabilityFamilyCandidate(
  value: unknown,
): AutoTeamCapabilityFamily | string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized as AutoTeamCapabilityFamily | string;
}

export function buildRouteDecisionIdempotencyKey(
  input: AutoTeamRoutePolicyInput,
): string {
  const payload = [
    input.tenantId,
    input.teamId ?? "",
    input.roomId ?? "",
    input.runId ?? "",
    input.workRequestId ?? "",
    input.workCaseId ?? "",
    input.objective ?? "",
    input.requestTitle ?? "",
    input.requestSummary ?? "",
    input.workType ?? "",
    input.language ?? "",
    input.requestedProvider ?? "",
    input.requestedModel ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function toRouteBlockedReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }
  if (typeof error === "string") {
    return error.slice(0, 180);
  }
  return "route_blocked";
}

export function toUnifiedCapabilityFamilies(
  routeClass: AutoTeamRouteClass,
  stageType: AutoTeamStageType,
): ("writing.article" | "writing.review" | "media.image" | "media.video" | "media.audio" | "orchestration.swarm" | "skill_factory.create")[] {
  switch (routeClass) {
    case "media.video":
      return stageType === "media_submit" || stageType === "media_poll"
        ? ["media.video"]
        : ["writing.article", "writing.review"];
    case "media.image":
      return stageType === "media_submit" || stageType === "media_poll"
        ? ["media.image"]
        : ["writing.article", "writing.review"];
    case "agency.swarm":
      return stageType === "agency_delegate"
        ? ["orchestration.swarm"]
        : ["writing.article", "writing.review"];
    case "workflow.automation":
      return ["skill_factory.create", "writing.article"];
    case "research.synthesis":
    case "document.writing":
      return ["writing.article", "writing.review"];
    case "unknown.blocked":
    default:
      return [];
  }
}

export function isSupportedAutoTeamRouteClass(
  value: string,
): value is AutoTeamRouteClass {
  return (AUTO_TEAM_ROUTE_CLASSES as readonly string[]).includes(value);
}
