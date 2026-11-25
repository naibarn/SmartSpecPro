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
  isRepeatedReviewConcept,
  type UsedReviewConcept,
} from "./marketplaceAutoReviewUsedConcepts";
import {
  isMarketplaceCastLeadRole,
  type MarketplaceCharacterCastRole,
} from "../../shared/hyperframes/characterCast";
import {
  castIdForCharacterIndex,
  type ShotCastLook,
} from "../../shared/marketplaceAutoReview/shotCast";
import {
  normalizeStagedDialogueTranscript,
  normalizeStagedSpeakerLine,
} from "../../shared/marketplaceAutoReview/stagedDialogue";

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

const STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_MAX_CHARS = 500;

function boundStagedStoryPlanProductDescription(
  value: string | null | undefined
): string {
  const description = clean(value);
  if (description.length <= STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_MAX_CHARS) {
    return description;
  }
  let bounded = "";
  for (const character of description) {
    if (
      bounded.length + character.length >
      STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_MAX_CHARS - 1
    ) {
      break;
    }
    bounded += character;
  }
  return `${bounded.trimEnd()}…`;
}

function buildStagedStoryPlanSummary(input: {
  summary?: string | null;
  selectedConcept?: StagedStoryConceptOption;
  shots: Array<{
    title?: string | null;
    storySummary?: string | null;
    visualSummary?: string | null;
  }>;
}): string {
  const authoredSummary = clean(input.summary);
  if (authoredSummary) return authoredSummary;

  const shotSummary = input.shots
    .map((shot, index) => {
      const title = clean(shot.title) || `Shot ${index + 1}`;
      const summary = clean(shot.storySummary) || clean(shot.visualSummary);
      return summary ? `${title}: ${summary}` : "";
    })
    .filter(Boolean)
    .join(" ");
  const summary = shotSummary || clean(input.selectedConcept?.storySummary);
  return Array.from(summary).slice(0, 500).join("").trim();
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

/** A stated under-18 age or explicit minor flag always removes dialogue rights. */
export function isStagedCastMemberMinor(
  member: Pick<StagedCastMember, "ageRange" | "depictsMinor">
): boolean {
  if (member.depictsMinor === true) return true;
  const age = clean(member.ageRange)
    .slice(0, 80)
    .normalize("NFKC")
    .toLocaleLowerCase();
  if (!age) return false;
  if (
    /\b(?:minor|child|children|kid|teen|teenager|underage|under\s*18|below\s*18|younger\s+than\s+18)\b|<\s*18|เด็ก|เยาวชน|วัยรุ่น|ผู้เยาว์|ต่ำกว่า\s*18/.test(
      age
    )
  ) {
    return true;
  }
  if (/\b(?:late|mid|early)\s+teens\b/.test(age)) return true;
  const statedAges = Array.from(age.matchAll(/\d+(?:\.\d+)?/g), match =>
    Number(match[0])
  ).filter(Number.isFinite);
  return statedAges.some(value => value < 18);
}

function normalizeStagedCastName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Remove named minor dialogue lines before any video or voiceover dispatch. */
export function removeStagedMinorDialogueLines(
  dialogue: string,
  cast: readonly StagedCastMember[] | null | undefined
): string {
  const normalizedDialogue = normalizeStagedDialogueTranscript(dialogue);
  const minorNames = new Set(
    (cast ?? [])
      .filter(isStagedCastMemberMinor)
      .map(member => normalizeStagedCastName(member.name))
  );
  if (minorNames.size === 0) return normalizedDialogue;
  return normalizedDialogue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => {
      const match = line.match(/^([^:\n]{1,100}):\s*.+$/);
      return !match || !minorNames.has(normalizeStagedCastName(match[1]!));
    })
    .join("\n");
}

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
  const members = (cast ?? []).filter(member => !isStagedCastMemberMinor(member));
  const host = members.find(member => member.role === "host");
  const guest = members.find(member => member.role === "guest");
  return [host, guest].filter((member): member is StagedCastMember => !!member);
}

/** The non-speaking tier — present for atmosphere/story beats. */
export function selectStagedSupportingCast(
  cast: StagedCastMember[] | null | undefined
): StagedCastMember[] {
  return (cast ?? []).filter(
    member =>
      isStagedCastMemberMinor(member) || !isMarketplaceCastLeadRole(member.role)
  );
}

type StagedSupportingBeatInput = StagedSupportingBeat | string;

/**
 * Providers occasionally flatten a supporting beat object to a plain action
 * string even though the skill contract asks for `{ castId, action }`. Recover
 * that shorthand only when its owner is unambiguous from the shot's cast list
 * (or there is exactly one supporting member in the whole roster). If it is
 * ambiguous, omit the unsupported extras instead of assigning an action to the
 * wrong person or failing the entire story plan.
 */
function normalizeStagedSupportingBeatInputs(params: {
  beats: StagedSupportingBeatInput[];
  castInShot?: string[];
  cast: StagedCastMember[];
}): {
  beats: StagedSupportingBeat[];
  castInShot?: string[];
  droppedAmbiguousBeatCount: number;
} {
  const supportIds = new Set(
    selectStagedSupportingCast(params.cast).map(member => member.castId)
  );
  const explicitBeats = params.beats.filter(
    (beat): beat is StagedSupportingBeat => typeof beat !== "string"
  );
  const shorthandActions = params.beats
    .filter((beat): beat is string => typeof beat === "string")
    .map(clean)
    .filter(Boolean);
  const explicitSupportIds = new Set(
    explicitBeats
      .filter(beat => supportIds.has(beat.castId))
      .map(beat => beat.castId)
  );
  let normalizedCastInShot = params.castInShot
    ? [...params.castInShot]
    : undefined;
  if (!normalizedCastInShot && explicitSupportIds.size > 0) {
    normalizedCastInShot = [];
  }
  if (normalizedCastInShot) {
    for (const castId of explicitSupportIds) {
      if (!normalizedCastInShot.includes(castId)) {
        normalizedCastInShot.push(castId);
      }
    }
  }
  const visibleSupportIds = (normalizedCastInShot ?? []).filter(
    (castId, index, values) =>
      supportIds.has(castId) && values.indexOf(castId) === index
  );
  let unassignedVisibleSupportIds = visibleSupportIds.filter(
    castId => !explicitSupportIds.has(castId)
  );

  // A single supporting actor plus one shorthand beat is a safe recovery even
  // when the model forgot to repeat that actor in castInShot.
  if (
    unassignedVisibleSupportIds.length === 0 &&
    shorthandActions.length === 1 &&
    supportIds.size === 1
  ) {
    const onlySupportId = params.cast.find(member =>
      supportIds.has(member.castId)
    )?.castId;
    if (onlySupportId && !explicitSupportIds.has(onlySupportId)) {
      unassignedVisibleSupportIds = [onlySupportId];
      if (!normalizedCastInShot) normalizedCastInShot = [];
      if (!normalizedCastInShot.includes(onlySupportId)) {
        normalizedCastInShot.push(onlySupportId);
      }
    }
  }

  const canMapByShotOrder =
    shorthandActions.length > 0 &&
    shorthandActions.length === unassignedVisibleSupportIds.length;
  const beats = [...explicitBeats];
  if (canMapByShotOrder) {
    shorthandActions.forEach((action, index) => {
      const castId = unassignedVisibleSupportIds[index];
      if (castId) beats.push({ castId, action });
    });
  }

  let droppedAmbiguousBeatCount = 0;
  if (shorthandActions.length > 0 && !canMapByShotOrder) {
    droppedAmbiguousBeatCount = shorthandActions.length;
    if (normalizedCastInShot) {
      const supportedIdsWithActions = new Set([...explicitSupportIds]);
      for (const castId of [...normalizedCastInShot]) {
        if (supportIds.has(castId) && !supportedIdsWithActions.has(castId)) {
          normalizedCastInShot.splice(normalizedCastInShot.indexOf(castId), 1);
        }
      }
    }
  }

  return {
    beats,
    ...(normalizedCastInShot ? { castInShot: normalizedCastInShot } : {}),
    droppedAmbiguousBeatCount,
  };
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
  return turns
    .map(
      turn =>
        `${turn.speakerName}: ${normalizeStagedSpeakerLine(turn.speakerName, turn.line)}`
    )
    .join("\n");
}

