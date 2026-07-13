/**
 * Vertical Drama Series — Text Overlay Suite bilingual (Thai/English) copy
 * (task #34, `planning/vertical-drama-end-card-teaser/plan.md` v2).
 *
 * A DEDICATED copy module (not folded into the already-huge
 * `verticalDramaWorkspaceCopy.ts`) per that file's own established
 * "self-contained, drop-in" rationale — the Text Overlay Suite's copy volume
 * (8 overlay kinds x several fields each, plus the series watermark card)
 * warrants its own file. Thai-first: every English string is the reference
 * translation of an already-decided Thai label (this feature's owner-facing
 * UI is Thai-primary, same posture as the rest of this component family).
 */

import type { VdLocale } from "./verticalDramaWorkspaceCopy";

export const VD_TEXT_OVERLAY_COPY = {
  th: {
    // Workspace section (episode-level plan)
    sectionTitle: "ข้อความบนวิดีโอ",
    sectionDescription:
      "เลือกเปิด/ปิดข้อความแต่ละแบบ ระบบจะสร้างข้อความอัตโนมัติให้เมื่อเป็นไปได้ หรือพิมพ์เองก็ได้เสมอ",
    saveButton: "บันทึกข้อความบนวิดีโอ",
    saving: "กำลังบันทึก…",
    saveSuccess: "บันทึกแล้ว",

    // Shared source labels
    sourceLabel: "ที่มา",
    sourceManual: "พิมพ์เอง",
    sourceCliffhanger: "จากปมค้างท้ายตอนย่อย",
    sourceHook: "จากปมที่ยังไม่คลี่คลาย",
    sourceFallback: "ข้อความเริ่มต้น",
    sourceSummary: "จากสรุปตอนย่อยก่อนหน้า",
    sourceNone: "ไม่มี (ตอนย่อยแรกไม่มีความเดิม)",
    revertToAutoButton: "คืนค่าอัตโนมัติ",
    autoFillButton: "เติมข้อความอัตโนมัติ",

    // End card teaser
    endCardTitle: "ข้อความท้ายตอนย่อย (กระตุ้นติดตาม)",
    endCardEnableLabel: "แสดงข้อความท้ายตอนย่อย",
    endCardTextLabel: "ข้อความ",
    endCardTextPlaceholder: "เว้นว่างเพื่อใช้ข้อความอัตโนมัติ…",
    endCardDurationLabel: "ระยะเวลา (วินาที)",
    endCardShowFollowLineLabel: 'แสดงบรรทัด "กดติดตาม"',
    endCardStyleVariantLabel: "รูปแบบ",
    endCardStyleCenterCard: "กลางจอ",
    endCardStyleLowerBand: "แถบล่าง",

    // Opener recap
    openerRecapTitle: "ความเดิมตอนย่อยที่แล้ว",
    openerRecapEnableLabel: "แสดงความเดิมตอนย่อยที่แล้ว",
    openerRecapTextLabel: "ข้อความ",
    openerRecapTextPlaceholder:
      "เว้นว่างเพื่อใช้สรุปอัตโนมัติจากตอนย่อยก่อนหน้า…",
    openerRecapDurationLabel: "ระยะเวลา (วินาที)",
    openerRecapEpisode1Note: "ตอนย่อยที่ 1 ไม่มีความเดิมตอนย่อยที่แล้ว",

    // Title bumper
    titleBumperTitle: "ป้ายชื่อเรื่องเปิดคลิป",
    titleBumperEnableLabel: "แสดงชื่อเรื่อง + ชื่อตอนย่อยตอนเปิดคลิป",
    titleBumperTextLabel:
      "ข้อความชื่อตอนย่อย (ไม่บังคับ — เว้นว่างเพื่อสร้างอัตโนมัติ)",
    titleBumperPreviewTemplate: "ตัวอย่าง: {primary} / {secondary}",

    // Episode indicator
    episodeIndicatorTitle: "เลข Sub-episode มุมจอ",
    episodeIndicatorEnableLabel: "แสดงเลข Sub-episode จาง ๆ ตลอดคลิป",
    episodeIndicatorPositionLabel: "ตำแหน่ง",
    episodeIndicatorPositionTopRight: "มุมขวาบน",
    episodeIndicatorPositionTopLeft: "มุมซ้ายบน",
    episodeIndicatorPreviewTemplate: "ตัวอย่าง: {label}",

    // Character intro cards
    characterIntroTitle: "ป้ายแนะนำตัวละคร",
    characterIntroEnableLabel: "แสดงชื่อ+บทบาทตอนตัวละครโผล่ครั้งแรก",
    characterIntroPreviewTitle: "ตัวละครที่จะมีป้ายแนะนำ",
    characterIntroPreviewEmpty:
      "ยังไม่พบตัวละครในช็อต (ต้องมีแผนภาพเริ่มช็อตก่อน)",
    characterIntroShotLabel: "ช็อต {shot}",

    // Mid-episode cards
    cardsTitle: "การ์ดข้อความกลางตอนย่อย",
    cardsDescription:
      "ป้ายเวลา/สถานที่ หรือข้อความกระตุ้นกลางเรื่อง — ผูกกับช็อตที่เลือก",
    cardsAddButton: "เพิ่มการ์ด",
    cardsEmptyState: 'ยังไม่มีการ์ดกลางตอนย่อย กด "เพิ่มการ์ด" เพื่อเริ่ม',
    cardKindLabel: "ชนิด",
    cardKindTimeSetting: "ป้ายเวลา/สถานที่",
    cardKindNarrativeHook: "ข้อความกระตุ้น",
    cardKindCustom: "กำหนดเอง",
    cardStyleVariantLabel: "สไตล์",
    cardAnchorShotLabel: "ช็อตที่",
    cardAnchorOffsetLabel: "ช่วงเวลาในช็อต (วินาที)",
    cardTextLabel: "ข้อความ",
    cardTextPlaceholder: 'เช่น "ย้อนเวลาไปปี 1980"',
    cardDurationLabel: "ระยะเวลา (วินาที)",
    cardEnabledLabel: "เปิดใช้การ์ดนี้",
    cardRemoveButton: "ลบ",
    cardTooManyConcurrentWarning:
      "มีการ์ดซ้อนเวลากันเกิน 2 ใบในช่วงนี้ — อาจอ่านไม่ทัน",
    cardTooManyTotalError: "เพิ่มการ์ดได้สูงสุด {n} ใบต่อตอนย่อย",

    // Preview block
    previewTitle: "ตัวอย่างข้อความที่จะแสดง",
    previewEmpty: "ยังไม่มีข้อความบนวิดีโอที่เปิดใช้งาน",

    // Validation
    durationOutOfRangeError: "ระยะเวลาต้องอยู่ระหว่าง {min}-{max} วินาที",
    fullscreenBannerOverlapWarning:
      "แบนเนอร์เต็มจอทับช่วงนี้อยู่ — แบนเนอร์จะแสดงทับข้อความ",

    // Series watermark card
    watermarkCardTitle: "ลายน้ำซีรีส์",
    watermarkCardDescription:
      "ลายน้ำผูกกับทั้งซีรีส์ (ไม่ใช่รายตอนย่อย) แสดงในทุกตอนย่อยที่เรนเดอร์",
    watermarkEnableLabel: "เปิดใช้ลายน้ำ",
    watermarkTypeLabel: "ชนิดลายน้ำ",
    watermarkTypeText: "ข้อความ",
    watermarkTypeImage: "รูปภาพ/โลโก้",
    watermarkTextLabel: "ข้อความลายน้ำ",
    watermarkTextPlaceholder: "เช่น @ชื่อช่อง",
    watermarkImageUrlLabel: "รูปโลโก้ (PNG พื้นหลังโปร่ง)",
    watermarkImageUploadButton: "อัปโหลดโลโก้",
    watermarkImageChangeButton: "เปลี่ยนโลโก้",
    watermarkPositionLabel: "ตำแหน่ง",
    watermarkPositionTopLeft: "มุมซ้ายบน",
    watermarkPositionTopRight: "มุมขวาบน",
    watermarkPositionBottomLeft: "มุมซ้ายล่าง",
    watermarkPositionBottomRight: "มุมขวาล่าง",
    watermarkOpacityLabel: "ความโปร่งใส",
    watermarkScalePctLabel: "ขนาด (% ความกว้างวิดีโอ)",
    watermarkMarginPxLabel: "ระยะขอบ (พิกเซล)",
    watermarkPreviewLabel: "ตัวอย่างตำแหน่ง",
    watermarkSaveButton: "บันทึกลายน้ำ",
    watermarkSaving: "กำลังบันทึก…",
    watermarkCornerClashNote:
      "ลายน้ำชนกับตำแหน่งเลขตอน ระบบจะย้ายลายน้ำไปมุมล่างให้อัตโนมัติตอนเรนเดอร์",

    // Batch (season) render dialog additions
    batchApplyTextOverlaysLabel: "ใส่ข้อความตามแผนของแต่ละตอน",
    batchApplyWatermarkLabel: "ใส่ลายน้ำซีรีส์",
  },
  en: {
    sectionTitle: "Text overlays",
    sectionDescription:
      "Toggle each text kind on/off. The system auto-fills text where possible, or type your own anytime.",
    saveButton: "Save text overlays",
    saving: "Saving…",
    saveSuccess: "Saved",

    sourceLabel: "Source",
    sourceManual: "Manual",
    sourceCliffhanger: "From the Sub-episode's cliffhanger",
    sourceHook: "From an unresolved story hook",
    sourceFallback: "Default text",
    sourceSummary: "From the previous Sub-episode's summary",
    sourceNone: "None (Sub-episode 1 has no recap)",
    revertToAutoButton: "Revert to automatic",
    autoFillButton: "Auto-fill text",

    endCardTitle: "End card (follow teaser)",
    endCardEnableLabel: "Show end card",
    endCardTextLabel: "Text",
    endCardTextPlaceholder: "Leave blank to use the auto-derived text…",
    endCardDurationLabel: "Duration (sec)",
    endCardShowFollowLineLabel: 'Show "follow now" line',
    endCardStyleVariantLabel: "Style",
    endCardStyleCenterCard: "Center card",
    endCardStyleLowerBand: "Lower band",

    openerRecapTitle: "Previously on…",
    openerRecapEnableLabel: 'Show "previously on" recap',
    openerRecapTextLabel: "Text",
    openerRecapTextPlaceholder:
      "Leave blank to auto-summarize the previous Sub-episode…",
    openerRecapDurationLabel: "Duration (sec)",
    openerRecapEpisode1Note: "Sub-episode 1 has no recap",

    titleBumperTitle: "Opening title card",
    titleBumperEnableLabel: "Show series + Sub-episode title at the start",
    titleBumperTextLabel:
      "Sub-episode title text (optional — leave blank to auto-derive)",
    titleBumperPreviewTemplate: "Preview: {primary} / {secondary}",

    episodeIndicatorTitle: "Sub-episode indicator",
    episodeIndicatorEnableLabel: "Show a faint Sub-episode counter throughout",
    episodeIndicatorPositionLabel: "Position",
    episodeIndicatorPositionTopRight: "Top right",
    episodeIndicatorPositionTopLeft: "Top left",
    episodeIndicatorPreviewTemplate: "Preview: {label}",

    characterIntroTitle: "Character intro cards",
    characterIntroEnableLabel:
      "Show name + role on each character's first appearance",
    characterIntroPreviewTitle: "Characters that will get an intro card",
    characterIntroPreviewEmpty:
      "No characters found in any shot yet (needs a start-frame plan first)",
    characterIntroShotLabel: "Shot {shot}",

    cardsTitle: "Mid-Sub-episode cards",
    cardsDescription:
      "Time/place stamps or narrative-hook text, anchored to a chosen shot",
    cardsAddButton: "Add card",
    cardsEmptyState: 'No mid-episode cards yet — click "Add card" to start',
    cardKindLabel: "Kind",
    cardKindTimeSetting: "Time / place stamp",
    cardKindNarrativeHook: "Narrative hook",
    cardKindCustom: "Custom",
    cardStyleVariantLabel: "Style",
    cardAnchorShotLabel: "Shot #",
    cardAnchorOffsetLabel: "Offset within shot (sec)",
    cardTextLabel: "Text",
    cardTextPlaceholder: 'e.g. "1980, ten years earlier"',
    cardDurationLabel: "Duration (sec)",
    cardEnabledLabel: "Enable this card",
    cardRemoveButton: "Remove",
    cardTooManyConcurrentWarning:
      "More than 2 cards overlap around this time — may be hard to read",
    cardTooManyTotalError: "You can add at most {n} cards per Sub-episode",

    previewTitle: "Text overlay preview",
    previewEmpty: "No text overlays are enabled yet",

    durationOutOfRangeError: "Duration must be between {min} and {max} seconds",
    fullscreenBannerOverlapWarning:
      "A fullscreen ad banner overlaps this window — the banner will render on top",

    watermarkCardTitle: "Series watermark",
    watermarkCardDescription:
      "The watermark is attached to the whole series (not per Sub-episode) and appears in every rendered Sub-episode",
    watermarkEnableLabel: "Enable watermark",
    watermarkTypeLabel: "Watermark type",
    watermarkTypeText: "Text",
    watermarkTypeImage: "Image / logo",
    watermarkTextLabel: "Watermark text",
    watermarkTextPlaceholder: "e.g. @yourchannel",
    watermarkImageUrlLabel: "Logo image (transparent PNG)",
    watermarkImageUploadButton: "Upload logo",
    watermarkImageChangeButton: "Change logo",
    watermarkPositionLabel: "Position",
    watermarkPositionTopLeft: "Top left",
    watermarkPositionTopRight: "Top right",
    watermarkPositionBottomLeft: "Bottom left",
    watermarkPositionBottomRight: "Bottom right",
    watermarkOpacityLabel: "Opacity",
    watermarkScalePctLabel: "Size (% of video width)",
    watermarkMarginPxLabel: "Margin (px)",
    watermarkPreviewLabel: "Position preview",
    watermarkSaveButton: "Save watermark",
    watermarkSaving: "Saving…",
    watermarkCornerClashNote:
      "The watermark shares a corner with the Sub-episode indicator — it will auto-move to a bottom corner at render time",

    batchApplyTextOverlaysLabel:
      "Apply each Sub-episode's own text overlay plan",
    batchApplyWatermarkLabel: "Include the series watermark",
  },
} as const;

export type VdTextOverlayCopy = Record<
  keyof (typeof VD_TEXT_OVERLAY_COPY)["en"],
  string
>;

export function vdTextOverlayCopy(locale: VdLocale): VdTextOverlayCopy {
  return VD_TEXT_OVERLAY_COPY[locale] as VdTextOverlayCopy;
}

/** Mirrors `vdCopyWithParams` in `verticalDramaWorkspaceCopy.ts` — kept as
 *  a local copy so this file has zero runtime dependency on that one
 *  (type-only import above is erased at compile time). */
export function vdTextOverlayCopyWithParams(
  template: string,
  params: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}
