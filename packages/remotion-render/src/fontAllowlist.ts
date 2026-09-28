/**
 * Feature 143 §4.10 (RK12 — "Thai text renders as tofu") — the allowlist of
 * font families the Video Studio layer editor may offer for a `text` layer's
 * `fontFamily`.
 *
 * MOVED (duplicated, not re-exported — see the `layerTemplateSchemas.ts`
 * DRIFT WARNING in this same package for why a true cross-package import
 * isn't used here either) from `apps/web/shared/remotion/fontAllowlist.ts`
 * as part of the `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract") — this
 * package's own `GenericTemplateComposition.tsx` needs this allowlist too.
 *
 * This is NOT an invented list: every family here is one of the exact
 * candidates `apps/web`'s `remotionRuntimeAdapter.ts`'s
 * `resolveThaiFontPath()` already probes via `fc-match`
 * (`"Prompt,Noto Sans Thai,Kanit,Sarabun,Loma:lang=th"`) and the ASS burn-in
 * post-pass already hardcodes one of (`postPassArgs.ts:244`,
 * `"Noto Sans Thai"`) — i.e. these are the families this codebase already
 * treats as its Thai-capable set. `"Loma"` is deliberately EXCLUDED from
 * this allowlist: unlike the other four, it has no publicly hosted,
 * checksummable Google Fonts file this server can fetch+verify server-side
 * (see `apps/web`'s `videoProjectAssetResolver.ts`'s
 * `buildFontManifestSources`) — offering it in the picker would mean
 * `role: "font"` manifest verification could never succeed for it. The
 * remaining four ARE real, currently-hosted Google Fonts files (verified
 * live against `fonts.googleapis.com`/`fonts.gstatic.com` while building
 * this allowlist — not fabricated file names).
 *
 * MUST be kept byte-identical (modulo comments) to
 * `apps/web/shared/remotion/fontAllowlist.ts` — see
 * `apps/web/shared/remotion/__tests__/fontAllowlistSync.test.ts`, mirroring
 * the existing `layerTemplateSchemasSync.test.ts` guard for the same
 * cross-package drift risk (RK1).
 */

export const VIDEO_STUDIO_FONT_ALLOWLIST = [
  "Sarabun",
  "Prompt",
  "Kanit",
  "Noto Sans Thai",
] as const;

export type VideoStudioFontFamily = (typeof VIDEO_STUDIO_FONT_ALLOWLIST)[number];

export function isAllowlistedFontFamily(family: string): family is VideoStudioFontFamily {
  return (VIDEO_STUDIO_FONT_ALLOWLIST as readonly string[]).includes(family);
}

/**
 * The Google Fonts CSS2 API `family` query value for each allowlisted
 * family (`wght@400;700` — regular + bold, matching `RemotionTextLayer`'s
 * `fontWeight: "normal" | "bold"`). Single source of truth for BOTH the
 * server-side manifest-verification fetch (`buildFontManifestSources`) and
 * the render-time `<link>`-based load inside `GenericTemplateComposition`
 * (both copies) — never hand-build this query string at either call site.
 */
export const FONT_ALLOWLIST_GOOGLE_FONTS_QUERY: Record<VideoStudioFontFamily, string> = {
  Sarabun: "Sarabun:wght@400;700",
  Prompt: "Prompt:wght@400;700",
  Kanit: "Kanit:wght@400;700",
  "Noto Sans Thai": "Noto+Sans+Thai:wght@400;700",
};

/** The Google Fonts CSS2 stylesheet URL for an allowlisted family — parsed
 *  server-side for its `fonts.gstatic.com` file URL(s)
 *  (`buildFontManifestSources`), or loaded directly via a `<link>` tag at
 *  render time (`GenericTemplateComposition`'s font loader). */
export function googleFontsCss2Url(family: VideoStudioFontFamily): string {
  const query = FONT_ALLOWLIST_GOOGLE_FONTS_QUERY[family];
  return `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
}