function parseSpeakerNamedDialogue(
  dialogue: string
): Array<{ speakerName: string; line: string }> | undefined {
  const lines = normalizeStagedDialogueTranscript(dialogue)
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
  /** User-approved per-shot override used by video prompt generation. */
  approvedShotAction?: string;
  /** True only when the specific marketplace product is physically visible
   * in this shot. New plans always author this; older plans infer it from the
   * visual direction so dialogue alone cannot pull the product into frame. */
  productInShot?: boolean;
  /** Optional authored direction kept separate so later prompt stages do not
   * flatten every shot into the same static camera/movement defaults. */
  cameraDirection?: string;
  movementDirection?: string;
  transition?: string;
  dialogue: string;
  durationSeconds: number;
  // Additive (opt-in): only populated when `conversationMode ===
  // "two_person_conversation"`. Absent shots stay exactly as they were.
  dialogueTurns?: StagedDialogueTurn[];
  castInShot?: string[];
  /** Per-shot business for the supporting tier. See `StagedSupportingBeat`. */
  supportingBeats?: StagedSupportingBeat[];
};

export type StagedDialogueQcIssue =
  | "none"
  | "awkward_wording"
  | "written_or_promotional"
  | "weak_response";

export type StagedDialogueQcReview = {
  shotId: number;
  verdict: "natural" | "revised";
  issue: StagedDialogueQcIssue;
  dialogue?: string;
  dialogueTurns?: Array<{ castId: string; line: string }>;
};

/**
 * Apply the dialogue editor's result without allowing it to alter story beats,
 * speaker identities, shot timing, or any other authored shot fields.
 */
export function applyStagedDialogueQcReviews(
  shots: StagedStoryArcShot[],
  reviews: StagedDialogueQcReview[],
  conversationMode: StagedConversationMode
): StagedStoryArcShot[] {
  const shotIds = shots.map(shot => shot.shotId);
  const reviewIds = reviews.map(review => review.shotId);
  if (
    reviews.length !== shots.length ||
    new Set(reviewIds).size !== reviewIds.length ||
    shotIds.some(shotId => !reviewIds.includes(shotId)) ||
    reviewIds.some(shotId => !shotIds.includes(shotId))
  ) {
    throw new Error("STAGED_DIALOGUE_QC_REVIEW_SET_INVALID");
  }

  const reviewByShotId = new Map<number, StagedDialogueQcReview>();
  for (const review of reviews) {
    reviewByShotId.set(review.shotId, review);
  }
  return shots.map(shot => {
    const review = reviewByShotId.get(shot.shotId)!;
    if (review.verdict === "natural") {
      if (
        review.issue !== "none" ||
        review.dialogue !== undefined ||
        review.dialogueTurns !== undefined
      ) {
        throw new Error(
          `STAGED_DIALOGUE_QC_NATURAL_REVIEW_HAS_REVISION:shot-${shot.shotId}`
        );
      }
      return shot;
    }

    if (review.issue === "none") {
      throw new Error(
        `STAGED_DIALOGUE_QC_REVISION_REASON_REQUIRED:shot-${shot.shotId}`
      );
    }

    if (conversationMode === "two_person_conversation") {
      const originalTurns = shot.dialogueTurns;
      const revisedTurns = review.dialogueTurns;
      if (
        !originalTurns ||
        !revisedTurns ||
        revisedTurns.length !== originalTurns.length ||
        review.dialogue !== undefined
      ) {
        throw new Error(
          `STAGED_DIALOGUE_QC_REVISED_TEXT_REQUIRED:shot-${shot.shotId}`
        );
      }
      if (
        revisedTurns.some(
          (turn, index) => turn.castId !== originalTurns[index]?.castId
        )
      ) {
        throw new Error(
          `STAGED_DIALOGUE_QC_SPEAKER_ORDER_CHANGED:shot-${shot.shotId}`
        );
      }
      const dialogueTurns = originalTurns.map((turn, index) => {
        const line = normalizeStagedSpeakerLine(
          turn.speakerName,
          clean(revisedTurns[index].line)
        );
        if (!line || line.length > 320) {
          throw new Error(
            `STAGED_DIALOGUE_QC_REVISED_LINE_INVALID:shot-${shot.shotId}`
          );
        }
        return { ...turn, line };
      });
      const dialogue = renderStagedDialogueFromTurns(dialogueTurns);
      if (dialogue.length > 320) {
        throw new Error(
          `STAGED_DIALOGUE_QC_REVISED_TEXT_TOO_LONG:shot-${shot.shotId}`
        );
      }
      return { ...shot, dialogue, dialogueTurns };
    }

    if (review.dialogueTurns !== undefined) {
      throw new Error(
        `STAGED_DIALOGUE_QC_SPEAKER_MODE_CHANGED:shot-${shot.shotId}`
      );
    }
    const dialogue = normalizeStagedDialogueTranscript(clean(review.dialogue));
    if (!dialogue || dialogue.length > 320) {
      throw new Error(
        `STAGED_DIALOGUE_QC_REVISED_TEXT_REQUIRED:shot-${shot.shotId}`
      );
    }
    return { ...shot, dialogue };
  });
}

export function buildStagedDialogueNaturalnessQcSystemPrompt(
  language: "th" | "en"
): string {
  if (language === "th") {
    return [
      "คุณเป็นบรรณาธิการบทพูดภาษาไทยสำหรับเรื่องสั้นและวิดีโอรีวิว ตรวจบทพูดทุกช็อตจากสถานการณ์และบริบทที่ให้มา แล้วแก้เฉพาะช็อตที่ฟังไม่เหมือนคนไทยพูดกันจริง",
      "บทพูดที่ผ่านต้องพูดออกเสียงได้ลื่น เป็นภาษาพูดที่เหมาะกับตัวละครและสถานการณ์ แต่ละคนต้องตอบรับสิ่งที่อีกคนพูดหรือทำ ห้ามให้ตัวละครพูดสรุปภาพที่คนดูเห็นอยู่แล้ว และอย่าเพิ่มความยาวจนพูดไม่ทันเวลาของช็อต",
      "ให้แก้เมื่อพบสำนวนภาษาเขียน/แปลตรงตัว คำจับคู่กันไม่เป็นธรรมชาติ ประโยคบรรยายความรู้ หรือภาษาขายของ เช่น ‘ควรแยกดูแล...ให้ตรงจุด’ ให้ใช้คำที่คนพูดจริงตามบริบท เช่น พูดถึงความมันที่ ‘โคนผม’ เมื่อหมายถึงรากผม แทนการใช้คำที่ฟังเหมือนข้อความบนฉลาก",
      "ตัวอย่างสำนวนแข็ง: ‘ถ้าเริ่มมันเร็ว ควรแยกดูแลหนังศีรษะกับเส้นผมให้ตรงจุด’ ปรับเป็นบทสนทนาที่ตอบกับสถานการณ์จริง เช่น ‘โคนผมมันเร็วเหรอ? งั้นลองเริ่มดูแลตรงโคนก่อนนะ’ อย่าคัดลอกตัวอย่างนี้หากไม่เข้ากับฉาก",
      "แก้ให้น้อยที่สุด รักษาใจความ อารมณ์ ความสัมพันธ์ ข้อเท็จจริงของสินค้า และลำดับผู้พูด ห้ามเพิ่มคุณสมบัติหรือผลลัพธ์ของสินค้า ราคา โปรโมชัน หรือคำกล่าวอ้างใหม่ ห้ามเปลี่ยนภาษาที่เลือก",
      "ตอบ JSON ตาม schema เท่านั้น โดยให้รีวิวครบทุก shotId: ใช้ verdict natural และ issue none เมื่อบทพูดเป็นธรรมชาติแล้ว; ใช้ verdict revised พร้อม issue ที่ตรงสาเหตุและข้อความแก้ไขเมื่อจำเป็น; issue ใช้ได้เฉพาะ none, awkward_wording, written_or_promotional, weak_response; อย่าเขียนทับบทที่เป็นธรรมชาติอยู่แล้ว",
      "สำหรับบทพูดสองคน ให้คืน dialogueTurns ทุกครั้งที่มีการแก้ โดยใช้ castId เดิมทุกตัว เรียงผู้พูดและจำนวนเทิร์นเดิม ห้ามเปลี่ยนชื่อหรือสลับผู้พูด; ส่งเฉพาะคำพูดใน line ไม่ใส่ชื่อผู้พูด",
      "สำหรับบทพูดคนเดียว ให้คืน dialogue ที่แก้แล้วเมื่อจำเป็น ห้ามเปลี่ยนข้อเท็จจริงหรือเพิ่มเนื้อหาใหม่",
    ].join("\n\n");
  }
  return [
    "You are a dialogue editor for short stories and product-review videos. Review every shot in context and revise only dialogue that does not sound like something a person would naturally say in that exact situation.",
    "Accepted dialogue must be easy to say aloud, fit the character and situation, and respond to the previous line or action. Do not make a character narrate what viewers can already see or make a line too long to speak within its shot duration.",
    "Revise stiff written language, literal translations, unnatural collocations, generic advice, or promotional copy. Keep the voice conversational and specific to the moment.",
    "Make the smallest change that improves naturalness. Preserve meaning, emotion, relationships, product facts, and speaker order. Do not add product features, outcomes, prices, promotions, or other claims. Keep the selected language.",
    "Return JSON matching the schema and review every shotId: use verdict natural with issue none when the dialogue already sounds natural; use verdict revised with the matching issue and corrected text when needed. Allowed issue values are none, awkward_wording, written_or_promotional, and weak_response. Do not rewrite dialogue that is already natural.",
    "For two-person dialogue, return dialogueTurns for every revised shot using the exact original castIds, turn count, and speaker order. Each line contains only spoken words, never a speaker name.",
    "For solo dialogue, return the revised dialogue string only when needed. Do not change facts or add new content.",
  ].join("\n\n");
}

