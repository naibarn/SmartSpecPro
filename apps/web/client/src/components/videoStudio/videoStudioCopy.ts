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

  /* Not-wired stage notice (VI_*_NOT_WIRED — never hidden, always explained) */
  notWiredTitle: { th: "ขั้นตอนนี้ยังไม่พร้อมใช้งาน", en: "This stage is not yet available" },
  notWiredBody: {
    th: "ขั้นตอนนี้เชื่อมต่อระบบคิวงานแล้ว แต่ยังไม่เชื่อมกับโมเดล AI ในเฟสนี้ คุณสามารถข้ามไปตรวจสอบ/แก้ไขเองได้",
    en: "This stage is fully wired to the job queue, but not yet connected to an AI model in this phase. You can review/edit manually and continue.",
  },

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
} as const;
