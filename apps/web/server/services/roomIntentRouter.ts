import { classifyIntent } from "./skillIntentClassifier";
import { detectSkill } from "./skillDetector";
import { getTenantFeatureFlag } from "./featureFlags";
import { parseTaskProfile, type TaskProfile } from "./taskProfileParser";
import { applyRoutingPolicies, type PolicyDecision } from "./routingPolicyEngine";
import { retrieveAndScoreCandidates, type ScoredCandidate } from "./skillCandidateScorer";
import { applyFallbackLadder, type RoutingStrategy } from "./routingFallbackLadder";
import { getSkillCatalogSummary } from "./skillCatalog";
import { recordRoutingDecision } from "./routingTelemetry";

/** Fallback skill for assistant/system turns when detection confidence is too low.
 * Must be a real skill in the registry. See also: teamRunSkillExecutor.ts (section-03 ensures eligibility). */
export const FALLBACK_CONTENT_SKILL_ID = "general-article-writer";

export type RoomIntentOrigin = "human_user" | "assistant" | "system";
export type RoomIntentContext = "room_message" | "run_turn" | "work_item";
export type RoomExecutionRoute = "chat" | "skill" | "agency";

export interface RoomIntentRouterInput {
  message: string;
  origin: RoomIntentOrigin;
  context: RoomIntentContext;
  userId: number;
  tenantId: string;
  conversationId?: number;
  teamId?: string;
  roomId?: string;
  hasImages?: boolean;
  assistantId?: string;
}

export interface RoomIntentDecision {
  route: RoomExecutionRoute;
  reason: string;
  selectedSkillId?: string;
  confidence: number;
  source: "rules" | "skill-detect" | "classifier" | "fallback" | "policy" | "scorer";
  agencyEscalation?: boolean;
  // Advanced routing fields (F21 only)
  routingStrategy?: RoutingStrategy;
  candidateSkills?: Array<{ skillId: string; score: number }>;
  taskProfile?: TaskProfile;
  policyReasons?: string[];
}

const TASK_SIGNAL_RE = /\b(ทำ|ช่วย|สร้าง|เขียน|สรุป|วิเคราะห์|รีวิว|review|draft|plan|research|generate|compose|design|build|fix|analyze|compare|evaluate|outline)\b/i;
const CHAT_SIGNAL_RE = /\b(hi|hello|สวัสดี|ขอบคุณ|thanks|how are you|เป็นไง|คุย|chat)\b/i;
const AGENCY_SIGNAL_RE = /\b(agency|multi[- ]step|หลายขั้น|workflow|orchestrate|delegate|coordinate|escalate|escalation)\b/i;

/** High-confidence regex threshold — skip LLM call */
const REGEX_AUTO_ROUTE_THRESHOLD = 0.82;

export async function routeRoomIntent(input: RoomIntentRouterInput): Promise<RoomIntentDecision> {
  const normalized = input.message.trim();
  if (!normalized) {
    return { route: "chat", reason: "empty_message", confidence: 0, source: "rules" };
  }

  // Check F21 feature flag — use advanced routing when enabled
  let useAdvancedRouting = false;
  try {
    useAdvancedRouting = await getTenantFeatureFlag("skillOrchestrator", input.tenantId);
  } catch {
    // Redis unavailable — fall through to legacy path
  }

  if (useAdvancedRouting) {
    return routeWithAdvancedPipeline(input, normalized);
  }

  return routeLegacy(input, normalized);
}

// ─── Advanced Routing Pipeline (F21) ────────────────────────────────────────

