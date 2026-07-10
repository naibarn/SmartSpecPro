/**
 * Vertical Drama Series — Ad Banner Overlay: series-level design types, style
 * presets, placement presets, and pure validators (spec feature 131, task
 * #30-A, plan `planning/vertical-drama-ad-banner-overlay/plan.md` §2-§4).
 *
 * This is the OVERLAY ADS layer, distinct from the existing story tie-in
 * system (`verticalDramaProductTieIn.ts` / `@shared/verticalDramaSeries/
 * thaiAdCompliance.ts`): overlay banners are a deliberate ad layer composited
 * ON TOP of a rendered clip (bottom band / side vertical / fullscreen
 * interstitial) — see plan.md §1 for why the banner prompt path is
 * INTENTIONALLY exempt from the story-side product-lock / brand-neutral
 * guards (`VD_PRODUCT_LOCK_INSTRUCTION`, `sanitizeBrandMentionsInPrompt`).
 *
 * Pure, isomorphic (client + server), no DB/network imports — designs persist
 * inside the EXISTING `vertical_drama_series.productTieIn` jsonb column under
 * a new `adBanners` array key (no migration; merge-patched the same way the
 * rest of `productTieIn` already is, see `VerticalDramaProductTieInTab.tsx`).
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Style presets (plan.md §4 — 10 trends for 2026)                            */
/* -------------------------------------------------------------------------- */

export const VD_AD_BANNER_STYLE_IDS = [
  "imperfect_by_design",
  "reality_warp",
  "tactile_sensory",
  "bold_typography",
  "retro_futurism",
  "documentary_realism",
  "multi_dimensional",
  "emotional_gradient",
  "collage_mixed_media",
  "vertical_first",
] as const;

export type VdAdBannerStyleId = (typeof VD_AD_BANNER_STYLE_IDS)[number];

export type VdAdBannerTextInImageRisk = "low" | "med" | "high";

export interface VdAdBannerStylePromptTokens {
  style: string[];
  composition: string[];
  texture: string[];
  lighting: string[];
}

export interface VdAdBannerStylePreset {
  id: VdAdBannerStyleId;
  nameTh: string;
  nameEn: string;
  /** Short Thai description of the trend's essence, shown under the card title. */
  essenceTh: string;
  promptTokens: VdAdBannerStylePromptTokens;
  negativeTokens: string[];
  /**
   * Free-text marketing-category tags this style tends to fit well —
   * matched against a tie-in's `productCategory` by `recommendStylePresets`
   * (bidirectional substring, case-insensitive — see that function's doc
   * comment for why, e.g. "cosmetics" vs "cosmetic").
   */
  fitCategories: string[];
  /**
   * How much this style relies on rendering readable text INSIDE the image —
   * "high" for styles whose core identity is large on-image typography
   * (`bold_typography`, `vertical_first`); "med" for styles with moderate
   * text elements (hand-lettering, collage notes, puffy 3D type); "low" for
   * the rest. Surfaced in the UI as a warning because AI image generation
   * renders non-Latin script (incl. Thai) unreliably (plan.md §5).
   */
  textInImageRisk: VdAdBannerTextInImageRisk;
}