export function isStagedProductVisibleInShot(
  shot: Pick<StagedStoryArcShot, "productInShot" | "visualSummary" | "movementDirection">,
  productName?: string | null,
): boolean {
  if (typeof shot.productInShot === "boolean") return shot.productInShot;

  const visualText = `${shot.visualSummary} ${shot.movementDirection ?? ""}`
    .normalize("NFKC")
    .toLocaleLowerCase();
  // Legacy plans have no explicit visibility field. Preserve their authored
  // staging: a clearly generic prop (such as the plain basin in the opening
  // of a pet-fountain story) must not be replaced by the attached product.
  if (/\b(?:ordinary|generic|plain|unbranded)\b.{0,50}\b(?:bowl|basin|container|prop)\b|กะละมัง|ภาชนะน้ำเปล่า|ชาม(?:น้ำ)?(?:ธรรมดา|เปล่า)|ชามกว้าง/u.test(visualText)) {
    return false;
  }
  const normalizedProductName = clean(productName).normalize("NFKC").toLocaleLowerCase();
  if (normalizedProductName && visualText.includes(normalizedProductName)) return true;
  return /\b(?:product|appliance|machine|device|fountain)\b|สินค้า|ผลิตภัณฑ์|ตัวเครื่อง|น้ำพุแมว|เครื่องชงกาแฟ|สินค้าอ้างอิง/u.test(visualText);
}

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
  expectedShotCount?: number | "auto";
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