async function routeWithAdvancedPipeline(
  input: RoomIntentRouterInput,
  normalized: string,
): Promise<RoomIntentDecision> {
  const startMs = Date.now();
  let llmClassifierUsed = false;

  // Step 1: Parse task profile (deterministic, ~0ms)
  const profile = parseTaskProfile(normalized, {
    origin: input.origin,
    hasImages: input.hasImages,
  });

  // Step 2: Apply routing policies (deterministic, ~0ms)
  let policy = applyRoutingPolicies(profile, input);

  // Step 3: Policy-forced routes → return immediately
  if (policy.forcedRoute) {
    const decision: RoomIntentDecision = {
      route: policy.forcedRoute,
      reason: `policy:${policy.policyReasons.join(",")}`,
      confidence: policy.forcedRoute === "agency" ? 0.92 : 0.6,
      source: "policy",
      agencyEscalation: policy.forcedRoute === "agency",
      routingStrategy: policy.forcedRoute === "agency" ? "swarm" : "single",
      taskProfile: profile,
      policyReasons: policy.policyReasons,
    };
    if (policy.forcedSkillId) decision.selectedSkillId = policy.forcedSkillId;
    recordRoutingDecision({
      timestamp: new Date().toISOString(), tenantId: input.tenantId, userId: input.userId,
      roomId: input.roomId, message: normalized, taskProfile: profile,
      policyReasons: policy.policyReasons, candidateCount: 0,
      topCandidateScore: 0, strategy: decision.routingStrategy ?? "single",
      selectedSkillId: decision.selectedSkillId, routingLatencyMs: Date.now() - startMs,
      llmClassifierUsed: false,
    });
    return decision;
  }

  // Step 4: Fast regex detection (existing, ~0ms)
  const regexDetection = await detectSkill(normalized, input.conversationId, undefined, input.userId);
  const regexMatch = regexDetection.detected && regexDetection.skill
    ? { skillId: regexDetection.skill.id, confidence: regexDetection.confidence }
    : undefined;

  // Step 5: High-confidence regex → return immediately (no LLM)
  if (regexMatch && regexMatch.confidence >= REGEX_AUTO_ROUTE_THRESHOLD && !policy.forceMultiSkill) {
    const decision: RoomIntentDecision = {
      route: "skill",
      reason: `regex_auto:${regexMatch.skillId}`,
      selectedSkillId: regexMatch.skillId,
      confidence: regexMatch.confidence,
      source: "skill-detect",
      routingStrategy: "single",
      taskProfile: profile,
      policyReasons: policy.policyReasons,
    };
    recordRoutingDecision({
      timestamp: new Date().toISOString(), tenantId: input.tenantId, userId: input.userId,
      roomId: input.roomId, message: normalized, taskProfile: profile,
      policyReasons: policy.policyReasons, candidateCount: 1,
      topCandidateScore: regexMatch.confidence, strategy: "single",
      selectedSkillId: regexMatch.skillId, routingLatencyMs: Date.now() - startMs,
      llmClassifierUsed: false,
    });
    return decision;
  }

  // Step 6: Retrieve candidates from catalog
  let catalog: any[] = [];
  try {
    catalog = await getSkillCatalogSummary(input.userId, input.tenantId);
  } catch {
    catalog = [];
  }

  let candidates = retrieveAndScoreCandidates(
    profile, policy, catalog, regexMatch,
  );

  // Step 7: LLM classifier (with pre-filtered candidates)
  const candidateIds = candidates.slice(0, 15).map((c) => c.skillId);
  if (candidateIds.length > 0) {
    try {
      const classification = await classifyIntent(
        normalized,
        input.userId,
        input.tenantId,
        input.conversationId,
        undefined,
        { hasImages: input.hasImages, candidateSkillIds: candidateIds },
      );
      llmClassifierUsed = true;

      if (classification) {
        // Step 8: Re-score with classifier results
        const classifierScores = classification.skills.map((s) => ({
          skillId: s.skillId,
          confidence: s.confidence,
        }));

        // Classifier says "complex" → create updated policy (don't mutate original)
        if (classification.level === "complex") {
          policy = {
            ...policy,
            forceMultiSkill: true,
            policyReasons: [...policy.policyReasons, "classifier_complex"],
          };
        }

        candidates = retrieveAndScoreCandidates(
          profile, policy, catalog, regexMatch, classifierScores,
        );
      }
    } catch {
      // Classifier unavailable — proceed with catalog-only scores
    }
  }

  // Step 9: Apply fallback ladder (with task signal detection)
  const hasTaskSignal = TASK_SIGNAL_RE.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.length > 50 ||
    profile.modalities.length > 1 ||
    profile.domainHints.length > 0;
  const fallback = applyFallbackLadder(candidates, profile, policy, hasTaskSignal);

  // Step 10: Map to RoomIntentDecision
  const strategyToRoute = (s: RoutingStrategy): RoomExecutionRoute => {
    switch (s) {
      case "swarm": return "agency";
      case "chat": return "chat";
      default: return "skill";
    }
  };
  const decision: RoomIntentDecision = {
    route: strategyToRoute(fallback.strategy),
    reason: `scored:${fallback.reason}`,
    selectedSkillId: fallback.primarySkillId ?? FALLBACK_CONTENT_SKILL_ID,
    confidence: fallback.confidence,
    source: "scorer",
    agencyEscalation: fallback.strategy === "swarm",
    routingStrategy: fallback.strategy,
    candidateSkills: candidates.slice(0, 5).map((c) => ({
      skillId: c.skillId,
      score: Math.round(c.compositeScore * 100) / 100,
    })),
    taskProfile: profile,
    policyReasons: policy.policyReasons,
  };

  recordRoutingDecision({
    timestamp: new Date().toISOString(), tenantId: input.tenantId, userId: input.userId,
    roomId: input.roomId, message: normalized, taskProfile: profile,
    policyReasons: policy.policyReasons, candidateCount: candidates.length,
    topCandidateScore: candidates[0]?.compositeScore ?? 0, strategy: fallback.strategy,
    selectedSkillId: decision.selectedSkillId, routingLatencyMs: Date.now() - startMs,
    llmClassifierUsed,
  });

  return decision;
}

