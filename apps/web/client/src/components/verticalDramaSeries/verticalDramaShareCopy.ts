/**
 * Vertical Drama Series — read-only share links copy dictionary (task #32,
 * Collab-lite L1, F131AA, added 2026-07-09).
 *
 * Deliberately a STANDALONE file, NOT importing from `verticalDramaCopy.ts`
 * — same `pickCopy` convention as `verticalDramaTieInDraftCopy.ts`/
 * `verticalDramaAdBannerCopy.ts` (own lang type, own local `pickCopy`, zero
 * coupling). Covers BOTH consumers of this feature:
 *  - `VerticalDramaSeriesShareDialog.tsx` (owner-side create/list/revoke,
 *    mounted from the authenticated series detail page).
 *  - `VerticalDramaSharedSeriesPage.tsx` (the public, unauthenticated
 *    viewer at `/share/vd/:token` — this page must NOT import anything from
 *    `verticalDramaCopy.ts`, which is scoped to the owner-authenticated
 *    workspace, so it uses THIS file's own `useVerticalDramaShareLang` too).
 */

import { useTranslation } from "react-i18next";

export type VerticalDramaShareLang = "th" | "en";

/** Resolve the active UI language — mirrors `verticalDramaCopy.ts`'s `useVerticalDramaLang` exactly, kept as a local copy so this file has no import dependency on that (separately-owned) module. */
export function useVerticalDramaShareLang(): VerticalDramaShareLang {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("th") ? "th" : "en";
}

/** Pick a bilingual string for the active language — mirrors `verticalDramaCopy.ts`'s `pickCopy` exactly. */
export function pickCopy<T>(
  lang: VerticalDramaShareLang,
  value: { th: T; en: T },
): T {
  return lang === "th" ? value.th : value.en;
}

/**
 * The ONE generic failure message shown for an unknown/expired/revoked
 * token — MUST stay byte-identical to
 * `server/services/verticalDramaShareLinks.ts`'s
 * `SHARE_LINK_GENERIC_ERROR_MESSAGE` (that server literal is what actually
 * ships in the tRPC error; this client copy is used only for a client-side
 * fallback / the page's own static "not found" heading — see
 * `VerticalDramaSharedSeriesPage.tsx`). Verified in sync by
 * `VerticalDramaSharedSeriesPage.test.tsx`.
 */
export const SHARE_LINK_GENERIC_ERROR_MESSAGE = "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว";

