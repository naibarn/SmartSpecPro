import {
  GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES,
  GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES,
} from "@shared/geminiOmni";

export type MarketplaceShotMediaStage = "image" | "video";

/** Client-side file-size ceilings for a manual drag/drop or tap-to-browse
 *  replacement of a staged auto-review shot's image/video slot. These
 *  mirror `GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES` /
 *  `GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES` exactly — the same constants the
 *  `uploadStagedAutoReviewShotMedia` tRPC mutation enforces server-side
 *  (server/routers/marketplaceCapture.ts) — so an obviously oversized file
 *  is rejected instantly here instead of round-tripping to the backend
 *  first. */
export const MARKETPLACE_SHOT_MEDIA_MAX_BYTES: Record<
  MarketplaceShotMediaStage,
  number
> = {
  image: GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES,
  video: GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES,
};

/**
 * Validates a dropped/selected local file against the target slot's
 * expected MIME-type family and size ceiling. Returns a ready-to-render Thai
 * error message, or `null` when the file is acceptable — mirrors the
 * backend's own `stage === "image" ? fileType.startsWith("image/") : ...`
 * check as a fast client-side guard. This is purely a UX shortcut: the
 * backend still independently enforces both checks (plus magic-byte
 * sniffing) and must never be relied on to be the only gate.
 */
export function validateMarketplaceShotMediaFile(
  file: File,
  stage: MarketplaceShotMediaStage
): string | null {
  const expectedPrefix = stage === "image" ? "image/" : "video/";
  if (!file.type.toLowerCase().startsWith(expectedPrefix)) {
    return stage === "image"
      ? "ไฟล์นี้ไม่ใช่ไฟล์ภาพ — กรุณาเลือกไฟล์ภาพ เช่น JPG, PNG หรือ WebP"
      : "ไฟล์นี้ไม่ใช่ไฟล์วิดีโอ — กรุณาเลือกไฟล์วิดีโอ เช่น MP4 หรือ WebM";
  }
  const maxBytes = MARKETPLACE_SHOT_MEDIA_MAX_BYTES[stage];
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return stage === "image"
      ? `ไฟล์ภาพใหญ่เกินไป — ต้องไม่เกิน ${maxMb}MB`
      : `ไฟล์วิดีโอใหญ่เกินไป — ต้องไม่เกิน ${maxMb}MB`;
  }
  return null;
}

/**
 * Reads a `File` into a base64 data URL — the exact shape
 * `uploadStagedAutoReviewShotMedia`'s `fileBase64` input expects (a data URL
 * is accepted as-is server-side; see its `input.fileBase64.split(",")`
 * handling). Kept self-contained here (rather than importing the equivalent
 * helper already living in `ImageSourcePicker.tsx`) so this small, focused
 * module doesn't pull that file's much larger component tree (trpc, Radix
 * popovers, media-history parsing) into every caller as a side effect.
 */
export function readShotMediaFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
