import { z } from "zod";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  validateStagedShotContract,
  type HumanApprovalCheckpointV1,
  type StagedSafeReasonCode,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { callLLMStructured } from "./callLLMStructured";
import { getSkillByIdAsync, syncSingleSkillIfChanged } from "./skillRegistry";
import {
  isMarketplaceCastLeadRole,
  type MarketplaceCharacterCastRole,
} from "../../shared/hyperframes/characterCast";
import {
  castIdForCharacterIndex,
  type ShotCastLook,
} from "../../shared/marketplaceAutoReview/shotCast";

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export type StagedStoryArcProduct = {
  productId: string;
  productName: string;
  description?: string | null;
  specs?: Record<string, unknown>;
  imageUrls: string[];
};

// A single uploaded/selected cast member.
//
// The roster holds up to `MARKETPLACE_CHARACTER_CAST_MAX` (4) people
// (`planning/marketplace-four-character-cast/plan.md`), but only the two LEADS
// (`host`/`guest`) own dialogue turns — `support` members are in the frame to
// carry a story beat, never to become a third conversational voice. That split
// is what let the roster grow without rewriting the two-person dialogue engine.
export type StagedCastMember = {
  castId: string; // "cast-1" .. "cast-4"
  name: string; // spoken name in the script
  source: "uploaded" | "vd_character";
  vdCharacterId?: string;
  vdSeriesId?: string;
  // host = opens/asks, guest = answers/reviews, support = present with a beat
  role: MarketplaceCharacterCastRole;
  descriptor?: string;
  ageRange?: string | null;
  /** Explicit minor grounding — see `project_marketplace_minor_safety_qa_grounding`.
   *  `undefined` stays unknown, which downstream treats conservatively. */
  depictsMinor?: boolean;
  imageIndex: number; // position in referenceImageUrls -> @Image{imageIndex}
};

export type StagedConversationMode = "solo" | "two_person_conversation";

/**
 * The cast members that own dialogue: at most one host and one guest, in that
 * order. Every consumer that used to write `cast.slice(0, 2)` to mean "the
 * speakers" must call this instead — with a 4-person roster the first two
 * entries are no longer necessarily the leads.
 */
export function selectStagedLeadCast(
  cast: StagedCastMember[] | null | undefined
): StagedCastMember[] {
  const members = cast ?? [];
  const host = members.find(member => member.role === "host");
  const guest = members.find(member => member.role === "guest");
  return [host, guest].filter((member): member is StagedCastMember => !!member);
}

/** The non-speaking tier — present for atmosphere/story beats. */
export function selectStagedSupportingCast(
  cast: StagedCastMember[] | null | undefined
): StagedCastMember[] {
  return (cast ?? []).filter(member => !isMarketplaceCastLeadRole(member.role));
}

/**
 * Guarantee that no supporting character is rendered into a shot without a
 * reason to be there (`planning/marketplace-four-character-cast/plan.md` §3).
 *
 * Validate model-authored cast and supporting beats without rewriting or
 * dropping any of them. Invalid cast data fails plan generation directly.
 */
export function enforceSupportingBeats<
  T extends {
    castInShot?: string[];
    supportingBeats?: StagedSupportingBeat[];
  },
>(params: {
  shots: T[];
  cast: StagedCastMember[] | null | undefined;
}): { shots: T[]; droppedCastIdsByShot: Record<number, string[]> } {
  const supporting = selectStagedSupportingCast(params.cast);
  if (supporting.length === 0) {
    return { shots: params.shots, droppedCastIdsByShot: {} };
  }
  const knownCastIds = new Set(
    (params.cast ?? []).map(member => member.castId)
  );
  const supportingIds = new Set(supporting.map(member => member.castId));

  const shots = params.shots.map((shot, index) => {
    if (!Array.isArray(shot.castInShot)) {
      throw new Error(`STAGED_CAST_IN_SHOT_REQUIRED:shot-${index + 1}`);
    }
    const unknownCastId = shot.castInShot.find(
      castId => !knownCastIds.has(castId)
    );
    if (unknownCastId) {
      throw new Error(
        `STAGED_CAST_MEMBER_NOT_FOUND:shot-${index + 1}:${unknownCastId}`
      );
    }
    const beats = shot.supportingBeats ?? [];
    const beatByCastId = new Map<string, StagedSupportingBeat>();
    for (const beat of beats) {
      if (!supportingIds.has(beat.castId)) {
        throw new Error(
          `STAGED_SUPPORTING_BEAT_CAST_INVALID:shot-${index + 1}:${beat.castId}`
        );
      }
      if (!shot.castInShot.includes(beat.castId)) {
        throw new Error(
          `STAGED_SUPPORTING_BEAT_CAST_NOT_IN_SHOT:shot-${index + 1}:${beat.castId}`
        );
      }
      if (!clean(beat.action)) {
        throw new Error(
          `STAGED_SUPPORTING_BEAT_ACTION_REQUIRED:shot-${index + 1}:${beat.castId}`
        );
      }
      if (beatByCastId.has(beat.castId)) {
        throw new Error(
          `STAGED_SUPPORTING_BEAT_DUPLICATE:shot-${index + 1}:${beat.castId}`
        );
      }
      beatByCastId.set(beat.castId, beat);
    }
    for (const castId of shot.castInShot) {
      if (supportingIds.has(castId) && !beatByCastId.has(castId)) {
        throw new Error(
          `STAGED_SUPPORTING_BEAT_REQUIRED:shot-${index + 1}:${castId}`
        );
      }
    }
    return {
      ...shot,
      castInShot: [...shot.castInShot],
      supportingBeats: beats,
    };
  });
  return { shots, droppedCastIdsByShot: {} };
}

export type StagedDialogueTurn = {
  castId: string;
  speakerName: string;
  line: string;
};

/**
 * What a SUPPORTING character does in one shot
 * (`planning/marketplace-four-character-cast/plan.md` §3).
 *
 * The user's requirement in their own words: a supporting character may or may
 * not speak, but must never be "แค่นั่งเฉย ๆ ไม่ส่งเสริมเรื่องราวใด ๆ" — they have
 * to raise the atmosphere, add a story beat, or pull the viewer's emotion.
 * Their examples were a child playing with the product without a line, and an
 * extra who says "ฉันก็ใช้อันนี้นะ".
 *
 * `action` is therefore REQUIRED and `line` is optional — the inverse of a
 * dialogue turn. A supporting character with no action is not rendered into
 * that shot at all (see `enforceSupportingBeats`), which is how "no idling" is
 * guaranteed without ever failing the run.
 */