// ─── Legacy Routing (F21 disabled) ──────────────────────────────────────────

async function routeLegacy(
  input: RoomIntentRouterInput,
  normalized: string,
): Promise<RoomIntentDecision> {
  const lower = normalized.toLowerCase();
  const explicitAgency = AGENCY_SIGNAL_RE.test(normalized);
  if (explicitAgency) {
    return {
      route: "agency",
      reason: "explicit_agency_signal",
      confidence: 0.92,
      source: "rules",
      agencyEscalation: true,
    };
  }

  // For assistant/run_turn: attempt skill detection with conversation context,
  // then fall back to general content skill.
  if (input.origin !== "human_user") {
    const assistantDetection = await detectSkill(normalized, input.conversationId, undefined, input.userId);
    if (assistantDetection.detected && assistantDetection.skill && assistantDetection.confidence >= 0.6) {
      return {
        route: "skill",
        reason: `assistant_skill_match:${assistantDetection.skill.id}`,
        selectedSkillId: assistantDetection.skill.id,
        confidence: assistantDetection.confidence,
        source: "skill-detect",
      };
    }
    return {
      route: "skill",
      reason: "assistant_content_fallback",
      selectedSkillId: FALLBACK_CONTENT_SKILL_ID,
      confidence: 0.5,
      source: "fallback",
    };
  }

  const detection = await detectSkill(normalized, input.conversationId, undefined, input.userId);
  if (detection.detected && detection.skill && detection.confidence >= 0.7) {
    return {
      route: "skill",
      reason: detection.matchedTrigger
        ? `skill_trigger:${detection.matchedTrigger}`
        : "skill_detected",
      selectedSkillId: detection.skill.id,
      confidence: detection.confidence,
      source: "skill-detect",
    };
  }

  const shouldClassify =
    TASK_SIGNAL_RE.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.length > 30;

  if (shouldClassify) {
    const classification = await classifyIntent(
      normalized,
      input.userId,
      input.tenantId,
      input.conversationId,
      undefined,
      { hasImages: input.hasImages },
    );

    if (classification) {
      const topSkill = classification.skills[0];
      if (classification.level === "complex") {
        return {
          route: "agency",
          reason: `classifier_complex:${classification.strategy}`,
          confidence: topSkill?.confidence ?? 0.7,
          source: "classifier",
          agencyEscalation: true,
        };
      }

      if (topSkill && topSkill.confidence >= 0.65) {
        return {
          route: "skill",
          reason: `classifier_skill:${topSkill.skillId}`,
          selectedSkillId: topSkill.skillId,
          confidence: topSkill.confidence,
          source: "classifier",
        };
      }
    }
  }

  if (CHAT_SIGNAL_RE.test(lower)) {
    return {
      route: "chat",
      reason: "conversation_signal",
      confidence: 0.6,
      source: "rules",
    };
  }

  return {
    route: "chat",
    reason: "default_chat",
    confidence: 0.5,
    source: "fallback",
  };
}
