/**
 * Pure precondition for selecting a Vertical Drama start frame as an I2V
 * anchor. The storyboard/emotional frame remains independently usable; this
 * gate only protects paid video generation from an unverified or visibly
 * unstable multi-character anchor.
 */

export type VideoSafetyCharacterEvidence = {
  character?: unknown;
  name?: unknown;
  face_readable?: unknown;
  facing?: unknown;
  eyes_visible?: unknown;
  occlusion?: unknown;
  face_size?: unknown;
  overlapped_by_other_face?: unknown;
};

export type VideoSafetyGateInput = {
  requiredCharacterRefs: string[];
  selectedAssetId?: string | number | null;
  videoSafety?: {
    characters?: VideoSafetyCharacterEvidence[];
    faces_separated?: boolean;
    face_touching_frame_edge?: boolean;
    video_safe_verdict?: "safe" | "conditional" | "risky";
    analyzedAssetId?: string;
  } | null;
};

export type VideoSafetyGateResult =
  | { allowed: true; reason: "not_required" | "verified" }
  | {
      allowed: false;
      reason:
        | "missing_asset"
        | "missing_qc"
        | "stale_qc"
        | "unsafe_verdict"
        | "incomplete_evidence";
      message: string;
    };

const normalize = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, " ")
    : "";

const isFrontalOrThreeQuarter = (value: unknown) => {
  const normalized = normalize(value);
  return (
    normalized === "frontal" ||
    normalized === "front" ||
    normalized === "three quarter" ||
    normalized === "3/4" ||
    normalized === "3 4" ||
    normalized === "three-quarter"
  );
};

const isBothEyesVisible = (value: unknown) => {
  const normalized = normalize(value);
  return (
    normalized === "both" || normalized === "both eyes" || normalized === "2"
  );
};

const isNoOcclusion = (value: unknown) => {
  const normalized = normalize(value);
  return normalized === "none" || normalized === "no" || normalized === "clear";
};

const isUsableFaceSize = (value: unknown) => {
  const normalized = normalize(value);
  return normalized === "large" || normalized === "medium";
};

function hasCompleteCharacterEvidence(
  character: VideoSafetyCharacterEvidence
): boolean {
  return (
    character.face_readable === true &&
    isFrontalOrThreeQuarter(character.facing) &&
    isBothEyesVisible(character.eyes_visible) &&
    isNoOcclusion(character.occlusion) &&
    isUsableFaceSize(character.face_size) &&
    character.overlapped_by_other_face === false
  );
}

/**
 * Require fresh, categorical evidence for every physical character in a
 * multi-character shot. Numeric "75%" remains a prompt/rubric target; the
 * gate deliberately uses conservative observable categories instead of
 * pretending a vision model produced a reliable pixel measurement.
 */
export function evaluateVideoSafetyGate(
  input: VideoSafetyGateInput
): VideoSafetyGateResult {
  const requiredCount = input.requiredCharacterRefs.filter(Boolean).length;
  if (requiredCount < 2) return { allowed: true, reason: "not_required" };

  const selectedAssetId = String(input.selectedAssetId ?? "").trim();
  if (!selectedAssetId) {
    return {
      allowed: false,
      reason: "missing_asset",
      message: "สร้างหรือเลือก start frame ก่อนสร้างวิดีโอ",
    };
  }

  const safety = input.videoSafety;
  if (!safety) {
    return {
      allowed: false,
      reason: "missing_qc",
      message: "ต้องตรวจความพร้อมใบหน้าของภาพก่อนสร้างวิดีโอ",
    };
  }
  if (String(safety.analyzedAssetId ?? "").trim() !== selectedAssetId) {
    return {
      allowed: false,
      reason: "stale_qc",
      message:
        "ผลตรวจใบหน้าไม่ตรงกับภาพที่จะใช้ทำวิดีโอ กรุณาตรวจภาพปัจจุบันใหม่",
    };
  }
  if (safety.video_safe_verdict !== "safe") {
    return {
      allowed: false,
      reason: "unsafe_verdict",
      message:
        "ภาพนี้ยังไม่ผ่านความพร้อมด้านใบหน้าสำหรับวิดีโอ กรุณาสร้างหรือเลือก Video-Safe frame",
    };
  }
  if (
    safety.faces_separated !== true ||
    safety.face_touching_frame_edge === true
  ) {
    return {
      allowed: false,
      reason: "incomplete_evidence",
      message: "ใบหน้าหลายตัวละครยังแยกไม่ชัดหรืออยู่ชิดขอบภาพเกินไป",
    };
  }

  const characters = safety.characters ?? [];
  if (
    characters.length < requiredCount ||
    characters
      .slice(0, requiredCount)
      .some(character => !hasCompleteCharacterEvidence(character))
  ) {
    return {
      allowed: false,
      reason: "incomplete_evidence",
      message:
        "ผลตรวจยังไม่มีหลักฐานว่าใบหน้าของตัวละครทุกตัวอ่านได้ชัดพอสำหรับวิดีโอ",
    };
  }

  return { allowed: true, reason: "verified" };
}
