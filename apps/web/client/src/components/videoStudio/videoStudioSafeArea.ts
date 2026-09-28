/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P3, §4.6 preset list
 * (`ราคาโปรมุมบนขวา` etc.).
 *
 * The client-side twin of `server/services/videoProjectQualityMetrics.ts`'s
 * `PLATFORM_SAFE_AREA_INSETS` / `computeSafeAreaRect` — server code can't be
 * imported into the client bundle, so these constants are COPIED verbatim
 * (not invented) per the task brief. If the server's inset table ever
 * changes, this file must be updated in lockstep or a preset will place a
 * layer outside the safe rect the QA repair applier actually enforces.
 */
import type { PlatformPreset } from "@shared/videoIntelligence/projectSchemas";

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Verbatim copy of `videoProjectQualityMetrics.ts`'s `PLATFORM_SAFE_AREA_INSETS`. */
const PLATFORM_SAFE_AREA_INSETS: Record<PlatformPreset, SafeAreaInsets> = {
  tiktok_9_16: { top: 10, bottom: 20, left: 5, right: 15 },
  reels_9_16: { top: 10, bottom: 20, left: 5, right: 15 },
  youtube_16_9: { top: 5, bottom: 10, left: 5, right: 5 },
  square_1_1: { top: 5, bottom: 5, left: 5, right: 5 },
};

export interface SafeAreaRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Verbatim copy of `videoProjectQualityMetrics.ts`'s `computeSafeAreaRect` —
 *  same formula, same units (0..100 percent-of-canvas). */
export function computeSafeAreaRect(platformPreset: PlatformPreset): SafeAreaRect {
  const insets = PLATFORM_SAFE_AREA_INSETS[platformPreset];
  return {
    left: insets.left,
    top: insets.top,
    right: 100 - insets.right,
    bottom: 100 - insets.bottom,
  };
}