export const VD_AD_BANNER_STYLE_PRESETS: readonly VdAdBannerStylePreset[] = [
  {
    id: "imperfect_by_design",
    nameTh: "ไม่สมบูรณ์แบบที่ตั้งใจ",
    nameEn: "Imperfect by Design",
    essenceTh:
      "เส้นลายมือ รอยแปรง และพื้นผิวกระดาษ ทำให้ดูจริงใจและเป็นมนุษย์ ไม่ขัดเงาจนเกินไป",
    promptTokens: {
      style: [
        "hand-drawn linework accents",
        "scribbled highlight marks",
        "imperfect hand-lettered typography",
        "raw human-made aesthetic",
      ],
      composition: [
        "deliberately off-kilter framing",
        "asymmetric layout with intentional negative space",
        "collage-like layering of elements",
      ],
      texture: [
        "visible brush strokes",
        "paper texture background",
        "rough torn-edge shapes",
        "subtle ink bleed",
      ],
      lighting: [
        "soft diffused natural light",
        "subtle film grain overlay",
        "warm analog color cast",
      ],
    },
    negativeTokens: [
      "overly polished render",
      "perfect symmetry",
      "corporate stock photo look",
      "glossy 3D render",
    ],
    fitCategories: [
      "coffee",
      "fashion",
      "handmade",
      "organic_food",
      "personal_brand",
    ],
    textInImageRisk: "med",
  },
  {
    id: "reality_warp",
    nameTh: "โลกจริงบิดเหนือจริง",
    nameEn: "Reality Warp",
    essenceTh:
      "ภาพสมจริงแต่แทรกความเหนือจริง วัตถุลอย มุมมองบิดเบี้ยว สร้างความน่าค้นหา",
    promptTokens: {
      style: [
        "photorealistic base render",
        "surreal dreamlike art direction",
        "impossible physics staging",
      ],
      composition: [
        "floating objects defying gravity",
        "distorted one-point perspective",
        "liminal, ambiguous space",
      ],
      texture: [
        "crisp photoreal material detail",
        "subtle motion blur on floating elements",
      ],
      lighting: [
        "surreal colored rim lighting",
        "unnatural directional shadows",
        "glowing volumetric haze",
      ],
    },
    negativeTokens: [
      "mundane flat composition",
      "literal physically accurate scene",
      "flat lighting",
    ],
    fitCategories: ["perfume", "luxury", "fashion", "tech", "gaming"],
    textInImageRisk: "low",
  },
  {
    id: "tactile_sensory",
    nameTh: "สัมผัสได้",
    nameEn: "Tactile Sensory",
    essenceTh:
      "เน้นพื้นผิวระยะมาโครที่สัมผัสได้ ผ้า แก้ว ของเหลว ไม้ ให้รู้สึกเหมือนแตะต้องสินค้าได้จริง",
    promptTokens: {
      style: [
        "hyper-tactile macro product styling",
        "puffy 3D typography",
        "sensory-first art direction",
      ],
      composition: [
        "extreme macro close-up framing",
        "product centered with tactile props",
      ],
      texture: [
        "macro fabric weave texture",
        "glass refraction and droplets",
        "liquid splash frozen in motion",
        "velvet nap texture",
        "natural wood grain",
      ],
      lighting: [
        "soft studio light emphasizing texture depth",
        "specular highlights on glass and liquid",
      ],
    },
    negativeTokens: [
      "flat matte textureless surfaces",
      "low detail macro",
      "plastic-looking texture",
    ],
    fitCategories: ["cosmetic", "furniture", "fashion", "luxury"],
    textInImageRisk: "med",
  },
  {
    id: "bold_typography",
    nameTh: "ตัวอักษรพระเอก",
    nameEn: "Bold Typography",
    essenceTh:
      "ให้ข้อความพาดหัวเป็นพระเอกของภาพ ตัวใหญ่ คอนทราสต์สูง อ่านชัดแม้สไลด์ผ่านไว",
    promptTokens: {
      style: [
        "oversized headline typography as hero element",
        "editorial poster layout",
        "variable font-weight type pairing",
      ],
      composition: [
        "type dominating over 60% of the frame",
        "high-contrast figure-ground layout",
        "grid-based editorial alignment",
      ],
      texture: ["clean flat color fields", "crisp vector-sharp edges"],
      lighting: [
        "high-contrast punchy lighting",
        "bold saturated color blocking",
      ],
    },
    negativeTokens: [
      "tiny illegible text",
      "cluttered busy background",
      "low contrast typography",
    ],
    fitCategories: ["sport", "promotion", "fashion", "beverage"],
    textInImageRisk: "high",
  },
  {
    id: "retro_futurism",
    nameTh: "อนาคตในมุมอดีต",
    nameEn: "Retro-Futurism",
    essenceTh: "โครเมียม แสงนีออน และลุค Y2K ผสมความล้ำยุคกับกลิ่นอายย้อนยุค",
    promptTokens: {
      style: [
        "Y2K retro-futurist styling",
        "chrome and metallic surfaces",
        "space-age silhouettes",
      ],
      composition: [
        "centered hero object with radial symmetry",
        "dynamic diagonal energy lines",
      ],
      texture: [
        "holographic iridescent sheen",
        "VHS scanline artifacts",
        "brushed metallic texture",
      ],
      lighting: [
        "neon glow rim lighting",
        "magenta-and-cyan gradient lighting",
        "chromatic aberration highlights",
      ],
    },
    negativeTokens: [
      "modern minimalist flat design",
      "matte non-reflective surfaces",
      "muted desaturated palette",
    ],
    fitCategories: ["gaming", "tech", "automobile", "music"],
    textInImageRisk: "low",
  },
  {
    id: "documentary_realism",
    nameTh: "ความจริงใจขายได้",
    nameEn: "Documentary Realism",
    essenceTh:
      "แสงธรรมชาติ อารมณ์จริง ไม่แต่งเติมมาก ให้ความรู้สึกน่าเชื่อถือแบบสารคดี",
    promptTokens: {
      style: [
        "documentary-style candid framing",
        "authentic lifestyle art direction",
        "minimal-retouch realism",
      ],
      composition: [
        "unposed candid subject placement",
        "environmental lifestyle context",
      ],
      texture: [
        "natural skin and fabric texture preserved",
        "true-to-life color grading",
      ],
      lighting: ["soft natural window light", "golden-hour ambient light"],
    },
    negativeTokens: [
      "over-retouched skin",
      "artificial studio backdrop",
      "heavy beauty filter",
    ],
    fitCategories: [
      "healthcare",
      "food",
      "travel",
      "wellness",
      "personal_brand",
    ],
    textInImageRisk: "low",
  },
  {
    id: "multi_dimensional",
    nameTh: "มิติและพื้นที่",
    nameEn: "Multi-Dimensional",
    essenceTh:
      "จัดวางวัตถุ 3 มิติเป็นชั้นความลึก สร้างพื้นที่และมิติให้ภาพดูมีเลเยอร์",
    promptTokens: {
      style: [
        "layered 3D product staging",
        "spatial depth-driven art direction",
      ],
      composition: [
        "floating layered planes at varying depth",
        "deep depth-of-field spatial composition",
      ],
      texture: [
        "clean matte 3D render surfaces",
        "soft ambient-occlusion shadow detail",
      ],
      lighting: [
        "soft diffused studio 3D lighting",
        "gentle soft shadows grounding each layer",
      ],
    },
    negativeTokens: [
      "flat single-plane composition",
      "no depth cues",
      "cluttered overlapping layers",
    ],
    fitCategories: ["tech", "product_launch", "ui", "packaging"],
    textInImageRisk: "low",
  },
  {
    id: "emotional_gradient",
    nameTh: "Gradient สร้างอารมณ์",
    nameEn: "Emotional Gradient",
    essenceTh:
      "พื้นหลังไล่สีนุ่มนวลแบบ mesh/aurora ช่วยสร้างอารมณ์และโทนสีให้แบรนด์",
    promptTokens: {
      style: [
        "mesh-gradient backdrop art direction",
        "aurora-inspired soft color field",
      ],
      composition: [
        "subject floating over a smooth gradient backdrop",
        "generous negative space around a soft gradient field",
      ],
      texture: [
        "ultra-smooth gradient blend, no banding",
        "soft glow bloom around edges",
      ],
      lighting: [
        "ambient glow lighting matched to the gradient palette",
        "soft diffused backlight",
      ],
    },
    negativeTokens: [
      "banding artifacts",
      "harsh gradient edges",
      "cluttered busy background",
    ],
    fitCategories: ["app", "startup", "beauty", "technology"],
    textInImageRisk: "low",
  },
  {
    id: "collage_mixed_media",
    nameTh: "คอลลาจหลายวัสดุ",
    nameEn: "Collage / Mixed Media",
    essenceTh: "ตัดปะกระดาษ เทป โน้ตลายมือ และภาพพิมพ์วินเทจ ผสมกันแบบสมุดสะสม",
    promptTokens: {
      style: [
        "mixed-media paper collage art direction",
        "scrapbook-style layered composition",
      ],
      composition: [
        "layered paper cut-out elements at varied angles",
        "washi tape and sticker accents at the edges",
      ],
      texture: [
        "paper cut-out edges with subtle drop shadow",
        "vintage print halftone texture",
        "handwritten note texture",
      ],
      lighting: ["flat even collage lighting", "subtle paper-shadow depth"],
    },
    negativeTokens: [
      "clean flat digital vector look",
      "single uniform material",
      "perfectly aligned grid",
    ],
    fitCategories: ["editorial", "fashion", "music", "lifestyle"],
    textInImageRisk: "med",
  },
  {
    id: "vertical_first",
    nameTh: "มือถือก่อน",
    nameEn: "Vertical-First",
    essenceTh:
      "ออกแบบเพื่อจอมือถือแนวตั้งโดยเฉพาะ ข้อความฮุกใหญ่ หยุดนิ้วสไลด์ได้ทันที",
    promptTokens: {
      style: [
        "native 9:16 mobile-first art direction",
        "thumb-stopping hook-first design",
      ],
      composition: [
        "center-weighted composition respecting platform safe zones",
        "big hook text near the top third",
      ],
      texture: ["clean high-contrast flat surfaces"],
      lighting: ["punchy high-contrast mobile-optimized lighting"],
    },
    negativeTokens: [
      "horizontal 16:9 framing",
      "small subject lost in wide empty space",
      "off-platform desktop layout",
    ],
    fitCategories: ["tiktok", "reels", "shorts", "mobile_ads"],
    textInImageRisk: "high",
  },
];