export function buildStagedImagePrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  customManifest?: Array<{ url: string; role?: string; label?: string; active?: boolean }>;
  /** This shot's per-shot look overrides, keyed by castId. Absent = default
   *  looks, which is every pre-existing run. */
  castLooks?: Record<string, ShotCastLook> | null;
}): string {
  const thai = input.plan.languagePlan?.promptLanguage === "th";
  const dialogue = normalizeStagedDialogueTranscript(input.shot.dialogue);

  const activeItems = (input.customManifest || []).filter(
    item => item && typeof item.url === "string" && item.url.trim() && item.active !== false
  );
  const showProduct = isStagedProductVisibleInShot(
    input.shot,
    input.plan.product.productName,
  );
  const productItems = showProduct
    ? activeItems.filter(item => item.role !== "character")
    : [];
  // Only THIS shot's characters — the same helper the dispatch path uses, so
  // the `@ImageN` tags written below always match the images actually sent
  // (`planning/marketplace-four-character-cast/plan.md` §5).
  //
  // The ORIGINAL manifest index is carried alongside, because `castId` and the
  // `plan.cast` lookup are both positional over the FULL character list —
  // indexing them by position in the filtered list would attribute shot 3's
  // lone supporting character to `cast-1`.
  const allCharacterItems = activeItems.filter(item => item.role === "character");
  const shotCastIds = new Set(input.shot.castInShot ?? []);
  const characterEntries = allCharacterItems
    .map((item, castIndex) => ({ item, castIndex }))
    .filter(
      entry =>
        shotCastIds.size === 0 ||
        shotCastIds.has(castIdForCharacterIndex(entry.castIndex)),
    );
  const characterItems = characterEntries.map(entry => entry.item);

  const hasProduct = productItems.length > 0;
  const hasCharacter = characterItems.length > 0;
  // Count-aware: only >=2 character reference items switch on the cast
  // roster + two-shot staging rules. Exactly 0 or 1 character items keep the
  // original single-tag `hasCharacter` behavior byte-for-byte.
  //
  // NOTE this is deliberately about how many people are IN THE FRAME, not how
  // many of them speak — it drives the two-shot/over-the-shoulder staging
  // language, which a host plus a silent supporting character needs just as
  // much as two speakers. `resolveStagedConversationMode` (leads only) remains
  // the authority for DIALOGUE.
  const isConversation = characterItems.length >= 2;

  const productTags = hasProduct
    ? productItems.map((_, i) => `@Image${i + 1}`).join(", ")
    : "";

  const productCount = hasProduct ? productItems.length : 0;
  const characterTags = hasCharacter
    ? characterItems.map((_, i) => `@Image${productCount + i + 1}`).join(", ")
    : "";

  // Cast roster: names/roles/descriptors come from `plan.cast` (matched by
  // position against the active character items); falls back to the
  // manifest's own `label` or a generic "Person N" when `plan.cast` hasn't
  // been wired by the caller yet.
  // EVERY active character is in the frame and therefore in the roster — the
  // old `.slice(0, 2)` silently dropped supporting characters from the prompt
  // while still sending their reference images, which is precisely how an
  // extra ends up standing in the shot with nothing to do
  // (`planning/marketplace-four-character-cast/plan.md` P1).
  // `tag` uses the position in THIS SHOT's ordered reference list (that is
  // what the provider receives); `name`/`role`/`castId` come from the cast
  // member's ORIGINAL roster position.
  const castRoster = isConversation
    ? characterEntries.map(({ item, castIndex }, i) => {
        const castMember = input.plan.cast?.[castIndex];
        const tag = `@Image${productCount + i + 1}`;
        const name =
          clean(castMember?.name) ||
          clean(item.label) ||
          `Person ${castIndex + 1}`;
        const role =
          castMember?.role ??
          (castIndex === 0 ? "host" : castIndex === 1 ? "guest" : "support");
        const descriptor = clean(castMember?.descriptor);
        const castId = castMember?.castId ?? castIdForCharacterIndex(castIndex);
        return { tag, name, role, descriptor, castId };
      })
    : [];

  // `castRoster` is ALREADY this shot's cast — the old second filter here is
  // gone with the per-shot selection above.
  const rosterInShot = castRoster;

  if (thai) {
    const refLines = hasProduct
      ? [`ใช้ ${productTags} เป็นภาพอ้างอิงหลักของสินค้า โดยรักษารูปร่าง สี วัสดุ ฉลาก และสัดส่วนตามหลักฐานทุกประการ`]
      : ["ช็อตนี้ยังไม่เห็นสินค้าจริง ให้แสดงเฉพาะพร็อพทั่วไปตามทิศทางภาพ ห้ามแทนพร็อพด้วยสินค้าจากภาพอ้างอิง"];
    if (hasCharacter) {
      refLines.push(
        `ใช้ ${characterTags} เป็นภาพบุคคล/ตัวละครอ้างอิงหลัก (character identity lock) โดยรักษาใบหน้า ทรงผม รูปร่าง และลักษณะเฉพาะตัวของตัวละครหลักตามภาพอ้างอิงอย่างแม่นยำ`
      );
    } else {
      refLines.push(
        "ใช้ภาพบุคคล/ตัวละครอ้างอิงที่แนบมาเป็น identity lock หากมี โดยรักษารูปร่างและลักษณะตัวละครสอดคล้องกัน"
      );
    }

    const conversationLines: string[] = [];
    if (isConversation && rosterInShot.length > 0) {
      conversationLines.push(
        "นักแสดงในคลิปนี้:",
        ...rosterInShot.map(entry =>
          entry.descriptor
            ? `${entry.tag} = ${entry.name} (${entry.role}) — ${entry.descriptor}`
            : `${entry.tag} = ${entry.name} (${entry.role})`
        )
      );
      // Supporting business, so the frame shows them DOING the thing the story
      // planner authored rather than standing in shot
      // (`planning/marketplace-four-character-cast/plan.md` §3).
      const beatLines = (input.shot.supportingBeats ?? [])
        .map(beat => {
          const entry = rosterInShot.find(item => item.castId === beat.castId);
          if (!entry || !clean(beat.action)) return null;
          return `${entry.tag} (${entry.name}) กำลัง: ${clean(beat.action)}`;
        })
        .filter((line): line is string => line !== null);
      if (beatLines.length > 0) {
        conversationLines.push("การกระทำของตัวประกอบในช็อตนี้:", ...beatLines);
      }
    }

    return [
      `สร้างภาพแนวตั้ง 9:16 สำหรับช็อตที่ ${input.shot.shotId} เท่านั้น`,
      `เรื่องย่อที่ยืนยันแล้ว: ${input.plan.storySummary}`,
      `เรื่องย่อของช็อต: ${input.shot.storySummary}`,
      `ทิศทางภาพ: ${input.shot.visualSummary}`,
      ...(input.shot.cameraDirection
        ? [`มุมกล้อง/การเคลื่อนกล้อง: ${input.shot.cameraDirection}`]
        : []),
      `การกระทำที่ต้องเห็นอย่างชัดเจน: ${input.shot.movementDirection || input.shot.visualSummary}`,
      ...(input.shot.transition
        ? [`จังหวะเชื่อมฉาก: ${input.shot.transition}`]
        : []),
      hasProduct
        ? "จัดองค์ประกอบภาพให้เห็นสินค้าและการกระทำหลักชัดเจน ใช้มุมกล้องและระยะภาพที่สอดคล้องกับทิศทางภาพ พร้อมโฟกัสสินค้าคมชัด"
        : "จัดองค์ประกอบตามการกระทำหลักของช็อต โดยคงพร็อพให้เป็นของทั่วไปและไม่ให้สินค้าจริงเข้าฉาก",
      `แสดงการกระทำนี้กำลังเกิดขึ้นจริง ณ จังหวะต้นของภาพ: ${input.shot.movementDirection || input.shot.visualSummary}. ให้มือและท่าทางทำสิ่งที่บทพูดระบุโดยตรง ห้ามแทนด้วยการนั่งคุยหรือวางสินค้าไว้ข้างหน้าเฉย ๆ`,
      ...(/ผม|หนังศีรษะ|สระผม|แชมพู|เซรั่ม|เส้นผม|hair|scalp|shampoo|serum/i.test(`${input.shot.visualSummary} ${input.shot.movementDirection ?? ""} ${dialogue}`)
        ? ["การดูแลเส้นผมต้องดูเป็นกิจวัตรจริงและสุภาพ: เห็นเฉพาะศีรษะ/เส้นผมกับมือที่กำลังทำงาน เสื้อผ้าทึบแสงปกปิดไหล่และลำตัว ไม่มีภาพเปลือยหรือท่าทางเชิงยั่วยุ"]
        : []),
      "ใช้แสงและฉากสมจริงแบบภาพโฆษณาสินค้า โดยรักษาความต่อเนื่องของสี แสง และสถานที่ตลอด storyboard",
      `บทพูดของช็อตนี้ (ต้องสะท้อนอารมณ์/สถานการณ์นี้ในภาพด้วย): ${dialogue}`,
      ...refLines,
      ...conversationLines,
      "ห้ามเพิ่มอุปกรณ์ คุณสมบัติ คำกล่าวอ้าง ราคา ข้อความ ป้าย โลโก้ ลายน้ำ หรือ UI ของ marketplace ที่ไม่มีหลักฐาน",
      hasProduct
        ? "ต้องเห็นสินค้าอย่างชัดเจน ภาพสมจริง อัตราส่วน 9:16 และห้ามแสดงบทพูดเป็นข้อความบนภาพ"
        : "ภาพสมจริง อัตราส่วน 9:16 และห้ามแสดงบทพูดเป็นข้อความบนภาพ",
    ].join("\n");
  }

  const refLinesEng = hasProduct
    ? [`Use ${productTags} as the primary product reference and preserve the product's visible shape, color, materials, labels, and proportions exactly.`]
    : ["No product reference applies to this shot. Show only the generic prop described in the visual direction; do not replace it with the attached product."];
  if (hasCharacter) {
    refLinesEng.push(
      `Use ${characterTags} as the primary person/character reference image (character identity lock), preserving the character's facial features, identity, hairstyle, and appearance consistently.`
    );
  } else {
    refLinesEng.push(
      "If a person or character reference is supplied, preserve that identity consistently as a separate identity lock."
    );
  }

  const conversationLinesEng: string[] = [];
  if (isConversation && rosterInShot.length > 0) {
    conversationLinesEng.push(
      "Cast in this clip:",
      ...rosterInShot.map(entry =>
        entry.descriptor
          ? `${entry.tag} = ${entry.name} (${entry.role}) — ${entry.descriptor}`
          : `${entry.tag} = ${entry.name} (${entry.role})`
      )
    );
    const beatLinesEng = (input.shot.supportingBeats ?? [])
      .map(beat => {
        const entry = rosterInShot.find(item => item.castId === beat.castId);
        if (!entry || !clean(beat.action)) return null;
        return `${entry.tag} (${entry.name}) is: ${clean(beat.action)}`;
      })
      .filter((line): line is string => line !== null);
    if (beatLinesEng.length > 0) {
      conversationLinesEng.push("Supporting action in this shot:", ...beatLinesEng);
    }
  }

  return [
    `Create one vertical 9:16 ${hasProduct ? "product-review image" : "story image"} for shot ${input.shot.shotId}.`,
    `Approved story summary: ${input.plan.storySummary}`,
    `Approved shot brief: ${input.shot.storySummary}`,
    `Visual direction: ${input.shot.visualSummary}`,
    ...(input.shot.cameraDirection
      ? [`Camera framing and movement: ${input.shot.cameraDirection}`]
      : []),
    `Visible action: ${input.shot.movementDirection || input.shot.visualSummary}`,
    ...(input.shot.transition
      ? [`Scene transition: ${input.shot.transition}`]
      : []),
    hasProduct
      ? "Compose a clear product-focused frame with the shot's main action visible; choose camera distance and angle to support the visual direction, with sharp focus on the product."
      : "Compose the frame around the shot's main action. Keep any prop generic as described and leave the specific product out of frame.",
    `Show this exact action visibly in progress at the start-frame moment: ${input.shot.movementDirection || input.shot.visualSummary}. Hands and body posture must perform what the dialogue says; do not replace it with people sitting and talking or a product merely placed beside them.`,
    ...(/ผม|หนังศีรษะ|สระผม|แชมพู|เซรั่ม|เส้นผม|hair|scalp|shampoo|serum/i.test(`${input.shot.visualSummary} ${input.shot.movementDirection ?? ""} ${dialogue}`)
      ? ["For hair-care actions, show a natural, modest routine: focus on the head/hair and working hands; wear opaque clothing that covers shoulders and torso; no nudity or suggestive posing."]
      : []),
    "Use realistic commercial-product lighting and a believable setting; keep location, color, and lighting continuity consistent across the storyboard.",
    `This shot's dialogue (the image MUST reflect this emotion/situation): ${dialogue}`,
    ...refLinesEng,
    ...conversationLinesEng,
    "Photorealistic commercial image, vertical 9:16. Do not invent accessories, claims, text, price, badges, logos, watermarks, or marketplace UI.",
    hasProduct
      ? "Keep the product clearly visible and do not render the dialogue as on-screen text."
      : "Do not show the specific product; do not render the dialogue as on-screen text.",
  ].join("\n");
}

/**
 * Deterministic (no LLM call) two-voice descriptor for a two-person
 * conversation clip. Mirrors the style of
 * `buildMarketplaceAutoReviewVoiceProfileDescriptor` in
 * `marketplaceAutoReviewService.ts` (facts-only, no invented details) but
 * intentionally does NOT reuse that legacy single-narrator "VOICE
 * CONSISTENCY LOCK" line — that lock forbids switching narrator, which would
 * directly defeat a two-person conversation.
 *
 * NOTE (skill-first restore, `planning/marketplace-staged-skill-first-restore`):
 * this descriptor's text is no longer injected into `buildStagedVideoPrompt`
 * — directing HOW the two voices should sound/perform is the
 * `product-review-sequential-storyboard` skill's job (see its Two-Person
 * Conversation Mode section), not this deterministic fallback's. The
 * function stays exported (it has no callers left in this file) as a
 * facts-only building block in case a future caller needs a deterministic
 * cast-voice label without any performance direction attached.
 */

export function buildStagedTwoVoiceDescriptor(
  cast: StagedCastMember[]
): string {
  // Two VOICES — read the leads, never the first two roster entries.
  const [host, guest] = selectStagedLeadCast(cast);
  const describeMember = (
    member: StagedCastMember | undefined,
    fallbackName: string,
    fallbackRole: "host" | "guest"
  ): string => {
    const name = clean(member?.name) || fallbackName;
    const roleLabel = member?.role ?? fallbackRole;
    const extra = [clean(member?.ageRange ?? undefined), clean(member?.descriptor)]
      .filter(Boolean)
      .join(", ");
    return extra ? `${name} (${roleLabel}, ${extra})` : `${name} (${roleLabel})`;
  };
  const hostLabel = describeMember(host, "the host", "host");
  const guestLabel = describeMember(guest, "the guest", "guest");
  return `two distinct, consistent voices — ${hostLabel} and ${guestLabel} — each speaker keeps the exact same voice, timbre, tone, and pacing across every clip; never swap voices between the two speakers.`;
}

