/**
 * Astryx palette catalog.
 *
 * Every palette below is a vendor theme produced by the Astryx CLI
 * (`astryx theme add` + `astryx theme build`). Only `neutral` ships as a
 * published npm package (`@astryxdesign/theme-neutral/built`); the other six
 * are scaffolded/built locally into `client/src/themes/<slug>/` and re-exported
 * here unmodified. Do not hand-edit the generated `<slug>Theme.ts` files.
 *
 * Human-readable name/description text is copied verbatim from
 * `npm run astryx -- docs theme --dense` (the theme table under "## Themes").
 */
import type { DefinedTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { butterTheme } from "@/themes/butter/butter";
import { chocolateTheme } from "@/themes/chocolate/chocolate";
import { gothicTheme } from "@/themes/gothic/gothic";
import { matchaTheme } from "@/themes/matcha/matcha";
import { stoneTheme } from "@/themes/stone/stone";
import { y2kTheme } from "@/themes/y2k/y2k";

export type AstryxPaletteSlug =
  | "neutral"
  | "butter"
  | "chocolate"
  | "gothic"
  | "matcha"
  | "stone"
  | "y2k";

export interface AstryxPaletteDefinition {
  slug: AstryxPaletteSlug;
  name: string;
  description: string;
  theme: DefinedTheme;
}

export const DEFAULT_ASTRYX_PALETTE: AstryxPaletteSlug = "neutral";

export const ASTRYX_PALETTES: AstryxPaletteDefinition[] = [
  {
    slug: "neutral",
    name: "Neutral",
    description:
      "Muted, minimal aesthetic with system fonts. A good starting point.",
    theme: neutralTheme,
  },
  {
    slug: "butter",
    name: "Butter",
    description:
      "Golden, buttery surfaces with blue accents; Sarina + Outfit type.",
    theme: butterTheme,
  },
  {
    slug: "chocolate",
    name: "Chocolate",
    description:
      "Warm brown tones and cozy beige; Fraunces + Albert Sans type.",
    theme: chocolateTheme,
  },
  {
    slug: "gothic",
    name: "Gothic",
    description:
      "Dark-only atmospheric theme; deep blue-gray surfaces, distressed display type.",
    theme: gothicTheme,
  },
  {
    slug: "matcha",
    name: "Matcha",
    description: "Earthy green theme with Figtree typography.",
    theme: matchaTheme,
  },
  {
    slug: "stone",
    name: "Stone",
    description: "Warm stone and slate tones; Montserrat + Figtree type.",
    theme: stoneTheme,
  },
  {
    slug: "y2k",
    name: "Y2K",
    description:
      "Playful Y2K pop; periwinkle body, holographic accents, Poppins + Crimson Text.",
    theme: y2kTheme,
  },
];

const ASTRYX_PALETTE_MAP: Record<AstryxPaletteSlug, AstryxPaletteDefinition> =
  ASTRYX_PALETTES.reduce(
    (map, palette) => {
      map[palette.slug] = palette;
      return map;
    },
    {} as Record<AstryxPaletteSlug, AstryxPaletteDefinition>,
  );

export function isAstryxPaletteSlug(
  value: string | null | undefined,
): value is AstryxPaletteSlug {
  return !!value && value in ASTRYX_PALETTE_MAP;
}

export function getAstryxPalette(
  slug: string | null | undefined,
): AstryxPaletteDefinition {
  if (isAstryxPaletteSlug(slug)) {
    return ASTRYX_PALETTE_MAP[slug];
  }
  return ASTRYX_PALETTE_MAP[DEFAULT_ASTRYX_PALETTE];
}

/**
 * Accent color for a palette, read directly from the built theme's own
 * resolved tokens (e.g. `light-dark(#225BFF, #FDEE8C)`) — never hardcoded.
 * Safe to use as an inline `backgroundColor` style for swatch previews.
 */
export function getAstryxPaletteAccent(palette: AstryxPaletteDefinition): string {
  return palette.theme.tokens["--color-accent"] ?? "var(--color-accent)";
}