const VD_AD_BANNER_STYLE_PRESET_MAP = new Map<
  VdAdBannerStyleId,
  VdAdBannerStylePreset
>(VD_AD_BANNER_STYLE_PRESETS.map(preset => [preset.id, preset]));

/** Look up a style preset by id. Throws when the id is unknown (a bug, never user input — `stylePresetId` is always zod-validated against `VD_AD_BANNER_STYLE_IDS` before reaching this). */
export function getAdBannerStylePreset(
  id: VdAdBannerStyleId
): VdAdBannerStylePreset {
  const preset = VD_AD_BANNER_STYLE_PRESET_MAP.get(id);
  if (!preset) {
    throw new Error(`Unknown ad banner style preset id: ${id}`);
  }
  return preset;
}

/* -------------------------------------------------------------------------- */
/* Placement presets (plan.md §3 — coordinates on a 1080x1920 frame)          */
/* -------------------------------------------------------------------------- */

export const VD_AD_BANNER_PLACEMENT_IDS = [
  "bottom_band",
  "side_vertical",
  "fullscreen",
] as const;
export type VdAdBannerPlacementId = (typeof VD_AD_BANNER_PLACEMENT_IDS)[number];

/** The overlay compositing frame's fixed dimensions (spec §3 — always 1080x1920, matching the series' fixed 9:16 aspect ratio). */
export const VD_AD_BANNER_FRAME_WIDTH = 1080;
export const VD_AD_BANNER_FRAME_HEIGHT = 1920;

