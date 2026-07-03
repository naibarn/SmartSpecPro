/**
 * Vertical Drama Series — shared client copy + route helpers (spec feature 131, section 03).
 *
 * Bilingual (Thai/English) copy dictionary and route builders shared by the
 * Series list, Series detail, and Episode workspace pages. Keeping the copy in
 * one place satisfies the section-03 Copy Contract (Thai + English labels,
 * planning vs. paid-generation wording) and keeps the pages lean.
 */

import { useTranslation } from "react-i18next";

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

export const VERTICAL_DRAMA_BASE_PATH = "/dashboard/vertical-drama";

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
} as const;

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
