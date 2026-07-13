/**
 * Vertical Drama Series — Ad Banner Overlay copy dictionary (F131W, #30-A,
 * `planning/vertical-drama-ad-banner-overlay/plan.md`).
 *
 * Deliberately a STANDALONE file, NOT importing from `verticalDramaCopy.ts`
 * (owned by another concurrent task) — same `pickCopy` convention, own
 * lang type, zero coupling. See `VerticalDramaAdBannerStudio.tsx`.
 */

export type VerticalDramaAdBannerLang = "th" | "en";

/** Pick a bilingual string for the active language — mirrors `verticalDramaCopy.ts`'s `pickCopy` exactly, kept as a local copy so this file has no import dependency on that (concurrently-owned) file. */
export function pickCopy<T>(
  lang: VerticalDramaAdBannerLang,
  value: { th: T; en: T }
): T {
  return lang === "th" ? value.th : value.en;
}

export const verticalDramaAdBannerCopy = {
  sectionTitle: { th: "แบนเนอร์โฆษณา (ซ้อนบนวิดีโอ)", en: "Ad Banner Overlay" },
  sectionHint: {
    th: "ออกแบบแบนเนอร์โฆษณาสูงสุด 5 แบบต่อซีรีส์ เลือกใช้ต่อตอนได้ในภายหลัง",
    en: "Design up to 5 ad banners for this series — you'll pick which ones to use per Sub-episode later.",
  },
  addBanner: { th: "เพิ่มแบนเนอร์", en: "Add banner" },
  limitReachedHint: {
    th: "ครบ 5 แบนเนอร์ต่อซีรีส์แล้ว",
    en: "Reached the 5-banner-per-series limit",
  },
  removeBanner: { th: "ลบแบนเนอร์นี้", en: "Remove this banner" },
  removeBannerConfirm: {
    th: "ลบแบนเนอร์นี้ออกจากซีรีส์? การกระทำนี้ย้อนกลับไม่ได้",
    en: "Remove this banner from the series? This cannot be undone.",
  },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  confirm: { th: "ยืนยัน", en: "Confirm" },
  saveChanges: { th: "บันทึกการตั้งค่า", en: "Save settings" },
  emptyState: {
    th: "ยังไม่มีแบนเนอร์โฆษณาในซีรีส์นี้",
    en: "No ad banners yet for this series.",
  },

  styleSectionTitle: { th: "เลือกสไตล์แบนเนอร์", en: "Choose a banner style" },
  recommendedBadge: { th: "แนะนำ", en: "Recommended" },
  textInImageRiskLabel: {
    th: "ความเสี่ยงข้อความในภาพ",
    en: "In-image text risk",
  },
  textInImageRiskLow: { th: "ต่ำ", en: "Low" },
  textInImageRiskMed: { th: "ปานกลาง", en: "Medium" },
  textInImageRiskHigh: {
    th: "สูง — ควรใช้ข้อความสั้นมาก",
    en: "High — keep any in-image text very short",
  },

  placementSectionTitle: { th: "เลือกตำแหน่งวาง", en: "Choose a placement" },
  placementBottomBandName: { th: "แถบล่าง", en: "Bottom band" },
  placementSideVerticalName: { th: "แนวตั้งข้าง", en: "Side vertical" },
  placementFullscreenName: {
    th: "เต็มจอ (แทรกช่วงเวลา)",
    en: "Fullscreen (timed insert)",
  },
  sideAlignLabel: { th: "ชิดขอบ", en: "Anchor edge" },
  sideAlignLeft: { th: "ซ้าย", en: "Left" },
  sideAlignRight: { th: "ขวา", en: "Right" },

  copySectionTitle: { th: "ข้อความบนแบนเนอร์", en: "Banner copy" },
  headlineLabel: { th: "หัวข้อหลัก", en: "Headline" },
  subtextLabel: { th: "ข้อความรอง", en: "Subtext" },
  priceTextLabel: { th: "ราคา / โปรโมชัน", en: "Price / promo" },
  ctaTextLabel: { th: "ปุ่มเรียกร้อง (CTA)", en: "Call to action" },

  timingSectionTitle: {
    th: "ช่วงเวลาแสดงผลเริ่มต้น",
    en: "Default display timing",
  },
  timingEntire: { th: "ทั้งคลิป", en: "Entire clip" },
  timingWindow: { th: "ช่วงเวลา", en: "Time window" },
  timingStartSecLabel: { th: "เริ่มวินาทีที่", en: "Start second" },
  timingDurationSecLabel: { th: "ความยาว (วินาที)", en: "Duration (seconds)" },

  modelSectionTitle: { th: "โมเดลสร้างภาพ", en: "Image model" },
  modelLabel: { th: "โมเดล", en: "Model" },
  aspectRatioLabel: { th: "อัตราส่วนภาพ", en: "Aspect ratio" },
  sizeLabel: { th: "ขนาด", en: "Size" },
  loadingModels: { th: "กำลังโหลดโมเดล…", en: "Loading models…" },

  generatePrompt: { th: "สร้าง Prompt", en: "Generate prompt" },
  generatingPrompt: { th: "กำลังสร้าง Prompt…", en: "Generating prompt…" },
  promptBoxTitle: { th: "Prompt ภาพแบนเนอร์", en: "Banner image prompt" },
  promptEmptyLabel: {
    th: "ยังไม่ได้สร้าง Prompt",
    en: "No prompt generated yet",
  },
  editPrompt: { th: "แก้ไข", en: "Edit" },
  savePrompt: { th: "บันทึก Prompt", en: "Save prompt" },
  copyPrompt: { th: "คัดลอก", en: "Copy" },
  copiedPrompt: { th: "คัดลอกแล้ว", en: "Copied" },

  generateImage: { th: "สร้างภาพแบนเนอร์", en: "Generate banner image" },
  regenerateImage: { th: "สร้างภาพใหม่", en: "Regenerate image" },
  generatingImage: { th: "กำลังสร้างภาพ…", en: "Generating image…" },
  imagePreviewAlt: { th: "ตัวอย่างแบนเนอร์", en: "Banner preview" },

  statusDraft: { th: "ร่าง", en: "Draft" },
  statusPromptReady: { th: "พร้อม Prompt", en: "Prompt ready" },
  statusGenerating: { th: "กำลังสร้างภาพ", en: "Generating" },
  statusReady: { th: "พร้อมใช้งาน", en: "Ready" },
  statusFailed: { th: "สร้างภาพล้มเหลว", en: "Generation failed" },

  approvalRequiredBadge: {
    th: "ต้องอนุมัติก่อนใช้",
    en: "Requires approval before use",
  },
  approvalApprovedBadge: { th: "อนุมัติแล้ว", en: "Approved" },
  approveAction: { th: "อนุมัติ", en: "Approve" },

  genericError: {
    th: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
    en: "Something went wrong. Please try again.",
  },
} as const;