export const verticalDramaShareCopy = {
  /* ---- Owner side: VerticalDramaSeriesShareDialog ---- */
  triggerButton: { th: "แชร์ซีรีส์", en: "Share series" },
  dialogTitle: { th: "แชร์ซีรีส์", en: "Share series" },
  dialogDescription: {
    th: "สร้างลิงก์อ่านอย่างเดียวให้ผู้อื่นดูเนื้อเรื่องได้โดยไม่ต้องมีบัญชี",
    en: "Create a read-only link so anyone can view the story content — no account needed.",
  },
  expiryLabel: { th: "อายุลิงก์", en: "Link expiry" },
  expiry7Days: { th: "7 วัน", en: "7 days" },
  expiry30Days: { th: "30 วัน", en: "30 days" },
  createButton: { th: "สร้างลิงก์", en: "Create link" },
  creatingButton: { th: "กำลังสร้าง…", en: "Creating…" },
  createSuccessToast: { th: "สร้างลิงก์แชร์สำเร็จ", en: "Share link created" },
  createErrorFallback: { th: "สร้างลิงก์ไม่สำเร็จ", en: "Failed to create share link" },
  capReachedHint: {
    th: "มีลิงก์ที่ใช้งานอยู่ครบ 5 ลิงก์แล้ว — เพิกถอนลิงก์เก่าก่อนสร้างใหม่",
    en: "You already have 5 active links — revoke one before creating another.",
  },
  revealTitle: { th: "ลิงก์ของคุณพร้อมแล้ว", en: "Your link is ready" },
  revealWarning: {
    th: "ลิงก์นี้จะไม่แสดงซ้ำ — คัดลอกตอนนี้",
    en: "This link will not be shown again — copy it now.",
  },
  copyButton: { th: "คัดลอก", en: "Copy" },
  copiedToast: { th: "คัดลอกลิงก์แล้ว", en: "Link copied" },
  copyFailedToast: { th: "คัดลอกไม่สำเร็จ", en: "Copy failed" },
  listTitle: { th: "ลิงก์ที่มีอยู่", en: "Existing links" },
  listEmpty: { th: "ยังไม่มีลิงก์แชร์", en: "No share links yet" },
  columnCreatedAt: { th: "สร้างเมื่อ", en: "Created" },
  columnExpiresAt: { th: "หมดอายุ", en: "Expires" },
  columnAccessCount: { th: "ยอดเข้าชม", en: "Views" },
  columnStatus: { th: "สถานะ", en: "Status" },
  statusActive: { th: "ใช้งานอยู่", en: "Active" },
  statusExpired: { th: "หมดอายุ", en: "Expired" },
  statusRevoked: { th: "เพิกถอนแล้ว", en: "Revoked" },
  revokeButton: { th: "เพิกถอน", en: "Revoke" },
  revokeConfirmTitle: { th: "เพิกถอนลิงก์นี้?", en: "Revoke this link?" },
  revokeConfirmBody: {
    th: "ผู้ที่มีลิงก์นี้จะเข้าชมไม่ได้อีกทันที การกระทำนี้ย้อนกลับไม่ได้",
    en: "Anyone with this link will immediately lose access. This cannot be undone.",
  },
  revokeConfirmButton: { th: "ยืนยันเพิกถอน", en: "Confirm revoke" },
  revokeCancel: { th: "ยกเลิก", en: "Cancel" },
  revokeSuccessToast: { th: "เพิกถอนลิงก์แล้ว", en: "Link revoked" },
  revokeErrorFallback: { th: "เพิกถอนลิงก์ไม่สำเร็จ", en: "Failed to revoke link" },
  closeButton: { th: "ปิด", en: "Close" },

  /* ---- Public viewer: VerticalDramaSharedSeriesPage ---- */
  viewerBanner: { th: "มุมมองผู้เยี่ยมชม — อ่านอย่างเดียว", en: "Visitor view — read only" },
  viewerLoading: { th: "กำลังโหลด…", en: "Loading…" },
  notFoundTitle: { th: SHARE_LINK_GENERIC_ERROR_MESSAGE, en: "This link is invalid or has expired" },
  notFoundBody: {
    th: "ตรวจสอบลิงก์อีกครั้ง หรือขอลิงก์ใหม่จากเจ้าของซีรีส์",
    en: "Double-check the link, or ask the series owner for a new one.",
  },
  overviewTitle: { th: "ภาพรวมเรื่อง", en: "Story overview" },
  loglineLabel: { th: "โลกไลน์", en: "Logline" },
  mainPlotLabel: { th: "โครงเรื่องหลัก", en: "Main plot" },
  seasonArcLabel: { th: "เส้นเรื่องซีซั่น", en: "Season arc" },
  episodeCountLabel: { th: "จำนวนตอนที่วางแผน", en: "Planned episodes" },
  episodesTitle: { th: "รายการตอน", en: "Episodes" },
  episodesEmpty: { th: "ยังไม่มีตอน", en: "No episodes yet" },
  episodeFallbackTitle: { th: "ตอนที่", en: "Episode" },
  episodeStatusDraft: { th: "ร่าง", en: "Draft" },
  episodeStatusScripted: { th: "มีบท", en: "Scripted" },
  episodeStatusVideo: { th: "มีวิดีโอ", en: "Video" },
  dialogueExpandLabel: { th: "ดูบทพูด", en: "View dialogue" },
  dialogueEmpty: { th: "ยังไม่มีบทพูดสำหรับตอนนี้", en: "No dialogue yet for this episode" },
} as const;