export interface VdAdBannerPlacementBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VdAdBannerPlacementPreset {
  id: VdAdBannerPlacementId;
  nameTh: string;
  /** Box on the 1080x1920 compositing frame. For `side_vertical`, this is the LEFT-aligned default — see `resolvePlacementBox` for the right-aligned mirror. */
  box: VdAdBannerPlacementBox;
  /** Target aspect ratio of the placement BOX itself (not necessarily a ratio any media model can generate directly — see `preferredModelAspects`). */
  targetAspect: string;
  /**
   * Ordered list of media-model aspect ratios to prefer when generating the
   * banner image, closest-fit first — no media model offers the placement's
   * exact box aspect (e.g. no model offers 3:1), so production standard is:
   * generate at the closest available aspect, then cover-fit + center-crop
   * into the box at composite time (plan.md §3, §7 — compositing itself is
   * #30-B, out of scope for A1).
   */
  preferredModelAspects: readonly string[];
  defaultTiming: VdAdBannerTiming;
  /** Fade in/out duration (seconds) applied at composite time — a v1 constant across all placements (plan.md §7's ffmpeg fade snippet). */
  fadeSec: number;
  /** English composition instruction fed verbatim to the ad-banner-prompt skill (plan.md §5) — the generated `imagePrompt` MUST respect this. */
  compositionGuidance: string;
}

export const VD_AD_BANNER_PLACEMENT_PRESETS: readonly VdAdBannerPlacementPreset[] =
  [
    {
      id: "bottom_band",
      nameTh: "แบนเนอร์แถบล่าง",
      box: { x: 0, y: 1400, w: 1080, h: 360 },
      targetAspect: "3:1",
      preferredModelAspects: ["16:9", "3:2"],
      defaultTiming: { mode: "entire" },
      fadeSec: 0.3,
      compositionGuidance:
        "wide horizontal banner composition, key subject and text within the central 60% height band, crop-safe margins, no critical detail within 5% of the top or bottom edge",
    },
    {
      id: "side_vertical",
      nameTh: "แบนเนอร์แนวตั้งข้าง",
      box: { x: 20, y: 480, w: 300, h: 960 },
      targetAspect: "1:3",
      preferredModelAspects: ["9:16", "2:3", "3:4"],
      defaultTiming: { mode: "entire" },
      fadeSec: 0.3,
      compositionGuidance:
        "tall vertical banner composition, subject and text centered within the safe column, crop-safe margins, avoid placing critical detail within 8% of the top or bottom edge",
    },
    {
      id: "fullscreen",
      nameTh: "เต็มจอ (แทรกช่วงเวลา)",
      box: { x: 0, y: 0, w: 1080, h: 1920 },
      targetAspect: "9:16",
      preferredModelAspects: ["9:16"],
      defaultTiming: { mode: "window", startSec: 0, durationSec: 3 },
      fadeSec: 0.3,
      compositionGuidance:
        "full-bleed vertical 9:16 interstitial composition, centered hero subject and headline, generous negative space near the edges for safe-zone overlays, crop-safe margins",
    },
  ];

