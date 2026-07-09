/**
 * Vertical Drama Series — shared client copy + route helpers (spec feature 131, section 03).
 *
 * Bilingual (Thai/English) copy dictionary and route builders shared by the
 * Series list, Series detail, and Episode workspace pages. Keeping the copy in
 * one place satisfies the section-03 Copy Contract (Thai + English labels,
 * planning vs. paid-generation wording) and keeps the pages lean.
 */

import { useTranslation } from "react-i18next";
import type {
  VerticalDramaArcDriftReasonCode,
  VerticalDramaSilenceIntent,
} from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaBlendFacet } from "@shared/verticalDramaSeries/presetVisualIdentity";
import type { VerticalDramaLineSpeakabilityViolationKind } from "@shared/verticalDramaSeries/dialogueQuality";

export type VerticalDramaLang = "th" | "en";

/** Resolve the active UI language as a simple `"th" | "en"` for local copy lookups. */
export function useVerticalDramaLang(): VerticalDramaLang {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("th") ? "th" : "en";
}

/** Pick a bilingual string for the active language. */
export function pickCopy<T>(lang: VerticalDramaLang, value: { th: T; en: T }): T {
  return lang === "th" ? value.th : value.en;
}

/* -------------------------------------------------------------------------- */
/* Route builders                                                             */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_BASE_PATH = "/drama-series";
/** Retired path, kept only so old bookmarks/links can be redirected. */
export const VERTICAL_DRAMA_LEGACY_BASE_PATH = "/dashboard/vertical-drama";

export const verticalDramaRoutes = {
  seriesList: () => VERTICAL_DRAMA_BASE_PATH,
  seriesDetail: (seriesId: string) => `${VERTICAL_DRAMA_BASE_PATH}/${seriesId}`,
  episode: (seriesId: string, episodeId: string) =>
    `${VERTICAL_DRAMA_BASE_PATH}/${seriesId}/episodes/${episodeId}`,
  run: (seriesId: string, episodeId: string, runId: string) =>
    `${VERTICAL_DRAMA_BASE_PATH}/${seriesId}/episodes/${episodeId}/runs/${runId}`,
} as const;

/* -------------------------------------------------------------------------- */
/* Copy dictionary                                                            */
/* -------------------------------------------------------------------------- */

