/**
 * Routing Policy Engine — deterministic business rules for skill routing.
 *
 * Applies hard rules before any LLM scoring. These rules either force-set
 * routing attributes or filter/boost candidate families.
 *
 * Part of Feature 021: Hybrid Skill Orchestrator.
 */

import type { TaskProfile } from "./taskProfileParser";
import type { RoomIntentRouterInput, RoomExecutionRoute } from "./roomIntentRouter";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PolicyDecision {
  /** Force a specific route (short-circuits scoring) */
  forcedRoute?: RoomExecutionRoute;
  /** Force a specific skill (short-circuits scoring) */
  forcedSkillId?: string;
  /** Skills MUST have these capabilities to be considered */
  requiredCapabilities: string[];
  /** Skills in these families are excluded */
  excludedFamilies: string[];
  /** Skills in these families get a score boost */
  preferredFamilies: string[];
  /** Force web search capability requirement */
  forceWebSearch: boolean;
  /** Don't allow single-skill resolution (needs planner/swarm) */
  forceMultiSkill: boolean;
  /** Audit trail of applied rules */
  policyReasons: string[];
}

// ─── Signal Patterns ────────────────────────────────────────────────────────

const AGENCY_SIGNAL_RE = /(agency|handoff|orchestrate|delegate|coordinate|escalate|escalation|multi[- ]agent|swarm)/i;

const CHAT_SIGNAL_RE = /^(hi|hello|สวัสดี|ขอบคุณ|thanks|how are you|เป็นไง|คุย|chat|hey|yo)\s*[!?.]?$/i;

const IMAGE_PROMPT_RE = /(prompt ภาพ|prompt รูป|สร้าง prompt|image prompt|photo prompt|create.+prompt.+(?:image|photo|visual))/i;

const REVIEW_PRODUCT_RE = /(รีวิว|เปรียบเทียบ|ข้อดีข้อเสีย|pros.?and.?cons|\breview\b|\bcompare\b|\bvs\b)/i;

// ─── Main Policy Function ───────────────────────────────────────────────────

export function applyRoutingPolicies(
  profile: TaskProfile,
  input: RoomIntentRouterInput,
): PolicyDecision {
  const decision: PolicyDecision = {
    requiredCapabilities: [],
    excludedFamilies: [],
    preferredFamilies: [],
    forceWebSearch: false,
    forceMultiSkill: false,
    policyReasons: [],
  };

  const text = input.message.trim();

  // Rule 1: Explicit agency signal → force agency route
  if (AGENCY_SIGNAL_RE.test(text)) {
    decision.forcedRoute = "agency";
    decision.policyReasons.push("explicit_agency_signal");
    return decision;
  }

  // Rule 2: Short greeting with no task signal → force chat
  if (CHAT_SIGNAL_RE.test(text)) {
    decision.forcedRoute = "chat";
    decision.policyReasons.push("greeting_detected");
    return decision;
  }

  // Rule 3: Freshness required OR explicit web search request → must have web search
  if (profile.freshness === "required" || profile.capabilityNeeds.webSearchExplicit) {
    decision.forceWebSearch = true;
    if (!decision.requiredCapabilities.includes("web_search")) {
      decision.requiredCapabilities.push("web_search");
    }
    decision.policyReasons.push(
      profile.capabilityNeeds.webSearchExplicit
        ? "user_requested_web_search"
        : "freshness_requires_web_search",
    );
  }

  // Rule 4: Review + place/product + images → prefer product_review with web
  if (REVIEW_PRODUCT_RE.test(text)) {
    decision.preferredFamilies.push("product_review");
    if (input.hasImages || profile.freshness !== "none") {
      decision.forceWebSearch = true;
      if (!decision.requiredCapabilities.includes("web_search")) {
        decision.requiredCapabilities.push("web_search");
      }
      decision.policyReasons.push("review_with_evidence_needs_web");
    } else {
      decision.policyReasons.push("review_detected");
    }
  }

  // Rule 5: Image/video prompt request → prefer media_prompts family
  if (IMAGE_PROMPT_RE.test(text)) {
    decision.preferredFamilies.push("media_prompts");
    decision.policyReasons.push("image_prompt_request");
  }

  // Rule 6: Audio modality → prefer media_audio family
  if (profile.modalities.includes("audio")) {
    decision.preferredFamilies.push("media_audio");
    decision.policyReasons.push("audio_modality_detected");
  }

  // Rule 7: Video modality without audio → prefer media_video
  if (profile.modalities.includes("video") && !profile.modalities.includes("audio")) {
    decision.preferredFamilies.push("media_video");
    decision.policyReasons.push("video_modality_detected");
  }

  // Rule 8: Image modality (without prompt request) → prefer media_image
  if (
    profile.modalities.includes("image") &&
    !IMAGE_PROMPT_RE.test(text) &&
    !REVIEW_PRODUCT_RE.test(text)
  ) {
    decision.preferredFamilies.push("media_image");
    decision.policyReasons.push("image_generation_detected");
  }

  // Rule 9: Multi-deliverable → don't force single skill
  if (profile.complexity === "multi_deliverable") {
    decision.forceMultiSkill = true;
    decision.policyReasons.push("multi_deliverable_detected");
  }

  // Rule 10: Vision capability needed
  if (profile.capabilityNeeds.vision) {
    decision.requiredCapabilities.push("vision");
    decision.policyReasons.push("vision_capability_needed");
  }

  // Rule 11: Code execution needed
  if (profile.capabilityNeeds.codeExecution) {
    decision.requiredCapabilities.push("code_execution");
    decision.policyReasons.push("code_execution_needed");
  }

  return decision;
}