const VD_AD_BANNER_PLACEMENT_PRESET_MAP = new Map<
  VdAdBannerPlacementId,
  VdAdBannerPlacementPreset
>(VD_AD_BANNER_PLACEMENT_PRESETS.map(preset => [preset.id, preset]));

/** Look up a placement preset by id. Throws when the id is unknown (a bug, never user input — `placementId` is always zod-validated before reaching this). */
export function getAdBannerPlacementPreset(
  id: VdAdBannerPlacementId
): VdAdBannerPlacementPreset {
  const preset = VD_AD_BANNER_PLACEMENT_PRESET_MAP.get(id);
  if (!preset) {
    throw new Error(`Unknown ad banner placement preset id: ${id}`);
  }
  return preset;
}

/**
 * Resolve the placement's box, mirrored to the right edge when `sideAlign`
 * is `"right"` for a `side_vertical` design (plan.md §3: "20 หรือ 760" — i.e.
 * `FRAME_WIDTH - box.w - box.x`, which is `1080 - 300 - 20 = 760`). A no-op
 * for every other placement (or when `sideAlign` is absent/`"left"`).
 */
export function resolvePlacementBox(
  placement: VdAdBannerPlacementPreset,
  sideAlign?: "left" | "right"
): VdAdBannerPlacementBox {
  if (placement.id !== "side_vertical" || sideAlign !== "right") {
    return placement.box;
  }
  return {
    ...placement.box,
    x: VD_AD_BANNER_FRAME_WIDTH - placement.box.w - placement.box.x,
  };
}

/* -------------------------------------------------------------------------- */
/* Recommendation (plan.md §4 — match productCategory to fitCategories)       */
/* -------------------------------------------------------------------------- */

/** Split a free-text category string into lowercase alnum tokens (e.g. `"food_beverage"` -> `["food","beverage"]`). */
function tokenizeCategory(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/**
 * True when two single-word tokens should be considered "the same category"
 * — exact match, simple English plural/singular tolerance (`cosmetics` <->
 * `cosmetic`), or a prefix relationship gated to tokens with at least 4
 * characters (long enough to avoid accidental collisions on short generic
 * tags like `app`/`ui` matching inside unrelated words, e.g. `"unmapped"`
 * containing `"app"`).
 */
function categoryTokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === `${b}s` || b === `${a}s`) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * True when `productCategory` reasonably matches one of the preset's
 * `fitCategories` tags. Token-aware (not exact string equality, not raw
 * substring) — the tie-in's own `productCategory` enum
 * (`@shared/verticalDramaSeries/thaiAdCompliance.ts`'s `cosmetics` /
 * `supplement` / `food_beverage` / `general_goods` / `service` / `other`) is
 * a different, coarser vocabulary than this file's marketing-trend
 * `fitCategories` tags (e.g. `cosmetic`, `food`, `beverage`) — tokenizing
 * both sides and matching token-to-token (see `categoryTokensMatch`) closes
 * that real-world gap (`"cosmetics"` vs `"cosmetic"`, `"food_beverage"` vs
 * `"food"`/`"beverage"`) deterministically, without a raw substring scan
 * that would false-positive on short tags appearing inside unrelated words.
 */
export function styleMatchesProductCategory(
  preset: VdAdBannerStylePreset,
  productCategory: string | null | undefined
): boolean {
  const needleTokens = tokenizeCategory(productCategory ?? "");
  if (needleTokens.length === 0) return false;
  return preset.fitCategories.some(tag =>
    tokenizeCategory(tag).some(tagToken =>
      needleTokens.some(needleToken =>
        categoryTokensMatch(needleToken, tagToken)
      )
    )
  );
}

/**
 * Order the 10 style preset ids so ones that fit `productCategory` come
 * first (stable relative order among matches AND among non-matches — both
 * groups keep `VD_AD_BANNER_STYLE_PRESETS`' original order). Always returns
 * all 10 ids; when nothing matches (including an absent/unknown category)
 * this degrades to the plain original order.
 */