export type StagedSupportingBeat = {
  castId: string;
  /** Physical business / reaction that serves the story. Authored by the model. */
  action: string;
  /** Optional short line. Never displaces a lead's dialogue turn. */
  line?: string;
};

/**
 * A cast member's descriptor, defaulted from their ROLE when the user did not
 * supply one (`planning/marketplace-four-character-cast/plan.md`).
 *
 * An uploaded photo carries no identity the system can read — unlike a Drama
 * Series pick, which brings occupation/personality from the series bible. So
 * without a default the planner sees a bare name and writes a generic script.
 * The role already says what each person is FOR, so that is what the default
 * states: the host presents/demonstrates, the guest assists and responds,
 * supporting characters add colour. This is a FACT restated from the role, not
 * invented character content — the moment the user types their own descriptor
 * it wins outright.
 *
 * Emitted in the run's own language so it never injects Thai into an English
 * script (or vice versa).
 */
export function resolveStagedCastDescriptor(
  member: Pick<StagedCastMember, "role" | "descriptor">,
  language: "th" | "en"
): string {
  const authored = clean(member.descriptor);
  if (authored) return authored;
  if (language === "th") {
    return member.role === "host"
      ? "ผู้บรรยาย/สาธิตสินค้าเป็นหลัก"
      : member.role === "guest"
        ? "ผู้ช่วย — ตอบรับ ถาม และเสริมการสาธิต"
        : "ตัวประกอบ — ช่วยเสริมบรรยากาศและเรื่องราว";
  }
  return member.role === "host"
    ? "primary presenter / product demonstrator"
    : member.role === "guest"
      ? "assistant — responds, asks, and supports the demonstration"
      : "supporting presence — adds atmosphere and story beats";
}

/**
 * Derive the conversation mode from the SPEAKING LEADS, never from the roster
 * size. Still the single source of truth so `cast` and `conversationMode`
 * cannot drift out of sync.
 *
 * This used to read `cast.length >= 2`. Once the roster can hold 4 people
 * (`planning/marketplace-four-character-cast/plan.md`), roster size stops
 * being a proxy for "how many voices": one host plus three supporting
 * characters is still a SOLO narration with three people in frame. Counting
 * leads keeps every existing solo/two-person run resolving byte-identically —
 * a legacy 2-entry roster is host + guest, so it still returns
 * `two_person_conversation`.
 */
export function resolveStagedConversationMode(
  cast: StagedCastMember[] | null | undefined
): StagedConversationMode {
  return selectStagedLeadCast(cast).length >= 2
    ? "two_person_conversation"
    : "solo";
}

/**
 * Flatten dialogue turns into the legacy single-string `dialogue` rendering
 * (`"Name: line"` joined by newlines). `dialogue` remains the source of truth
 * for hashes, TTS joins, and UI display — this is purely a rendering helper.
 */
export function renderStagedDialogueFromTurns(
  turns: StagedDialogueTurn[]
): string {
  return turns.map(turn => `${turn.speakerName}: ${turn.line}`).join("\n");
}

function parseSpeakerNamedDialogue(
  dialogue: string
): Array<{ speakerName: string; line: string }> | undefined {
  const lines = dialogue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  const parsed = lines.map(line => {
    const match = line.match(/^([^:\n]{1,100}):\s*(.+)$/);
    const speakerName = match?.[1]?.trim();
    const spokenLine = match?.[2]?.trim();
    return speakerName && spokenLine ? { speakerName, line: spokenLine } : null;
  });
  return parsed.every(
    (line): line is { speakerName: string; line: string } => !!line
  )
    ? parsed
    : undefined;
}

/**
 * Resolve the editable `Name: line` transcript back to the cast IDs. The
 * transcript is canonical after a user edit; persisted turns are only a
 * derived convenience and must never keep an older version alive.
 */
export function parseStagedDialogueTurns(
  dialogue: string,
  cast: StagedCastMember[] | null | undefined
): StagedDialogueTurn[] | undefined {
  const parsed = parseSpeakerNamedDialogue(dialogue);
  if (!parsed || !cast?.length) return undefined;
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const memberByName = new Map(
    cast.map(member => [normalizedName(member.name), member])
  );
  const resolved = parsed.map(line => {
    const member = memberByName.get(normalizedName(line.speakerName));
    return member
      ? { castId: member.castId, speakerName: member.name, line: line.line }
      : null;
  });
  return resolved.every((turn): turn is StagedDialogueTurn => !!turn)
    ? resolved
    : undefined;
}

export type StagedStoryArcShot = {
  shotId: number;
  title: string;
  storySummary: string;
  visualSummary: string;
  dialogue: string;
  durationSeconds: number;
  // Additive (opt-in): only populated when `conversationMode ===
  // "two_person_conversation"`. Absent shots stay exactly as they were.
  dialogueTurns?: StagedDialogueTurn[];
  castInShot?: string[];
  /** Per-shot business for the supporting tier. See `StagedSupportingBeat`. */
  supportingBeats?: StagedSupportingBeat[];
};

export type StagedStoryArcLanguagePlan = {
  summaryLanguage: "th" | "en";
  dialogueLanguage: "th" | "en";
  promptLanguage: "th" | "en";
};

export type StagedStoryArcPlanSource = "llm_story_arc";

export type StagedStoryConceptOption = {
  conceptId: string;
  title: string;
  angle: string;
  storySummary: string;
  dialoguePreview: string;
};

export type StagedStoryArcPlan = {
  planRevision: number;
  title: string;
  storySummary: string;
  product: StagedStoryArcProduct;
  shots: StagedStoryArcShot[];
  referenceManifestHash: string;
  storyPlanHash: string;
  source: StagedStoryArcPlanSource;
  authoring: {
    model: string;
    provider: string;
    creditsUsed: number;
  };
  languagePlan?: StagedStoryArcLanguagePlan;
  conceptOptions?: StagedStoryConceptOption[];
  selectedConceptId?: string;
  // Additive (opt-in): only present when at least one cast member was
  // supplied. Absent entirely for every existing product-only/solo caller.
  cast?: StagedCastMember[];
  conversationMode?: StagedConversationMode;
};