export const verticalDramaCopy = {
  menuTitle: { th: "ซีรีย์แนวตั้ง", en: "Vertical Drama Series" },
  createSeries: { th: "สร้างซีรีย์แนวตั้ง", en: "Create Vertical Drama Series" },
  planningOnly: {
    th: "โหมดวางแผน — ยังไม่มีการสร้างสื่อที่มีค่าใช้จ่าย",
    en: "Planning mode — no paid generation is triggered",
  },
  searchPlaceholder: { th: "ค้นหาซีรีย์ตามชื่อ", en: "Search series by title" },
  allStatuses: { th: "ทุกสถานะ", en: "All statuses" },
  loading: { th: "กำลังโหลด…", en: "Loading…" },
  emptyTitle: { th: "ยังไม่มีซีรีย์", en: "No series yet" },
  emptyBody: {
    th: "เริ่มต้นด้วยการสร้างโครงซีรีย์แนวตั้งใหม่ในโหมดวางแผน",
    en: "Start by creating a new vertical drama series shell in planning mode.",
  },
  errorTitle: { th: "โหลดข้อมูลไม่สำเร็จ", en: "Failed to load" },
  retry: { th: "ลองใหม่", en: "Retry" },
  featureDisabledTitle: {
    th: "ฟีเจอร์นี้ยังไม่เปิดใช้งาน",
    en: "This feature is not available",
  },
  featureDisabledBody: {
    th: "ซีรีย์แนวตั้งยังไม่เปิดใช้งานสำหรับบัญชีของคุณ",
    en: "Vertical Drama Series is not enabled for your account.",
  },
  nextEpisode: { th: "ตอนถัดไป", en: "Next episode" },
  lastEdited: { th: "แก้ไขล่าสุด", en: "Last edited" },
  missingApproval: { th: "รออนุมัติ", en: "Awaiting approval" },
  productTieIn: { th: "มีสินค้าผูกเรื่อง", en: "Product tie-in" },
  episodes: { th: "ตอน", en: "Episodes" },
  open: { th: "เปิด", en: "Open" },
  back: { th: "ย้อนกลับ", en: "Back" },
  seriesCrumb: { th: "ซีรีย์", en: "Series" },
  episodeCrumb: { th: "ตอน", en: "Episode" },
  storyboardReviewCrumb: { th: "ตรวจสตอรี่บอร์ด", en: "Storyboard Review" },
  runDetailTitle: { th: "รายละเอียดรอบการทำงาน (อ่านอย่างเดียว)", en: "Run detail (read-only)" },
  archived: { th: "เก็บถาวร", en: "Archived" },
  readOnly: { th: "อ่านอย่างเดียว", en: "Read-only" },
  backToDashboard: { th: "กลับแดชบอร์ด", en: "Dashboard" },
  sidebarTitle: { th: "โปรเจกต์ทั้งหมด", en: "All projects" },
  sidebarSearchPlaceholder: { th: "ค้นหาโปรเจกต์…", en: "Search projects…" },
  sidebarNewSeries: { th: "สร้างใหม่", en: "New" },
  sidebarCollapse: { th: "ย่อแถบด้านข้าง", en: "Collapse sidebar" },
  sidebarExpand: { th: "ขยายแถบด้านข้าง", en: "Expand sidebar" },
  sidebarEmpty: { th: "ไม่พบโปรเจกต์ที่ตรงกัน", en: "No matching projects" },
  sidebarError: { th: "โหลดรายการไม่สำเร็จ", en: "Failed to load projects" },
  saveAsPreset: { th: "บันทึกเป็น Preset", en: "Save as preset" },
  saveAsPresetDialogTitle: { th: "บันทึกซีรีย์นี้เป็น Preset", en: "Save this series as a preset" },
  saveAsPresetDialogBody: {
    th: "แนวเรื่อง เรื่องย่อ โครงเรื่อง และตัวละครของซีรีย์นี้จะถูกบันทึกเป็น preset ให้เลือกใช้ตอนสร้างซีรีย์ใหม่",
    en: "This series' genre, logline, plot, and characters will be saved as a preset you can pick when creating a new series.",
  },
  presetTitleLabel: { th: "ชื่อ Preset", en: "Preset title" },
  publishGlobally: { th: "เผยแพร่ให้ผู้ใช้ทุกคน", en: "Publish for all users" },
  publishGloballyHint: {
    th: "เฉพาะแอดมิน — หากไม่เลือก preset นี้จะใช้ได้เฉพาะบัญชีของคุณเท่านั้น",
    en: "Admin only — leave unchecked and this preset stays private to your account only.",
  },
  saveAsPresetSuccess: { th: "บันทึก Preset แล้ว", en: "Preset saved" },
  saveAsPresetError: { th: "บันทึก Preset ไม่สำเร็จ", en: "Failed to save preset" },
  dangerZoneTitle: { th: "โซนอันตราย", en: "Danger zone" },
  deleteSeries: { th: "ลบโปรเจกต์ซีรีย์", en: "Delete series project" },
  deleteSeriesBody: {
    th: "ลบถาวร: ตอนทั้งหมด สตอรีบอร์ด ตัวละคร ความจำซีรีย์ และการตั้งค่า — ไฟล์ภาพ/วิดีโอในคลังสื่อจะไม่ถูกลบ",
    en: "Permanently deletes all episodes, storyboards, characters, series memory, and settings — image/video files in your media library are not deleted.",
  },
  deleteSeriesDialogTitle: { th: "ยืนยันการลบซีรีย์นี้", en: "Confirm deleting this series" },
  deleteSeriesDialogBody: {
    th: "การลบนี้ย้อนกลับไม่ได้ พิมพ์ชื่อซีรีย์ด้านล่างให้ตรงกันทุกตัวอักษรเพื่อยืนยัน",
    en: "This cannot be undone. Type the series name below exactly to confirm.",
  },
  deleteSeriesConfirmLabel: { th: "พิมพ์ชื่อซีรีย์เพื่อยืนยัน", en: "Type the series name to confirm" },
  deleteSeriesConfirmButton: { th: "ลบซีรีย์ถาวร", en: "Permanently delete series" },
  deleteSeriesCancel: { th: "ยกเลิก", en: "Cancel" },
  deleteSeriesSuccess: { th: "ลบซีรีย์แล้ว", en: "Series deleted" },
  deleteSeriesError: { th: "ลบซีรีย์ไม่สำเร็จ", en: "Failed to delete series" },

  /* ---------------------------------------------------------------------- */
  /* Preset Mix v2 — weights, blend report, under-blend warning (§8.2.2.C,   */
  /* section-15). Rendered only when the synthesis response is shaped like  */
  /* v2 (`contract_version: 2`) — the server decides flag state, the client */
  /* only adapts to the response shape it receives.                        */
  /* ---------------------------------------------------------------------- */
  mixWeightSectionTitle: {
    th: "ปรับน้ำหนักการผสมแต่ละ Preset",
    en: "Adjust each preset's mix weight",
  },
  blendReportTitle: { th: "รายงานการผสม Preset", en: "Blend report" },
  blendReportCoverageTitle: {
    th: "สิ่งที่แต่ละ Preset เพิ่มเข้ามา",
    en: "What each preset contributed",
  },
  blendReportFacetsTitle: {
    th: "รายละเอียดตามด้าน",
    en: "Contribution detail by facet",
  },
  blendKeptLabel: { th: "ใช้จริงในผลลัพธ์", en: "Kept in result" },
  blendNotKeptLabel: { th: "ไม่ได้ใช้", en: "Not used" },
  blendMinFacetsLabel: {
    th: "เกณฑ์ขั้นต่ำต่อ Preset",
    en: "Minimum facets per preset",
  },
  blendAdjustWeightsCta: { th: "ปรับน้ำหนัก", en: "Adjust weights" },
  blendCoverageUnit: { th: "ด้าน", en: "facets" },

  /* ---------------------------------------------------------------------- */
  /* Arc re-plan review card (§7.7.3, section-13) — Memory tab surface,     */
  /* mirrors the retcon proposal review card in VerticalDramaSeriesMemoryTab.*/
  /* ---------------------------------------------------------------------- */
  arcReplanCardTitle: { th: "ข้อเสนอปรับแผนซีซั่น", en: "Arc re-plan proposals" },
  arcReplanEmpty: {
    th: "ยังไม่มีข้อเสนอปรับแผนซีซั่น — ระบบจะเสนอโดยอัตโนมัติเมื่อตอนที่อนุมัติแล้วใช้เนื้อเรื่องเกินแผนที่วางไว้",
    en: "No arc re-plan proposals yet — the system proposes one automatically when an approved episode drifts from the planned season arc.",
  },
  arcReplanKicker: {
    th: "ตอนนี้ใช้เนื้อเรื่องล่วงหน้า — เสนอปรับแผนซีซั่น",
    en: "This episode used story material ahead of plan — a season re-plan is proposed",
  },
  arcReplanTriggeredBy: { th: "เกิดจากตอนที่", en: "Triggered by episode" },
  arcReplanDriftReasonsLabel: { th: "สาเหตุที่ตรวจพบ", en: "Detected reasons" },
  arcReplanAffectedEpisodesLabel: {
    th: "ตอนที่ได้รับผลกระทบ (ยังไม่ผลิต)",
    en: "Affected episodes (not yet produced)",
  },
  arcReplanRationaleLabel: { th: "เหตุผลประกอบ", en: "Rationale" },
  arcReplanOldPlanLabel: { th: "แผนเดิม", en: "Old plan" },
  arcReplanNewPlanLabel: { th: "แผนใหม่", en: "New plan" },
  arcReplanNoOldPlan: {
    th: "ยังไม่มีแผนเดิมสำหรับตอนนี้",
    en: "No prior plan exists for this episode yet",
  },
  arcReplanKeyBeatsLabel: { th: "บีตหลัก", en: "Key beats" },
  arcReplanApprove: { th: "อนุมัติแผนใหม่", en: "Approve new plan" },
  arcReplanReject: { th: "คงแผนเดิม", en: "Keep current plan" },
  arcReplanApproveSuccess: {
    th: "อนุมัติแผนใหม่แล้ว — ซีซั่นใช้แผนใหม่ตั้งแต่ตอนถัดไป",
    en: "New plan approved — the season now follows the new plan from the next episode onward",
  },
  arcReplanApproveError: { th: "อนุมัติแผนใหม่ไม่สำเร็จ", en: "Failed to approve the new plan" },
  arcReplanRejectSuccess: { th: "คงแผนเดิมแล้ว", en: "Kept the current plan" },
  arcReplanRejectError: { th: "คงแผนเดิมไม่สำเร็จ", en: "Failed to keep the current plan" },
  arcReplanPendingBadge: { th: "รอดำเนินการ", en: "Pending" },
  arcReplanApprovedBadge: { th: "อนุมัติแล้ว — แผนใหม่มีผลแล้ว", en: "Approved — new plan is active" },
  arcReplanRejectedBadge: { th: "ปฏิเสธแล้ว — คงแผนเดิม", en: "Rejected — current plan stands" },

  /* ---------------------------------------------------------------------- */
  /* Arc re-plan — tie-in-deferred branch (task #31, spec §7.7.3, added      */
  /* 2026-07-09) — replaces the generic drift kicker/diff for a proposal     */
  /* whose driftReasons includes VD_ARC_TIE_IN_DEFERRED (a deliberate defer, */
  /* not a detected drift): a compact "product moved" summary instead of the */
  /* full old/new breakdown diff (every OTHER field is guard-enforced        */
  /* identical — see `findArcReplanTieInGuardViolations`).                   */
  /* ---------------------------------------------------------------------- */
  arcReplanTieInGainsPlacement: { th: "ได้รับตำแหน่งสินค้า", en: "Gains the product placement" },
  arcReplanTieInLosesPlacement: { th: "เสียตำแหน่งสินค้า (ย้ายออก)", en: "Loses the product placement (moved out)" },

  /* ---------------------------------------------------------------------- */
  /* Deep story drafts (W10-C, spec F131T) — series-detail Overview surface: */
  /* generate/extend a full 9-shot + speakable-dialogue draft for every      */
  /* planned episode, plus per-episode completeness badges + a read-only     */
  /* shot viewer. Flag-gated on `verticalDramaSeriesDeepStoryDrafts`         */
  /* (fail-closed) — every string below is only ever shown behind that flag. */
  /* ---------------------------------------------------------------------- */
  deepStoryDraftsGeneratingProgress: {
    th: "กำลังร่างเนื้อเรื่องละเอียด… (อาจใช้เวลาหลายรอบ)",
    en: "Generating detailed drafts… (may take multiple rounds)",
  },
  deepStoryDraftsConfirmTitle: {
    th: "ยืนยันสร้างเนื้อเรื่องละเอียดทุกตอน",
    en: "Confirm generating a detailed story for every episode",
  },
  deepStoryDraftsConfirmCreditsWarning: {
    th: "หักเครดิตตามจริงต่อรอบ — ระบบจะคำนวณและหักเครดิตจริงหลังแต่ละรอบเรียกเสร็จสิ้น",
    en: "Credits are deducted per round based on actual usage — computed and charged after each round completes",
  },
  deepStoryDraftsConfirmCancel: { th: "ยกเลิก", en: "Cancel" },
  deepStoryDraftsConfirmSubmit: { th: "ยืนยันสร้าง", en: "Confirm generate" },
  deepStoryDraftsGenerateError: {
    th: "สร้างเนื้อเรื่องละเอียดไม่สำเร็จ",
    en: "Failed to generate detailed drafts",
  },
  deepStoryDraftsExtending: { th: "กำลังขยายร่าง…", en: "Extending draft…" },
  deepStoryDraftsExtendError: { th: "ขยายร่างไม่สำเร็จ", en: "Failed to extend the draft" },

  /* ---------------------------------------------------------------------- */
  /* Async story jobs (#28, added 2026-07-08) — submit -> poll progress copy, */
  /* shared by `generateStoryBibleDeep`/`extendStoryDraftHorizon` (above) AND */
  /* `critiqueSeasonDrafts`/`applySeasonCritique` (below). Phase labels map   */
  /* 1:1 onto `services/verticalDramaStoryBible.ts`'s `VdStoryDraftProgressPhase` */
  /* — see that type's own doc comment for exactly which pipeline step each   */
  /* one covers. Rendered via `storyJobProgressText` near the bottom of this  */
  /* file, e.g. "รอบเรียก 2/4 · กำลังตรวจ".                                   */
  /* ---------------------------------------------------------------------- */
  storyJobQueued: { th: "กำลังอยู่ในคิว…", en: "Queued…" },
  storyJobRoundLabel: { th: "รอบเรียก", en: "Call" },
  storyJobPhaseOutline: { th: "กำลังคิดโครง", en: "Outlining" },
  storyJobPhaseDraft: { th: "กำลังร่าง", en: "Drafting" },
  storyJobPhaseReview: { th: "กำลังตรวจ", en: "Reviewing" },
  storyJobPhaseFixPrefix: { th: "กำลังซ่อมตอน", en: "Fixing episode" },
  storyJobPhaseReading: { th: "กำลังอ่านทั้งซีซั่น…", en: "Reading the whole season…" },
  storyJobTimeoutError: {
    th: "ใช้เวลานานเกินไป ลองตรวจสอบภายหลัง",
    en: "Taking too long — check back later.",
  },

  deepStoryDraftsShotViewerToggle: { th: "ดูร่าง 9 ช็อต + บทพูด", en: "View the 9-shot + dialogue draft" },
  deepStoryDraftsDialogueCompleteBadge: { th: "✓ บทพูดครบทุกช็อต", en: "✓ Dialogue in every shot" },
  deepStoryDraftsSpeakableBadge: { th: "✓ อ่านออกเสียงได้", en: "✓ All lines are speakable" },
  deepStoryDraftsCoverageOk: { th: "ครอบคลุมตามเป้า", en: "coverage on target" },
  deepStoryDraftsCoverageWarning: { th: "ครอบคลุมต่ำกว่าเป้า", en: "coverage below target" },
  deepStoryDraftsCoverageError: { th: "ครอบคลุมต่ำกว่าเป้ามาก", en: "coverage well below target" },
  deepStoryDraftsCompletenessGroupLabel: {
    th: "สถานะความครบถ้วนของบทพูด",
    en: "Dialogue completeness status",
  },

  /* ---------------------------------------------------------------------- */
  /* Consolidated primary action (spec addendum, added 2026-07-08) — kills   */
  /* the "which button do I press?" confusion: the ONE primary button that   */
  /* replaces the old separate "Generate story"/"Regenerate" button AND the  */
  /* deep-draft card's own standalone "generate" CTA. The existing confirm   */
  /* dialog above is reused as-is and gains a scope radio (shown only once a */
  /* plan already exists) plus these two chain-phase progress labels.        */
  /* ---------------------------------------------------------------------- */
  deepStoryDraftsGenerateFullCta: {
    th: "สร้างเนื้อเรื่องเต็ม + ร่างละเอียดทุกตอน",
    en: "Generate full story + detailed drafts for every episode",
  },
  deepStoryDraftsUpdateCta: {
    th: "อัปเดตเนื้อเรื่องละเอียดทุกตอน (9 ช็อต + บทพูด)",
    en: "Update detailed story for every episode (9 shots + dialogue)",
  },
  deepStoryDraftsScopeGroupLabel: { th: "ขอบเขตการสร้าง", en: "Generation scope" },
  deepStoryDraftsScopeKeepLabel: {
    th: "เก็บโครงเรื่องเดิม แล้วเติม/อัปเดตร่างละเอียด",
    en: "Keep the current plot, then fill in/update the detailed drafts",
  },
  deepStoryDraftsScopeRewriteLabel: {
    th: "คิดโครงเรื่องใหม่ทั้งหมด แล้วร่างละเอียดต่อ",
    en: "Rewrite the plot completely, then continue with detailed drafts",
  },
  deepStoryDraftsScopeRewriteHint: {
    th: "เริ่มคิดเรื่องใหม่ทั้งหมด ของเดิมถูกแทนที่ (ร่างเก่ายังย้อนดูได้)",
    en: "Starts the plot over completely — the old one is replaced (previous drafts are still viewable in version history).",
  },
  deepStoryDraftsChainStoryProgress: { th: "กำลังคิดโครงเรื่องใหม่…", en: "Rewriting the plot…" },
  deepStoryDraftsChainDeepProgress: { th: "กำลังร่างละเอียด…", en: "Drafting details…" },

  /* ---------------------------------------------------------------------- */
  /* Premium multi-round drafts (W11-B, added 2026-07-08) — the quality-mode */
  /* picker inside the confirm dialog (reads/writes `mode` on               */
  /* `generateStoryBibleDeep`/`extendStoryDraftHorizon`, W11-A) plus the      */
  /* per-episode scorecard badge strings. Every string below is only ever    */
  /* shown when the corresponding response field (`mode`/`draftScorecard`/   */
  /* `deepDraftSummary.premium`) is actually present — additive, byte-        */
  /* identical when absent (spec: "standard mode + absent fields untouched"). */
  /* ---------------------------------------------------------------------- */
  deepStoryDraftsModeGroupLabel: { th: "โหมดคุณภาพการร่าง", en: "Draft quality mode" },
  deepStoryDraftsModeStandardLabel: { th: "มาตรฐาน (เร็ว ประหยัด)", en: "Standard (fast, economical)" },
  deepStoryDraftsModeStandardHint: {
    th: "ร่างรอบเดียวต่อชุดตอน ไม่มีการตรวจซ้ำหรือซ่อมอัตโนมัติ",
    en: "Drafts once per chunk of episodes — no re-checking or auto-repair.",
  },
  deepStoryDraftsModePremiumLabel: { th: "คิดหลายรอบ (พรีเมียม)", en: "Multi-round thinking (premium)" },
  deepStoryDraftsExtendPremiumCheckboxLabel: {
    th: "ใช้โหมดพรีเมียมสำหรับการขยายนี้",
    en: "Use premium mode for this extension",
  },
  deepStoryDraftsSummaryPremiumSuffix: { th: "· โหมดพรีเมียม", en: "· Premium mode" },
  deepStoryDraftsScorecardBelowFloorToggle: { th: "จุดที่ยังต่ำกว่าเกณฑ์", en: "Points still below the floor" },

  /* ---------------------------------------------------------------------- */
  /* Manual dialogue edits (W10.5, added 2026-07-08) — inline per-shot       */
  /* dialogue editor inside the Overview draft viewer                        */
  /* (`VerticalDramaDeepStoryDraftEpisodeDetail`), wired to the shipped       */
  /* `updateEpisodeDraftDialogue` mutation. Gated the SAME way as every      */
  /* other deep-story-drafts string above (flag off -> never rendered).      */
  /* ---------------------------------------------------------------------- */
  manualDialogueEditCta: { th: "แก้บทพูด", en: "Edit dialogue" },
  manualDialogueEditCancel: { th: "ยกเลิก", en: "Cancel" },
  manualDialogueEditSave: { th: "บันทึก", en: "Save" },
  manualDialogueEditSaving: { th: "กำลังบันทึก…", en: "Saving…" },
  manualDialogueEditAddLine: { th: "เพิ่มบรรทัด", en: "Add line" },
  manualDialogueEditMaxLinesReached: {
    th: "ถึงจำนวนบรรทัดสูงสุดแล้ว (8 บรรทัด)",
    en: "Maximum of 8 lines reached",
  },
  manualDialogueEditRemoveLine: { th: "ลบบรรทัดนี้", en: "Remove this line" },
  manualDialogueEditSpeakerLabel: { th: "ผู้พูด (ถ้ามี)", en: "Speaker (optional)" },
  manualDialogueEditLineLabel: { th: "บทพูด", en: "Line" },
  manualDialogueEditDeliveryPlaceholder: { th: "อารมณ์/วิธีพูด", en: "Delivery/emotion" },
  manualDialogueEditLineRequired: { th: "บทพูดห้ามว่าง", en: "The line cannot be empty" },
  manualDialogueEditApplyCleaned: { th: "ใช้เวอร์ชันที่แก้ให้", en: "Use the cleaned version" },
  manualDialogueEditEditedBadge: { th: "แก้แล้ว", en: "Edited" },
  manualDialogueEditAlreadyCreatedHint: {
    th: "ตอนนี้ถูกสร้างแล้ว — บทที่แก้จะถูกใช้เมื่อสร้าง/เกลี่ยบทของตอนนั้นอีกครั้ง",
    en: "This episode has already been created — the edited line will be used the next time this episode's script is generated/reconciled.",
  },
  manualDialogueEditSilenceRemovedInfo: {
    th: "นำป้ายช็อตภาพล้วนออก เพราะมีบทพูดแล้ว",
    en: "Removed the visual-only shot tag, since it now has dialogue",
  },
  manualDialogueEditSaveError: { th: "แก้ไขบทพูดไม่สำเร็จ", en: "Failed to edit the dialogue" },

  /* ---------------------------------------------------------------------- */
  /* Dramaturgy critic (W11.5, added 2026-07-08) — "วิจารณ์ซีซั่นนี้" card    */
  /* inside the Overview actions area (`VerticalDramaSeasonCritiqueCard` in  */
  /* `VerticalDramaDeepStoryDraftsPanel.tsx`). Gated the SAME way as every   */
  /* other deep-story-drafts string above — no new flag.                    */
  /* ---------------------------------------------------------------------- */
  seasonCritiqueCta: { th: "วิจารณ์ซีซั่นนี้ (AI)", en: "Critique this season (AI)" },
  seasonCritiqueRerunCta: { th: "วิจารณ์ใหม่", en: "Re-run critique" },
  seasonCritiqueRunning: { th: "กำลังวิจารณ์…", en: "Critiquing…" },
  seasonCritiqueError: { th: "วิจารณ์ซีซั่นไม่สำเร็จ", en: "Failed to critique this season" },
  seasonCritiqueApplying: { th: "กำลังปรับแก้…", en: "Applying fixes…" },
  seasonCritiqueApplyError: { th: "ปรับตามคำวิจารณ์ไม่สำเร็จ", en: "Failed to apply the critique" },
  seasonCritiqueStrengthsToggle: { th: "จุดแข็งของซีซั่นนี้", en: "This season's strengths" },
  seasonCritiqueFindingsLabel: { th: "จุดที่ควรปรับปรุง", en: "Points to improve" },
  seasonCritiqueRejectedHeading: {
    th: "บางข้อปรับไม่สำเร็จ (เก็บเวอร์ชันเดิมไว้)",
    en: "Some fixes could not be applied (the prior version was kept)",
  },

  /* ---------------------------------------------------------------------- */
  /* Voice casting (W12-B, spec feature 131 §14/§7.4, voice chain wave) —    */
  /* per-character voice casting card on the Characters surface             */
  /* (`VerticalDramaCharacterVoiceCastingCard.tsx`, mounted from             */
  /* `VerticalDramaCharacterStockPanel.tsx`). Gated on the                   */
  /* `verticalDramaSeriesVoiceChain` tenant flag — see that panel's          */
  /* `voiceChainEnabled` prop.                                               */
  /* ---------------------------------------------------------------------- */
  voiceCastingSectionTitle: { th: "เสียงพูดตัวละคร", en: "Character voice" },
  voiceCastingChipUncast: { th: "ยังไม่กำหนดเสียง", en: "No voice cast yet" },
  voiceCastingSelectCta: { th: "เลือกเสียง", en: "Choose voice" },
  voiceCastingClearCta: { th: "ล้างเสียง", en: "Clear voice" },
  voiceCastingClearing: { th: "กำลังล้างเสียง…", en: "Clearing…" },
  voiceCastingPreviewCta: { th: "ฟังตัวอย่าง (มีค่าใช้จ่าย)", en: "Preview voice (paid)" },
  voiceCastingPreviewing: { th: "กำลังสร้างตัวอย่าง…", en: "Generating preview…" },
  voiceCastingPreviewConfirmTitle: { th: "การฟังตัวอย่างนี้ใช้เครดิต", en: "This preview spends credits" },
  voiceCastingPreviewConfirmBody: {
    th: "ระบบจะสร้างคลิปเสียงตัวอย่างสั้น ๆ จากเสียงที่กำหนดไว้ของตัวละครนี้",
    en: "Generates a short sample audio clip using this character's currently cast voice.",
  },
  voiceCastingPreviewErrorNoVoice: {
    th: "ยังไม่ได้กำหนดเสียงให้ตัวละครนี้ — เลือกเสียงก่อนฟังตัวอย่าง",
    en: "This character has no voice cast yet — choose a voice before previewing.",
  },
  voiceCastingDialogTitle: { th: "เลือกเสียงตัวละคร", en: "Choose a character voice" },
  voiceCastingSearchPlaceholder: { th: "ค้นหาเสียง…", en: "Search voices…" },
  voiceCastingSearchAriaLabel: { th: "ค้นหาเสียงจากรายการ", en: "Search the voice catalog" },
  voiceCastingLoading: { th: "กำลังโหลดรายการเสียง…", en: "Loading voice catalog…" },
  voiceCastingNoResults: { th: "ไม่พบเสียงที่ตรงกับคำค้นหา", en: "No voices match your search" },
  voiceCastingEmptyCatalog: {
    th: "ยังไม่มีเสียงให้เลือก — ตรวจสอบว่ามีโมเดลสร้างเสียงที่เปิดใช้งานอยู่",
    en: "No voices available yet — check that an audio model is enabled.",
  },
  voiceCastingUnknownLanguageGroup: { th: "ไม่ระบุภาษา", en: "Unspecified language" },
  voiceCastingCastSuccess: { th: "กำหนดเสียงแล้ว", en: "Voice cast" },
  voiceCastingClearSuccess: { th: "ล้างเสียงแล้ว", en: "Voice cleared" },
  voiceCastingCurrentlyCast: { th: "เสียงที่กำหนดไว้", en: "Currently cast" },
  voiceCastingCancel: { th: "ยกเลิก", en: "Cancel" },
  voiceCastingConfirm: { th: "ยืนยัน", en: "Confirm" },
} as const;

