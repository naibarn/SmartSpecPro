import { z } from "zod";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  validateStagedShotContract,
  type HumanApprovalCheckpointV1,
  type StagedSafeReasonCode,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { callLLMStructured } from "./callLLMStructured";
import {
  isMarketplaceCastLeadRole,
  type MarketplaceCharacterCastRole,
} from "../../shared/hyperframes/characterCast";
import {
  castIdForCharacterIndex,
  type ShotCastLook,
} from "../../shared/marketplaceAutoReview/shotCast";

export type StagedStoryArcProduct = {
  productId: string;
  productName: string;
  description?: string | null;
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
 * Enforcement is by CONSTRUCTION, not by rejection: a supporting character the
 * model gave no `action` is removed from that shot's `castInShot`, so their
 * reference image is never sent and they simply are not in the frame. The
 * alternative — failing the shot and retrying — is the trap that
 * `pinApprovedCanonicalDesignDna` had to undo elsewhere in this codebase the
 * same week: a guard the model cannot reliably satisfy turns into a dead
 * feature. Worst case here is a supporting character appearing in fewer shots;
 * there is no path where the run dies.
 *
 * Also normalizes the legacy `castInShot === undefined` case. That used to mean
 * "everyone", which with a supporting tier would put a beatless extra in every
 * frame — so once a supporting cast exists, the list is always made explicit.
 * Runs with no supporting cast are left byte-identical.
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
  const droppedCastIdsByShot: Record<number, string[]> = {};
  if (supporting.length === 0) {
    return { shots: params.shots, droppedCastIdsByShot };
  }
  const leadIds = selectStagedLeadCast(params.cast).map(member => member.castId);
  const supportingIds = new Set(supporting.map(member => member.castId));

  const shots = params.shots.map((shot, index) => {
    const declared =
      Array.isArray(shot.castInShot) && shot.castInShot.length > 0
        ? shot.castInShot
        : // Legacy/absent -> everyone, made explicit now that "everyone"
          // would include a supporting tier.
          [...leadIds, ...supportingIds];
    const beatByCastId = new Map(
      (shot.supportingBeats ?? [])
        .filter(beat => beat && typeof beat.action === "string" && beat.action.trim())
        .map(beat => [beat.castId, beat])
    );
    const dropped: string[] = [];
    const kept = declared.filter(castId => {
      if (!supportingIds.has(castId)) return true;
      if (beatByCastId.has(castId)) return true;
      dropped.push(castId);
      return false;
    });
    if (dropped.length > 0) {
      droppedCastIdsByShot[index] = dropped;
    }
    // Only keep beats for characters still in the shot. Note the key is
    // DELETED rather than left unspread when nothing survives — `...shot`
    // would otherwise carry the original (rejected) beats straight through,
    // so a whitespace-only action would still reach the prompt.
    const keptSet = new Set(kept);
    const supportingBeats = (shot.supportingBeats ?? []).filter(
      beat => beatByCastId.has(beat.castId) && keptSet.has(beat.castId)
    );
    const next: T = { ...shot, castInShot: kept };
    if (supportingBeats.length > 0) {
      next.supportingBeats = supportingBeats;
    } else {
      delete next.supportingBeats;
    }
    return next;
  });
  return { shots, droppedCastIdsByShot };
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
  language: "th" | "en",
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

// "bounded_story_arc_fallback" = deterministic TS builder (no LLM call).
// "llm_story_arc" = generateStagedStoryArcPlanWithLLM's LLM path succeeded.
// Previously the LLM path also hardcoded "bounded_story_arc_fallback",
// making it impossible to tell from telemetry whether a plan came from the
// LLM or the deterministic fallback.
export type StagedStoryArcPlanSource = "bounded_story_arc_fallback" | "llm_story_arc";

export type StagedStoryArcPlan = {
  planRevision: number;
  title: string;
  storySummary: string;
  product: StagedStoryArcProduct;
  shots: StagedStoryArcShot[];
  referenceManifestHash: string;
  storyPlanHash: string;
  source: StagedStoryArcPlanSource;
  languagePlan?: StagedStoryArcLanguagePlan;
  // Additive (opt-in): only present when at least one cast member was
  // supplied. Absent entirely for every existing product-only/solo caller.
  cast?: StagedCastMember[];
  conversationMode?: StagedConversationMode;
};

const SHOT_BEATS = [
  ["เปิดเรื่อง", "เปิดภาพสินค้าแบบเต็มชิ้นจากมุมที่เห็นตัวตนของสินค้าได้ชัด"],
  ["เผยสินค้า", "พาสายตาดูรูปทรงและรายละเอียดที่มีหลักฐานจากภาพอ้างอิง"],
  [
    "บริบทการใช้งาน",
    "วางสินค้าในบริบทการใช้งานที่ไม่เพิ่มคุณสมบัติที่ไม่มีหลักฐาน",
  ],
  ["ฟังก์ชันหลัก", "แสดงการใช้งานหรือจุดเด่นที่เห็นได้จากข้อมูลสินค้า"],
  ["ฟังก์ชันรอง", "ย้ำอีกหนึ่งมุมของสินค้าโดยคงรูปทรงและสีตามภาพอ้างอิง"],
  [
    "รายละเอียดวัสดุ",
    "เข้าใกล้รายละเอียดพื้นผิว งานประกอบ หรือส่วนที่มองเห็นได้",
  ],
  [
    "ความต่อเนื่อง",
    "เชื่อมกลับมายังสินค้าชิ้นเดิมโดยไม่เปลี่ยนรุ่นหรืออุปกรณ์",
  ],
  ["สรุปการใช้งาน", "แสดงภาพรวมการใช้งานอย่างสงบและตรวจสอบได้"],
  ["ปิดเรื่อง", "ปิดด้วยภาพสินค้าชัดเจนและคำชวนติดตามแบบไม่กล่าวอ้างเกินจริง"],
] as const;

const SHOT_BEATS_EN = [
  ["Opening", "Open with a full product view from an angle that makes its identity clear."],
  ["Reveal the product", "Guide attention across the shape and details supported by the reference images."],
  ["Usage context", "Place the product in a believable use context without adding unsupported features."],
  ["Primary function", "Show a use or visible benefit that is supported by the product evidence."],
  ["Secondary function", "Reinforce another angle while preserving the reference color and proportions."],
  ["Material detail", "Move closer to visible texture, construction, or a verifiable product detail."],
  ["Continuity", "Return to the same product without changing its model, color, or accessories."],
  ["Usage recap", "Show the overall use calmly and keep every claim grounded in the available evidence."],
  ["Closing", "Close on a clear product view with a restrained call to action and no unsupported claim."],
] as const;

const TONE_LABELS_TH: Record<string, string> = {
  irritated_problem: "หงุดหงิดกับปัญหา",
  funny_light: "ตลกขำเบา ๆ",
  warm_friendly: "จริงใจเป็นกันเอง",
  energetic_excited: "ตื่นเต้นพลังสูง",
  empathetic_soft: "อบอุ่นเห็นใจ",
  expert_confident: "ผู้เชี่ยวชาญมั่นใจ",
  straight_serious: "ตรงไปตรงมา จริงจัง",
};

const STORYTELLING_BEATS_TH: Record<string, readonly [string, string][]> = {
  hook_problem_insight_proof_cta: [
    ["Hook (เปิดประเด็น)", "เปิดฉากด้วย Hook ดึงดูดสายตาและชวนติดตามปัญหาที่ผู้ใช้อาจมองข้าม"],
    ["Problem (สะท้อนปัญหา)", "แสดงปัญหาและจุดชวนหงุดหงิดที่พบบ่อยในการใช้งานจริง"],
    ["Problem Deepen (ขยายปัญหา)", "เจาะลึกความยุ่งยากของปัญหาเดิมๆ ให้เห็นภาพและอารมณ์ชัดเจน"],
    ["Insight (มุมมองทางออก)", "เสนออินไซต์หรือมุมมองใหม่ในการแก้ปัญหานั้น"],
    ["Solution (เปิดตัวสินค้า)", "เปิดตัวสินค้าเป็นทางออกที่ตรงจุดเพื่อแก้ปัญหาที่กล่าวถึง"],
    ["Proof (พิสูจน์ฟังก์ชัน)", "แสดงการใช้งานจริงและฟังก์ชันหลักของสินค้าให้เห็นผลลัพธ์"],
    ["Proof Details (จุดเด่นวัสดุ)", "เข้าใกล้รายละเอียดวัสดุ งานประกอบ หรือคุณสมบัติที่ตรวจสอบได้"],
    ["Result (ผลลัพธ์หลังใช้)", "แสดงผลลัพธ์และความพึงพอใจหลังได้รับการแก้ไขปัญหาด้วยสินค้า"],
    ["CTA (สรุปและชวนติดตาม)", "สรุปจุดเด่นและคำแนะนำปิดท้ายแบบชัดเจน"],
  ],
  hook_problem_emotion_insight_solution_result_cta: [
    ["Hook (เปิดเรื่อง)", "เปิดภาพสินค้ากระตุ้นความสนใจในทันที"],
    ["Problem (ชี้ปัญหา)", "ระบุปัญหาจริงที่ผู้ใช้มักต้องเจอในชีวิตประจำวัน"],
    ["Emotion (สะท้อนอารมณ์)", "สะท้อนความรู้สึกและอารมณ์ร่วมกับปัญหานั้น"],
    ["Insight (อินไซต์ใหม่)", "นำเสนอข้อคิดหรือทางออกที่เฉลียวฉลาดในการรับมือ"],
    ["Solution (สินค้าคือคำตอบ)", "เปิดตัวสินค้าเป็นคำตอบหลักเพื่อคลายกังวล"],
    ["Demonstration (สาธิตการใช้)", "โชว์ฟังก์ชันและการใช้งานจริงของสินค้า"],
    ["Material & Safety (วัสดุและความปลอดภัย)", "เน้นคุณภาพวัสดุและความปลอดภัยที่ตรวจสอบได้"],
    ["Result (ผลลัพธ์ที่เปลี่ยนไป)", "แสดงผลลัพธ์ที่เปลี่ยนความรู้สึกและชีวิตให้ง่ายขึ้น"],
    ["CTA (คำชวนติดตาม)", "ชวนติดตามและสรุปประโยชน์หลักอย่างตรงไปตรงมา"],
  ],
  product_review_situation_problem_try_result_fit: [
    ["Situation (สถานการณ์)", "เริ่มต้นจากสถานการณ์จริงในชีวิตประจำวัน"],
    ["Problem (ข้อจำกัดที่พบ)", "สะท้อนข้อจำกัดหรือปัญหาที่มักเจอในสถานการณ์นั้น"],
    ["Discovery (การค้นพบ)", "ค้นพบสินค้าและทางเลือกใหม่ที่น่าสนใจ"],
    ["Try (ทดลองใช้)", "ลองเปิดกล่องและเริ่มใช้งานสินค้าเป็นครั้งแรก"],
    ["Function (ฟังก์ชันหลัก)", "โชว์ฟังก์ชันเด่นที่แก้ปัญหาได้จริง"],
    ["Result (ผลการทดลอง)", "แสดงผลลัพธ์หลังใช้งานอย่างชัดเจน"],
    ["Material (รายละเอียดวัสดุ)", "ตรวจสอบวัสดุและความคุ้มค่าที่มองเห็นได้"],
    ["Who it fits (ความเหมาะสม)", "สรุปว่าสินค้าเหมาะกับใครและตอบโจทย์อย่างไร"],
    ["CTA (สรุปรีวิว)", "ปิดท้ายด้วยสรุปการรีวิวและคำแนะนำ"],
  ],
  before_after_bridge: [
    ["Before (ก่อนใช้)", "แสดงสภาพหรือปัญหาก่อนได้รับการแก้ไข"],
    ["Pain Point (จุดลำบาก)", "เน้นย้ำความยุ่งยากและความหงุดหงิดเดิม"],
    ["Bridge (ตัวเชื่อมความเปลี่ยนแปลง)", "แนะนำสินค้าเป็นตัวเชื่อมเปลี่ยนผ่าน"],
    ["After (หลังใช้)", "แสดงสภาพและความสะดวกสบายหลังใช้สินค้า"],
    ["Demonstration (การใช้งาน)", "พิสูจน์การทำงานจริงของสินค้า"],
    ["Key Feature (จุดเด่นหลัก)", "โชว์ฟังก์ชันสำคัญที่สร้างความแตกต่าง"],
    ["Safety & Quality (ความปลอดภัย)", "แสดงคุณภาพวัสดุและการประกอบอย่างมั่นใจ"],
    ["Transformation (ผลลัพธ์)", "ย้ำผลลัพธ์ที่เปลี่ยนไปทางดีขึ้น"],
    ["CTA (ข้อคิดปิดท้าย)", "ชวนตัดสินใจและติดตาม"],
  ],
  pas: [
    ["Problem (ระบุปัญหา)", "ชี้ปัญหาหลักที่ผู้ใช้กำลังเผชิญ"],
    ["Agitate (ตอกย้ำความยุ่งยาก)", "ขยายผลกระทบของปัญหาให้เห็นชัด"],
    ["Agitate Deep (ผลกระทบต่อเนื่อง)", "แสดงความหงุดหงิดที่เกิดขึ้นหากไม่แก้ปัญหา"],
    ["Solution (นำเสนอทางออก)", "เสนอสินค้าเป็นคำตอบอย่างตรงจุด"],
    ["Feature 1 (คุณสมบัติ 1)", "โชว์คุณสมบัติเด่นชิ้นแรกในการแก้ปัญหา"],
    ["Feature 2 (คุณสมบัติ 2)", "โชว์คุณสมบัติเสริมและความปลอดภัย"],
    ["Proof (การพิสูจน์)", "ทดสอบการใช้งานจริงให้เห็นผล"],
    ["Outcome (ผลลัพธ์)", "แสดงความโล่งใจและผลลัพธ์ที่ได้รับ"],
    ["CTA (ปิดการรีวิว)", "คำชวนติดตามและสั่งซื้อ"],
  ],
  aida: [
    ["Attention (เรียกร้องความสนใจ)", "เปิดฉากด้วยมุมมองสินค้าที่ดึงดูดสายตาทันที"],
    ["Interest (สร้างความสนใจ)", "กระตุ้นความสนใจด้วยการชี้ปัญหาหรือความต้องการ"],
    ["Desire (สร้างความอยากได้)", "แสดงความสะดวกและประโยชน์ที่น่าประทับใจ"],
    ["Solution (แนะนำสินค้า)", "เปิดตัวสินค้าพร้อมฟังก์ชันหลัก"],
    ["Demonstration (สาธิตฟังก์ชัน)", "โชว์การใช้งานจริงอย่างละเอียด"],
    ["Details (รายละเอียดคุณภาพ)", "เน้นความประณีตของวัสดุและความปลอดภัย"],
    ["Proof (หลักฐานความคุ้มค่า)", "แสดงผลลัพธ์และความพึงพอใจในการใช้"],
    ["Action (ข้อเสนอและการกระทำ)", "แนะนำการเลือกซื้อและใช้งาน"],
    ["CTA (สรุปปิดท้าย)", "ชวนติดตามและปิดการรีวิวอย่างสมบูรณ์"],
  ],
  relatable_story: [
    ["Relatable Moment (โมเมนต์คุ้นเคย)", "เริ่มต้นด้วยพฤติกรรมหรือเรื่องราวใกล้ตัวที่ทุกคนคุ้นเคย"],
    ["Unspoken Problem (ปัญหาที่ไม่ทันคิด)", "เผยปัญหาที่หลายคนมองข้ามหรือไม่ทันสังเกต"],
    ["Frustration (อารมณ์ร่วม)", "สะท้อนความรู้สึกหงุดหงิดหรือความยุ่งยาก"],
    ["Turning Point (จุดเปลี่ยน)", "เจอจุดเปลี่ยนเมื่อได้ลองใช้สินค้า"],
    ["Solution (สินค้าทางเลือก)", "แนะนำสินค้าและวิธีใช้ง่ายๆ"],
    ["Feature Demo (ฟังก์ชันเด่น)", "สาธิตจุดเด่นสินค้าอย่างเป็นธรรมชาติ"],
    ["Quality Proof (พิสูจน์คุณภาพ)", "โชว์วัสดุและความปลอดภัยที่น่าเชื่อถือ"],
    ["Shared Benefit (ประโยชน์ที่ได้รับ)", "สรุปความประทับใจและความสะดวกสบาย"],
    ["CTA (ส่งท้ายเรื่องราว)", "ปิดท้ายด้วยข้อคิดดีๆ และชวนติดตาม"],
  ],
  problem_struggle_solution_transformation: [
    ["Problem (ระบุปัญหา)", "เปิดเรื่องด้วยปัญหาสำคัญที่สร้างความยุ่งยาก"],
    ["Struggle (ความพยายามแก้ไข)", "แสดงความพยายามและอุปสรรคในการแก้ปัญหาแบบเดิมๆ"],
    ["Turning Point (จุดเปลี่ยน)", "พบบริบทใหม่หรือการค้นพบสินค้าที่น่าสนใจ"],
    ["Solution (ทางออก)", "แนะนำสินค้าเป็นวิธีแก้ไขที่ตรงจุด"],
    ["Function Demo (สาธิตการทำงาน)", "โชว์การใช้งานและคุณสมบัติเด่นของสินค้า"],
    ["Quality Check (ตรวจสอบคุณภาพ)", "ตรวจสอบรายละเอียดวัสดุและความปลอดภัยที่น่าเชื่อถือ"],
    ["Transformation (ความเปลี่ยนแปลง)", "แสดงภาพความสะดวกสบายและชีวิตที่ดีขึ้น"],
    ["Proof of Benefit (ยืนยันผลลัพธ์)", "ย้ำผลลัพธ์และความคุ้มค่าหลังใช้งาน"],
    ["CTA (คำชวนติดตาม)", "ชวนตัดสินใจและปิดท้ายการรีวิว"],
  ],
};

// English mirror of STORYTELLING_BEATS_TH. Previously the selected structure
// was silently ignored for English runs (only STORYTELLING_BEATS_TH was ever
// consulted, gated on `summaryLanguage !== "en"`), so an English run lost the
// user-selected storytelling structure without any warning.
const STORYTELLING_BEATS_EN: Record<string, readonly [string, string][]> = {
  hook_problem_insight_proof_cta: [
    ["Hook", "Open with an attention-grabbing hook about a problem the user may be overlooking."],
    ["Problem", "Show the common, frustrating problem people run into in real use."],
    ["Problem Deepen", "Deepen the same problem so its difficulty and emotion are vivid and clear."],
    ["Insight", "Offer an insight or new perspective for solving that problem."],
    ["Solution", "Introduce the product as the precise solution to the stated problem."],
    ["Proof", "Show real usage and the core function with a visible result."],
    ["Proof Details", "Move close on material, construction, or a verifiable standout detail."],
    ["Result", "Show the outcome and satisfaction after the problem is solved."],
    ["CTA", "Summarize the highlights with a clear closing recommendation."],
  ],
  hook_problem_emotion_insight_solution_result_cta: [
    ["Hook", "Open with a product shot that grabs attention immediately."],
    ["Problem", "State a real problem users commonly face in daily life."],
    ["Emotion", "Reflect the feeling and emotion tied to that problem."],
    ["Insight", "Present a clever insight or new way to handle it."],
    ["Solution", "Introduce the product as the main answer that eases the concern."],
    ["Demonstration", "Demonstrate the product's function and real usage."],
    ["Material & Safety", "Emphasize material quality and verifiable safety."],
    ["Result", "Show the outcome that changed how it feels and made life easier."],
    ["CTA", "Invite the viewer to follow and summarize the main benefit plainly."],
  ],
  product_review_situation_problem_try_result_fit: [
    ["Situation", "Start from a real, everyday situation."],
    ["Problem", "Reflect the limitation or problem commonly found in that situation."],
    ["Discovery", "Discover the product and an interesting new option."],
    ["Try", "Unbox it and try using the product for the first time."],
    ["Function", "Show the standout function that truly solves the problem."],
    ["Result", "Show the result after use clearly."],
    ["Material", "Check the visible material quality and value."],
    ["Who it fits", "Summarize who the product fits and how it answers their need."],
    ["CTA", "Close with a summary of the review and a recommendation."],
  ],
  before_after_bridge: [
    ["Before", "Show the condition or problem before it was solved."],
    ["Pain Point", "Emphasize the old difficulty and frustration."],
    ["Bridge", "Introduce the product as the bridge into the transition."],
    ["After", "Show the condition and comfort after using the product."],
    ["Demonstration", "Prove the product's real function."],
    ["Key Feature", "Show the key function that makes the difference."],
    ["Safety & Quality", "Show material quality and construction with confidence."],
    ["Transformation", "Reinforce the positive change in the outcome."],
    ["CTA", "Invite a decision and a follow."],
  ],
  pas: [
    ["Problem", "Point out the main problem the user is facing."],
    ["Agitate", "Expand the impact of the problem so it's clearly visible."],
    ["Agitate Deep", "Show the frustration that continues if it's left unsolved."],
    ["Solution", "Offer the product as the precise answer."],
    ["Feature 1", "Show the first standout feature that solves the problem."],
    ["Feature 2", "Show a supporting feature and its safety."],
    ["Proof", "Test the real usage so the result is visible."],
    ["Outcome", "Show the relief and result that was gained."],
    ["CTA", "Close the review with an invite to follow and buy."],
  ],
  aida: [
    ["Attention", "Open with a product view that grabs attention immediately."],
    ["Interest", "Build interest by pointing out the problem or need."],
    ["Desire", "Show the convenience and benefit in a compelling way."],
    ["Solution", "Introduce the product along with its core function."],
    ["Demonstration", "Demonstrate real usage in detail."],
    ["Details", "Emphasize the refinement of the materials and safety."],
    ["Proof", "Show the result and satisfaction from using it."],
    ["Action", "Recommend the choice and the action to take."],
    ["CTA", "Invite a follow and close the review fully."],
  ],
  relatable_story: [
    ["Relatable Moment", "Start with a familiar behavior or story everyone relates to."],
    ["Unspoken Problem", "Reveal a problem many overlook or don't notice in time."],
    ["Frustration", "Reflect the shared feeling of frustration or difficulty."],
    ["Turning Point", "Reach a turning point upon trying the product."],
    ["Solution", "Introduce the product and how simple it is to use."],
    ["Feature Demo", "Demonstrate the standout feature naturally."],
    ["Quality Proof", "Show the trustworthy material and safety."],
    ["Shared Benefit", "Summarize the impression and comfort gained."],
    ["CTA", "Close with a good thought and an invite to follow."],
  ],
  problem_struggle_solution_transformation: [
    ["Problem", "Open with the key problem that causes difficulty."],
    ["Struggle", "Show the effort and obstacles from solving it the old way."],
    ["Turning Point", "Find a new context or discover an interesting product."],
    ["Solution", "Introduce the product as the precise fix."],
    ["Function Demo", "Show the usage and standout features of the product."],
    ["Quality Check", "Check the material details and trustworthy safety."],
    ["Transformation", "Show the comfort and improved life that results."],
    ["Proof of Benefit", "Reinforce the result and value gained after use."],
    ["CTA", "Invite a decision and close the review."],
  ],
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value: string, max: number): string {
  return value.slice(0, max).trim();
}

function buildShotDialogueTH(
  shotId: number,
  title: string,
  productName: string,
  toneKey?: string | null
): string {
  if (toneKey === "irritated_problem") {
    if (shotId <= 3) {
      return `เบื่อและหงุดหงิดไหมกับปัญหาเดิมๆ? ช็อตนี้พามาดูจุดชวนหัวเสียเรื่อง ${title} ก่อนที่จะเจอทางออกดีๆ`;
    }
    if (shotId <= 5) {
      return `พอเปลี่ยนมาใช้ ${productName} ปัญหาก็จบไป ช่วยแก้ความหงุดหงิดเรื่อง ${title} ได้อย่างตรงจุด`;
    }
    if (shotId <= 7) {
      return `ลองดูรายละเอียดวัสดุและการใช้งานจริงของ ${productName} ที่ปลอดภัย ไร้กังวลเรื่อง ${title}`;
    }
    return `หมดปัญหาหงุดหงิดเดิมๆ ทันที! สรุป ${productName} คุ้มค่า ปลอดภัย ตอบโจทย์ใช้งานจริง`;
  }
  if (toneKey === "funny_light") {
    if (shotId <= 3) {
      return `ถ้าชีวิตต้องเจอปัญหานี้บ่อยๆ ขอบอกเลยว่ามีเรื่องให้ขำ (แต่เจ็บจริง)... ช็อตนี้พาดู ${title}`;
    }
    if (shotId <= 5) {
      return `จนกระทั่งได้ลอง ${productName} อารมณ์เปลี่ยนทันที ช่วยเรื่อง ${title} ได้แบบฮาๆ แต่เห็นผลจริง`;
    }
    if (shotId <= 7) {
      return `ดูวัสดุและการใช้งานจริงกันชัดๆ ตลกแต่เอาเรื่อง คุ้มค่า ปลอดภัยตามภาพอ้างอิง`;
    }
    return `ฮาได้สบายใจ! สรุป ${productName} ตัวนี้ของมันต้องมี ตอบโจทย์ชีวิตสุดๆ`;
  }
  if (toneKey === "warm_friendly") {
    if (shotId <= 3) {
      return `วันนี้อยากมาแชร์เรื่องใกล้ตัวเรื่อง ${title} ที่หลายคนน่าจะเจอกันบ่อยๆ ครับ/ค่ะ`;
    }
    if (shotId <= 5) {
      return `พอได้ลองใช้ ${productName} แล้วชอบมาก ช่วยเรื่อง ${title} ได้เป็นกันเองและลงตัวสุดๆ`;
    }
    if (shotId <= 7) {
      return `พามาดูรายละเอียดวัสดุและการใช้งานกันใกล้ๆ จริงใจ ไม่จกตา ตรวจสอบได้ทุกมุม`;
    }
    return `แนะนำจากใจเลยครับ/ค่ะ ${productName} ตอบโจทย์และคุ้มค่าจริงๆ`;
  }
  if (toneKey === "energetic_excited") {
    if (shotId <= 3) {
      return `มาแล้วทุกคน! ช็อตนี้พามาดู ${title} ของ ${productName} ที่ต้องบอกว่าน่าตื่นเต้นมาก!`;
    }
    if (shotId <= 5) {
      return `โชว์ฟังก์ชันกันเน้นๆ ${productName} ตัวนี้ใช้งานได้เจ๋งสุดๆ ปังมาก!`;
    }
    if (shotId <= 7) {
      return `ดูงานประกอบและรายละเอียดวัสดุสิครับ จัดเต็ม ปลอดภัย คุณภาพแน่น!`;
    }
    return `สุดปัง! สรุป ${productName} ตัวนี้ไม่ทำให้ผิดหวัง ลุยเลย!`;
  }
  if (toneKey === "empathetic_soft") {
    if (shotId <= 3) {
      return `เข้าใจเลยว่าความกังวลเรื่อง ${title} มันสร้างความยุ่งยากใจมากแค่ไหน...`;
    }
    if (shotId <= 5) {
      return `${productName} ออกแบบมาด้วยความใส่ใจ เพื่อช่วยผ่อนคลายความกังวลเรื่อง ${title}`;
    }
    if (shotId <= 7) {
      return `รายละเอียดวัสดุอ่อนโยน ปลอดภัย ใส่ใจในทุกจุดเพื่อความสบายใจของคุณ`;
    }
    return `อบอุ่นใจทุกครั้งที่ใช้งาน สรุป ${productName} คือทางเลือกที่ดูแลคุณอย่างแท้จริง`;
  }
  if (toneKey === "expert_confident") {
    if (shotId <= 3) {
      return `การวิเคราะห์เรื่อง ${title} ชี้ให้เห็นปัจจัยสำคัญที่ต้องพิจารณาอย่างถี่ถ้วน`;
    }
    if (shotId <= 5) {
      return `${productName} ตอบโจทย์ด้านประสิทธิภาพและฟังก์ชันการใช้งานตามมาตรฐานอย่างแม่นยำ`;
    }
    if (shotId <= 7) {
      return `ตรวจสอบรายละเอียดโครงสร้างและวัสดุ มีหลักฐานยืนยันความปลอดภัยที่น่าเชื่อถือ`;
    }
    return `สรุปผลการทดสอบ ${productName} มีคุณภาพและประสิทธิภาพตามมาตรฐานที่มั่นใจได้`;
  }
  if (toneKey === "straight_serious") {
    if (shotId <= 3) {
      return `ตรงไปตรงมา ช็อตนี้แสดงปัญหาและข้อจำกัดเรื่อง ${title} โดยไม่อ้อมค้อม`;
    }
    if (shotId <= 5) {
      return `การใช้งานจริงของ ${productName} แสดงผลลัพธ์และฟังก์ชันหลักชัดเจน`;
    }
    if (shotId <= 7) {
      return `ตรวจสอบรายละเอียดวัสดุ ความแข็งแรง และความปลอดภัยตามข้อมูลจริง`;
    }
    return `สรุปตามจริง ${productName} ให้ผลลัพธ์ตามที่ระบุ คุ้มค่าตามข้อมูล`;
  }
  return `ช็อตที่ ${shotId} พาไปดู${title}ของ${productName} โดยยึดข้อมูลและภาพอ้างอิงที่ตรวจสอบได้`;
}

// Short host (opener/asker) line for the two-person conversation deterministic
// fallback. The guest's line stays the existing tone-varying
// `buildShotDialogueTH` content — this only adds a short question/prompt from
// the host so the beat is now split across two speakers instead of replaced.
function buildShotHostPromptTH(
  shotId: number,
  title: string,
  productName: string
): string {
  if (shotId <= 3) {
    return `เล่าให้ฟังหน่อยว่าเรื่อง ${title} เป็นยังไงบ้าง?`;
  }
  if (shotId <= 5) {
    return `แล้ว ${productName} ช่วยเรื่องนี้ได้จริงไหม ลองโชว์ให้ดูหน่อย`;
  }
  if (shotId <= 7) {
    return `ขอดูรายละเอียดวัสดุและการใช้งานจริงหน่อยได้ไหม?`;
  }
  return `สรุปแล้วคิดว่ายังไงกับ ${productName}?`;
}

function buildShotHostPromptEN(
  shotId: number,
  title: string,
  productName: string
): string {
  if (shotId <= 3) {
    return `Tell me more about ${title.toLowerCase()} — what's going on here?`;
  }
  if (shotId <= 5) {
    return `Does ${productName} really help with this? Show me.`;
  }
  if (shotId <= 7) {
    return `Can we take a closer look at the materials and how it's actually used?`;
  }
  return `So overall, what do you think about ${productName}?`;
}

function buildShotDialogueTurnsTH(
  shotId: number,
  title: string,
  productName: string,
  toneKey: string | null | undefined,
  host: StagedCastMember,
  guest: StagedCastMember
): StagedDialogueTurn[] {
  return [
    {
      castId: host.castId,
      speakerName: host.name,
      line: buildShotHostPromptTH(shotId, title, productName),
    },
    {
      castId: guest.castId,
      speakerName: guest.name,
      line: buildShotDialogueTH(shotId, title, productName, toneKey),
    },
  ];
}

function buildShotDialogueTurnsEN(
  shotId: number,
  title: string,
  productName: string,
  host: StagedCastMember,
  guest: StagedCastMember
): StagedDialogueTurn[] {
  return [
    {
      castId: host.castId,
      speakerName: host.name,
      line: buildShotHostPromptEN(shotId, title, productName),
    },
    {
      castId: guest.castId,
      speakerName: guest.name,
      line: `Shot ${shotId} explores the ${title.toLowerCase()} of ${productName}, grounded in the approved references and verifiable information.`,
    },
  ];
}

function buildNarrativeStorySummaryTH(
  productName: string,
  structureKey?: string | null,
  toneKey?: string | null,
  revisionNotes?: string | null
): string {
  const toneLabel = TONE_LABELS_TH[toneKey ?? ""] ? ` - โทน${TONE_LABELS_TH[toneKey ?? ""]}` : "";
  let baseSummary = "";

  if (structureKey === "hook_problem_insight_proof_cta") {
    baseSummary = `เรื่องย่อ (Hook → Problem → Insight → Proof → CTA${toneLabel}): เปิดเรื่องด้วย Hook ดึงดูดสายตาเกี่ยวกับ ${productName} สะท้อนปัญหาและความหงุดหงิดเดิมๆ ของผู้ใช้ที่พบบ่อย เสนออินไซต์และมุมมองทางออกใหม่ด้วยสินค้า พิสูจน์ด้วยฟังก์ชันการใช้งานและวัสดุความปลอดภัยที่ตรวจสอบได้ ปิดท้ายด้วยสรุปผลการใช้งานและคำชวนติดตามอย่างคุ้มค่า`;
  } else if (structureKey === "hook_problem_emotion_insight_solution_result_cta") {
    baseSummary = `เรื่องย่อ (Hook → Problem → Emotion → Insight → Solution → Result → CTA${toneLabel}): ดึงดูดความสนใจใน ${productName} ชี้ปัญหาและสะท้อนอารมณ์ความกังวลเดิม นำเสนออินไซต์และแนะนำสินค้าเป็นคำตอบหลัก แสดงผลการสาธิตใช้งานจริงและวัสดุปลอดภัย ปิดท้ายด้วยผลลัพธ์ที่ดีขึ้นและคำชวนติดตาม`;
  } else if (structureKey === "product_review_situation_problem_try_result_fit") {
    baseSummary = `เรื่องย่อ (Situation → Problem → Try → Result → Fit${toneLabel}): เริ่มจากสถานการณ์จริงในชีวิตประจำวันเกี่ยวกับการใช้ ${productName} สะท้อนข้อจำกัดที่พบ ลองเปิดกล่องทดลองใช้งาน โชว์ผลลัพธ์และวัสดุที่คุ้มค่า พร้อมสรุปความเหมาะสมตอบโจทย์ผู้ใช้งาน`;
  } else if (structureKey === "before_after_bridge") {
    baseSummary = `เรื่องย่อ (Before → After → Bridge${toneLabel}): แสดงปัญหาก่อนใช้งาน ${productName} แนะนำสินค้าเป็นตัวเชื่อมเปลี่ยนผ่านสู่ความสะดวกสบายหลังใช้ สาธิตฟังก์ชันสำคัญและตรวจสอบความปลอดภัย ปิดท้ายด้วยความเปลี่ยนแปลงที่ชัดเจน`;
  } else if (structureKey === "pas") {
    baseSummary = `เรื่องย่อ (PAS - Problem → Agitate → Solution${toneLabel}): ชี้ปัญหาหลักและตอกย้ำความยุ่งยากเดิม นำเสนอ ${productName} เป็นทางออกหลัก พิสูจน์ฟังก์ชันและการใช้งานจริงอย่างละเอียด ปิดท้ายด้วยผลลัพธ์และความคุ้มค่า`;
  } else if (structureKey === "aida") {
    baseSummary = `เรื่องย่อ (AIDA - Attention → Interest → Desire → Action${toneLabel}): ดึงดูดสายตากับ ${productName} กระตุ้นความสนใจและความอยากได้ด้วยฟังก์ชันเด่น สาธิตการใช้งานจริงและคุณภาพวัสดุ ปิดท้ายด้วยคำชวนสั่งซื้อและติดตาม`;
  } else if (structureKey === "relatable_story") {
    baseSummary = `เรื่องย่อ (Relatable Story${toneLabel}): เล่าโมเมนต์ใกล้ตัวเกี่ยวกับ ${productName} เผยปัญหาที่ไม่ทันคิด สู่จุดเปลี่ยนในการลองใช้งานจริง โชว์ความปลอดภัยและประโยชน์ที่ได้รับ ปิดท้ายด้วยข้อคิดดีๆ และคำแนะนำ`;
  } else if (structureKey === "problem_struggle_solution_transformation") {
    baseSummary = `เรื่องย่อ (Problem → Struggle → Solution → Transformation${toneLabel}): เปิดด้วยปัญหาและอุปสรรคในการแก้ไขแบบเดิม สู่จุดเปลี่ยนที่ค้นพบ ${productName} สาธิตการทำงานและตรวจสอบคุณภาพวัสดุ ยืนยันความเปลี่ยนแปลงที่ดีขึ้นและผลลัพธ์ที่คุ้มค่า`;
  } else {
    baseSummary = `เรื่องย่อ 9 ช็อต (${productName}${toneLabel}): เปิดเรื่องดึงดูดสายตา เผยรายละเอียดและฟังก์ชันหลักของสินค้าในบริบทการใช้งานจริง ตรวจสอบงานประกอบและวัสดุอย่างปลอดภัย ปิดท้ายด้วยสรุปการใช้งานที่ตรวจสอบได้`;
  }

  const notes = clean(revisionNotes);
  if (notes) {
    baseSummary += ` (ทิศทางปรับแก้ไข: ${notes})`;
  }
  return baseSummary;
}

function buildNarrativeStorySummaryEN(
  productName: string,
  structureKey?: string | null,
  toneKey?: string | null,
  revisionNotes?: string | null
): string {
  const toneText = toneKey ? ` in ${toneKey} tone` : "";
  let baseSummary = "";
  if (structureKey) {
    const formattedStruct = structureKey.replace(/_/g, " ").toUpperCase();
    baseSummary = `Nine-shot story arc (${formattedStruct}${toneText}): Open with an engaging hook for ${productName}, highlight real user problems and pain points, present the insight and product solution, demonstrate verifiable features and safe material construction, and close with a clear call to action.`;
  } else {
    baseSummary = `A continuous nine-shot review of ${productName}${toneText}, grounded in approved product references and verifiable information.`;
  }
  const notes = clean(revisionNotes);
  if (notes) {
    baseSummary += ` (Revision direction: ${notes})`;
  }
  return baseSummary;
}

// Additive (feature/marketplace-flexible-shots): mechanically resizes a
// beats table to `targetCount` entries. This is a BOUNDED, purely mechanical
// fallback — it never authors new creative content. It always keeps the
// first beat (hook/opening) and the last beat (CTA/closing) fixed, and cycles
// through the beats in between to fill whatever length is requested. When
// `targetCount === beats.length` (the common/default 9-shot case) it returns
// the table completely unchanged (byte-identical output).
function resizeShotBeats(
  beats: readonly (readonly [string, string])[],
  targetCount: number
): Array<[string, string]> {
  if (targetCount === beats.length) {
    return beats.map(beat => [beat[0], beat[1]] as [string, string]);
  }
  const first = beats[0];
  const last = beats[beats.length - 1];
  if (targetCount <= 1) {
    return [first ? [first[0], first[1]] : ["", ""]];
  }
  if (targetCount === 2) {
    return [
      [first[0], first[1]],
      [last[0], last[1]],
    ];
  }
  const middle = beats.slice(1, beats.length - 1);
  const middleTargetCount = targetCount - 2;
  const resized: Array<[string, string]> = [[first[0], first[1]]];
  for (let index = 0; index < middleTargetCount; index += 1) {
    const source = middle.length > 0 ? middle[index % middle.length] : last;
    resized.push([source[0], source[1]]);
  }
  resized.push([last[0], last[1]]);
  return resized;
}

export function buildStagedStoryArcPlan(input: {
  runId: string;
  product: StagedStoryArcProduct;
  referenceManifestHash?: string | null;
  revision?: number;
  previousStorySummary?: string | null;
  languagePlan?: StagedStoryArcLanguagePlan;
  reviewTone?: string | null;
  storytellingStructure?: string | null;
  // Additive (opt-in). Omitting this (or passing 0/1 members) reproduces
  // today's output byte-for-byte — only >=2 members switch on
  // two_person_conversation behavior.
  cast?: StagedCastMember[];
  // Additive (opt-in). Defaults to 10 to reproduce today's output exactly.
  shotDurationSeconds?: number;
  // Additive (opt-in, feature/marketplace-flexible-shots). Defaults to 9 (the
  // beats table's natural length) to reproduce today's output exactly. For
  // any other count, the beats table is mechanically resized via
  // `resizeShotBeats` — this is a bounded deterministic fallback, never new
  // authored content. The LLM path (`generateStagedStoryArcPlanWithLLM`) is
  // the primary source of truth for non-default shot counts; this function
  // only runs when the LLM path is skipped or fails.
  shotCount?: number;
}): StagedStoryArcPlan {
  const productName = bounded(
    clean(input.product.productName) || "สินค้า",
    240
  );
  const productId = clean(input.product.productId);
  const productDescription = bounded(clean(input.product.description), 500);
  const languagePlan = input.languagePlan;
  const summaryLanguage = languagePlan?.summaryLanguage === "en" ? "en" : "th";
  const dialogueLanguage = languagePlan?.dialogueLanguage === "en" ? "en" : "th";
  const structureKey = clean(input.storytellingStructure);
  const toneKey = clean(input.reviewTone);
  const customBeatsTH = STORYTELLING_BEATS_TH[structureKey];
  const customBeatsEN = STORYTELLING_BEATS_EN[structureKey];
  const baseShotBeats =
    summaryLanguage === "en"
      ? customBeatsEN ?? SHOT_BEATS_EN
      : customBeatsTH ?? SHOT_BEATS;
  const targetShotCount =
    typeof input.shotCount === "number" &&
    Number.isFinite(input.shotCount) &&
    input.shotCount > 0
      ? Math.max(1, Math.min(30, Math.round(input.shotCount)))
      : baseShotBeats.length;
  const shotBeats = resizeShotBeats(baseShotBeats, targetShotCount);

  // Deterministic dialogue is a TWO-VOICE builder — it must read the leads,
  // not the first two roster entries, now that the roster can hold supporting
  // characters (`planning/marketplace-four-character-cast/plan.md`).
  const cast = selectStagedLeadCast(input.cast);
  const conversationMode = resolveStagedConversationMode(input.cast);
  const [hostMember, guestMember] = cast;
  const shotDurationSeconds = Math.max(
    1,
    Math.round(input.shotDurationSeconds ?? 10)
  );

  const revisionContext = clean(input.previousStorySummary);
  const storySummary = bounded(
    summaryLanguage === "en"
      ? buildNarrativeStorySummaryEN(
          productName,
          structureKey,
          toneKey,
          revisionContext
        )
      : buildNarrativeStorySummaryTH(
          productName,
          structureKey,
          toneKey,
          revisionContext
        ),
    500
  );
  const shots = shotBeats.map(([title, visual], index) => {
    const shotId = index + 1;
    let dialogue: string;
    let dialogueTurns: StagedDialogueTurn[] | undefined;
    let castInShot: string[] | undefined;

    if (
      conversationMode === "two_person_conversation" &&
      hostMember &&
      guestMember
    ) {
      const turns =
        dialogueLanguage === "en"
          ? buildShotDialogueTurnsEN(shotId, title, productName, hostMember, guestMember)
          : buildShotDialogueTurnsTH(
              shotId,
              title,
              productName,
              toneKey,
              hostMember,
              guestMember
            );
      dialogueTurns = turns;
      dialogue = bounded(renderStagedDialogueFromTurns(turns), 640);
      castInShot = [hostMember.castId, guestMember.castId];
    } else {
      dialogue = bounded(
        dialogueLanguage === "en"
          ? `Shot ${shotId} explores the ${title.toLowerCase()} of ${productName}, grounded in the approved references and verifiable information.`
          : buildShotDialogueTH(shotId, title, productName, toneKey),
        320
      );
    }

    return {
      shotId,
      title,
      storySummary: bounded(`${shotId}. ${title}: ${visual}`, 600),
      visualSummary: bounded(visual, 400),
      dialogue,
      durationSeconds: shotDurationSeconds,
      ...(dialogueTurns ? { dialogueTurns } : {}),
      ...(castInShot ? { castInShot } : {}),
    };
  });
  const product = {
    productId,
    productName,
    description: productDescription || null,
    imageUrls: input.product.imageUrls.map(clean).filter(Boolean).slice(0, 5),
  } satisfies StagedStoryArcProduct;
  const referenceManifestHash =
    clean(input.referenceManifestHash) ||
    buildProductionStableHash({ productId, imageUrls: product.imageUrls });
  const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
  const storyPlanHash = buildProductionStableHash({
    runId: input.runId,
    planRevision,
    storySummary,
    product,
    shots,
    referenceManifestHash,
    ...(languagePlan ? { languagePlan } : {}),
  });
  const plan = {
    planRevision,
    title: `Marketplace Auto Review: ${productName}`,
    storySummary,
    product,
    shots,
    referenceManifestHash,
    storyPlanHash,
    source: "bounded_story_arc_fallback" as const,
    ...(languagePlan ? { languagePlan } : {}),
    ...(cast.length > 0 ? { cast, conversationMode } : {}),
  };
  const contract = validateStagedShotContract(
    shots.map(shot => ({
      shotId: shot.shotId,
      durationSeconds: shot.durationSeconds,
    })),
    { expectedCount: targetShotCount }
  );
  if (!contract.valid) {
    throw new Error(
      `staged_story_plan_invalid:${contract.reasonCodes.join(",")}`
    );
  }
  return plan;
}

export function buildStagedImagePrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  customManifest?: Array<{ url: string; role?: string; label?: string; active?: boolean }>;
  /** This shot's per-shot look overrides, keyed by castId. Absent = default
   *  looks, which is every pre-existing run. */
  castLooks?: Record<string, ShotCastLook> | null;
}): string {
  const thai = input.plan.languagePlan?.promptLanguage === "th";

  const activeItems = (input.customManifest || []).filter(
    item => item && typeof item.url === "string" && item.url.trim() && item.active !== false
  );
  const productItems = activeItems.filter(item => item.role !== "character");
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
    : "@Image1";

  const productCount = hasProduct ? productItems.length : 1;
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
    const refLines = [
      `ใช้ ${productTags} เป็นภาพอ้างอิงหลักของสินค้า โดยรักษารูปร่าง สี วัสดุ ฉลาก และสัดส่วนตามหลักฐานทุกประการ`,
    ];
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
      `สร้างภาพรีวิวสินค้าแนวตั้ง 9:16 สำหรับช็อตที่ ${input.shot.shotId} เท่านั้น`,
      `เรื่องย่อที่ยืนยันแล้ว: ${input.plan.storySummary}`,
      `เรื่องย่อของช็อต: ${input.shot.storySummary}`,
      `ทิศทางภาพ: ${input.shot.visualSummary}`,
      `บทพูดของช็อตนี้ (ต้องสะท้อนอารมณ์/สถานการณ์นี้ในภาพด้วย): ${input.shot.dialogue}`,
      ...refLines,
      ...conversationLines,
      "ห้ามเพิ่มอุปกรณ์ คุณสมบัติ คำกล่าวอ้าง ราคา ข้อความ ป้าย โลโก้ ลายน้ำ หรือ UI ของ marketplace ที่ไม่มีหลักฐาน",
      "ต้องเห็นสินค้าอย่างชัดเจน และห้ามแสดงบทพูดเป็นข้อความบนภาพ",
    ].join("\n");
  }

  const refLinesEng = [
    `Use ${productTags} as the primary product reference and preserve the product's visible shape, color, materials, labels, and proportions exactly.`,
  ];
  if (hasCharacter) {
    refLinesEng.push(
      `Use ${characterTags} as the primary person/character reference image (character identity lock), preserving the character's facial features, identity, hairstyle, and appearance consistently.`
    );
  } else {
    refLinesEng.push(
      "If a person or character reference is supplied, preserve that identity consistently as a separate identity lock; never let it alter the product lock."
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
    `Create one vertical 9:16 product-review image for shot ${input.shot.shotId}.`,
    `Approved story summary: ${input.plan.storySummary}`,
    `Approved shot brief: ${input.shot.storySummary}`,
    `Visual direction: ${input.shot.visualSummary}`,
    `This shot's dialogue (the image MUST reflect this emotion/situation): ${input.shot.dialogue}`,
    ...refLinesEng,
    ...conversationLinesEng,
    "Do not invent accessories, claims, text, price, badges, logos, watermarks, or marketplace UI.",
    "Keep the product clearly visible and do not render the dialogue as on-screen text.",
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
  const turns = input.shot.dialogueTurns;

  const conversationLinesTH: string[] = [];
  const conversationLinesEng: string[] = [];
  if (isConversation && turns && turns.length > 0) {
    conversationLinesTH.push(
      "บทสนทนาตามลำดับผู้พูด (ต้องพูดตามลำดับนี้เป๊ะ ห้ามเขียนใหม่):",
      ...turns.map((turn, i) => `${i + 1}. ${turn.speakerName}: ${turn.line}`)
    );
    conversationLinesEng.push(
      "Dialogue in speaking order (must be spoken exactly in this order, do not rewrite):",
      ...turns.map((turn, i) => `${i + 1}. ${turn.speakerName}: ${turn.line}`)
    );
  }

  // Supporting business + optional short line
  // (`planning/marketplace-four-character-cast/plan.md` §3). Kept in its own
  // block, AFTER the lead turns, so a supporting line can never be mistaken
  // for one of the two main voices or reorder the conversation.
  const supportingBeats = (input.shot.supportingBeats ?? []).filter(beat =>
    clean(beat.action)
  );
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
      `บทพูดที่ยืนยันแล้ว (ห้ามเขียนใหม่): ${input.shot.dialogue}`,
      `บริบทเรื่องที่ยืนยันแล้ว: ${input.shot.storySummary}`,
      ...conversationLinesTH,
      "การเคลื่อนไหวต้องเป็นธรรมชาติ นุ่มนวล ไม่กระตุก และห้ามเพิ่มคำกล่าวอ้าง ราคา caption โลโก้ ลายน้ำ หรือ UI ที่ไม่มีหลักฐาน",
    ].join("\n");
  }
  return [
    `Create a ${durationSeconds}-second vertical 9:16 product-review video for shot ${input.shot.shotId}.`,
    `Use the accepted image artifact for shot ${input.shot.shotId} as the exact visual source.`,
    `Approved dialogue (must not be rewritten): ${input.shot.dialogue}`,
    `Approved story context: ${input.shot.storySummary}`,
    ...conversationLinesEng,
    "Motion must feel natural, restrained, and physically coherent while preserving product identity and continuity.",
    "If a person or character reference is supplied, preserve that identity consistently throughout the shot.",
    "Do not add unsupported claims, price text, captions, logos, watermarks, or marketplace UI.",
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
  // Fail-open QC warnings from `assessStagedPlanAdherence` (tone/structure/
  // conversation-turns adherence). Only meaningful on `story_plan`
  // checkpoints; omit or pass an empty array everywhere else.
  adherenceWarnings?: string[];
}): HumanApprovalCheckpointV1 {
  const shotScoped =
    input.kind === "image_prompt" ||
    input.kind === "image_result" ||
    input.kind === "video_prompt" ||
    input.kind === "video_result";
  const autoApprove = input.autoApprove;
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
    ...(input.adherenceWarnings && input.adherenceWarnings.length > 0
      ? { adherenceWarnings: input.adherenceWarnings }
      : {}),
  };
}