export function recommendStylePresets(
  productCategory: string | null | undefined
): VdAdBannerStyleId[] {
  const matched: VdAdBannerStyleId[] = [];
  const unmatched: VdAdBannerStyleId[] = [];
  for (const preset of VD_AD_BANNER_STYLE_PRESETS) {
    if (styleMatchesProductCategory(preset, productCategory)) {
      matched.push(preset.id);
    } else {
      unmatched.push(preset.id);
    }
  }
  return [...matched, ...unmatched];
}

/* -------------------------------------------------------------------------- */
/* Forbidden-claim screening (deterministic, mirrors                          */
/* verticalDramaProductTieIn.ts's screenClaims forbidden-list branch)         */
/* -------------------------------------------------------------------------- */

/**
 * True when `text` contains any of `forbiddenClaims`, case-insensitive
 * substring match after trimming each claim. Thai has no case distinction,
 * but `.toLowerCase()` is kept so the SAME helper works unmodified for any
 * English claims/copy mixed into the same list.
 */
export function containsForbiddenClaim(
  text: string,
  forbiddenClaims: readonly string[] | null | undefined
): boolean {
  if (!forbiddenClaims || forbiddenClaims.length === 0) return false;
  const lower = text.toLowerCase();
  return forbiddenClaims.some(claim => {
    const trimmed = claim.trim().toLowerCase();
    return trimmed.length > 0 && lower.includes(trimmed);
  });
}

/* -------------------------------------------------------------------------- */
/* Design shape (plan.md §2 — series-level `productTieIn.adBanners[]`)       */
/* -------------------------------------------------------------------------- */

/** Max banner designs per series (plan.md §2, §8). */
export const VD_AD_BANNER_MAX_PER_SERIES = 5 as const;

/** Soft character caps for the user-authored copy fields — enforced as WARNINGS (not hard blocks) by `validateAdBannerDesigns`; a downstream render/QC step is not part of A1. */
export const VD_AD_BANNER_COPY_LIMITS = {
  headline: 60,
  subtext: 120,
  priceText: 40,
  ctaText: 30,
} as const;

export interface VdAdBannerCopy {
  headline?: string;
  subtext?: string;
  priceText?: string;
  ctaText?: string;
}

export interface VdAdBannerPrompt {
  generated?: string;
  negative?: string;
  final?: string;
  editedAt?: string;
}

export interface VdAdBannerGeneration {
  modelId?: string;
  aspectRatio?: string;
  size?: string;
}

export interface VdAdBannerImageAsset {
  url: string;
  taskId?: string;
  width?: number;
  height?: number;
  generatedAt: string;
}

export interface VdAdBannerTiming {
  mode: "entire" | "window";
  startSec?: number;
  durationSec?: number;
}

export type VdAdBannerStatus =
  | "draft"
  | "prompt_ready"
  | "generating"
  | "ready"
  | "failed";