/**
 * Copy Contract: "ล็อกเมื่อ {date}" — locked-voice timestamp shown on the
 * casting card once a character has a voice cast (`voiceConfig.lockedAt`).
 * Formatted deterministically (UTC `YYYY-MM-DD HH:mm`) rather than
 * `toLocaleString` so the string is stable across test environments/locales.
 */
export function voiceCastingLockedAtText(lang: VerticalDramaLang, lockedAtIso: string): string {
  const formatted = formatUtcMinutes(lockedAtIso);
  if (!formatted) return "";
  return lang === "th" ? `ล็อกเมื่อ ${formatted}` : `Locked at ${formatted}`;
}

/**
 * "ใช้ไป N เครดิต" — the resolved `creditCost` `previewCharacterVoice`
 * returns, shown as small muted text near the preview button/result (debt-
 * item-2, 2026-07-08). Deterministic template, same "small standalone
 * formatter function" convention as `voiceCastingLockedAtText` above (this
 * file has no generic `{n}`-placeholder helper the way
 * `verticalDramaWorkspaceCopy.ts`'s `vdCopyWithCount` does).
 */
export function voiceCastingPreviewCreditCostText(
  lang: VerticalDramaLang,
  creditCost: number,
): string {
  return lang === "th"
    ? `ใช้ไป ${creditCost} เครดิต`
    : `Cost: ${creditCost} credit${creditCost === 1 ? "" : "s"}`;
}

