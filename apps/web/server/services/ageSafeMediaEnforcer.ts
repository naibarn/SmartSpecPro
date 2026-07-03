import type { AgeSafetyDecision, SafetyActorContext, SafetySurface } from "../../shared/ageSafetyPolicy";
import { DEFAULT_AGE_SAFETY_POLICY, getPolicySnapshotHash, resolveJurisdictionPreset } from "../../shared/ageSafetyPolicy";
import { enforceAgePolicy } from "./agePolicyEnforcer";
import {
  detectChatSafetyCategory,
  shouldHardBlockCategory,
  shouldMinorBlockCategory,
  type ChatSafetyModerationCategory,
} from "./ageSafeChatEnforcer";
import type { AgeSafetyPolicyModeInput } from "./ageSafetyPolicyService";
import { buildGeneratedAssetSafetyMetadata, type GeneratedAssetSafetyMetadata } from "./generatedAssetSafetyService";

export type MediaSafetyKind = "image" | "video" | "audio";

export type MediaSafetyResult = {
  allowed: boolean;
  decision: AgeSafetyDecision;
  category: ChatSafetyModerationCategory;
  metadata: GeneratedAssetSafetyMetadata;
  response?: {
    code: string;
    message: string;
  };
};

export function mediaKindToSurface(kind: MediaSafetyKind): SafetySurface {
  if (kind === "video") return "media_video";
  if (kind === "audio") return "media_audio";
  return "media_image";
}

export function evaluateMediaPrompt(input: {
  actor: SafetyActorContext;
  kind: MediaSafetyKind;
  prompt: string;
  now?: Date;
  flags?: AgeSafetyPolicyModeInput["flags"];
  policy?: AgeSafetyPolicyModeInput["policy"];
  audit?: boolean;
}): MediaSafetyResult {
  const now = input.now ?? new Date();
  const enforcement = enforceAgePolicy({
    actor: input.actor,
    surface: mediaKindToSurface(input.kind),
    action: "submit_prompt",
    protectedSurfaceScope: "age-policy:temporary-adult",
    now,
    flags: input.flags,
    policy: input.policy,
    audit: input.audit,
  });

  // General media (image/video/audio) is allowed for teen+; only genuinely
  // sensitive prompts are escalated. Sexual/graphic content stays adult-only,
  // and illegal/self-harm content is hard-blocked for everyone. This mirrors
  // the chat enforcer so classification lives in one place.
  const category = detectChatSafetyCategory(input.prompt);
  const adultUnlocked = input.actor.protectedSurfaceScopes?.includes("age-policy:temporary-adult") === true;
  const contentBlocked =
    shouldHardBlockCategory(category) ||
    (shouldMinorBlockCategory(category) && enforcement.decision.enforcementAgeBand !== "adult" && !adultUnlocked);

  const decision: AgeSafetyDecision = contentBlocked
    ? {
        ...enforcement.decision,
        allowed: false,
        effect: "block",
        reasonCode: `age_policy_media_${category}`,
      }
    : enforcement.decision;

  const preset = resolveJurisdictionPreset(input.actor.countryCode, undefined, now);
  const metadata = buildGeneratedAssetSafetyMetadata({
    creatorBand: decision.enforcementAgeBand,
    minimumViewerBand: decision.enforcementAgeBand,
    policyVersion: decision.policyVersion,
    policySnapshotHash: getPolicySnapshotHash(input.policy ?? DEFAULT_AGE_SAFETY_POLICY, preset),
    contentCategory: `media:${input.kind}`,
    reviewState: decision.allowed ? "clear" : "quarantined",
  });
  return {
    allowed: decision.allowed,
    decision,
    category,
    metadata,
    response: decision.allowed
      ? undefined
      : contentBlocked
        ? {
            code: decision.reasonCode,
            message: "This media request is restricted by content-safety policy.",
          }
        : {
            code: enforcement.response?.code ?? decision.reasonCode,
            message: enforcement.response?.message ?? "This media request is restricted by age-safety policy.",
          },
  };
}
