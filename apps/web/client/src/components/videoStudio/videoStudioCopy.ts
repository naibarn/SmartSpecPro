/**
 * Video Studio (Feature 133, section-08) — bilingual (Thai-first, English
 * fallback) copy helpers. Mirrors the established
 * `components/verticalDramaSeries/verticalDramaCopy.ts` convention
 * (`useVideoStudioLang` + `pickCopy`) rather than inventing a new i18n
 * pattern (memory `feedback_reuse_existing_ui_patterns`).
 */
import { useTranslation } from "react-i18next";

export type VideoStudioLang = "th" | "en";

export function useVideoStudioLang(): VideoStudioLang {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("th") ? "th" : "en";
}

export function pickCopy<T>(lang: VideoStudioLang, value: { th: T; en: T }): T {
  return lang === "th" ? value.th : value.en;
}

export const videoStudioCopy = {
  dashboard: { th: "แดชบอร์ด", en: "Dashboard" },
  pageTitle: { th: "สตูดิโอวิดีโอ", en: "Video Studio" },
  pageDescription: {
    th: "สร้างวิดีโอจากสินค้าในตลาด (Catalog) หรือเริ่มโปรเจกต์ motion graphic เปล่า",
    en: "Create videos from a marketplace product (Catalog) or start a blank motion graphics project.",
  },
  newFromProduct: { th: "สร้างจากสินค้า", en: "New from product" },
  newBlankProject: { th: "โปรเจกต์เปล่าใหม่", en: "New blank project" },
  searchPlaceholder: { th: "ค้นหาโปรเจกต์...", en: "Search projects..." },
  allStudioTypes: { th: "ทั้งหมด", en: "All" },
  studioTypeCatalog: { th: "Catalog Video", en: "Catalog Video" },
  studioTypeMotion: { th: "Motion Studio", en: "Motion Studio" },
  studioTypeContent: { th: "AI Content", en: "AI Content" },
  studioTypeReviewRemix: { th: "Review Remix", en: "Review Remix" },
  studioTypeImported: { th: "นำเข้า", en: "Imported" },
  emptyTitle: { th: "ยังไม่มีโปรเจกต์วิดีโอ", en: "No video projects yet" },
  emptyBody: {
    th: "เริ่มต้นด้วยการสร้างจากสินค้า หรือสร้างโปรเจกต์ motion เปล่า",
    en: "Get started by creating from a product, or start a blank motion project.",
  },
  errorTitle: { th: "โหลดรายการโปรเจกต์ไม่สำเร็จ", en: "Failed to load projects" },
  notAvailable: { th: "ฟีเจอร์นี้ยังไม่เปิดใช้งานสำหรับบัญชีของคุณ", en: "This feature is not available for your account." },
  loading: { th: "กำลังโหลด...", en: "Loading..." },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  save: { th: "บันทึก", en: "Save" },
  saved: { th: "บันทึกแล้ว", en: "Saved" },
  unsavedChanges: { th: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก", en: "You have unsaved changes" },
  conflictTitle: { th: "มีการเปลี่ยนแปลงจากที่อื่น", en: "This project changed elsewhere" },
  conflictBody: {
    th: "โปรเจกต์นี้ถูกแก้ไขจากที่อื่นแล้ว กรุณาโหลดใหม่ก่อนบันทึกต่อ (ระบบจะไม่เขียนทับข้อมูลให้อัตโนมัติ)",
    en: "This project was changed elsewhere. Reload before saving again — nothing is overwritten automatically.",
  },
  reload: { th: "โหลดใหม่", en: "Reload" },

  /* Stage rail */
  stageBrief: { th: "โจทย์", en: "Brief" },
  stageScenes: { th: "ฉาก", en: "Scenes" },
  stageNarration: { th: "เสียงบรรยาย", en: "Narration" },
  stageMotion: { th: "โมชัน", en: "Motion" },
  stageCaptions: { th: "คำบรรยาย", en: "Captions" },
  stageQa: { th: "ตรวจสอบคุณภาพ", en: "QA" },
  stageRender: { th: "เรนเดอร์", en: "Render" },

  runScenePlan: { th: "สร้างแผนฉากด้วย AI", en: "Generate scene plan (AI)" },
  runNarration: { th: "สร้างเสียงบรรยาย (TTS)", en: "Generate narration (TTS)" },
  runQualityReview: { th: "ตรวจสอบคุณภาพด้วย AI", en: "Run AI quality review" },

  addScene: { th: "เพิ่มฉาก", en: "Add scene" },
  removeScene: { th: "ลบฉาก", en: "Remove scene" },

  exportSrt: { th: "ส่งออก SRT", en: "Export SRT" },
  exportVtt: { th: "ส่งออก VTT", en: "Export VTT" },

  compileError: { th: "คอมไพล์โปรเจกต์ไม่สำเร็จ", en: "Failed to compile project" },
  renderPreview: { th: "เรนเดอร์ตัวอย่าง", en: "Render preview" },
  renderFinal: { th: "เรนเดอร์ไฟล์จริง", en: "Render final" },
  renderCostEstimate: { th: "ประมาณการต้นทุนเรนเดอร์", en: "Render cost estimate" },
  viewRenderJob: { th: "ดูสถานะงานเรนเดอร์", en: "View render job" },

  claimViolation: {
    th: "มีข้อความอ้างสิทธิ์ที่ต้องห้ามหรือยังไม่ผ่านการตรวจสอบ กรุณาแก้ไขก่อนเรนเดอร์ไฟล์จริง",
    en: "There are prohibited or unmapped product claims. Fix them before rendering the final video.",
  },
  segmentedNotSupported: {
    th: "โปรเจกต์นี้มีเลเยอร์มากเกินไป (เกิน 40 เลเยอร์) การเรนเดอร์แบบแบ่งส่วนยังไม่รองรับในเฟสนี้",
    en: "This project compiles to more than 40 layers; segmented rendering is not supported in this phase yet.",
  },
  documentInvalid: {
    th: "ข้อมูลโปรเจกต์ไม่ถูกต้องตามรูปแบบที่กำหนด",
    en: "The project document does not match the required schema.",
  },
  jobErrorGeneric: {
    th: "งานล้มเหลว กรุณาลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ",
    en: "The job failed. Please try again or contact support.",
  },

  /* Section-07 — estimate -> confirm gate (D4) */
  stageFailedTitle: { th: "ขั้นตอนล้มเหลว", en: "Stage failed" },
  estimateTitle: { th: "ประมาณการเครดิตก่อนเริ่ม", en: "Credit estimate before running" },
  estimateCeiling: { th: "ใช้เครดิตอย่างมาก", en: "At most" },
  estimateTypical: { th: "โดยทั่วไปประมาณ", en: "Typically about" },
  estimateCeilingNote: {
    th: "เป็นเพดานสูงสุด (ตรวจ + ซ่อม + ตรวจซ้ำ ต่อรอบ) การเรียกเก็บจริงคิดตามจำนวนโทเค็นที่ใช้จริง",
    en: "This is a ceiling (review + repairs + re-review per round). Actual billing follows real token usage.",
  },
  estimateModel: { th: "โมเดลที่ใช้", en: "Model" },
  estimateMaxLoops: { th: "จำนวนรอบสูงสุด", en: "Max rounds" },
  estimateBasis: { th: "ที่มาของตัวเลข", en: "Why this number" },
  estimateConfirm: { th: "ยืนยันและเริ่ม", en: "Confirm and run" },
  noRecommendedModel: {
    th: "ยังไม่มีโมเดลที่แนะนำและรองรับผลลัพธ์แบบมีโครงสร้าง กรุณาติดต่อผู้ดูแลระบบ",
    en: "No recommended structured-output model is available. Please contact an administrator.",
  },
  insufficientCredits: { th: "เครดิตไม่พอสำหรับขั้นตอนนี้", en: "Not enough credits for this stage" },
  saveBeforeRunning: {
    th: "บันทึกการเปลี่ยนแปลงก่อนเริ่มขั้นตอนนี้",
    en: "Save your changes before running this stage",
  },
  qaEmpty: { th: "ยังไม่เคยตรวจสอบคุณภาพโปรเจกต์นี้", en: "This project has not been reviewed yet" },
  qaScore: { th: "คะแนนรวม", en: "Overall score" },
  qaStale: {
    th: "ผลตรวจนี้ล้าสมัย (เอกสารเปลี่ยนไปหลังการตรวจ)",
    en: "This review is out of date — the document changed after it was produced",
  },
  qaStaleUnsaved: {
    th: "ผลตรวจนี้ยังไม่รวมการแก้ไขที่ยังไม่ได้บันทึก",
    en: "This review does not include your unsaved changes",
  },
  qaRerun: { th: "ตรวจสอบใหม่", en: "Re-run review" },
  qaIssuesHigh: { th: "รุนแรง", en: "High" },
  qaIssuesMedium: { th: "ปานกลาง", en: "Medium" },
  qaIssuesLow: { th: "เล็กน้อย", en: "Low" },
  qaIssuesUnknown: { th: "ไม่ระบุความรุนแรง", en: "Unspecified severity" },
  qaClaimBlockTitle: {
    th: "ติดล็อกการอ้างสิทธิ์ — ยังเรนเดอร์ไฟล์จริงไม่ได้",
    en: "Claim compliance blocks the final render",
  },
  qaClaimBlockFromDocument: {
    th: "ตรวจจากเอกสารปัจจุบัน (ผลจากเซิร์ฟเวอร์จะมาพร้อมการตรวจครั้งถัดไป)",
    en: "Derived from the current document — the server verdict arrives with the next review",
  },
  repairFree: { th: "ฟรี (ไม่เรียกใช้ AI)", en: "Free (no AI call)" },
  repairBillable: { th: "ใช้เครดิต", en: "Uses credits" },
  repairApplyAll: { th: "ซ่อมทั้งหมด", en: "Repair all" },
  qaRound: { th: "รอบที่", en: "Round" },
  qaRevert: { th: "ย้อนกลับรอบนี้", en: "Revert this round" },
  qaRevertConfirm: {
    th: "ย้อนเอกสารกลับไปสถานะก่อนการซ่อมรอบนี้?",
    en: "Revert the document to its state before this repair round?",
  },
  creditsActual: { th: "ใช้จริง", en: "Actual" },
  creditsFailedNotFree: {
    th: "ขั้นตอนล้มเหลว แต่เครดิตอาจถูกใช้ไปแล้วบางส่วน",
    en: "The stage failed, but credits may already have been spent",
  },
  scenePlanMode: { th: "โหมดการวางแผนซ้ำ", en: "Re-run mode" },
  scenePlanModeFillEmpty: { th: "วางแผนเฉพาะฉากที่ยังว่าง", en: "Plan only empty scenes" },
  scenePlanModeReplace: {
    th: "วางแผนใหม่ทั้งหมด (แทนที่ของเดิม)",
    en: "Re-plan everything (replaces existing)",
  },
  scenePlanReplaceWarning: {
    th: "จะเขียนทับฉากที่คุณแก้ไขเอง เอกสารเดิมถูกเก็บเป็นเวอร์ชันย้อนกลับได้",
    en: "This overwrites scenes you edited manually. The previous document is kept as a revertable revision.",
  },
  destructiveAcknowledge: {
    th: "ฉันเข้าใจและต้องการดำเนินการต่อ",
    en: "I understand and want to proceed",
  },
  planLayerBudget: {
    th: "แผนฉากใช้เลเยอร์เกิน 40 จึงเรนเดอร์ไฟล์จริงไม่ได้ ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The plan exceeds the 40-layer budget, so it could never be final-rendered. Your document was left unchanged.",
  },
  planTimelineInvalid: {
    th: "ช่วงเวลาของฉากซ้อนทับหรือเกินความยาววิดีโอ ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "Scene timings overlap or exceed the video duration. Your document was left unchanged.",
  },
  planTemplateUnknown: {
    th: "แม่แบบฉากที่เลือกไม่รู้จัก ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The selected scene template is unknown. Your document was left unchanged.",
  },
  planParamsInvalid: {
    th: "พารามิเตอร์ของแผนฉากไม่ถูกต้อง ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The scene plan's parameters are invalid. Your document was left unchanged.",
  },
  goToQa: { th: "ไปที่ขั้นตอนตรวจสอบคุณภาพ", en: "Go to QA" },
} as const;

/**
 * FE03 (pre-merge security gate, carried over from the deleted
 * `NotWiredJobCard`): only render an error verbatim when it is one of our
 * own greppable `VI_*` codes; any other value (arbitrary worker/job text, or
 * an HTML-looking payload) falls back to the generic message instead of
 * being echoed into the DOM. Never returns `null` for a non-empty input.
 */
export function renderableJobError(lang: VideoStudioLang, error: string | null | undefined): string | null {
  if (!error) return null;
  return error.startsWith("VI_") ? error : pickCopy(lang, videoStudioCopy.jobErrorGeneric);
}