export function buildStagedVideoPrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
}): string {
  const thai = input.plan.languagePlan?.promptLanguage === "th";
  const durationSeconds = input.shot.durationSeconds;

  const isConversation = input.plan.conversationMode === "two_person_conversation";
  // `dialogue` is the editable, hashed source of truth. `dialogueTurns` is a
  // derived cache and can be stale on older runs, so never append both forms
  // to a prompt. Vertical Drama uses the same pattern: resolve each spoken
  // name against labeled character portraits, then bind it to the matching
  // face in the accepted start frame.
  const cast = input.plan.cast ?? [];
  const safeDialogue = removeStagedMinorDialogueLines(input.shot.dialogue, cast);
  const namedDialogue = parseSpeakerNamedDialogue(safeDialogue);
  const minorCast = cast.filter(isStagedCastMemberMinor);
  const usesSpeakerBinding =
    isConversation || (namedDialogue !== undefined && cast.length > 0);
  const normalizeName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const castByName = new Map(
    cast.map(member => [normalizeName(member.name), member])
  );
  const renderSpeaker = (speakerName: string) =>
    castByName.get(normalizeName(speakerName))?.name ?? speakerName;

  const conversationLinesTH: string[] = [];
  const conversationLinesEng: string[] = [];
  if (usesSpeakerBinding) {
    const visibleSpeakerLines = (namedDialogue ?? []).map(line => {
      const speakerName = renderSpeaker(line.speakerName);
      const fallbackCueEn =
        "not visually resolved by this text-only fallback; use offscreen voice-over and keep every visible mouth closed";
      const fallbackCueTh =
        "fallback แบบข้อความไม่สามารถตรวจยืนยันใบหน้าได้; ใช้เสียงบรรยายนอกจอและปิดปากตัวละครทุกคนในภาพ";
      return { speakerName, fallbackCueEn, fallbackCueTh };
    });
    if (visibleSpeakerLines.length > 0) {
      conversationLinesTH.push(
        "SPEAKER VISUAL MAP FOR THIS SHOT (safe fallback):",
        ...visibleSpeakerLines.map(
          ({ speakerName, fallbackCueTh }) =>
            `- ${speakerName}: ${fallbackCueTh}`
        ),
        "รหัส cast และป้าย @Image เป็นข้อมูลเฉพาะตอนเขียน Prompt เท่านั้น; ห้ามใช้แทนจุดสังเกตของคนในภาพจริง"
      );
      conversationLinesEng.push(
        "SPEAKER VISUAL MAP FOR THIS SHOT (safe fallback):",
        ...visibleSpeakerLines.map(
          ({ speakerName, fallbackCueEn }) =>
            `- ${speakerName}: ${fallbackCueEn}`
        ),
        "Cast IDs and @Image labels are authoring-only metadata; never use them as visual identifiers in the rendered video prompt."
      );
    }
    if (namedDialogue) {
      const cueForSpeaker = (speakerName: string, language: "th" | "en") => {
        const cue = visibleSpeakerLines.find(
          item => normalizeName(item.speakerName) === normalizeName(speakerName)
        );
        return language === "th"
          ? cue?.fallbackCueTh ?? "ใช้เสียงบรรยายนอกจอเพราะยังจับคู่ใบหน้าไม่ได้"
          : cue?.fallbackCueEn ?? "not visually resolved by this text-only fallback; use offscreen voice-over";
      };
      conversationLinesTH.push(
        "บทพูดที่อนุมัติแล้ว (พูดแต่ละบรรทัดครั้งเดียว ตามลำดับและข้อความนี้เท่านั้น):",
        ...namedDialogue.map((line, i) =>
          `${i + 1}. ${renderSpeaker(line.speakerName)} (${cueForSpeaker(line.speakerName, "th")}): "${line.line}"`
        )
      );
      conversationLinesEng.push(
        "Approved dialogue (speak each line exactly once, in this order, with no added or rewritten speech):",
        ...namedDialogue.map((line, i) =>
          `${i + 1}. ${renderSpeaker(line.speakerName)} (${cueForSpeaker(line.speakerName, "en")}): "${line.line}"`
        )
      );
    } else {
      conversationLinesTH.push(
        "บทพูดที่อนุมัติแล้ว (พูดข้อความนี้ครั้งเดียวตรงตามต้นฉบับ ห้ามเพิ่มหรือเขียนใหม่):",
        safeDialogue
      );
      conversationLinesEng.push(
        "Approved dialogue (speak this exact text once; do not add or rewrite speech):",
        safeDialogue
      );
    }
    conversationLinesTH.push(
      "ล็อกผู้พูดกับใบหน้า: fallback นี้ไม่มีการตรวจภาพเพื่อจับคู่ใบหน้า จึงห้ามเดาตัวตนหรือสั่งขยับปาก ให้ใช้เสียงบรรยายนอกจอเท่านั้น"
    );
    conversationLinesEng.push(
      "SPEAKER-TO-FACE LOCK: This text-only fallback has not visually matched the portraits to people in the accepted shot. Do not guess or assign visible lip movement; use offscreen voice-over and keep every visible mouth closed."
    );
  }

  // Supporting business + optional short line
  // (`planning/marketplace-four-character-cast/plan.md` §3). Kept in its own
  // block, AFTER the lead turns, so a supporting line can never be mistaken
  // for one of the two main voices or reorder the conversation.
  const supportingBeats = (input.shot.supportingBeats ?? [])
    .filter(beat => clean(beat.action))
    .map(beat => {
      const member = cast.find(candidate => candidate.castId === beat.castId);
      return member && isStagedCastMemberMinor(member)
        ? { ...beat, line: undefined }
        : beat;
    });
  if (supportingBeats.length > 0) {
    const castNameById = new Map(
      (input.plan.cast ?? []).map(member => [member.castId, member.name])
    );
    const describeBeat = (beat: StagedSupportingBeat) => {
      const name = castNameById.get(beat.castId) || beat.castId;
      const line = clean(beat.line);
      return { name, action: clean(beat.action), line };
    };
    conversationLinesTH.push(
      "ตัวประกอบในช็อตนี้ (ไม่ใช่ผู้พูดหลัก):",
      ...supportingBeats.map(beat => {
        const { name, action, line } = describeBeat(beat);
        return line
          ? `- ${name} กำลัง ${action} และพูดสั้น ๆ ว่า "${line}"`
          : `- ${name} กำลัง ${action} โดยไม่มีบทพูด`;
      })
    );
    conversationLinesEng.push(
      "Supporting cast in this shot (not a main speaker):",
      ...supportingBeats.map(beat => {
        const { name, action, line } = describeBeat(beat);
        return line
          ? `- ${name} is ${action}, with one short line: "${line}"`
          : `- ${name} is ${action}, with no spoken line`;
      })
    );
  }

  if (thai) {
    return [
      `สร้างวีดีโอรีวิวสินค้าแนวตั้ง 9:16 ความยาว ${durationSeconds} วินาทีสำหรับช็อตที่ ${input.shot.shotId} เท่านั้น`,
      `ใช้ภาพที่ยอมรับแล้วของช็อตที่ ${input.shot.shotId} เป็นแหล่งภาพต้นฉบับที่ต้องคงเอกลักษณ์ไว้`,
      ...(usesSpeakerBinding
        ? []
        : [safeDialogue ? `บทพูดที่ยืนยันแล้ว (ห้ามเขียนใหม่): ${safeDialogue}` : "ช็อตนี้ไม่มีบทพูด ให้ทุกคนเงียบและปิดปากตามธรรมชาติ"]),
      `บริบทเรื่องที่ยืนยันแล้ว: ${input.shot.storySummary}`,
      ...conversationLinesTH,
      ...(minorCast.length
        ? [`ข้อกำหนดความปลอดภัย: ${minorCast.map(member => member.name).join(", ")} อายุต่ำกว่า 18 ปี ห้ามพูด ร้องเพลง พากย์ หรือขยับปากให้ตรงเสียงโดยเด็ดขาด ให้ปิดปากและเงียบตลอดช็อต อนุญาตเฉพาะเสียงผู้ใหญ่ที่อยู่นอกจอ`]
        : []),
      ...(input.shot.cameraDirection ? [`มุมกล้องที่วางแผนไว้: ${input.shot.cameraDirection}`] : []),
      ...(input.shot.movementDirection ? [`การกระทำของช็อต: ${input.shot.movementDirection}`] : []),
      ...(input.shot.transition ? [`การเชื่อมจาก/ไปฉาก: ${input.shot.transition}`] : []),
      usesSpeakerBinding
        ? `กล้อง/การกระทำ: ต่อจากภาพที่อนุมัติและแสดงการกระทำหลักตามทิศทางนี้: ${input.shot.visualSummary}; คงความต่อเนื่องของสินค้าและทำให้เห็นการเคลื่อนไหวชัดเจน`
        : `เริ่มจากภาพที่ยอมรับแล้วและแสดงการกระทำหลักตามทิศทางภาพนี้: ${input.shot.visualSummary}; คงรูปทรง สี วัสดุ และตำแหน่งสินค้าให้ต่อเนื่องขณะเคลื่อนไหว`,
      usesSpeakerBinding
        ? `จังหวะ: เริ่มการกระทำช่วงต้น แสดงชัดช่วงกลาง แล้วหยุดอย่างเป็นธรรมชาติก่อนครบ ${durationSeconds} วินาที`
        : `จังหวะเวลา: ช่วงต้นตั้งภาพและเริ่มการกระทำ ช่วงกลางแสดงการเคลื่อนไหวให้เห็นชัด ช่วงท้ายหยุดอย่างเป็นธรรมชาติภายใน ${durationSeconds} วินาที; การเคลื่อนไหวต้องนุ่มนวลและสมจริง`,
      usesSpeakerBinding
        ? "เสียง: พูดเฉพาะบทที่อนุมัติให้ตรงตามข้อความ ห้ามเพิ่มเสียงบรรยายหรือประโยคอื่น; ห้ามเพิ่มคำกล่าวอ้าง ข้อความ โลโก้ หรือลายน้ำ"
        : "ใช้เสียงบทพูดที่ยืนยันแล้วตามตัวอักษร ไม่เพิ่มบทพูดอื่น; ห้ามเพิ่มคำกล่าวอ้าง ราคา ข้อความบนจอ caption โลโก้ ลายน้ำ หรือ UI ที่ไม่มีหลักฐาน",
    ].join("\n");
  }
  return [
    `Create a ${durationSeconds}-second vertical 9:16 product-review video for shot ${input.shot.shotId}.`,
    `Use the accepted image artifact for shot ${input.shot.shotId} as the exact visual source.`,
    ...(usesSpeakerBinding
      ? []
      : [safeDialogue ? `Approved dialogue (must not be rewritten): ${safeDialogue}` : "This shot has no dialogue; everyone stays silent with mouths naturally closed."]),
    `Approved story context: ${input.shot.storySummary}`,
    ...conversationLinesEng,
    ...(minorCast.length
      ? [`MINOR SPEECH SAFETY LOCK: ${minorCast.map(member => member.name).join(", ")} is under 18 and must never speak, sing, narrate, ad-lib, or lip-sync. Keep their mouth closed and keep them silent throughout this shot. Only an adult off-screen narrator may speak.`]
      : []),
    ...(input.shot.cameraDirection ? [`Planned camera: ${input.shot.cameraDirection}`] : []),
    ...(input.shot.movementDirection ? [`Shot action: ${input.shot.movementDirection}`] : []),
    ...(input.shot.transition ? [`Scene transition: ${input.shot.transition}`] : []),
    usesSpeakerBinding
      ? `Camera/action: continue from the accepted image and show the main action matching: ${input.shot.visualSummary}. Preserve product design and placement while keeping the action visibly alive.`
      : `Camera and action: start from the accepted image, then show the main action matching this shot's visual direction: ${input.shot.visualSummary}. Keep the product's shape, color, materials, and placement consistent during motion.`,
    usesSpeakerBinding
      ? `Pacing: begin early, show the action clearly mid-shot, then settle naturally before ${durationSeconds} seconds.`
      : `Timing: establish the frame and begin the action early, show the movement clearly through the middle, and settle naturally before the ${durationSeconds}-second shot ends. Use smooth, physically coherent motion.`,
    usesSpeakerBinding
      ? "Audio: speak only the approved lines verbatim, naturally; add no narration or other speech."
      : "Audio: speak only the approved dialogue exactly as written, with natural pacing and relevant room ambience; do not add narration or other lines.",
    ...(usesSpeakerBinding
      ? []
      : ["If a person or character reference is supplied, preserve that identity consistently throughout the shot."]),
    usesSpeakerBinding
      ? "Photorealistic vertical 9:16 commercial video. No unsupported claims, on-screen text, captions, logos, watermarks, or marketplace UI."
      : "Photorealistic commercial short-form video, vertical 9:16. Do not add unsupported claims, price text, captions, logos, watermarks, or marketplace UI.",
  ].join("\n");
}

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
    ...(plan.expectedShotCount !== undefined
      ? { expectedShotCount: plan.expectedShotCount }
      : {}),
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
  excludePromotionalContent?: boolean;
  model?: string | null;
  // Additive (opt-in). See buildStagedStoryArcPlan.
  cast?: StagedCastMember[];
  shotDurationSeconds?: number;
  // Additive (opt-in, feature/marketplace-flexible-shots). New fixed counts
  // are 2..18; persisted fixed runs up to 30 remain valid for redrafts. The
  // literal "auto" lets the LLM decide within 2..18 using
  // `shotDurationSeconds` as the pacing criterion. Omitted defaults to 9.
  shotCount?: number | "auto";
  selectedConcept?: StagedStoryConceptOption;
  conceptsOnly?: boolean;
  usedReviewConcepts?: UsedReviewConcept[];
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
  const productDescription = boundStagedStoryPlanProductDescription(
    input.product.description
  );
  if (productDescription.length > STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_MAX_CHARS) {
    throw new Error("STAGED_STORY_PLAN_PRODUCT_DESCRIPTION_TOO_LONG");
  }
  // Keep Auto as an explicit skill-owned decision. Resolving it here to a
  // fixed tone/structure prevents the story skill from adapting to the
  // selected product and concept.
  const structureKey = clean(input.storytellingStructure) || "auto";
  const toneKey = clean(input.reviewTone) || "auto";
  const structureDirection =
    structureKey === "auto"
      ? "ให้ Story skill เลือกโครงเรื่องจากข้อเท็จจริงของสินค้าและแนวคิดที่เลือก โดยให้เปิดด้วยปัญหาจริงที่ผู้ชมเข้าใจได้เมื่อเหมาะกับเนื้อหา"
      : `คงโครงเรื่องที่ผู้ใช้เลือก "${structureKey}"`;
  const toneDirection =
    toneKey === "auto"
      ? "ให้ Story skill เลือกโทนที่เข้ากับสินค้า ผู้ชม และแนวคิด โดยเปิดเรื่องให้ชวนติดตาม สื่ออารมณ์อย่างเป็นธรรมชาติ และโน้มน้าวด้วยการสาธิต/หลักฐานโดยไม่ขายตรงเกินไป"
      : `คงโทนที่ผู้ใช้เลือก "${toneKey}"`;
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
      fixedShotCount < 2 ||
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
  const dialogueLanguage: "th" | "en" =
    input.languagePlan?.dialogueLanguage === "en" ? "en" : "th";
  const dialogueStyleDirection =
    dialogueLanguage === "th"
      ? "บทพูดภาษาไทยต้องฟังเหมือนคนคุยกันจริง ใช้คำพูดติดปากตามสถานการณ์ ไม่ใช้สำนวนภาษาเขียน ภาษาฉลากสินค้า หรือประโยคแนะนำแบบโฆษณา ให้แต่ละประโยคตอบกับสิ่งที่อีกคนพูดหรือทำ"
      : "Dialogue must sound like spontaneous conversation in the selected scene, not written copy, label language, or generic advertising advice. Each line should respond to what the other person said or did.";

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
          )}\n\nRoster facts: host/guest roles and cast IDs are user-selected. For each shot, provide "dialogueTurns" as an ordered array of {castId, line} entries and "castInShot" with the cast IDs of people visible in that shot. Every castId must match this roster exactly; the server builds "dialogue" from the turns after validation. Each "line" must contain only the spoken words, never the speaker name or a "Name:" prefix.`
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
          }\nบทพูดทุกช็อตเป็นบทพูดเดี่ยวของ "${activeCast[0].name}" ในมุมมองบุคคลที่หนึ่ง สอดคล้องกับตัวตนของผู้ดำเนินรายการคนนี้ โดย ${structureDirection} และ ${toneDirection} ให้ครบทุกช็อต ให้ส่ง castInShot ที่ระบุ castId ของผู้ดำเนินรายการในทุกช็อต (ไม่ต้องส่ง dialogueTurns)`
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
          )}\n\nกฎตัวประกอบ (บังคับ): ตัวประกอบไม่ใช่คู่สนทนาหลัก — บทสนทนาหลักยังเป็นของ host/guest เท่านั้น ตัวประกอบที่เป็นผู้ใหญ่จะมีบทพูดสั้น ๆ หรือไม่มีบทพูดก็ได้ แต่ทุกครั้งที่ปรากฏในช็อตต้องมี action ที่ส่งเสริมเรื่องราว\n\nสำหรับแต่ละช็อตที่มีตัวประกอบ ให้ส่ง "castInShot" เป็น castId ทุกคนที่อยู่จริง และส่ง "supportingBeats" เป็น object รูปแบบ {\"castId\":\"cast-3\",\"action\":\"ยื่นสินค้าให้ผู้ดำเนินรายการ\"} สำหรับตัวประกอบทุกคนในช็อตนั้น หากไม่มีตัวประกอบในช็อต ให้ส่ง castInShot ที่มีเฉพาะนักแสดงหลักและ supportingBeats เป็น array ว่าง รูปแบบ object เป็นรูปแบบหลัก; ระบบรองรับ action แบบ string ได้เฉพาะเมื่อระบุเจ้าของจาก castInShot ได้แน่ชัด และจะละตัวประกอบที่จับคู่ไม่ได้เพื่อไม่ให้บทบาทผิดคน`
      : "";
  const minorCast = (input.cast ?? []).filter(isStagedCastMemberMinor);
  const minorSilenceLock = minorCast.length
    ? `\n\nMINOR SPEECH SAFETY LOCK (highest priority): The following cast members are under 18 and must never speak, narrate, sing, ad-lib, or lip-sync: ${minorCast.map(member => `${member.name} [${member.castId}]`).join(", ")}. Do not assign them dialogueTurns or supportingBeats.line. They may only perform silent physical actions; keep their mouths closed. Dialogue may belong only to adult cast members or an off-screen adult narrator. This rule overrides the selected concept and every creative instruction. กฎสูงสุด: ตัวละครที่ระบุข้างต้นอายุต่ำกว่า 18 ปี ห้ามมีบทพูด เสียงบรรยาย ร้องเพลง หรือขยับปากตามเสียงโดยเด็ดขาด ห้ามใส่ใน dialogueTurns หรือ supportingBeats.line ให้ทำได้เฉพาะการกระทำทางกายแบบเงียบและปิดปากไว้`
    : "";

  // Runtime state only. The loaded skill owns pacing and all creative decisions.
  const shotCountInstruction = isAutoShotCount
    ? `shot_count: auto; allowed range: 2-18; shot duration: ${shotDurationSeconds} seconds`
    : `shot_count: ${fixedShotCount}; shot duration: ${shotDurationSeconds} seconds`;

  const selectedConceptInstruction = input.selectedConcept
    ? `\nแนวคิดที่ผู้ใช้เลือกไว้ (ต้องใช้เป็นแนวทางหลัก): ${JSON.stringify(input.selectedConcept)}`
    : "";
  const usedReviewConcepts = input.conceptsOnly ? input.usedReviewConcepts ?? [] : [];
  const noveltyInstruction = input.conceptsOnly
    ? "\n\nREVIEW IDEA NOVELTY: Give each of the three options a distinct core premise. Compare each option's scenario, central question, demonstration, and story progression with the other two and with every entry in usedReviewConcepts. Replace any concept that would replay substantially the same story with changed wording, cast, or setting. Use the list only as historical data about confirmed concepts for this product. An empty list means there are no historical exclusions."
    : "";
  const commercialContentInstruction =
    input.excludePromotionalContent !== false
      ? "\n\nPRICE AND PROMOTION EXCLUSION (mandatory user setting): Do not mention or imply any product price, discount, sale, coupon, promotion, buy-one-get-one, free gift, gift-with-purchase, bundle deal, or time-limited offer (ราคา, โปรโมชัน/โปรโมชั่น, ส่วนลด, คูปอง, ซื้อ 1 แถม 1, ของแถม) in concepts, titles, angles, summaries, dialogue previews, storyboard shots, or any other authored review text. This rule overrides product descriptions/specifications, selected concepts, and revision notes. Ordinary product specifications such as size, volume, and dimensions remain allowed when relevant."
      : "\n\nPROMOTION FACTUALITY: Price, discount, coupon, bundle, promotion, or free-gift details (ราคา, โปรโมชัน/โปรโมชั่น, ส่วนลด, คูปอง, ซื้อ 1 แถม 1, ของแถม) may be included only if that exact detail is explicitly present in the supplied product facts. Never invent or infer an offer or price.";

  const runtimeInstructions = `
Marketplace Auto Review Story Arc skill runtime context:
- ${shotCountInstruction}
- call_mode: ${input.conceptsOnly ? "concept_selection" : "confirmed_storyboard"}
- selected review_format: ${isDramaTieIn ? "drama_tie_in" : "general"}
- selected storytelling_structure: ${structureKey}
- selected review_tone: ${toneKey}
- dialogue duration target: ${dialogueWindowMinSeconds}-${shotDurationSeconds} seconds per shot. Write only dialogue that can be spoken naturally within this window; shorten the line while preserving its key story beat instead of rushing or padding it.
- dialogue naturalness: ${dialogueStyleDirection}
- The loaded skill owns concept selection, Auto tone/structure resolution, dialogue, visual action, product timing, and other creative decisions. ${structureDirection}. ${toneDirection}. Keep every shot purposeful and action-led; show a visible gesture, reaction, or product-use action that matches its dialogue rather than repeating static talking-head scenes. Persuade through relevant evidence, demonstration, and honest product fit; avoid hard-selling and unsupported outcomes. Apply any explicit user selections as facts and return only the requested structured output.${selectedConceptInstruction}${commercialContentInstruction}${noveltyInstruction}${castRosterBlock}${supportingCastBlock}${minorSilenceLock}`;
  const systemPrompt = `${skillInstructions}\n\n${runtimeInstructions}`;

  const userMessage = JSON.stringify(
    {
      productName,
      productDescription: productDescription || undefined,
      productSpecs: input.product.specs,
      reviewFormat: isDramaTieIn ? "drama_tie_in" : "general",
      storytellingStructure: structureKey,
      reviewTone: toneKey,
      excludePromotionalContent: input.excludePromotionalContent !== false,
      revisionNotes: revisionNotes || undefined,
      selectedConcept: input.selectedConcept,
      ...(input.conceptsOnly ? { usedReviewConcepts } : {}),
      // Include the full roster so supporting characters keep their identity
      // and age/minor grounding through image and video prompt generation.
      ...(input.cast && input.cast.length > 0
        ? {
            cast: input.cast.map(member => ({
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
  const ZodSupportingBeatObjectSchema = z.object({
    castId: z.string().min(1).max(80),
    action: z.string().min(1).max(240),
    line: z.string().min(1).max(160).optional(),
  });
  // Keep objects as the canonical skill format, while accepting providers
  // that flatten an item to an action string. The planner maps that shorthand
  // only when cast membership in the shot makes the owner deterministic.
  const ZodSupportingBeatSchema = z.union([
    ZodSupportingBeatObjectSchema,
    z.string().trim().min(1).max(240),
  ]);

  // Some providers serialize numeric identifiers as JSON strings. Shot IDs
  // are redundant (the server assigns them from array order), so normalize
  // digit-only strings here while still rejecting malformed identifiers.
  const ZodShotIdSchema = z.union([
    z.number().int().min(1).max(30),
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(30)),
  ]);

  const shotObjectSchema = z.object({
    // Shot ids are assigned from output order below; do not reject a plan
    // because the model omitted this redundant field.
    shotId: ZodShotIdSchema.optional(),
    title: z.string().min(1).max(120),
    storySummary: z.string().min(1).max(600).optional(),
    visualSummary: z.string().min(1).max(400),
    productInShot: z.boolean(),
    cameraDirection: z.string().min(1).max(240).optional(),
    movementDirection: z.string().min(1).max(240),
    transition: z.string().min(1).max(180).optional(),
    dialogue: z.string().min(1).max(320).optional(),
    dialogueTurns: z.array(ZodDialogueTurnSchema).min(2).optional(),
    castInShot: z.array(z.string().min(1).max(80)).optional(),
    supportingBeats: z.array(ZodSupportingBeatSchema).optional(),
  });

  const conceptOptionsSchema = z.array(z.object({
    conceptId: z.string().min(1),
    title: z.string().min(1),
    angle: z.string().min(1),
    storySummary: z.string().min(1),
    dialoguePreview: z.string().trim().min(40).max(6000),
  })).length(3);
  const ZodLLMPlanSchema = z.object({
    storySummary: z.string().optional(),
    conceptOptions: input.conceptsOnly
      ? conceptOptionsSchema.superRefine((options, context) => {
          for (const [index, concept] of options.entries()) {
            if (usedReviewConcepts.some(previous => isRepeatedReviewConcept(concept, previous))) {
              context.addIssue({
                code: "custom",
                path: [index],
                message: "This idea repeats a previously used concept for this product. Write a different review premise.",
              });
            } else if (options.slice(0, index).some(other => isRepeatedReviewConcept(concept, other))) {
              context.addIssue({
                code: "custom",
                path: [index],
                message: "This idea repeats an option in the current set. Write a different review premise.",
              });
            }
          }
        })
      : conceptOptionsSchema,
    selectedConceptId: z.string().optional(),
    ...(input.conceptsOnly
      ? {}
      : {
          shots: isAutoShotCount
            ? z.array(shotObjectSchema).min(2).max(18)
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
      maxRetries: 1,
      repairCompleteJson: true,
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
        expectedShotCount: isAutoShotCount ? "auto" : fixedShotCount ?? 9,
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
        ...(input.cast && input.cast.length > 0
          ? { cast: input.cast, conversationMode }
          : {}),
      };
    }

    const generatedShots = Array.isArray((llmRes.data as any).shots)
      ? (llmRes.data as any).shots
      : [];
    const rawShotCount = generatedShots.length;
    const rawShotCountOk = isAutoShotCount
      ? rawShotCount >= 2 && rawShotCount <= 18
      : rawShotCount === (fixedShotCount ?? 9);

    if (rawShotCountOk) {
      const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
      const storySummary = buildStagedStoryPlanSummary({
        summary: llmRes.data.storySummary,
        selectedConcept: input.selectedConcept,
        shots: generatedShots,
      });
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
        (input.cast ?? []).map(member => [member.castId, member])
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
          const resolvedTurns = shot.dialogueTurns.flatMap(turn => {
            const member = castById.get(turn.castId);
            if (!member) {
              throw new Error(
                `STAGED_STORY_PLAN_DIALOGUE_SPEAKER_NOT_IN_CAST:shot-${shotId}:${turn.castId}`
              );
            }
            if (isStagedCastMemberMinor(member)) {
              console.warn(
                "[generateStagedStoryArcPlanWithLLM] removed minor dialogue turn",
                { runId: input.runId, shotId, castId: member.castId }
              );
              return [];
            }
            if (!activeCast.some(lead => lead.castId === turn.castId)) {
              throw new Error(
                `STAGED_STORY_PLAN_DIALOGUE_SPEAKER_NOT_LEAD:shot-${shotId}:${turn.castId}`
              );
            }
            return [{
              castId: member.castId,
              speakerName: member.name,
              line: normalizeStagedSpeakerLine(member.name, clean(turn.line)),
            } satisfies StagedDialogueTurn];
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
          dialogue = removeStagedMinorDialogueLines(
            clean(shot.dialogue),
            input.cast
          );
        }

        let declaredCastInShot = shot.castInShot;
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
        const normalizedSupporting = normalizeStagedSupportingBeatInputs({
          beats: shot.supportingBeats ?? [],
          castInShot: declaredCastInShot,
          cast: input.cast ?? [],
        });
        declaredCastInShot = normalizedSupporting.castInShot;
        if (normalizedSupporting.droppedAmbiguousBeatCount > 0) {
          console.warn(
            "[generateStagedStoryArcPlanWithLLM] omitted ambiguous supporting beat shorthand",
            {
              runId: input.runId,
              shotId,
              droppedBeatCount: normalizedSupporting.droppedAmbiguousBeatCount,
            }
          );
        }
        const supportingBeats = normalizedSupporting.beats.map(beat => {
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
            ...(!isStagedCastMemberMinor(castById.get(beat.castId)!) &&
            clean(beat.line)
              ? { line: clean(beat.line) }
              : {}),
          };
        });

        return {
          shotId,
          title: clean(shot.title),
          storySummary:
            clean(shot.storySummary) || clean(shot.visualSummary),
          visualSummary: clean(shot.visualSummary),
          productInShot: shot.productInShot,
          ...(clean(shot.cameraDirection)
            ? { cameraDirection: clean(shot.cameraDirection) }
            : {}),
          movementDirection: clean(shot.movementDirection),
          ...(clean(shot.transition)
            ? { transition: clean(shot.transition) }
            : {}),
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

      const dialogueQcReviewSchema = z.object({
        shotId: z.number().int().min(1),
        verdict: z.enum(["natural", "revised"]),
        issue: z.enum([
          "none",
          "awkward_wording",
          "written_or_promotional",
          "weak_response",
        ]),
        dialogue: z.string().trim().min(1).max(320).optional(),
        dialogueTurns: z.array(
          z.object({
            castId: z.string().trim().min(1).max(80),
            line: z.string().trim().min(1).max(320),
          }).strict()
        ).min(2).max(18).optional(),
      }).strict();
      const dialogueQcResponseSchema = z.object({
        reviews: z.array(dialogueQcReviewSchema).length(enforcedShots.length),
      }).strict();
      const dialogueQcRes = await callLLMStructured({
        systemPrompt:
          buildStagedDialogueNaturalnessQcSystemPrompt(dialogueLanguage),
        userMessage: JSON.stringify({
          dialogueLanguage,
          conversationMode,
          cast: activeCast.map(member => ({
            castId: member.castId,
            name: member.name,
            role: member.role,
          })),
          shots: enforcedShots.map(shot => ({
            shotId: shot.shotId,
            durationSeconds: shot.durationSeconds,
            title: shot.title,
            storySummary: shot.storySummary,
            visualSummary: shot.visualSummary,
            dialogue: shot.dialogue,
            ...(shot.dialogueTurns
              ? {
                  dialogueTurns: shot.dialogueTurns.map(turn => ({
                    castId: turn.castId,
                    speakerName: turn.speakerName,
                    line: turn.line,
                  })),
                }
              : {}),
          })),
        }),
        model: chosenModel,
        zodSchema: dialogueQcResponseSchema,
        userId,
        tenantId,
        maxRetries: 0,
        repairCompleteJson: true,
        disableProviderFallbacks: true,
        maxTokens: 4000,
        billingDescription: `Staged Story Arc dialogue naturalness QC (${chosenModel})`,
        billingMetadata: {
          workflow: "marketplace_auto_review_story_arc",
          stage: "dialogue_naturalness_qc",
          runId: input.runId,
          planRevision,
        },
      });
      const dialogueQcModel = clean(dialogueQcRes.modelId);
      const dialogueQcProvider = clean(dialogueQcRes.providerName);
      if (!dialogueQcModel || !dialogueQcProvider) {
        throw new Error("STAGED_DIALOGUE_QC_PROVIDER_PROVENANCE_MISSING");
      }
      const qualityCheckedShots = applyStagedDialogueQcReviews(
        enforcedShots,
        dialogueQcRes.data.reviews,
        conversationMode
      );
      const revisedDialogueCount = dialogueQcRes.data.reviews.filter(
        review => review.verdict === "revised"
      ).length;
      console.info(
        "[generateStagedStoryArcPlanWithLLM] dialogue naturalness QC completed",
        {
          runId: input.runId,
          shotCount: qualityCheckedShots.length,
          revisedDialogueCount,
          dialogueLanguage,
          model: dialogueQcModel,
          provider: dialogueQcProvider,
        }
      );

      const normalizedDialogue = qualityCheckedShots
        .map(shot => clean(shot.dialogue)
          .replace(/^[^:：]{1,40}[:：]\s*/gm, "")
          .replace(/[\s\p{P}\p{S}]/gu, "")
          .toLocaleLowerCase())
        .filter(Boolean);
      if (new Set(normalizedDialogue).size !== normalizedDialogue.length) {
        throw new Error("STAGED_STORY_PLAN_REPEATED_DIALOGUE");
      }
      if (
        qualityCheckedShots.some(shot =>
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
        qualityCheckedShots.map(shot => ({
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
          shots: qualityCheckedShots.map(s => `${s.shotId}:${s.title}:${s.dialogue}`),
        });

        return {
          planRevision,
          expectedShotCount: enforcedShots.length,
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
          shots: qualityCheckedShots,
          referenceManifestHash,
          storyPlanHash,
          source: "llm_story_arc",
          authoring: {
            model: authoringModel,
            provider: authoringProvider,
            creditsUsed: llmRes.creditsUsed + dialogueQcRes.creditsUsed,
          },
          languagePlan: input.languagePlan,
          ...(input.cast && input.cast.length > 0
            ? { cast: input.cast, conversationMode }
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