function formatUtcMinutes(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* Series status labels (bilingual + text color, never color-only)            */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesStatus =
  | "draft"
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export const seriesStatusCopy: Record<
  VerticalDramaSeriesStatus,
  { th: string; en: string }
> = {
  draft: { th: "ฉบับร่าง", en: "Draft" },
  planning: { th: "กำลังวางแผน", en: "Planning" },
  active: { th: "กำลังผลิต", en: "Active" },
  paused: { th: "หยุดชั่วคราว", en: "Paused" },
  completed: { th: "เสร็จสิ้น", en: "Completed" },
  archived: { th: "เก็บถาวร", en: "Archived" },
};

/** Wizard steps (spec §8.2) — bilingual titles for the 6-step Create-Series wizard. */
export const wizardSteps: Array<{ id: string; th: string; en: string }> = [
  { id: "basic", th: "ตั้งค่าพื้นฐาน", en: "Basic setup" },
  { id: "story", th: "โครงเรื่อง", en: "Story setup" },
  { id: "characters", th: "ตัวละคร", en: "Characters" },
  { id: "bible", th: "วิชวลไบเบิล", en: "Visual bible" },
  { id: "product", th: "สินค้าผูกเรื่อง (ไม่บังคับ)", en: "Product tie-in (optional)" },
  { id: "review", th: "ตรวจสอบและสร้าง", en: "Review" },
];

/* -------------------------------------------------------------------------- */
/* Preset Mix v2 — interpolated Copy Contract strings (spec §8.2.2.C,         */
/* section-15). Kept verbatim in Thai per the section's Copy Contract; each   */
/* pure function is unit-tested directly (no component render needed).       */
/* -------------------------------------------------------------------------- */

/** Copy Contract: "น้ำหนักการผสม {n}/5". */
export function mixWeightLabel(lang: VerticalDramaLang, weight: number): string {
  return lang === "th" ? `น้ำหนักการผสม ${weight}/5` : `Mix weight ${weight}/5`;
}

/** Copy Contract: "สิ่งที่ preset นี้เพิ่มเข้ามา: {elements}". */
export function blendContributionSummary(lang: VerticalDramaLang, elements: string[]): string {
  const joined = elements.length > 0 ? elements.join(", ") : lang === "th" ? "(ไม่มี)" : "(none)";
  return lang === "th"
    ? `สิ่งที่ preset นี้เพิ่มเข้ามา: ${joined}`
    : `What this preset contributed: ${joined}`;
}

/** Copy Contract: "preset '{title}' ยังไม่ถูกผสมจริง (ครอบคลุม {n}/{floor} ด้าน) — เพิ่มน้ำหนักหรือเลือกใหม่". */
export function underBlendedWarningText(
  lang: VerticalDramaLang,
  title: string,
  coverage: number,
  floor: number,
): string {
  return lang === "th"
    ? `preset '${title}' ยังไม่ถูกผสมจริง (ครอบคลุม ${coverage}/${floor} ด้าน) — เพิ่มน้ำหนักหรือเลือกใหม่`
    : `preset '${title}' has not genuinely blended in yet (covers ${coverage}/${floor} facets) — increase its weight or choose again`;
}

/** Copy Contract: "สไตล์ภาพ: {styleName}". */
export function visualStyleLabel(lang: VerticalDramaLang, styleName: string): string {
  return lang === "th" ? `สไตล์ภาพ: ${styleName}` : `Visual style: ${styleName}`;
}

/** Bilingual display labels for the 8 Mix-and-Match v2 blend facets (spec §8.2.2.C). */
export const blendFacetCopy: Record<VerticalDramaBlendFacet, { th: string; en: string }> = {
  story_spine: { th: "โครงเรื่องหลัก", en: "Story spine" },
  situations: { th: "สถานการณ์ในเรื่อง", en: "Situations" },
  characters: { th: "ตัวละคร", en: "Characters" },
  tone: { th: "โทนเรื่อง", en: "Tone" },
  cliffhanger_style: { th: "สไตล์ตอนจบค้าง", en: "Cliffhanger style" },
  world_texture: { th: "บรรยากาศ/โลกของเรื่อง", en: "World texture" },
  visual_identity: { th: "อัตลักษณ์ภาพ", en: "Visual identity" },
  product_fit: { th: "ความเข้ากับสินค้าผูกเรื่อง", en: "Product fit" },
};

/* -------------------------------------------------------------------------- */
/* Arc drift reason codes (spec §7.7.3, section-13) — stable VD_ARC_* codes   */
/* localized for the Arc re-plan review card. Unknown/future codes fall back  */
/* to the raw code string via `arcDriftReasonLabel` below (never crashes).    */
/* -------------------------------------------------------------------------- */

export const arcDriftReasonCopy: Record<
  VerticalDramaArcDriftReasonCode,
  { th: string; en: string }
> = {
  VD_ARC_BEATS_CONSUMED_EARLY: {
    th: "ตอนนี้ใช้บีตเนื้อเรื่องที่วางแผนไว้สำหรับตอนถัดไปล่วงหน้า",
    en: "This episode used story beats planned for a later episode",
  },
  VD_ARC_HOOK_RESOLVED_EARLY: {
    th: "ปมค้างถูกคลี่คลายเร็วกว่าแผนที่วางไว้",
    en: "A hook resolved earlier than planned",
  },
  VD_ARC_HOOK_UNPLANNED: {
    th: "มีปมค้างใหม่เกิดขึ้นโดยไม่อยู่ในแผนเดิม",
    en: "A new hook was introduced outside the plan",
  },
  VD_ARC_CONTENT_BUDGET_EXCEEDED: {
    th: "เนื้อหา/บทพูดของตอนนี้เกินงบที่วางแผนไว้มาก",
    en: "This episode's content/speech significantly exceeded its planned budget",
  },
  VD_ARC_ESCALATION_ORDER_BROKEN: {
    th: "ระดับความเข้มข้นของตอนนี้แซงหน้าแผนของตอนถัดไปแล้ว",
    en: "This episode's intensity already exceeds a later episode's planned curve",
  },
  // Task #31 (added 2026-07-09) — DELIBERATE (user-triggered defer), not a
  // detected drift — see this code's own doc comment in
  // `VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES` (contentBudget.ts).
  VD_ARC_TIE_IN_DEFERRED: {
    th: "ย้ายตำแหน่งสินค้าไปตอนอื่นตามคำขอเลื่อนสินค้า",
    en: "Product placement moved to another episode by a defer request",
  },
};

/** Defensive lookup — unknown/future codes fall back to the raw code (never throws). */
export function arcDriftReasonLabel(lang: VerticalDramaLang, code: string): string {
  const entry = arcDriftReasonCopy[code as VerticalDramaArcDriftReasonCode];
  return entry ? entry[lang] : code;
}

/**
 * Task #31 (spec §7.7.3, added 2026-07-09) — "ข้อเสนอย้ายสินค้า: ตอน {from}
 * → ตอน {to}" kicker for a `VD_ARC_TIE_IN_DEFERRED` proposal, replacing
 * `arcReplanKicker`'s generic drift copy for this proposal type.
 */
export function tieInReplanMoveKickerText(
  lang: VerticalDramaLang,
  fromEpisodeNumber: number,
  toEpisodeNumber: number,
): string {
  return lang === "th"
    ? `ข้อเสนอย้ายสินค้า: ตอน ${fromEpisodeNumber} → ตอน ${toEpisodeNumber}`
    : `Proposal to move the product: episode ${fromEpisodeNumber} → episode ${toEpisodeNumber}`;
}

/* -------------------------------------------------------------------------- */
/* Deep story drafts (W10-C, spec F131T) — interpolated Copy Contract         */
/* strings for `VerticalDramaDeepStoryDraftsPanel.tsx`. Each pure function is */
/* unit-tested directly (no component render needed), mirroring the Preset   */
/* Mix v2 functions above.                                                   */
/* -------------------------------------------------------------------------- */

/** Copy Contract: "ร่างแล้ว {n} ตอน". */
export function deepStoryDraftsGeneratedSuccessText(lang: VerticalDramaLang, episodeCount: number): string {
  return lang === "th"
    ? `ร่างแล้ว ${episodeCount} ตอน`
    : `Drafted ${episodeCount} episode${episodeCount === 1 ? "" : "s"}`;
}

/** Copy Contract: "ร่างสำเร็จบางส่วน (ถึงตอนที่ {horizonEndEpisode}) — กดขยายเพื่อทำต่อ". */
export function deepStoryDraftsPartialWarningText(lang: VerticalDramaLang, horizonEndEpisode: number): string {
  return lang === "th"
    ? `ร่างสำเร็จบางส่วน (ถึงตอนที่ ${horizonEndEpisode}) — กดขยายเพื่อทำต่อ`
    : `Partially drafted (through episode ${horizonEndEpisode}) — press extend to continue`;
}

/**
 * Copy Contract: "ร่างละเอียดแล้ว {episodesWithDrafts}/{totalEpisodes} ตอน
 * (ถึงตอนที่ {horizonEndEpisode})", with "· โหมดพรีเมียม" appended when
 * `summary.premium` is true (W11-B) — `premium` is optional/additive
 * (mirrors the server's `VdDeepDraftSummary.premium?: true`), so omitting it
 * renders byte-identical to every pre-W11-B caller.
 */
export function deepStoryDraftsSummaryText(
  lang: VerticalDramaLang,
  summary: {
    episodesWithDrafts: number;
    totalEpisodes: number;
    horizonEndEpisode: number;
    premium?: true;
  },
): string {
  const base =
    lang === "th"
      ? `ร่างละเอียดแล้ว ${summary.episodesWithDrafts}/${summary.totalEpisodes} ตอน (ถึงตอนที่ ${summary.horizonEndEpisode})`
      : `Drafted in detail: ${summary.episodesWithDrafts}/${summary.totalEpisodes} episodes (through episode ${summary.horizonEndEpisode})`;
  return summary.premium
    ? `${base} ${pickCopy(lang, verticalDramaCopy.deepStoryDraftsSummaryPremiumSuffix)}`
    : base;
}

/** Copy Contract: "จำนวนตอนที่จะร่าง: {horizon} ตอน". */
export function deepStoryDraftsHorizonCountText(lang: VerticalDramaLang, horizonEpisodes: number): string {
  return lang === "th"
    ? `จำนวนตอนที่จะร่าง: ${horizonEpisodes} ตอน`
    : `Episodes to draft: ${horizonEpisodes}`;
}

/** Copy Contract: "จำนวนรอบเรียก: {rounds} รอบ". */
export function deepStoryDraftsCallRoundsText(lang: VerticalDramaLang, callRounds: number): string {
  return lang === "th" ? `จำนวนรอบเรียก: ${callRounds} รอบ` : `Number of calls: ${callRounds}`;
}

/**
 * Copy Contract: "โปรไฟล์ความยาว: {nameTh} — ทุกตอนเปิดด้วย hook ใน
 * {hookWithinSeconds} วิ / เนื้อแน่นไม่มีตอนเติม" (task #23, added
 * 2026-07-08) — informational-only chip shown in the deep-draft confirm
 * dialog when the series' planned episode count resolves to the
 * `"ultra_short"`/`"short"` `VerticalDramaFormatProfile` tier (see
 * `@shared/verticalDramaSeries/formatProfiles`'s `resolveVerticalDramaFormatProfile`
 * — the caller gates on `profile.tier !== "standard"`, never shown for a
 * standard-length season). The shared profile type only carries a Thai
 * `nameTh`, so the English tier name is derived here from `profile.tier`
 * directly rather than a `nameEn` field.
 */
export function deepStoryDraftsFormatProfileChipText(
  lang: VerticalDramaLang,
  profile: {
    tier: "ultra_short" | "short" | "standard";
    nameTh: string;
    perEpisodeHookRule: { hookWithinSeconds: number };
  },
): string {
  const seconds = profile.perEpisodeHookRule.hookWithinSeconds;
  if (lang === "th") {
    return `โปรไฟล์ความยาว: ${profile.nameTh} — ทุกตอนเปิดด้วย hook ใน ${seconds} วิ / เนื้อแน่นไม่มีตอนเติม`;
  }
  const nameEn = profile.tier === "ultra_short" ? "ultra-short series" : "short series";
  return `Length profile: ${nameEn} — every episode opens with a hook within ${seconds}s / dense content, no filler episodes`;
}

/**
 * Copy Contract: "ขยายร่างอีก {n} ตอน" — owner-reported fix (2026-07-08): the
 * label previously always said a hardcoded "5" even when fewer episodes
 * remained (e.g. 9/10 drafted showed "...อีก 5 ตอน" instead of "...อีก 1
 * ตอน"). `count` is computed by the caller
 * (`VerticalDramaDeepStoryDraftsPanel.tsx`'s `computeDeepDraftExtendCount`)
 * as `min(DEEP_DRAFT_EXTEND_DEFAULT_EPISODES, totalEpisodes -
 * horizonEndEpisode)`, so this function only ever renders the real number of
 * episodes THIS click will draft.
 */
export function deepStoryDraftsExtendCtaText(lang: VerticalDramaLang, count: number): string {
  return lang === "th"
    ? `ขยายร่างอีก ${count} ตอน`
    : `Extend draft by ${count} more episode${count === 1 ? "" : "s"}`;
}

/** Copy Contract: "ช็อต {n} — {summary}". */
export function deepStoryDraftsShotSummaryLabel(
  lang: VerticalDramaLang,
  shotNumber: number,
  summary: string,
): string {
  return lang === "th" ? `ช็อต ${shotNumber} — ${summary}` : `Shot ${shotNumber} — ${summary}`;
}

/** Copy Contract: "{speaker}: {line}" — mirrors the wizard's own dialogue-viewer template exactly. */
export function deepStoryDraftsDialogueLineText(
  _lang: VerticalDramaLang,
  speaker: string,
  line: string,
): string {
  return `${speaker}: ${line}`;
}

/** Copy Contract: "จุดค้าง: {line}". */
export function deepStoryDraftsCliffhangerText(lang: VerticalDramaLang, line: string): string {
  return lang === "th" ? `จุดค้าง: ${line}` : `Cliffhanger: ${line}`;
}

/** Copy Contract: "บทพูดรวม {n} วิ". */
export function deepStoryDraftsSpeechSecondsBadgeText(lang: VerticalDramaLang, seconds: number): string {
  const rounded = Math.round(seconds);
  return lang === "th" ? `บทพูดรวม ${rounded} วิ` : `Total dialogue ${rounded}s`;
}

/**
 * Copy Contract: "โครง {n} ตอนยังเหมือนเดิม เพิ่มบทละเอียดให้ทุกตอน" — the "keep
 * the current plot" scope's dialog hint. Deliberately a function (not a
 * static string) so the episode count always matches the real series instead
 * of a hardcoded example number.
 */
export function deepStoryDraftsScopeKeepHintText(lang: VerticalDramaLang, totalEpisodes: number): string {
  return lang === "th"
    ? `โครง ${totalEpisodes} ตอนยังเหมือนเดิม เพิ่มบทละเอียดให้ทุกตอน`
    : `The ${totalEpisodes}-episode plot stays the same — detailed drafts are added/updated for every episode.`;
}

/** Bilingual labels for the 4 canonical silence-intent codes (spec §7.7.2 Layer 3). */
export const deepStoryDraftsSilenceIntentCopy: Record<VerticalDramaSilenceIntent, { th: string; en: string }> = {
  dramatic_pause: {
    th: "ช็อตเงียบเชิงดราม่า (ไม่มีบทพูดโดยตั้งใจ)",
    en: "Dramatic pause (intentionally silent)",
  },
  action_visual: {
    th: "ช็อตแอ็กชัน/ภาพล้วน (ไม่มีบทพูดโดยตั้งใจ)",
    en: "Action/visual shot (intentionally silent)",
  },
  montage: {
    th: "ช็อตมองตาจ (ไม่มีบทพูดโดยตั้งใจ)",
    en: "Montage shot (intentionally silent)",
  },
  establishing: {
    th: "ช็อตปูฉาก (ไม่มีบทพูดโดยตั้งใจ)",
    en: "Establishing shot (intentionally silent)",
  },
};

/** Defensive lookup mirroring `arcDriftReasonLabel` — unknown values fall back to the raw code. */
export function deepStoryDraftsSilenceIntentLabel(
  lang: VerticalDramaLang,
  intent: VerticalDramaSilenceIntent,
): string {
  const entry = deepStoryDraftsSilenceIntentCopy[intent];
  return entry ? entry[lang] : intent;
}

/* -------------------------------------------------------------------------- */
/* Premium multi-round drafts (W11-A/W11-B) — the 8 judged dimensions +       */
/* interpolated scorecard/mode-picker Copy Contract strings.                  */
/*                                                                            */
/* `PREMIUM_DRAFT_SCORE_DIMENSIONS` mirrors the server's own                  */
/* `VD_PREMIUM_DRAFT_SCORE_DIMENSIONS` (order + key set only — DISPLAY MATH   */
/* ONLY; `server/services/verticalDramaStoryBible.ts` is a server-only file,  */
/* not importable from the client, and stays the sole source of truth for    */
/* what a stored `draftScorecard` actually contains). Declared here (rather   */
/* than `VerticalDramaDeepStoryDraftsPanel.tsx`) so this file is the single   */
/* source for the dimension key set, keeping the exhaustive                   */
/* `deepStoryDraftsPremiumDimensionCopy` Record type-checked against it       */
/* without duplicating the literal array in two files — the Panel imports     */
/* this array/type for its own zod schema + below-floor filtering order.      */
/* -------------------------------------------------------------------------- */
export const PREMIUM_DRAFT_SCORE_DIMENSIONS = [
  "hook_strength",
  "reversal_sharpness",
  "emotion_variety",
  "dialogue_naturalness",
  "pacing",
  "cliffhanger_strength",
  "continuity_with_recap",
  "season_cohesion",
] as const;

export type VerticalDramaPremiumDraftScoreDimension = (typeof PREMIUM_DRAFT_SCORE_DIMENSIONS)[number];

/** Bilingual labels for the 8 premium-draft judged dimensions (spec W11-A/W11-B). */
export const deepStoryDraftsPremiumDimensionCopy: Record<
  VerticalDramaPremiumDraftScoreDimension,
  { th: string; en: string }
> = {
  hook_strength: { th: "แรงดึงดูดของฮุคเปิดเรื่อง", en: "Hook strength" },
  reversal_sharpness: { th: "ความคมของจุดพลิกผัน", en: "Reversal sharpness" },
  emotion_variety: { th: "ความหลากหลายทางอารมณ์", en: "Emotional variety" },
  dialogue_naturalness: { th: "ความเป็นธรรมชาติของบทพูด", en: "Dialogue naturalness" },
  pacing: { th: "จังหวะเรื่อง", en: "Pacing" },
  cliffhanger_strength: { th: "ความแรงของจุดค้าง", en: "Cliffhanger strength" },
  continuity_with_recap: { th: "ความต่อเนื่องกับเนื้อเรื่องเดิม", en: "Continuity with recap" },
  season_cohesion: { th: "ความกลมกลืนกับภาพรวมซีซั่น", en: "Season cohesion" },
};

/** Defensive lookup mirroring `arcDriftReasonLabel`/`deepStoryDraftsSilenceIntentLabel` — unknown values fall back to the raw code, never throws. */
export function deepStoryDraftsPremiumDimensionLabel(lang: VerticalDramaLang, dimension: string): string {
  const entry = deepStoryDraftsPremiumDimensionCopy[dimension as VerticalDramaPremiumDraftScoreDimension];
  return entry ? entry[lang] : dimension;
}

/** Rounds a 1-5 premium-draft score to at most 1 decimal place, trimming a trailing ".0" (e.g. `4` -> `"4"`, `3.333` -> `"3.3"`). */
export function formatPremiumDraftScore(score: number): string {
  if (!Number.isFinite(score)) return "0";
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Copy Contract: "คะแนน {overall}/5" — the premium-draft scorecard's header badge. */
export function deepStoryDraftsScorecardOverallBadgeText(lang: VerticalDramaLang, overall: number): string {
  const formatted = formatPremiumDraftScore(overall);
  return lang === "th" ? `คะแนน ${formatted}/5` : `Score ${formatted}/5`;
}

/** Copy Contract: "จุดที่ยังต่ำ: {dimensionLabel} {score}/5" — one row per below-floor premium-draft dimension. */
export function deepStoryDraftsScorecardBelowFloorDimText(
  lang: VerticalDramaLang,
  dimension: VerticalDramaPremiumDraftScoreDimension,
  score: number,
): string {
  const label = deepStoryDraftsPremiumDimensionLabel(lang, dimension);
  const formatted = formatPremiumDraftScore(score);
  return lang === "th" ? `จุดที่ยังต่ำ: ${label} ${formatted}/5` : `Still below floor: ${label} ${formatted}/5`;
}

/** Copy Contract: "แตก 3 มุมเขียน ตรวจ ซ่อมอัตโนมัติ (~{callEstimate} ครั้งเรียก)" — premium mode's one-line hint in the confirm dialog's mode picker (call estimate mirrors the server's `estimatePremiumDeepDraftCalls`, DISPLAY MATH ONLY). */
export function deepStoryDraftsModePremiumHintText(lang: VerticalDramaLang, callEstimate: number): string {
  return lang === "th"
    ? `แตก 3 มุมเขียน ตรวจ ซ่อมอัตโนมัติ (~${callEstimate} ครั้งเรียก)`
    : `Writes 3 different takes, checks each one, and auto-repairs weak spots (~${callEstimate} calls)`;
}

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits (W10.5) — interpolated Copy Contract strings for      */
/* `VerticalDramaDeepStoryDraftEpisodeDetail`'s inline per-shot editor.        */
/* -------------------------------------------------------------------------- */

/** Copy Contract: "บันทึกบทช็อต {n} แล้ว". */
export function manualDialogueEditSavedSuccessText(lang: VerticalDramaLang, shotNumber: number): string {
  return lang === "th" ? `บันทึกบทช็อต ${shotNumber} แล้ว` : `Saved shot ${shotNumber}'s dialogue`;
}

/** Copy Contract: "บันทึกแล้ว แต่ยังมี {k} จุดที่อ่านออกเสียงยาก". */
export function manualDialogueEditSavedWithWarningsText(
  lang: VerticalDramaLang,
  warningCount: number,
): string {
  return lang === "th"
    ? `บันทึกแล้ว แต่ยังมี ${warningCount} จุดที่อ่านออกเสียงยาก`
    : `Saved, but ${warningCount} spot${warningCount === 1 ? " is" : "s are"} still hard to read aloud`;
}

/**
 * Copy Contract: "บทพูดรวม {live} วิ (เป้า {target} วิ)" — the LIVE, unsaved
 * per-shot editor chip. Deliberately distinct from the read-only
 * `deepStoryDraftsSpeechSecondsBadgeText` above (which only ever shows the
 * server-computed episode-wide total, never a target) — this one always
 * shows both the live sum and the per-shot target side by side so the user
 * can see progress toward it while typing.
 */
export function manualDialogueEditLiveSpeechSecondsText(
  lang: VerticalDramaLang,
  liveSeconds: number,
  targetSeconds: number,
): string {
  const live = Math.round(liveSeconds);
  const target = Math.round(targetSeconds);
  return lang === "th"
    ? `บทพูดรวม ${live} วิ (เป้า ${target} วิ)`
    : `Total dialogue ${live}s (target ${target}s)`;
}

/** Copy Contract: "บรรทัดที่ {n}" — the accessible group label wrapping each editable line's speaker/line/delivery fields (disambiguates the per-row "remove"/field labels for screen-reader users without needing a per-field interpolated label). */
export function manualDialogueEditLineGroupLabel(lang: VerticalDramaLang, lineNumber: number): string {
  return lang === "th" ? `บรรทัดที่ ${lineNumber}` : `Line ${lineNumber}`;
}

/** Bilingual short reasons for each `VerticalDramaLineSpeakabilityViolationKind` (spec §14.1 rule 6b) — the inline editor's live per-line hint, shown next to the "ใช้เวอร์ชันที่แก้ให้" one-click fix button. */
export const manualDialogueEditViolationCopy: Record<
  VerticalDramaLineSpeakabilityViolationKind,
  { th: string; en: string }
> = {
  wrapping_quotes: { th: "มีเครื่องหมายคำพูดครอบทั้งประโยค", en: "Wrapped in quote marks" },
  parenthetical_stage_direction: {
    th: "มีวงเล็บกำกับการแสดง",
    en: "Contains a parenthetical stage direction",
  },
  unspeakable_symbol: { th: "มีสัญลักษณ์ที่พูดออกเสียงไม่ได้", en: "Contains an unspeakable symbol" },
  em_dash: { th: "มีเครื่องหมายขีดยาว (—)", en: "Contains an em dash" },
  ellipsis_run: { th: "มีจุดไข่ปลาซ้ำหลายจุด", en: "Contains a repeated ellipsis" },
  emoji: { th: "มีอิโมจิ", en: "Contains an emoji" },
  nonverbal_line: {
    th: "เป็นเสียงที่ไม่ใช่คำพูด ควรใช้ป้ายช็อตภาพล้วนแทน",
    en: "Reads as a nonverbal sound, not spoken dialogue",
  },
};

/** Defensive lookup mirroring `arcDriftReasonLabel`/`deepStoryDraftsSilenceIntentLabel` — unknown violation kinds fall back to the raw code, never throws. */
export function manualDialogueEditViolationLabel(lang: VerticalDramaLang, kind: string): string {
  const entry = manualDialogueEditViolationCopy[kind as VerticalDramaLineSpeakabilityViolationKind];
  return entry ? entry[lang] : kind;
}

/* -------------------------------------------------------------------------- */
/* Dramaturgy critic (W11.5, added 2026-07-08) — the 8 golden-critique        */
/* finding kinds + "other", plus interpolated Copy Contract strings for       */
/* `VerticalDramaSeasonCritiqueCard` (`VerticalDramaDeepStoryDraftsPanel.tsx`).*/
/*                                                                            */
/* `SEASON_CRITIQUE_FINDING_KINDS` mirrors the server's own                   */
/* `VD_SEASON_CRITIQUE_FINDING_KINDS` (`server/services/verticalDramaStoryBible.ts`,*/
/* a server-only file, not importable from the client) — order + key set      */
/* only, DISPLAY MATH/COPY ONLY.                                              */
/* -------------------------------------------------------------------------- */
export const SEASON_CRITIQUE_FINDING_KINDS = [
  "protagonist_no_stake",
  "world_rules_undefined",
  "key_character_late_intro",
  "character_agency_zero_decisions",
  "antagonist_tactic_repetition",
  "finale_no_price_paid",
  "on_the_nose_dialogue",
  "info_heavy_low_action",
  "tie_in_distribution",
  "other",
] as const;

export type VerticalDramaSeasonCritiqueFindingKind = (typeof SEASON_CRITIQUE_FINDING_KINDS)[number];

/** Bilingual labels for the 8 golden-critique finding kinds + "other" (ม.ปลาย reading level — plain, concrete Thai). */
export const seasonCritiqueFindingKindCopy: Record<
  VerticalDramaSeasonCritiqueFindingKind,
  { th: string; en: string }
> = {
  protagonist_no_stake: {
    th: "พระเอก/นางเอกไม่มีเหตุผลส่วนตัว",
    en: "Protagonist lacks a personal stake",
  },
  world_rules_undefined: {
    th: "กติกาโลกของเรื่องยังไม่ชัดเจน",
    en: "The story's world-rule system is undefined",
  },
  key_character_late_intro: {
    th: "ตัวละครสำคัญออกตัวช้าเกินไป",
    en: "A key character is introduced too late",
  },
  character_agency_zero_decisions: {
    th: "ตัวละครไม่มีบทบาทตัดสินใจเอง",
    en: "A character never gets to decide anything on their own",
  },
  antagonist_tactic_repetition: {
    th: "ตัวร้ายใช้กลวิธีซ้ำเดิม",
    en: "The antagonist repeats the same tactic",
  },
  finale_no_price_paid: {
    th: "ตอนจบไม่มีราคาที่ต้องจ่าย",
    en: "The finale resolves without any real cost",
  },
  on_the_nose_dialogue: {
    th: "บทพูดตรงเกินไป (บอกแทนที่จะเล่า)",
    en: "Dialogue is too on-the-nose (tells instead of shows)",
  },
  info_heavy_low_action: {
    th: "ตอนแน่นข้อมูล ขาดฉากดราม่า",
    en: "Episode is info-heavy with little dramatized action",
  },
  tie_in_distribution: {
    th: "การวางสินค้าตามแผนกระจายไม่ดี",
    en: "Tie-in placements are poorly distributed",
  },
  other: { th: "ปัญหาอื่น ๆ", en: "Other" },
};

/** Defensive lookup mirroring `arcDriftReasonLabel`/`manualDialogueEditViolationLabel` — unknown kinds fall back to the raw code, never throws. */
export function seasonCritiqueFindingKindLabel(lang: VerticalDramaLang, kind: string): string {
  const entry = seasonCritiqueFindingKindCopy[kind as VerticalDramaSeasonCritiqueFindingKind];
  return entry ? entry[lang] : kind;
}

/** Copy Contract: "คะแนนรวม {overallScore}/10". */
export function seasonCritiqueScoreText(lang: VerticalDramaLang, overallScore: number): string {
  return lang === "th" ? `คะแนนรวม ${overallScore}/10` : `Overall score ${overallScore}/10`;
}

/** Copy Contract: "ตอนที่ 3, 5, 7" — a finding's cited episode numbers, ascending. */
export function seasonCritiqueEvidenceEpisodesText(lang: VerticalDramaLang, episodeNumbers: number[]): string {
  const list = [...episodeNumbers].sort((a, b) => a - b).join(", ");
  return lang === "th" ? `ตอนที่ ${list}` : `Episode${episodeNumbers.length === 1 ? "" : "s"} ${list}`;
}

/** Copy Contract: "ปรับตามคำวิจารณ์ ({n} ข้อ, มีค่าใช้จ่าย)" — the apply footer button. */
export function seasonCritiqueApplyFooterText(lang: VerticalDramaLang, selectedCount: number): string {
  return lang === "th"
    ? `ปรับตามคำวิจารณ์ (${selectedCount} ข้อ, มีค่าใช้จ่าย)`
    : `Apply the critique (${selectedCount} item${selectedCount === 1 ? "" : "s"}, incurs a cost)`;
}

/** Copy Contract: "ปรับปรุงแล้ว {n} ตอน" — the apply success toast. */
export function seasonCritiqueApplySuccessText(lang: VerticalDramaLang, updatedCount: number): string {
  return lang === "th"
    ? `ปรับปรุงแล้ว ${updatedCount} ตอน`
    : `Updated ${updatedCount} episode${updatedCount === 1 ? "" : "s"}`;
}

/** Copy Contract: "ตอนที่ {n}: {reason}" — one line per rejected episode in the apply-result warning. */
export function seasonCritiqueRejectedLineText(
  lang: VerticalDramaLang,
  episodeNumber: number,
  reason: string,
): string {
  return lang === "th" ? `ตอนที่ ${episodeNumber}: ${reason}` : `Episode ${episodeNumber}: ${reason}`;
}

/* -------------------------------------------------------------------------- */
/* Async story jobs (#28, added 2026-07-08) — shared progress text            */
/* -------------------------------------------------------------------------- */

/** A structural (not imported) mirror of `services/verticalDramaStoryJobs.ts`'s `VerticalDramaStoryJobProgress` — keeps this file dependency-free of any server module. */
export interface VerticalDramaStoryJobProgressCopyInput {
  phase: "outline" | "draft" | "review" | "fix" | "reading";
  chunkIndex?: number;
  chunkCount?: number;
  episodesDone?: number[];
}

/** Copy Contract: "กำลังซ่อมตอน {eps}" — episode numbers ascending, comma-joined; falls back to the bare prefix when no episode numbers are known yet. */
function storyJobPhaseFixText(lang: VerticalDramaLang, episodesDone: number[] | undefined): string {
  const prefix = pickCopy(lang, verticalDramaCopy.storyJobPhaseFixPrefix);
  if (!episodesDone || episodesDone.length === 0) return prefix;
  const list = [...episodesDone].sort((a, b) => a - b).join(", ");
  return `${prefix} ${list}`;
}

/** Copy Contract: "รอบเรียก {i}/{n}". */
function storyJobRoundText(lang: VerticalDramaLang, chunkIndex: number, chunkCount: number): string {
  return `${pickCopy(lang, verticalDramaCopy.storyJobRoundLabel)} ${chunkIndex}/${chunkCount}`;
}

/**
 * Copy Contract: "รอบเรียก {i}/{n} · {phase-thai}" (`chunkIndex`/`chunkCount`
 * omitted when the phase isn't chunk-scoped, e.g. the premium pipeline's
 * one-time season continuity sweep — see
 * `services/verticalDramaStoryBible.ts`'s `VdStoryDraftProgressEvent` doc
 * comment). `progress: null | undefined` reads as "queued" (submitted, no
 * progress event yet — covers both a freshly-enqueued job and a resumed job
 * whose first poll hasn't returned a `progress` snapshot yet).
 */
export function storyJobProgressText(
  lang: VerticalDramaLang,
  progress: VerticalDramaStoryJobProgressCopyInput | null | undefined,
): string {
  if (!progress) return pickCopy(lang, verticalDramaCopy.storyJobQueued);

  const phaseLabel =
    progress.phase === "outline"
      ? pickCopy(lang, verticalDramaCopy.storyJobPhaseOutline)
      : progress.phase === "draft"
        ? pickCopy(lang, verticalDramaCopy.storyJobPhaseDraft)
        : progress.phase === "review"
          ? pickCopy(lang, verticalDramaCopy.storyJobPhaseReview)
          : progress.phase === "reading"
            ? pickCopy(lang, verticalDramaCopy.storyJobPhaseReading)
            : storyJobPhaseFixText(lang, progress.episodesDone);

  if (progress.chunkIndex == null || progress.chunkCount == null) {
    return phaseLabel;
  }
  return `${storyJobRoundText(lang, progress.chunkIndex, progress.chunkCount)} · ${phaseLabel}`;
}
