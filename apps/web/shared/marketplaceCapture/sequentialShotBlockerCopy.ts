/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 08 §6.8. Pure Thai copy for the section-04 §5.7 deterministic
 * preflight blocker-id vocabulary (frozen cross-section contract, spec
 * §23.1). Both the server rejection path
 * (`saveMarketplaceAutoReviewSequentialShotOverride`) and the client
 * per-shot editor (section 11) import this module — no server-only imports
 * allowed here (this directory already holds `referenceIndexMap.ts`, a
 * client+server pure module, section 02).
 *
 * G10 note (implementation-gaps.md): the section-04 runner folds the
 * structural "prompt missing" condition into `sequential_prompt_set_incomplete`
 * — it never actually emits a bare `prompt_empty` id. The entry below is kept
 * anyway (harmless, spec-listed) but callers must not assume it is reachable
 * from `validateSequentialStoryboardPackPreflight`.
 */

/** One Thai sentence per section-04 §5.7 blocker id, phrased as an
 *  actionable instruction. Section 11 renders these verbatim. */
export const SEQUENTIAL_SHOT_BLOCKER_COPY_TH: Readonly<Record<string, string>> = {
  sequential_prompt_set_incomplete:
    "ชุด prompt ของช็อตนี้ยังไม่ครบ กรุณากรอก prompt ภาพและวิดีโอให้ครบถ้วน",
  prompt_empty: "prompt ว่าง กรุณากรอกข้อความ",
  prompt_too_long_for_image_provider:
    "prompt ภาพยาวเกินขีดจำกัดของโมเดล กรุณาย่อข้อความให้สั้นลง",
  prompt_too_long_for_video_provider:
    "prompt วิดีโอยาวเกิน 2,000 ตัวอักษร กรุณาย่อข้อความ",
  video_global_block_missing:
    "prompt วิดีโอต้องมีบล็อกล็อกสินค้า (global block) ครบทุกช็อต",
  guardian_directive_missing: "ช็อตที่มีเด็กต้องระบุผู้ใหญ่ที่ดูแลอยู่ในภาพ",
  assembly_demo_unverified:
    "ห้ามแสดงการประกอบ/ถอดชิ้นส่วน เพราะไม่มีเอกสารยืนยันจากหน้าสินค้า",
  price_claim_detected:
    "พบข้อความเกี่ยวกับราคา/ส่วนลด ซึ่งห้ามใช้ในรีวิว กรุณาลบออก",
  shot_duration_exceeds_max:
    "ความยาวช็อตเกินขีดจำกัดที่กำหนด กรุณาปรับความยาวช็อตให้อยู่ในช่วงที่กำหนด",
  dialogue_exceeds_shot_duration: "บทพูดยาวเกินความยาวช็อต กรุณาตัดให้สั้นลง",
  reference_index_mapping_mismatch:
    "การอ้างอิง @ImageN ใน prompt ไม่ตรงกับภาพอ้างอิงจริง กรุณาแก้ให้ตรงกัน",
  product_reference_model_conflict:
    "พบความขัดแย้งของรุ่นสินค้าที่อ้างอิงในภาพ กรุณาตรวจสอบภาพอ้างอิงสินค้าอีกครั้ง",
  minor_safety_clothing_lock_missing:
    "ช็อตที่มีเด็กต้องมีล็อกความปลอดภัยเรื่องเครื่องแต่งกายของเด็กใน prompt",
};

/**
 * Never returns a bare id and never returns an empty string: an unknown id
 * still gets a generic Thai sentence that names the id, so the UI/error path
 * always has something readable to show.
 */
export function sequentialShotBlockerMessageTh(blockerId: string): string {
  const id = typeof blockerId === "string" ? blockerId.trim() : "";
  const known = id ? SEQUENTIAL_SHOT_BLOCKER_COPY_TH[id] : undefined;
  if (known) return known;
  return `ไม่ผ่านการตรวจสอบ (${id || "unknown"})`;
}

/**
 * The exact `TRPCError.message` on a rejected shot-override save
 * (§6.7 step 6): starts with the first blocker's Thai message, then lists
 * every blocker id for support/debugging. Deterministic — same input always
 * produces the same string.
 */
export function buildSequentialShotOverrideRejectionMessage(
  blockers: readonly string[]
): string {
  const ids = (blockers ?? []).map(id => String(id ?? "").trim()).filter(Boolean);
  const firstMessage = ids.length > 0
    ? sequentialShotBlockerMessageTh(ids[0])
    : "prompt ไม่ผ่านการตรวจสอบ";
  return `${firstMessage} [ids: ${ids.join(", ")}]`;
}
