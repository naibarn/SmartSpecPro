/**
 * Minimal, structural `BrandKit` type consumed by the video project compiler
 * (`server/services/videoProjectCompiler.ts`) for brand-token resolution and
 * brand-lock enforcement (spec §10.3). Client-safe, no DB import — this
 * intentionally lives in `shared/videoIntelligence/` (per the cross-section
 * consistency resolution #3, `sections/index.md`) rather than importing the
 * Drizzle `brand_kits` row from section-05, so section-01 stays buildable
 * ahead of section-05. Section-05's persisted `BrandKitRow` is a structural
 * superset of this type; section-07 loads a row and passes the token subset
 * here as `TemplateBuildContext.brandKit`.
 */
import type { CaptionPresetId } from "./projectSchemas";

export interface BrandKitColors {
  /** The canonical/primary brand color — the value brand-lock enforcement
   *  checks locked layer colors against (see `videoProjectCompiler.ts`). */
  primary: string;
  secondary?: string;
  accent?: string;
}

export interface BrandKitFonts {
  heading: string;
  /** The canonical/primary brand body font — the value brand-lock
   *  enforcement checks locked text layers' `fontFamily` against. */
  body: string;
}

export interface BrandKitLocks {
  colors?: boolean;
  fonts?: boolean;
  iconStyle?: boolean;
  motionIntensity?: boolean;
  cta?: boolean;
  productFidelity?: boolean;
}

export interface BrandKit {
  colors: BrandKitColors;
  fonts: BrandKitFonts;
  captionPresetId: CaptionPresetId | null;
  locks: BrandKitLocks;
  /** `brand_kits.logoAssetId` (a `media_assets.id`), or `null`/`undefined`
   *  when the brand kit has no logo. Optional (not just nullable) so the
   *  many pre-existing `BrandKit` test fixtures that predate this field
   *  don't all need updating — `luxury_end_card.ts` treats a missing value
   *  the same as `null`. Resolved to a URL by `ctx.assetResolver.url()` at
   *  template-build time — see `luxury_end_card.ts`'s CTA/end-card template,
   *  the one template that renders a brand logo image layer. */
  logoAssetId?: number | null;
}