export function buildStagedPlanView(plan: StagedStoryArcPlan) {
  return {
    title: plan.title,
    storySummary: plan.storySummary,
    planRevision: plan.planRevision,
    storyPlanHash: plan.storyPlanHash,
    shots: plan.shots,
    referenceManifestHash: plan.referenceManifestHash,
    ...(plan.languagePlan ? { languagePlan: plan.languagePlan } : {}),
  };
}

/**
 * Fail-open QC helper: never throws. Anything unparseable/absent counts as
 * satisfied (no warning). Uses the new staged reason codes to flag likely
 * adherence gaps for a plan — never blocks/kills the run by itself.
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
  try {
    const structureKey = clean(options.storytellingStructure);
    const toneKey = clean(options.reviewTone);
    const conversationMode =
      options.conversationMode ?? resolveStagedConversationMode(plan.cast ?? []);
    const shots = Array.isArray(plan.shots) ? plan.shots : [];

    if (structureKey && shots.length >= 1) {
      const hasEmptyBeat = shots.some(
        shot => !clean(shot?.title) || !clean(shot?.storySummary)
      );
      if (hasEmptyBeat) {
        warnings.push("staged_structure_beat_missing");
      }
    }

    if (toneKey && shots.length > 0) {
      const allDialogueBlank = shots.every(shot => !clean(shot?.dialogue));
      if (allDialogueBlank) {
        warnings.push("staged_tone_not_adhered");
      }
    }

    if (conversationMode === "two_person_conversation" && shots.length > 0) {
      const missingTurns = shots.some(
        shot => !Array.isArray(shot?.dialogueTurns) || shot.dialogueTurns.length < 2
      );
      if (missingTurns) {
        warnings.push("staged_conversation_turns_missing");
      }
    }
  } catch {
    // fail-open: never throw, never block the run.
  }
  return { warnings };
}

export async function generateStagedStoryArcPlanWithLLM(input: {
  runId: string;
  userId?: number;
  tenantId?: string;
  product: StagedStoryArcProduct;
  referenceManifestHash?: string | null;
  revision?: number;
  previousStorySummary?: string | null;
  languagePlan?: StagedStoryArcLanguagePlan;
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
}): Promise<StagedStoryArcPlan> {
  let chosenModel = input.model?.trim();
  if (!chosenModel || chosenModel === "__automatic__") {
    try {
      // "อัตโนมัติ" must draw from the admin-curated RECOMMENDED set, not the
      // cheapest model that merely clears the capability floor.
      // `selectQualityLargeContextEligibleModels` is sorted cheapest-first, so
      // taking `[0]` here is what put `google/gemini-3.1-flash-lite` — the
      // exact model behind the 2026-07-18 lead-beauty-gate incident — in
      // charge of authoring the story. Vertical Drama's own resolver was moved
      // to the recommended set on 2026-07-31 (owner override, see
      // `resolveQualityLargeContextModelId`); the marketplace staged planner
      // was left behind, and it now matters much more because a 4-person cast
      // with supporting beats is exactly the kind of structured output a lite
      // model gets wrong (`project_vd_weak_model_json_class`).
      const { resolveQualityLargeContextModelId } = await import(
        "./verticalDramaImproveScript"
      );
      const best = await resolveQualityLargeContextModelId();
      if (best) {
        chosenModel = best;
      }
    } catch {
      // Fallback if DB query unavailable
    }
  }
  if (!chosenModel || chosenModel === "__automatic__") {
    chosenModel = "gemini-2.5-flash";
  }

  const productName = bounded(clean(input.product.productName) || "สินค้า", 240);
  const productDescription = bounded(clean(input.product.description), 500);
  const structureKey = clean(input.storytellingStructure) || "hook_problem_insight_proof_cta";
  const toneKey = clean(input.reviewTone) || "irritated_problem";
  const revisionNotes = clean(input.previousStorySummary);

  const userId = input.userId ?? 1;
  const tenantId = input.tenantId ?? "system";

  const shotDurationSeconds = Math.max(
    1,
    Math.round(input.shotDurationSeconds ?? 10)
  );
  const dialogueWindowMinSeconds = Math.max(1, shotDurationSeconds - 3);

  // Additive (feature/marketplace-flexible-shots). See the `shotCount` doc
  // comment on the input type above.
  const isAutoShotCount = input.shotCount === "auto";
  const fixedShotCount = isAutoShotCount
    ? undefined
    : typeof input.shotCount === "number" && Number.isFinite(input.shotCount)
    ? Math.max(1, Math.min(30, Math.round(input.shotCount)))
    : 9;

  // The DIALOGUE roster is the leads only — supporting characters are handed
  // to the model separately (they carry beats, not conversational turns), so
  // this block's two-voice contract stays exactly as it was.
  const activeCast = selectStagedLeadCast(input.cast);
  const conversationMode = resolveStagedConversationMode(input.cast);
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
                rosterLanguage,
              )})`
          )
          .join(
            "\n"
          )}\n\nกฎบทสนทนาสองคน (บังคับ): ทุกช็อตต้องเป็นบทสนทนาระหว่างสองคนนี้ตามบทบาท — คนที่มีบทบาท "host" เป็นผู้เปิดประเด็น/ถาม และคนที่มีบทบาท "guest" เป็นผู้ตอบ/รีวิว โดยยังต้องคงโครงสร้างการเล่าเรื่อง "${structureKey}" และโทน "${toneKey}" ของแต่ละช็อตให้ครบทุกประเด็น — งานของคุณคือแบ่งบทพูดของแต่ละ beat เดิมออกเป็นสองคนผลัดกันพูด ไม่ใช่แทนที่หรือละทิ้งโครงสร้าง/โทนที่กำหนดไว้\n\nสำหรับแต่ละช็อต ให้ส่งฟิลด์ "dialogueTurns" เป็น array ของ {castId, line} เรียงตามลำดับการพูดจริง (อย่างน้อย 2 turn ต่อช็อต) โดยค่า castId ต้องตรงกับที่กำหนดไว้ข้างต้นเป๊ะ (ฟิลด์ "dialogue" จะถูกสร้างจาก turns เหล่านี้โดยอัตโนมัติ ไม่ต้องส่งก็ได้)`
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
          activeCast[0].descriptor ? ` — ${clean(activeCast[0].descriptor)}` : ""
        }\nบทพูดทุกช็อตเป็นบทพูดเดี่ยวของ "${activeCast[0].name}" ในมุมมองบุคคลที่หนึ่ง สอดคล้องกับตัวตนของผู้ดำเนินรายการคนนี้ โดยคงโครงสร้าง "${structureKey}" และโทน "${toneKey}" ครบทุกประเด็น (ไม่ต้องส่ง dialogueTurns)`
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
          )}\n\nกฎตัวประกอบ (บังคับ): ตัวประกอบไม่ใช่คู่สนทนาหลัก — บทสนทนาหลักยังเป็นของ host/guest เท่านั้น ตัวประกอบจะ "มีบทพูดสั้น ๆ ก็ได้ หรือไม่มีบทพูดเลยก็ได้" แต่ทุกครั้งที่ปรากฏในช็อตต้องมีเหตุผลที่ส่งเสริมเรื่องราว เช่น ทำให้บรรยากาศดีขึ้น เพิ่มจุดเสริมของเรื่อง หรือดึงอารมณ์คนดู ห้ามให้ตัวประกอบอยู่ในภาพเฉย ๆ โดยไม่ทำอะไรที่เกี่ยวข้องกับเรื่อง\n\nสำหรับแต่ละช็อต ให้ส่ง:\n- "castInShot": array ของ castId ทุกคนที่อยู่ในช็อตนั้นจริง ๆ (ตัวประกอบไม่จำเป็นต้องอยู่ครบทุกช็อต — ให้เลือกเฉพาะช็อตที่การมีอยู่ของเขาช่วยเรื่องราว)\n- "supportingBeats": array ของ {castId, action, line?} เฉพาะตัวประกอบที่อยู่ในช็อตนั้น โดย "action" คือสิ่งที่เขากำลังทำซึ่งเชื่อมกับเรื่องราวของช็อต (บังคับ) และ "line" คือบทพูดสั้น ๆ (ใส่หรือไม่ใส่ก็ได้)\n\nตัวประกอบคนใดที่อยู่ใน castInShot แต่ไม่มี action จะถูกตัดออกจากช็อตนั้นโดยอัตโนมัติ`
      : "";

  // Additive (feature/marketplace-flexible-shots): the shot-count instruction
  // is now parametric. Fixed count -> state the exact number as a fact.
  // "auto" -> the shot count itself is LLM judgment: state the criterion
  // (per-shot duration) as a fact and let the model decide within 7-30 based
  // on how much content the product genuinely needs.
  const shotCountInstruction = isAutoShotCount
    ? `จำนวนช็อต: ไม่กำหนดตายตัว ให้คุณเป็นผู้ตัดสินใจเองว่าเนื้อหาของสินค้านี้ควรใช้ช็อตทั้งหมดกี่ช็อต โดยเลือกจำนวนระหว่าง 7-30 ช็อต และใช้ "ความยาวต่อช็อต" (${shotDurationSeconds} วินาที/ช็อต) เป็นเกณฑ์หลักในการตัดสินใจ — สินค้าที่มีรายละเอียด/ฟังก์ชันเยอะควรใช้จำนวนช็อตมากขึ้นเพื่อเล่าเรื่องได้ครบถ้วน ส่วนสินค้าที่เรียบง่ายใช้จำนวนช็อตน้อยกว่าได้ ให้ส่งช็อตทั้งหมดที่คุณเลือกกลับมาใน shots array (เรียง shotId ต่อเนื่อง 1 ถึงจำนวนช็อตที่เลือก)`
    : `จำนวนช็อต: วางแผนบทรีวิวทั้งหมด ${fixedShotCount} ช็อต (ช็อตละ ${shotDurationSeconds} วินาที)`;

  const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านการวางแผนบท Storyboard และรีวิวสินค้า Marketplace (Marketplace Auto Review Storyboard Specialist)

หน้าที่ของคุณคือวิเคราะห์ข้อมูลสินค้าที่ได้รับ แล้วสังเคราะห์เรื่องย่อ และวางแผนบทรีวิวตามเงื่อนไขดังนี้:
0. ${shotCountInstruction}
1. โครงสร้างการเล่าเรื่อง (Storytelling Structure): วางลำดับช็อตทั้งหมดตามโครงสร้าง "${structureKey}" โดยกำหนดชื่อช็อต (title) และสรุปการถ่ายทำ (visualSummary) ให้เห็นภาพชัดเจน
2. โทนการพูด (Review Tone): บทพูดเสียงพากย์ภาษาไทย (dialogue) ในทุกช็อตต้องสื่อสารด้วยโทน "${toneKey}" อย่างเป็นธรรมชาติ และสอดคล้องกับตัวตนสินค้าจริง
3. ความจริงใจจากข้อมูลสินค้า: อ้างอิงเฉพาะฟังก์ชัน วัสดุ และจุดเด่นที่มีหลักฐานจากสินค้า ห้ามกล่าวอ้างเกินจริง
4. ความยาวบทพูด: บทพูดภาษาไทยของแต่ละช็อตควรกระชับ อ่านจบได้ภายใน ${dialogueWindowMinSeconds}-${shotDurationSeconds} วินาที
5. เรื่องย่อ (storySummary): สรุปเรื่องย่อรวมทุกช็อตที่ระบุประเด็น Hook, Problem, Insight, Proof, CTA อย่างชัดเจน${castRosterBlock}${supportingCastBlock}`;

  const userMessage = JSON.stringify(
    {
      productName,
      productDescription: productDescription || undefined,
      storytellingStructure: structureKey,
      reviewTone: toneKey,
      revisionNotes: revisionNotes || undefined,
      // Include the roster for ANY named cast (solo presenter included) —
      // see castRosterBlock's solo branch above.
      ...(activeCast.length > 0
        ? {
            cast: activeCast.map(member => ({
              castId: member.castId,
              name: member.name,
              role: member.role,
            })),
          }
        : {}),
    },
    null,
    2
  );

  const ZodDialogueTurnSchema = z.object({
    castId: z.string().min(1),
    line: z.string(),
  });

  // Supporting tier (`planning/marketplace-four-character-cast/plan.md` §3).
  // `action` required, `line` optional — the inverse of a dialogue turn.
  const ZodSupportingBeatSchema = z.object({
    castId: z.string().min(1),
    action: z.string(),
    line: z.string().optional(),
  });

  const shotObjectSchema = z.object({
    shotId: z.number().int().min(1).max(30),
    title: z.string(),
    storySummary: z.string(),
    visualSummary: z.string(),
    dialogue: z.string().optional(),
    dialogueTurns: z.array(ZodDialogueTurnSchema).optional(),
    castInShot: z.array(z.string().min(1)).optional(),
    supportingBeats: z.array(ZodSupportingBeatSchema).optional(),
  });

  const ZodLLMPlanSchema = z.object({
    storySummary: z.string(),
    shots: isAutoShotCount
      ? z.array(shotObjectSchema).min(7).max(30)
      : z.array(shotObjectSchema).length(fixedShotCount ?? 9),
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
      billingDescription: `Staged Story Arc Plan generation (${chosenModel})`,
    });

    const rawShotCount = llmRes?.data?.shots?.length ?? 0;
    const rawShotCountOk = isAutoShotCount
      ? rawShotCount >= 7 && rawShotCount <= 30
      : rawShotCount === (fixedShotCount ?? 9);

    if (rawShotCountOk) {
      const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
      const referenceManifestHash =
        clean(input.referenceManifestHash) ||
        buildProductionStableHash({
          productId: input.product.productId,
          imageUrls: input.product.imageUrls,
        });

      const storySummary = bounded(llmRes.data.storySummary, 500);
      const castById = new Map(activeCast.map(member => [member.castId, member]));
      const shots = llmRes.data.shots.map((shot, idx) => {
        const shotId = idx + 1;
        let dialogueTurns: StagedDialogueTurn[] | undefined;
        let castInShot: string[] | undefined;
        let dialogue: string;

        if (
          conversationMode === "two_person_conversation" &&
          Array.isArray(shot.dialogueTurns) &&
          shot.dialogueTurns.length > 0
        ) {
          const resolvedTurns = shot.dialogueTurns
            .map(turn => {
              const member = castById.get(turn.castId);
              if (!member) return null;
              return {
                castId: member.castId,
                speakerName: member.name,
                line: bounded(clean(turn.line), 320),
              } satisfies StagedDialogueTurn;
            })
            .filter((turn): turn is StagedDialogueTurn => turn !== null);

          if (resolvedTurns.length > 0) {
            dialogueTurns = resolvedTurns;
            dialogue = bounded(renderStagedDialogueFromTurns(resolvedTurns), 640);
            castInShot = activeCast.map(member => member.castId);
          } else {
            dialogue = bounded(clean(shot.dialogue), 320);
          }
        } else {
          dialogue = bounded(clean(shot.dialogue), 320);
        }

        // The model's own per-shot presence wins when it supplied one — that is
        // the whole point of a supporting tier that is not in every frame. The
        // two-person path's `castInShot = every lead` remains the fallback.
        const declaredCastInShot = Array.isArray(shot.castInShot)
          ? shot.castInShot.filter(castId => castById.has(castId))
          : undefined;
        const supportingBeats = (shot.supportingBeats ?? [])
          .filter(beat => castById.has(beat.castId) && clean(beat.action))
          .map(beat => ({
            castId: beat.castId,
            action: bounded(clean(beat.action), 240),
            ...(clean(beat.line) ? { line: bounded(clean(beat.line), 160) } : {}),
          }));

        return {
          shotId,
          title: bounded(shot.title, 120),
          storySummary: bounded(shot.storySummary, 600),
          visualSummary: bounded(shot.visualSummary, 400),
          dialogue,
          durationSeconds: shotDurationSeconds,
          ...(dialogueTurns ? { dialogueTurns } : {}),
          ...(declaredCastInShot?.length
            ? { castInShot: declaredCastInShot }
            : castInShot
            ? { castInShot }
            : {}),
          ...(supportingBeats.length > 0 ? { supportingBeats } : {}),
        };
      });

      // No idle extras: a supporting character the model gave no `action` is
      // removed from that shot's cast, so their reference image is never sent
      // (`planning/marketplace-four-character-cast/plan.md` §3). Enforced by
      // construction — this can only ever shrink a shot's cast, never fail it.
      const { shots: enforcedShots, droppedCastIdsByShot } = enforceSupportingBeats({
        shots,
        cast: input.cast,
      });
      const droppedShotCount = Object.keys(droppedCastIdsByShot).length;
      if (droppedShotCount > 0) {
        console.info(
          `[generateStagedStoryArcPlanWithLLM] run=${input.runId} dropped beatless supporting cast from ${droppedShotCount} shot(s): ${JSON.stringify(droppedCastIdsByShot)}`
        );
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

      if (contract.valid) {
        const storyPlanHash = buildProductionStableHash({
          runId: input.runId,
          planRevision,
          storySummary,
          shots: enforcedShots.map(s => `${s.shotId}:${s.title}:${s.dialogue}`),
        });

        return {
          planRevision,
          title: `Staged Story Arc (LLM: ${chosenModel})`,
          storySummary,
          product: {
            productId: clean(input.product.productId),
            productName,
            description: productDescription || null,
            imageUrls: input.product.imageUrls.map(clean).filter(Boolean).slice(0, 5),
          },
          shots: enforcedShots,
          referenceManifestHash,
          storyPlanHash,
          source: "llm_story_arc",
          languagePlan: input.languagePlan,
          ...(activeCast.length > 0 ? { cast: activeCast, conversationMode } : {}),
        };
      }
    }
  } catch (error) {
    console.warn(
      `[generateStagedStoryArcPlanWithLLM] LLM call failed with model ${chosenModel}, falling back to deterministic planner:`,
      error
    );
  }

  // Bounded deterministic fallback. When the LLM chose "auto" but failed, we
  // cannot know what count it would have picked, so we fall back to the
  // fixed default of 9 (today's behavior) rather than guessing — the
  // fallback is mechanical, never a re-attempt at LLM judgment.
  return buildStagedStoryArcPlan({ ...input, shotCount: fixedShotCount });
}