export function buildStagedCheckpoint(input: {
  checkpointId: string;
  kind: HumanApprovalCheckpointV1["kind"];
  shotId?: number | null;
  revision: number;
  contentHash: string;
  estimatedCredits?: number | null;
  model?: string | null;
  provider?: string | null;
  referenceManifestHash?: string | null;
  // When present, the checkpoint is constructed already `approved` — with
  // `approvedHash`/`approvedByUserId`/`approvedAt` populated — instead of
  // `awaiting`. Field population mirrors exactly what the "approve" branch
  // of `transitionStagedCheckpoint` already does (see
  // marketplaceAutoReviewStagedCheckpointService.ts) so an auto-approved
  // checkpoint is indistinguishable from one a human approved by hand.
  // Callers building a `story_plan` checkpoint must NEVER pass this: story
  // plan confirmation is the one deliberately-kept manual gate. Omitting
  // this param reproduces the previous "awaiting" output exactly.
  autoApprove?: { userId: number; approvedAt?: string } | null;
  /** Explicit user request to spend media credits for this prompt. A
   *  generated/approved prompt alone must never dispatch a render. */
  mediaDispatchIntent?: {
    requestedByUserId: number;
    requestedAt?: string;
  } | null;
  // Non-blocking adherence warnings from `assessStagedPlanAdherence`
  // (tone/structure/conversation turns). Only meaningful on `story_plan`
  // checkpoints; omit or pass an empty array everywhere else.
  adherenceWarnings?: string[];
}): HumanApprovalCheckpointV1 {
  const shotScoped =
    input.kind === "image_prompt" ||
    input.kind === "image_result" ||
    input.kind === "video_prompt" ||
    input.kind === "video_result";
  const autoApprove = input.autoApprove;
  const mediaDispatchIntent = input.mediaDispatchIntent;
  return {
    checkpointId: input.checkpointId,
    kind: input.kind,
    scope: shotScoped ? "shot" : "run",
    shotId: shotScoped ? (input.shotId ?? null) : null,
    state: autoApprove ? "approved" : "awaiting",
    revision: Math.max(1, input.revision),
    contentHash: input.contentHash,
    approvedHash: autoApprove ? input.contentHash : null,
    approvedByUserId: autoApprove ? autoApprove.userId : null,
    approvedAt: autoApprove
      ? (autoApprove.approvedAt ?? new Date().toISOString())
      : null,
    consumedAt: null,
    consumedByOperationId: null,
    rejectionReasonCode: null,
    estimatedCredits: input.estimatedCredits ?? null,
    approvedModel: input.model ?? null,
    approvedProvider: input.provider ?? null,
    approvedSafetyVerdict: "passed",
    approvedReferenceManifestHash: input.referenceManifestHash ?? null,
    ...(mediaDispatchIntent
      ? {
          mediaDispatchIntent: {
            requestedByUserId: mediaDispatchIntent.requestedByUserId,
            requestedAt:
              mediaDispatchIntent.requestedAt ?? new Date().toISOString(),
          },
        }
      : {}),
    ...(input.adherenceWarnings && input.adherenceWarnings.length > 0
      ? { adherenceWarnings: input.adherenceWarnings }
      : {}),
  };
}

export function buildStagedPlanView(plan: StagedStoryArcPlan) {
  return {
    title: plan.title,
    storySummary: plan.storySummary,
    source: plan.source,
    ...(plan.conceptOptions ? { conceptOptions: plan.conceptOptions } : {}),
    ...(plan.selectedConceptId
      ? { selectedConceptId: plan.selectedConceptId }
      : {}),
    planRevision: plan.planRevision,
    storyPlanHash: plan.storyPlanHash,
    shots: plan.shots,
    referenceManifestHash: plan.referenceManifestHash,
    ...(plan.languagePlan ? { languagePlan: plan.languagePlan } : {}),
  };
}

/**
 * Checks authored plan structure and returns non-blocking adherence warnings.
 * Malformed plan input throws so QC errors cannot be hidden as a clean result.
 */
export function assessStagedPlanAdherence(
  plan: StagedStoryArcPlan,
  options: {
    storytellingStructure?: string | null;
    reviewTone?: string | null;
    conversationMode?: StagedConversationMode;
  }
): { warnings: StagedSafeReasonCode[] } {
  const warnings: StagedSafeReasonCode[] = [];
  const structureKey = clean(options.storytellingStructure);
  const toneKey = clean(options.reviewTone);
  const conversationMode =
    options.conversationMode ?? resolveStagedConversationMode(plan.cast ?? []);
  if (!Array.isArray(plan.shots) || plan.shots.length === 0) {
    throw new Error("STAGED_PLAN_SHOTS_REQUIRED_FOR_ADHERENCE_CHECK");
  }
  const shots = plan.shots;

  if (structureKey) {
    const hasEmptyBeat = shots.some(
      shot => !clean(shot?.title) || !clean(shot?.storySummary)
    );
    if (hasEmptyBeat) {
      warnings.push("staged_structure_beat_missing");
    }
  }

  if (toneKey) {
    const allDialogueBlank = shots.every(shot => !clean(shot?.dialogue));
    if (allDialogueBlank) {
      warnings.push("staged_tone_not_adhered");
    }
  }

  if (conversationMode === "two_person_conversation") {
    const missingTurns = shots.some(
      shot =>
        !Array.isArray(shot?.dialogueTurns) || shot.dialogueTurns.length < 2
    );
    if (missingTurns) {
      warnings.push("staged_conversation_turns_missing");
    }
  }
  return { warnings };
}