export interface VdAdBannerApproval {
  required: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface VdAdBannerDesign {
  id: string;
  stylePresetId: VdAdBannerStyleId;
  placementId: VdAdBannerPlacementId;
  /** Only meaningful for `placementId === "side_vertical"`. */
  sideAlign?: "left" | "right";
  copy: VdAdBannerCopy;
  prompt: VdAdBannerPrompt;
  generation: VdAdBannerGeneration;
  imageAsset?: VdAdBannerImageAsset;
  defaultTiming: VdAdBannerTiming;
  status: VdAdBannerStatus;
  approval?: VdAdBannerApproval;
  /**
   * A1 addition beyond plan.md §2's literal shape — tracks an in-flight
   * image-generation task id BEFORE `imageAsset` exists (`imageAsset.url`/
   * `generatedAt` are required, so they cannot represent a pending task).
   * Set by `generateAdBannerImage`, cleared by `getAdBannerImageStatus` once
   * the task reaches a terminal state (success populates `imageAsset`;
   * failure just clears this so a retry starts clean). Additive-only —
   * absent on any design that has never started a generation.
   */
  pendingTaskId?: string;
}

/* -------------------------------------------------------------------------- */
/* Zod schemas — defensive runtime parsing of the jsonb-stored array          */
/* -------------------------------------------------------------------------- */

export const vdAdBannerCopySchema = z.object({
  headline: z.string().optional(),
  subtext: z.string().optional(),
  priceText: z.string().optional(),
  ctaText: z.string().optional(),
}) satisfies z.ZodType<VdAdBannerCopy>;

export const vdAdBannerPromptSchema = z.object({
  generated: z.string().optional(),
  negative: z.string().optional(),
  final: z.string().optional(),
  editedAt: z.string().optional(),
}) satisfies z.ZodType<VdAdBannerPrompt>;

export const vdAdBannerGenerationSchema = z.object({
  modelId: z.string().optional(),
  aspectRatio: z.string().optional(),
  size: z.string().optional(),
}) satisfies z.ZodType<VdAdBannerGeneration>;

export const vdAdBannerImageAssetSchema = z.object({
  url: z.string().min(1),
  taskId: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  generatedAt: z.string(),
}) satisfies z.ZodType<VdAdBannerImageAsset>;

export const vdAdBannerTimingSchema = z.object({
  mode: z.enum(["entire", "window"]),
  startSec: z.number().optional(),
  durationSec: z.number().optional(),
}) satisfies z.ZodType<VdAdBannerTiming>;

export const vdAdBannerApprovalSchema = z.object({
  required: z.boolean(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
}) satisfies z.ZodType<VdAdBannerApproval>;

export const vdAdBannerDesignSchema = z.object({
  id: z.string().min(1),
  stylePresetId: z.enum(VD_AD_BANNER_STYLE_IDS),
  placementId: z.enum(VD_AD_BANNER_PLACEMENT_IDS),
  sideAlign: z.enum(["left", "right"]).optional(),
  copy: vdAdBannerCopySchema,
  prompt: vdAdBannerPromptSchema,
  generation: vdAdBannerGenerationSchema,
  imageAsset: vdAdBannerImageAssetSchema.optional(),
  defaultTiming: vdAdBannerTimingSchema,
  status: z.enum(["draft", "prompt_ready", "generating", "ready", "failed"]),
  approval: vdAdBannerApprovalSchema.optional(),
  pendingTaskId: z.string().optional(),
}) satisfies z.ZodType<VdAdBannerDesign>;

/**
 * Parse an `unknown` value (typically `productTieIn.adBanners` read straight
 * off the jsonb column) into a `VdAdBannerDesign[]`, silently DROPPING any
 * entry that doesn't validate (defensive — a partially-malformed/legacy
 * record must never crash the whole studio) rather than throwing. Returns
 * `[]` for anything that isn't an array at all.
 */
export function parseAdBannerDesigns(value: unknown): VdAdBannerDesign[] {
  if (!Array.isArray(value)) return [];
  const result: VdAdBannerDesign[] = [];
  for (const item of value) {
    const parsed = vdAdBannerDesignSchema.safeParse(item);
    if (parsed.success) {
      result.push(parsed.data);
    }
  }
  return result;
}

/**
 * Build a fresh draft design. `id` is caller-supplied (this module stays
 * environment-agnostic — no `crypto.randomUUID()` dependency — callers
 * already have an id generator: the client uses `crypto.randomUUID()`
 * elsewhere in this component family, the server uses node's `crypto`).
 * `defaultTiming` is seeded from the placement preset's own default.
 */
export function createDefaultAdBannerDesign(params: {
  id: string;
  stylePresetId: VdAdBannerStyleId;
  placementId: VdAdBannerPlacementId;
}): VdAdBannerDesign {
  const placement = getAdBannerPlacementPreset(params.placementId);
  return {
    id: params.id,
    stylePresetId: params.stylePresetId,
    placementId: params.placementId,
    copy: {},
    prompt: {},
    generation: {},
    defaultTiming: { ...placement.defaultTiming },
    status: "draft",
  };
}

/* -------------------------------------------------------------------------- */
/* Product context (pure jsonb field reads — shared between router + client) */
/* -------------------------------------------------------------------------- */

export interface VdAdBannerProductContext {
  name?: string;
  category?: string;
  forbiddenClaims: string[];
  regulatedCategory?: string;
  requireHumanApproval: boolean;
}

/**
 * Defensively read the product-context fields the ad banner flow needs off
 * the loosely-typed `productTieIn` jsonb blob — same field names/reads as
 * `verticalDramaEpisodePipeline.ts`'s existing `productImageUrl`/
 * `marketplaceCaptureId`/`productCategory` reads, extended with
 * `regulatedCategory`/`requireHumanApproval` for the approval gate
 * (plan.md §1, §8). Never throws; every field degrades to `undefined`/`[]`/
 * `false` when absent or the wrong type.
 */
export function readAdBannerProductContext(
  productTieIn: Record<string, unknown> | null | undefined
): VdAdBannerProductContext {
  const name =
    typeof productTieIn?.productName === "string"
      ? productTieIn.productName
      : undefined;
  const category =
    typeof productTieIn?.productCategory === "string"
      ? productTieIn.productCategory
      : undefined;
  const forbiddenClaims = Array.isArray(productTieIn?.forbiddenClaims)
    ? productTieIn.forbiddenClaims.filter(
        (c): c is string => typeof c === "string"
      )
    : [];
  const regulatedCategory =
    typeof productTieIn?.regulatedCategory === "string"
      ? productTieIn.regulatedCategory
      : undefined;
  const requireHumanApproval = productTieIn?.requireHumanApproval === true;
  return {
    name,
    category,
    forbiddenClaims,
    regulatedCategory,
    requireHumanApproval,
  };
}

/* -------------------------------------------------------------------------- */
/* Validators (plan.md §8 v1 scope: max count, copy lengths, window timing)   */
/* -------------------------------------------------------------------------- */

export interface VdAdBannerValidationIssue {
  code:
    | "VD_AD_BANNER_TOO_MANY"
    | "VD_AD_BANNER_DUPLICATE_ID"
    | "VD_AD_BANNER_COPY_TOO_LONG"
    | "VD_AD_BANNER_INVALID_TIMING_START"
    | "VD_AD_BANNER_INVALID_TIMING_DURATION";
  severity: "error" | "warning";
  message: string;
  bannerId?: string;
  field?: string;
}

/**
 * Deterministic, pure validation over a series' full banner design list.
 * Scope (plan.md §8 v1, A1 slice only): ≤`VD_AD_BANNER_MAX_PER_SERIES`
 * designs, copy field length caps (soft — `"warning"`), and `"window"`
 * timing sanity (`startSec >= 0`, `durationSec > 0` — hard — `"error"`).
 * Duplicate-id is an additional structural guard (`"error"`) since two
 * designs sharing an id would corrupt every id-keyed lookup. Forbidden-claim
 * screening and the regulated-category approval gate are NOT part of this
 * validator — they are server-side, generation-time concerns (see
 * `containsForbiddenClaim` / the ad banner service's approval-gate resolver).
 */
export function validateAdBannerDesigns(
  designs: readonly VdAdBannerDesign[]
): VdAdBannerValidationIssue[] {
  const issues: VdAdBannerValidationIssue[] = [];

  if (designs.length > VD_AD_BANNER_MAX_PER_SERIES) {
    issues.push({
      code: "VD_AD_BANNER_TOO_MANY",
      severity: "error",
      message: `A series may have at most ${VD_AD_BANNER_MAX_PER_SERIES} ad banner designs (found ${designs.length}).`,
    });
  }

  const seenIds = new Set<string>();
  for (const design of designs) {
    if (seenIds.has(design.id)) {
      issues.push({
        code: "VD_AD_BANNER_DUPLICATE_ID",
        severity: "error",
        message: `Duplicate ad banner design id: "${design.id}".`,
        bannerId: design.id,
      });
    }
    seenIds.add(design.id);

    for (const field of Object.keys(VD_AD_BANNER_COPY_LIMITS) as Array<
      keyof typeof VD_AD_BANNER_COPY_LIMITS
    >) {
      const value = design.copy[field];
      const limit = VD_AD_BANNER_COPY_LIMITS[field];
      if (typeof value === "string" && value.length > limit) {
        issues.push({
          code: "VD_AD_BANNER_COPY_TOO_LONG",
          severity: "warning",
          message: `"${field}" is ${value.length} characters, longer than the recommended ${limit}.`,
          bannerId: design.id,
          field,
        });
      }
    }

    if (design.defaultTiming.mode === "window") {
      const { startSec, durationSec } = design.defaultTiming;
      if (
        typeof startSec !== "number" ||
        !Number.isFinite(startSec) ||
        startSec < 0
      ) {
        issues.push({
          code: "VD_AD_BANNER_INVALID_TIMING_START",
          severity: "error",
          message: `"startSec" must be a finite number >= 0 for a "window" timed banner (got ${String(startSec)}).`,
          bannerId: design.id,
          field: "defaultTiming.startSec",
        });
      }
      if (
        typeof durationSec !== "number" ||
        !Number.isFinite(durationSec) ||
        durationSec <= 0
      ) {
        issues.push({
          code: "VD_AD_BANNER_INVALID_TIMING_DURATION",
          severity: "error",
          message: `"durationSec" must be a finite number > 0 for a "window" timed banner (got ${String(durationSec)}).`,
          bannerId: design.id,
          field: "defaultTiming.durationSec",
        });
      }
    }
  }

  return issues;
}