export async function generateStagedStoryArcPlanWithLLM(input: {
  runId: string;
  userId?: number;
  tenantId?: string;
  product: StagedStoryArcProduct;
  referenceManifestHash: string;
  revision?: number;
  previousStorySummary?: string | null;
  languagePlan?: StagedStoryArcLanguagePlan;
  reviewFormat?: string | null;
  reviewTone?: string | null;
  storytellingStructure?: string | null;
  model?: string | null;
  // Additive (opt-in). See buildStagedStoryArcPlan.
  cast?: StagedCastMember[];
  shotDurationSeconds?: number;
  // Additive (opt-in, feature/marketplace-flexible-shots). A fixed shot count
  // (7..30), the literal "auto" (the LLM decides the shot count itself,
  // within 7..30, using `shotDurationSeconds` as the pacing criterion — this
  // is LLM judgment, never pre-computed in TS), or omitted (today's default
  // of a fixed 9 shots, byte-identical prompt/schema behavior).
  shotCount?: number | "auto";
  selectedConcept?: StagedStoryConceptOption;
  conceptsOnly?: boolean;
}): Promise<StagedStoryArcPlan> {
  let chosenModel = input.model?.trim();
  if (!chosenModel || chosenModel === "__automatic__") {
    // Automatic selection uses the configured recommended model resolver.
    // A resolver error is an error for this run; never substitute a default.
    const { resolveQualityLargeContextModelId } =
      await import("./verticalDramaImproveScript");
    chosenModel = (await resolveQualityLargeContextModelId())?.trim() || "";
  }
  if (!chosenModel || chosenModel === "__automatic__") {
    throw new Error("STAGED_STORY_PLAN_MODEL_NOT_CONFIGURED");
  }
  if (!Number.isSafeInteger(input.userId) || !input.tenantId?.trim()) {
    throw new Error("STAGED_STORY_PLAN_OWNER_CONTEXT_REQUIRED");
  }
  const referenceManifestHash = clean(input.referenceManifestHash);
  if (!referenceManifestHash) {
    throw new Error("STAGED_STORY_PLAN_REFERENCE_MANIFEST_HASH_REQUIRED");
  }

  const skillId = "marketplace-auto-review-story-arc";
  const skillSync = await syncSingleSkillIfChanged(skillId);
  if (skillSync.error) {
    throw new Error(`STAGED_STORY_PLAN_SKILL_SYNC_FAILED:${skillSync.error}`);
  }
  const skill = await getSkillByIdAsync(skillId);
  const skillInstructions = String(
    skill?.systemPrompt ?? skill?.skillContent ?? ""
  ).trim();
  if (!skillInstructions) {
    throw new Error("STAGED_STORY_PLAN_SKILL_NOT_AVAILABLE");
  }

  const productName = clean(input.product.productName);
  if (!productName) throw new Error("STAGED_STORY_PLAN_PRODUCT_NAME_REQUIRED");
  if (productName.length > 240)
    throw new Error("STAGED_STORY_PLAN_PRODUCT_NAME_TOO_LONG");
  const productDescription = clean(input.product.description);
  if (productDescription.length > 500) {
    throw new Error("STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_TOO_LONG");
  }
  const structureKey =
    clean(input.storytellingStructure) || "hook_problem_insight_proof_cta";
  const toneKey = clean(input.reviewTone) || "irritated_problem";
  const revisionNotes = clean(input.previousStorySummary);

  const userId = input.userId!;
  const tenantId = input.tenantId!.trim();

  const shotDurationSeconds = input.shotDurationSeconds ?? 10;
  if (
    !Number.isInteger(shotDurationSeconds) ||
    shotDurationSeconds < 1 ||
    shotDurationSeconds > 60
  ) {
    throw new Error(
      `STAGED_STORY_PLAN_SHOT_DURATION_INVALID:${shotDurationSeconds}`
    );
  }
  const dialogueWindowMinSeconds = Math.max(1, shotDurationSeconds - 3);

  // Additive (feature/marketplace-flexible-shots). See the `shotCount` doc
  // comment on the input type above.
  const isAutoShotCount = input.shotCount === "auto";
  const fixedShotCount = isAutoShotCount ? undefined : (input.shotCount ?? 9);
  if (
    fixedShotCount !== undefined &&
    (!Number.isInteger(fixedShotCount) ||
      fixedShotCount < 7 ||
      fixedShotCount > 30)
  ) {
    throw new Error(`STAGED_STORY_PLAN_SHOT_COUNT_INVALID:${fixedShotCount}`);
  }
  if (revisionNotes.length > 1200) {
    throw new Error("STAGED_STORY_PLAN_REVISION_NOTES_TOO_LONG");
  }

  // The DIALOGUE roster is the leads only — supporting characters are handed
  // to the model separately (they carry beats, not conversational turns), so
  // this block's two-voice contract stays exactly as it was.
  const activeCast = selectStagedLeadCast(input.cast);
  const conversationMode = resolveStagedConversationMode(input.cast);
  const isDramaTieIn = clean(input.reviewFormat) === "drama_tie_in";
  if (isDramaTieIn && conversationMode !== "two_person_conversation") {
    throw new Error("STAGED_TIE_IN_TWO_LEADS_REQUIRED");
  }
  // The roster's defaulted descriptors follow the run's own summary language,
  // so an English script never gets a Thai role note spliced into it.
  const rosterLanguage: "th" | "en" =
    input.languagePlan?.summaryLanguage === "en" ? "en" : "th";

  const castRosterBlock =
    conversationMode === "two_person_conversation"
      ? `\n\nนักแสดงสองคนในคลิปนี้ (Cast Roster):\n${activeCast
          .map(
            member =>
              `- castId "${member.castId}": ${member.name} (${member.role} — ${resolveStagedCastDescriptor(
                member,
                rosterLanguage
              )}; ageRange: ${member.ageRange || "unknown"}; depictsMinor: ${member.depictsMinor === true ? "yes" : member.depictsMinor === false ? "no" : "unknown"})`
          )
          .join(
            "\n"
          )}\n\nกฎบทสนทนาสองคน (บังคับ): ทุกช็อตต้องเป็นบทสนทนาระหว่างสองคนนี้ตามบทบาท — คนที่มีบทบาท "host" เป็นผู้เปิดประเด็น/ถาม และคนที่มีบทบาท "guest" เป็นผู้ตอบ/รีวิว โดยยังต้องคงโครงสร้างการเล่าเรื่อง "${structureKey}" และโทน "${toneKey}" ของแต่ละช็อตให้ครบทุกประเด็น — งานของคุณคือแบ่งบทพูดของแต่ละ beat เดิมออกเป็นสองคนผลัดกันพูด ไม่ใช่แทนที่หรือละทิ้งโครงสร้าง/โทนที่กำหนดไว้\n\nสำหรับแต่ละช็อต ให้ส่งฟิลด์ "dialogueTurns" เป็น array ของ {castId, line} เรียงตามลำดับการพูดจริง (อย่างน้อย 2 turn ต่อช็อต) และ "castInShot" เป็น castId ของทุกคนที่เห็นในช็อต โดยค่า castId ต้องตรงกับที่กำหนดไว้ข้างต้นเป๊ะ (ฟิลด์ "dialogue" จะสร้างจาก turns เหล่านี้หลังผ่านการตรวจสอบ)`
      : activeCast.length === 1
        ? // Gap fix (flexible-shots/creation-casting audit 2026-07-30): a SOLO
          // named cast member (e.g. one Drama Series character picked at
          // creation) used to be omitted from the prompt entirely — the
          // LLM-first path fired for cast>=1, but the model never learned the
          // presenter's name/identity, so the solo requirement ("1 ตัว =
          // พูดคนเดียวในนามตัวละครนั้น") silently degraded to a generic
          // narrator. The roster is a FACT (skill-first compliant); how to
          // speak as that presenter remains the model's judgment.
          `\n\nผู้ดำเนินรายการคนเดียวในคลิปนี้ (Presenter): ${activeCast[0].name}${
            activeCast[0].descriptor
              ? ` — ${clean(activeCast[0].descriptor)}`
              : ""
          }\nบทพูดทุกช็อตเป็นบทพูดเดี่ยวของ "${activeCast[0].name}" ในมุมมองบุคคลที่หนึ่ง สอดคล้องกับตัวตนของผู้ดำเนินรายการคนนี้ โดยคงโครงสร้าง "${structureKey}" และโทน "${toneKey}" ครบทุกประเด็น ให้ส่ง castInShot ที่ระบุ castId ของผู้ดำเนินรายการในทุกช็อต (ไม่ต้องส่ง dialogueTurns)`
        : "";

  /* Supporting tier (`planning/marketplace-four-character-cast/plan.md` §3).
     FACTS + a structural contract only — WHAT a supporting character does is
     entirely the model's judgment, exactly like the host/guest split above
     states the structure without writing the lines. The one hard rule mirrors
     the user's requirement verbatim: a supporting character who is in a shot
     must be doing something that serves the story; anyone with nothing to do
     is left OUT of the shot rather than standing around in frame. */
  const supportingCast = selectStagedSupportingCast(input.cast);
  const supportingCastBlock =
    supportingCast.length > 0
      ? `\n\nตัวประกอบในคลิปนี้ (Supporting Cast — ไม่ใช่ผู้พูดหลัก):\n${supportingCast
          .map(
            member =>
              `- castId "${member.castId}": ${member.name}${
                member.ageRange ? ` (อายุ ${member.ageRange})` : ""
              } — ${resolveStagedCastDescriptor(member, rosterLanguage)}`
          )
          .join(
            "\n"
          )}\n\nกฎตัวประกอบ (บังคับ): ตัวประกอบไม่ใช่คู่สนทนาหลัก — บทสนทนาหลักยังเป็นของ host/guest เท่านั้น ตัวประกอบจะมีบทพูดสั้น ๆ หรือไม่มีบทพูดก็ได้ แต่ทุกครั้งที่ปรากฏในช็อตต้องมี action ที่ส่งเสริมเรื่องราว\n\nสำหรับแต่ละช็อตที่มีตัวประกอบ ให้ส่ง "castInShot" เป็น castId ทุกคนที่อยู่จริง และส่ง "supportingBeats" ที่มี {castId, action, line?} สำหรับตัวประกอบทุกคนในช็อตนั้น หากไม่มีตัวประกอบในช็อต ให้ส่ง castInShot ที่มีเฉพาะนักแสดงหลักและ supportingBeats เป็น array ว่าง. Output ที่ขาด cast/action หรือมี castId ที่ไม่รู้จักจะถูกปฏิเสธ ไม่แก้หรือตัดข้อมูลให้อัตโนมัติ`
      : "";

  // Additive (feature/marketplace-flexible-shots): the shot-count instruction
  // is now parametric. Fixed count -> state the exact number as a fact.
  // "auto" -> the shot count itself is LLM judgment: state the criterion
  // (per-shot duration) as a fact and let the model decide within 7-30 based
  // on how much content the product genuinely needs.
  const shotCountInstruction = isAutoShotCount
    ? `จำนวนช็อต: ไม่กำหนดตายตัว ให้คุณเป็นผู้ตัดสินใจเองว่าเนื้อหาของสินค้านี้ควรใช้ช็อตทั้งหมดกี่ช็อต โดยเลือกจำนวนระหว่าง 7-30 ช็อต และใช้ "ความยาวต่อช็อต" (${shotDurationSeconds} วินาที/ช็อต) เป็นเกณฑ์หลักในการตัดสินใจ — สินค้าที่มีรายละเอียด/ฟังก์ชันเยอะควรใช้จำนวนช็อตมากขึ้นเพื่อเล่าเรื่องได้ครบถ้วน ส่วนสินค้าที่เรียบง่ายใช้จำนวนช็อตน้อยกว่าได้ ให้ส่งช็อตทั้งหมดที่คุณเลือกกลับมาใน shots array (เรียง shotId ต่อเนื่อง 1 ถึงจำนวนช็อตที่เลือก)`
    : `จำนวนช็อต: วางแผนบทรีวิวทั้งหมด ${fixedShotCount} ช็อต (ช็อตละ ${shotDurationSeconds} วินาที)`;

  const selectedConceptInstruction = input.selectedConcept
    ? `\nแนวคิดที่ผู้ใช้เลือกไว้ (ต้องใช้เป็นแนวทางหลัก): ${JSON.stringify(input.selectedConcept)}`
    : "";
  const reviewFormatInstruction = isDramaTieIn
    ? `\n\nROMANTIC PRODUCT TIE-IN LOCK: รูปแบบนี้เป็นละคร Tie-in โดยมี ${activeCast[0].name} (host) และ ${activeCast[1].name} (guest) เป็นคู่ตัวละครหลัก ให้ทั้งคู่พูดโต้ตอบ จีบกันอย่างหวานพอดีหรือแซวกันอย่างเป็นธรรมชาติและมีเสน่ห์ รูปแบบรีวิวกำหนดความสัมพันธ์และวิธีดำเนินเรื่อง ส่วนโทนที่เลือกกำหนดน้ำเสียงและวิธีพูด ต้องรักษาทั้งสองอย่างร่วมกัน ไม่ใช่บทรีวิวบรรยายตรง ๆ ตลอดคลิป ทุกช็อตต้องพาเรื่องไปข้างหน้าและทำให้สินค้าเป็นส่วนหนึ่งของเหตุการณ์จริง กระจายการสาธิตสินค้าและข้อมูล/ประโยชน์ที่ตรวจสอบได้จาก product facts ไปตลอดเรื่อง ห้ามให้มุกหรือความสัมพันธ์กลบเนื้อหารีวิว ผู้พูดต้องตรงกับ castId และ castInShot ของคนที่เห็นในภาพ ห้ามสลับบทหรือเดาว่าคนไหนพูด ใช้บทโรแมนติกได้ต่อเมื่อข้อมูลระบุชัดว่าทั้งคู่เป็นผู้ใหญ่และไม่มีใครเป็นผู้เยาว์; หากอายุไม่ชัดหรือมีผู้เยาว์ ให้คงเป็นการหยอกล้อแบบเพื่อนที่เหมาะสมกับวัย ห้ามแต่งคุณสมบัติหรือผลลัพธ์ของสินค้า`
    : "";

  const conceptsOnlyInstruction = input.conceptsOnly
    ? "ผู้ใช้ยังไม่ได้เลือกแนวคิด: ส่ง 3 แนวคิดพร้อมบทพูดตัวอย่างที่เป็นธรรมชาติครบทุกแนวคิด บทพูดต้องเป็นบทสนทนาที่นำไปใช้รีวิวสินค้าได้จริง ห้ามมี shots หรือสร้าง Storyboard จนกว่าผู้ใช้จะยืนยันแนวคิด"
    : "ผู้ใช้ยืนยันแนวคิดแล้ว: ใช้แนวคิดและ dialoguePreview ที่แนบมาเป็นต้นฉบับหลัก รักษาน้ำเสียงและบทสนทนาที่เลือกไว้ แล้วจึงจัดเป็น Storyboard ฉบับเต็ม โดยให้บทพูดของทุกช็อตพัฒนาต่อจาก dialoguePreview นั้น";
  const runtimeInstructions = `
คุณคือผู้เชี่ยวชาญด้านการวางแผนบท Storyboard และรีวิวสินค้า Marketplace (Marketplace Auto Review Storyboard Specialist)

หน้าที่ของคุณคือวิเคราะห์ข้อมูลสินค้าและ Product brief ที่ได้รับ แล้วสร้างแนวคิดรีวิว 3 แบบที่แตกต่างกัน จากนั้นเลือกแนวคิดที่เหมาะที่สุด 1 แบบและวางแผนบทรีวิวฉบับเต็มตามแนวคิดนั้น:
0. ${shotCountInstruction}
1. ส่ง conceptOptions จำนวน 3 แบบพอดี แต่ละแบบมี conceptId, title, angle, storySummary และ dialoguePreview ที่เขียนเป็นบทพูดจริง ไม่ใช่หัวข้อหรือคำอธิบาย
2. ${conceptsOnlyInstruction}
3. โครงสร้างการเล่าเรื่อง (Storytelling Structure): วางลำดับช็อตทั้งหมดตามโครงสร้าง "${structureKey}" โดยกำหนดชื่อช็อต (title) และสรุปการถ่ายทำ (visualSummary) ให้เห็นภาพชัดเจน
4. โทนการพูด (Review Tone): บทพูดเสียงพากย์ภาษาไทย (dialogue) ในทุกช็อตต้องสื่อสารด้วยโทน "${toneKey}" อย่างเป็นธรรมชาติ และสอดคล้องกับตัวตนสินค้าจริง
5. ความจริงใจจากข้อมูลสินค้า: อ้างอิงเฉพาะฟังก์ชัน วัสดุ และจุดเด่นที่มีหลักฐานจากสินค้า ห้ามกล่าวอ้างเกินจริง
6. ความยาวบทพูด: บทพูดภาษาไทยของแต่ละช็อตควรกระชับ อ่านจบได้ภายใน ${dialogueWindowMinSeconds}-${shotDurationSeconds} วินาที
7. บทพูดทุกแบบต้องเป็นภาษาพูดธรรมชาติ มีบทสนทนาที่ตอบรับกันตามบริบท ห้ามใช้คำถามเปิดหรือประโยคตอบแบบแม่แบบซ้ำ ห้ามใช้ถ้อยคำกว้าง ๆ เช่น “เล่าให้ฟังหน่อยว่าเรื่อง...” หรือ “เบื่อและหงุดหงิดไหมกับปัญหาเดิมๆ” ให้พูดถึงเหตุการณ์ การใช้งาน หรือรายละเอียดสินค้าที่มีหลักฐานจริงโดยตรง
8. ห้ามใช้ placeholder เช่น “เผยสินค้า” เป็นเนื้อหาบทพูด แต่ใช้เป็นชื่อช็อตได้
9. เรื่องย่อ (storySummary): สรุปเรื่องย่อรวมทุกช็อตที่ระบุประเด็น Hook, Problem, Insight, Proof, CTA อย่างชัดเจน${reviewFormatInstruction}${selectedConceptInstruction}${castRosterBlock}${supportingCastBlock}`;
  const systemPrompt = `${skillInstructions}\n\n${runtimeInstructions}`;

  const userMessage = JSON.stringify(
    {
      productName,
      productDescription: productDescription || undefined,
      productSpecs: input.product.specs,
      ...(isDramaTieIn ? { reviewFormat: "drama_tie_in" } : {}),
      storytellingStructure: structureKey,
      reviewTone: toneKey,
      revisionNotes: revisionNotes || undefined,
      selectedConcept: input.selectedConcept,
      // Include the roster for ANY named cast (solo presenter included) —
      // see castRosterBlock's solo branch above.
      ...(activeCast.length > 0
        ? {
            cast: activeCast.map(member => ({
              castId: member.castId,
              name: member.name,
              role: member.role,
              ageRange: member.ageRange ?? null,
              depictsMinor: member.depictsMinor ?? null,
            })),
          }
        : {}),
    },
    null,
    2
  );

  const ZodDialogueTurnSchema = z.object({
    castId: z.string().min(1).max(80),
    line: z.string().min(1).max(320),
  });

  // Supporting tier (`planning/marketplace-four-character-cast/plan.md` §3).
  // `action` required, `line` optional — the inverse of a dialogue turn.
  const ZodSupportingBeatSchema = z.object({
    castId: z.string().min(1).max(80),
    action: z.string().min(1).max(240),
    line: z.string().min(1).max(160).optional(),
  });

  const shotObjectSchema = z.object({
    shotId: z.number().int().min(1).max(30),
    title: z.string().min(1).max(120),
    storySummary: z.string().min(1).max(600),
    visualSummary: z.string().min(1).max(400),
    dialogue: z.string().min(1).max(320).optional(),
    dialogueTurns: z.array(ZodDialogueTurnSchema).min(2).optional(),
    castInShot: z.array(z.string().min(1).max(80)).optional(),
    supportingBeats: z.array(ZodSupportingBeatSchema).optional(),
  });

  const ZodLLMPlanSchema = z.object({
    storySummary: z.string(),
    conceptOptions: z
      .array(
        z.object({
          conceptId: z.string().min(1),
          title: z.string().min(1),
          angle: z.string().min(1),
          storySummary: z.string().min(1),
          dialoguePreview: z.string().trim().min(40).max(6000),
        })
      )
      .length(3),
    selectedConceptId: z.string().optional(),
    ...(input.conceptsOnly
      ? {}
      : {
          shots: isAutoShotCount
            ? z.array(shotObjectSchema).min(7).max(30)
            : z.array(shotObjectSchema).length(fixedShotCount ?? 9),
        }),
  });

  try {
    const llmRes = await callLLMStructured({
      systemPrompt,
      userMessage,
      model: chosenModel,
      zodSchema: ZodLLMPlanSchema,
      userId,
      tenantId,
      maxRetries: 0,
      disableProviderFallbacks: true,
      billingDescription: `Staged Story Arc Plan generation (${chosenModel})`,
    });

    const authoringModel = clean(llmRes.modelId);
    const authoringProvider = clean(llmRes.providerName);
    if (!authoringModel || !authoringProvider) {
      throw new Error("STAGED_STORY_PLAN_PROVIDER_PROVENANCE_MISSING");
    }

    if (input.conceptsOnly) {
      const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
      const conceptOptions = llmRes.data.conceptOptions.map(option => ({
        conceptId: clean(option.conceptId),
        title: clean(option.title),
        angle: clean(option.angle),
        storySummary: clean(option.storySummary),
        dialoguePreview: clean(option.dialoguePreview),
      }));
      if (
        conceptOptions.some(
          option =>
            !option.conceptId ||
            !option.title ||
            !option.angle ||
            !option.storySummary ||
            option.dialoguePreview.length < 40
        ) ||
        new Set(conceptOptions.map(option => option.conceptId)).size !== 3 ||
        new Set(
          conceptOptions.map(option =>
            option.dialoguePreview
              .replace(/^[^:：]{1,40}[:：]\s*/gm, "")
              .replace(/[\s\p{P}\p{S}]/gu, "")
              .toLocaleLowerCase()
          )
        ).size !== 3
      ) {
        throw new Error("STAGED_STORY_PLAN_CONCEPT_OPTIONS_INVALID");
      }
      const storySummary = conceptOptions
        .map((option, index) => `${index + 1}. ${option.title}: ${option.storySummary}`)
        .join("\n");
      return {
        planRevision,
        title: `Review concepts (LLM: ${chosenModel})`,
        storySummary,
        conceptOptions,
        product: {
          productId: clean(input.product.productId),
          productName,
          description: productDescription || null,
          ...(input.product.specs ? { specs: input.product.specs } : {}),
          imageUrls: input.product.imageUrls.map(clean).filter(Boolean).slice(0, 5),
        },
        shots: [],
        referenceManifestHash,
        storyPlanHash: buildProductionStableHash({
          runId: input.runId,
          planRevision,
          conceptOptions,
          referenceManifestHash,
        }),
        source: "llm_story_arc",
        authoring: {
          model: authoringModel,
          provider: authoringProvider,
          creditsUsed: llmRes.creditsUsed,
        },
        languagePlan: input.languagePlan,
        ...(activeCast.length > 0
          ? { cast: activeCast, conversationMode }
          : {}),
      };
    }

    const generatedShots = Array.isArray((llmRes.data as any).shots)
      ? (llmRes.data as any).shots
      : [];
    const rawShotCount = generatedShots.length;
    const rawShotCountOk = isAutoShotCount
      ? rawShotCount >= 7 && rawShotCount <= 30
      : rawShotCount === (fixedShotCount ?? 9);

    if (rawShotCountOk) {
      const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
      const storySummary = clean(llmRes.data.storySummary);
      if (!storySummary || storySummary.length > 500) {
        throw new Error("STAGED_STORY_PLAN_SUMMARY_INVALID");
      }
      const generatedConceptOptions = llmRes.data.conceptOptions.map(
        option => ({
          conceptId: clean(option.conceptId),
          title: clean(option.title),
          angle: clean(option.angle),
          storySummary: clean(option.storySummary),
          dialoguePreview: clean(option.dialoguePreview),
        })
      );
      const selectedConceptId = input.selectedConcept?.conceptId ?? "";
      const selectedOption = generatedConceptOptions.find(
        option => option.conceptId === selectedConceptId
      );
      if (input.selectedConcept && !selectedOption) {
        throw new Error("STAGED_STORY_PLAN_SELECTED_CONCEPT_NOT_RETURNED");
      }
      const conceptOptions = input.selectedConcept
        ? generatedConceptOptions.map(option =>
            option.conceptId === selectedConceptId
              ? input.selectedConcept!
              : option
          )
        : generatedConceptOptions;
      const castById = new Map(
        activeCast.map(member => [member.castId, member])
      );
      const shots = generatedShots.map((shot: z.infer<typeof shotObjectSchema>, idx: number) => {
        const shotId = idx + 1;
        let dialogueTurns: StagedDialogueTurn[] | undefined;
        let castInShot: string[] | undefined;
        let dialogue: string;

        if (conversationMode === "two_person_conversation") {
          if (
            !Array.isArray(shot.dialogueTurns) ||
            shot.dialogueTurns.length < 2
          ) {
            throw new Error(
              `STAGED_STORY_PLAN_DIALOGUE_TURNS_REQUIRED:shot-${shotId}`
            );
          }
          const resolvedTurns = shot.dialogueTurns.map(turn => {
            const member = castById.get(turn.castId);
            if (!member) {
              throw new Error(
                `STAGED_STORY_PLAN_DIALOGUE_SPEAKER_NOT_IN_CAST:shot-${shotId}:${turn.castId}`
              );
            }
            if (!activeCast.some(lead => lead.castId === turn.castId)) {
              throw new Error(
                `STAGED_STORY_PLAN_DIALOGUE_SPEAKER_NOT_LEAD:shot-${shotId}:${turn.castId}`
              );
            }
            return {
              castId: member.castId,
              speakerName: member.name,
              line: clean(turn.line),
            } satisfies StagedDialogueTurn;
          });
          if (resolvedTurns.some(turn => !turn.line)) {
            throw new Error(
              `STAGED_STORY_PLAN_DIALOGUE_LINE_REQUIRED:shot-${shotId}`
            );
          }
          dialogueTurns = resolvedTurns;
          dialogue = renderStagedDialogueFromTurns(resolvedTurns);
          castInShot = activeCast.map(member => member.castId);
        } else {
          dialogue = clean(shot.dialogue);
          if (!dialogue)
            throw new Error(
              `STAGED_STORY_PLAN_DIALOGUE_REQUIRED:shot-${shotId}`
            );
        }

        const declaredCastInShot = shot.castInShot;
        if (activeCast.length > 0 && !declaredCastInShot) {
          throw new Error(
            `STAGED_STORY_PLAN_CAST_IN_SHOT_REQUIRED:shot-${shotId}`
          );
        }
        if (declaredCastInShot) {
          const invalidCastId = declaredCastInShot.find(
            castId => !castById.has(castId)
          );
          if (invalidCastId) {
            throw new Error(
              `STAGED_STORY_PLAN_CAST_NOT_IN_ROSTER:shot-${shotId}:${invalidCastId}`
            );
          }
          const missingSpeaker = (dialogueTurns ?? []).find(
            turn => !declaredCastInShot.includes(turn.castId)
          );
          if (missingSpeaker) {
            throw new Error(
              `STAGED_STORY_PLAN_SPEAKER_NOT_IN_SHOT:shot-${shotId}:${missingSpeaker.castId}`
            );
          }
        }
        const supportingBeats = (shot.supportingBeats ?? []).map(beat => {
          if (!castById.has(beat.castId)) {
            throw new Error(
              `STAGED_STORY_PLAN_SUPPORTING_CAST_NOT_IN_ROSTER:shot-${shotId}:${beat.castId}`
            );
          }
          if (!clean(beat.action)) {
            throw new Error(
              `STAGED_STORY_PLAN_SUPPORTING_ACTION_REQUIRED:shot-${shotId}:${beat.castId}`
            );
          }
          return {
            castId: beat.castId,
            action: clean(beat.action),
            ...(clean(beat.line) ? { line: clean(beat.line) } : {}),
          };
        });

        return {
          shotId,
          title: clean(shot.title),
          storySummary: clean(shot.storySummary),
          visualSummary: clean(shot.visualSummary),
          dialogue,
          durationSeconds: shotDurationSeconds,
          ...(dialogueTurns ? { dialogueTurns } : {}),
          ...(declaredCastInShot ? { castInShot: declaredCastInShot } : {}),
          ...(supportingBeats.length > 0 ? { supportingBeats } : {}),
        };
      });

      const { shots: enforcedShots } = enforceSupportingBeats({
        shots,
        cast: input.cast,
      });

      const normalizedDialogue = enforcedShots.map(shot =>
        clean(shot.dialogue)
          .replace(/^[^:：]{1,40}[:：]\s*/gm, "")
          .replace(/[\s\p{P}\p{S}]/gu, "")
          .toLocaleLowerCase()
      );
      if (new Set(normalizedDialogue).size !== normalizedDialogue.length) {
        throw new Error("STAGED_STORY_PLAN_REPEATED_DIALOGUE");
      }
      if (
        enforcedShots.some(shot =>
          /เล่าให้ฟังหน่อยว่าเรื่อง|เบื่อและหงุดหงิดไหมกับปัญหาเดิม|ช็อตนี้พามาดูจุดชวนหัวเสีย|เผยสินค้า/.test(
            shot.dialogue
          )
        )
      ) {
        throw new Error("STAGED_STORY_PLAN_GENERIC_DIALOGUE");
      }

      // Additive (feature/marketplace-flexible-shots): re-validate the final
      // shot contract (ids 1..N unique ascending, duration in range) before
      // trusting the LLM output. Fixed count -> exact match; auto -> range.
      const contract = validateStagedShotContract(
        enforcedShots.map(shot => ({
          shotId: shot.shotId,
          durationSeconds: shot.durationSeconds,
        })),
        isAutoShotCount ? {} : { expectedCount: fixedShotCount }
      );

      if (!contract.valid) {
        throw new Error(
          `staged_story_plan_invalid:${contract.reasonCodes.join(",")}`
        );
      }
      {
        const storyPlanHash = buildProductionStableHash({
          runId: input.runId,
          planRevision,
          selectedConceptId,
          conceptOptions,
          storySummary,
          shots: enforcedShots.map(s => `${s.shotId}:${s.title}:${s.dialogue}`),
        });

        return {
          planRevision,
          title: `Staged Story Arc (LLM: ${chosenModel})`,
          storySummary,
          conceptOptions,
          selectedConceptId,
          product: {
            productId: clean(input.product.productId),
            productName,
            description: productDescription || null,
            ...(input.product.specs ? { specs: input.product.specs } : {}),
            imageUrls: input.product.imageUrls
              .map(clean)
              .filter(Boolean)
              .slice(0, 5),
          },
          shots: enforcedShots,
          referenceManifestHash,
          storyPlanHash,
          source: "llm_story_arc",
          authoring: {
            model: authoringModel,
            provider: authoringProvider,
            creditsUsed: llmRes.creditsUsed,
          },
          languagePlan: input.languagePlan,
          ...(activeCast.length > 0
            ? { cast: activeCast, conversationMode }
            : {}),
        };
      }
    }
  } catch (error) {
    console.warn(
      `[generateStagedStoryArcPlanWithLLM] direct LLM call failed for model ${chosenModel}:`,
      error
    );
    throw new Error(
      `STAGED_STORY_PLAN_SKILL_FAILED:${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  throw new Error("STAGED_STORY_PLAN_SKILL_RETURNED_NO_PLAN");
}
