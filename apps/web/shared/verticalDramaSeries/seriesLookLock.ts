/** Feature 139 P1 — reversible, source-aware Series Look Lock contracts. */

import {
  verticalDramaPresetVisualIdentitySchema,
  type VerticalDramaPresetVisualIdentity,
} from "./presetVisualIdentity";

export const VD_LOOK_LOCK_GENRES = [
  "drama_romance",
  "horror_thriller",
  "sci_fi_cyberpunk",
  "action_epic",
  "fantasy_fairytale",
] as const;
export type VdLookLockGenre = (typeof VD_LOOK_LOCK_GENRES)[number];
export type VdLookLockMode = "inherit_source" | "genre" | "manual" | "none";
export type VdLookLockInheritedSource = "preset" | "ai_mix" | "lineage";
export type VdLookLockGovernance = "preset_mix" | "look_lock";

export type VdLookLockControl = {
  mode: VdLookLockMode;
  genreKey?: VdLookLockGenre;
  inheritedIdentity?: VerticalDramaPresetVisualIdentity;
  inheritedSource?: VdLookLockInheritedSource;
  inheritedGovernance?: VdLookLockGovernance;
  revision: number;
  updatedAt: string;
};

export type VdLookLockManualPatch = Partial<
  Pick<
    VerticalDramaPresetVisualIdentity,
    "styleName" | "palette" | "lighting" | "cameraGrammar" | "imagePromptFragments"
  >
>;

const CATALOG: Record<VdLookLockGenre, VerticalDramaPresetVisualIdentity> = {
  drama_romance: {
    styleName: "Intimate contemporary drama",
    palette: ["warm cream", "muted navy", "soft rose"],
    lighting: "natural window light with gentle practical warmth",
    environmentMotifs: ["lived-in interiors", "quiet urban details"],
    wardrobeGrammar: ["grounded contemporary tailoring", "soft natural fabrics"],
    signaturePropsAndCompanions: ["personal letters", "everyday keepsakes"],
    cameraGrammar: "restrained still composition with intimate eyelines",
    characterArchetypes: [],
    imagePromptFragments: {
      positive: ["natural window light", "grounded production design", "intimate dramatic framing"],
      negative: ["neon spectacle", "exaggerated fantasy styling"],
    },
  },
  horror_thriller: {
    styleName: "Controlled atmospheric thriller",
    palette: ["charcoal", "cold green", "aged amber"],
    lighting: "motivated low-key light with stable shadow direction",
    environmentMotifs: ["weathered surfaces", "constrained negative space"],
    wardrobeGrammar: ["subdued practical layers", "desaturated textiles"],
    signaturePropsAndCompanions: ["worn evidence objects", "failing practical lights"],
    cameraGrammar: "precise tense composition with deliberate negative space",
    characterArchetypes: [],
    imagePromptFragments: {
      positive: ["motivated low-key lighting", "weathered tactile surfaces", "controlled negative space"],
      negative: ["cheerful high-key lighting", "playful candy colors"],
    },
  },
  sci_fi_cyberpunk: {
    styleName: "Grounded near-future urban systems",
    palette: ["deep cyan", "graphite", "signal magenta"],
    lighting: "structured practical light from interfaces and architecture",
    environmentMotifs: ["layered infrastructure", "functional luminous signage"],
    wardrobeGrammar: ["technical streetwear", "modular utility details"],
    signaturePropsAndCompanions: ["worn personal devices", "public data displays"],
    cameraGrammar: "architectural composition with controlled luminous depth",
    characterArchetypes: [],
    imagePromptFragments: {
      positive: ["grounded near-future production design", "functional luminous interfaces", "layered urban infrastructure"],
      negative: ["clean utopian showroom", "random decorative neon"],
    },
  },
  action_epic: {
    styleName: "Large-scale grounded action",
    palette: ["burnished steel", "dust gold", "deep crimson"],
    lighting: "directional natural light with clear spatial separation",
    environmentMotifs: ["monumental terrain", "credible impact wear"],
    wardrobeGrammar: ["functional layered gear", "readable faction accents"],
    signaturePropsAndCompanions: ["battle-worn tools", "terrain markers"],
    cameraGrammar: "bold readable still composition with strong depth planes",
    characterArchetypes: [],
    imagePromptFragments: {
      positive: ["monumental grounded scale", "directional natural light", "credible impact wear"],
      negative: ["weightless posing", "cluttered unreadable staging"],
    },
  },
  fantasy_fairytale: {
    styleName: "Tactile storybook fantasy",
    palette: ["moss green", "moon silver", "warm ochre"],
    lighting: "soft enchanted naturalism with consistent practical sources",
    environmentMotifs: ["handcrafted organic architecture", "weathered magical artifacts"],
    wardrobeGrammar: ["layered natural textiles", "symbolic handcrafted details"],
    signaturePropsAndCompanions: ["heirloom talismans", "subtle living flora"],
    cameraGrammar: "storybook composition grounded in tangible space",
    characterArchetypes: [],
    imagePromptFragments: {
      positive: ["tactile storybook fantasy", "handcrafted organic detail", "soft enchanted naturalism"],
      negative: ["plastic costume finish", "generic game interface styling"],
    },
  },
};

export function getSeriesLookLockGenreIdentity(
  genre: VdLookLockGenre,
): VerticalDramaPresetVisualIdentity {
  return structuredClone(CATALOG[genre]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIdentity(value: unknown): VerticalDramaPresetVisualIdentity | undefined {
  const parsed = verticalDramaPresetVisualIdentitySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseControl(value: unknown): VdLookLockControl | undefined {
  if (!isRecord(value)) return undefined;
  const modes: readonly string[] = ["inherit_source", "genre", "manual", "none"];
  if (!modes.includes(String(value.mode))) return undefined;
  const revision = Number(value.revision);
  if (!Number.isInteger(revision) || revision < 1 || typeof value.updatedAt !== "string") {
    return undefined;
  }
  const genreKey = VD_LOOK_LOCK_GENRES.includes(value.genreKey as VdLookLockGenre)
    ? value.genreKey as VdLookLockGenre
    : undefined;
  const inheritedIdentity = parseIdentity(value.inheritedIdentity);
  const inheritedSource = ["preset", "ai_mix", "lineage"].includes(String(value.inheritedSource))
    ? value.inheritedSource as VdLookLockInheritedSource
    : undefined;
  const inheritedGovernance = ["preset_mix", "look_lock"].includes(
    String(value.inheritedGovernance),
  ) ? value.inheritedGovernance as VdLookLockGovernance : undefined;
  return {
    mode: value.mode as VdLookLockMode,
    revision,
    updatedAt: value.updatedAt,
    ...(genreKey ? { genreKey } : {}),
    ...(inheritedIdentity ? { inheritedIdentity } : {}),
    ...(inheritedSource ? { inheritedSource } : {}),
    ...(inheritedGovernance ? { inheritedGovernance } : {}),
  };
}

export function resolveEffectiveSeriesVisualIdentity(params: {
  bible: unknown;
  presetMixEnabled: boolean;
  lookLockEnabled: boolean;
}): VerticalDramaPresetVisualIdentity | undefined {
  if (!isRecord(params.bible)) return undefined;
  const current = parseIdentity(params.bible.presetVisualIdentity);
  const hasControl = Object.prototype.hasOwnProperty.call(params.bible, "lookLockControl");
  const control = parseControl(params.bible.lookLockControl);
  if (!hasControl) return params.presetMixEnabled ? current : undefined;
  if (!control) return undefined;

  const inheritedAuthorized = control.inheritedGovernance === "preset_mix"
    ? params.presetMixEnabled
    : control.inheritedGovernance === "look_lock"
      ? params.lookLockEnabled
      : false;

  if (!params.lookLockEnabled) {
    return inheritedAuthorized ? control.inheritedIdentity : undefined;
  }
  if (control.mode === "none") return undefined;
  if (control.mode === "genre" || control.mode === "manual") return current;
  return inheritedAuthorized ? (control.inheritedIdentity ?? current) : undefined;
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function validateString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 500 && !hasControlCharacters(trimmed)
    ? trimmed
    : undefined;
}

function validateStringArray(value: unknown, min = 0, max = 12): string[] | undefined {
  if (!Array.isArray(value) || value.length < min || value.length > max) return undefined;
  const parsed = value.map(validateString);
  return parsed.every((entry): entry is string => entry !== undefined) ? parsed : undefined;
}

export function validateSeriesLookManualPatch(
  raw: unknown,
): { ok: true; value: VdLookLockManualPatch } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Manual look patch must be an object" };
  const allowed = new Set(["styleName", "palette", "lighting", "cameraGrammar", "imagePromptFragments"]);
  if (Object.keys(raw).some(key => !allowed.has(key))) {
    return { ok: false, error: "Manual look patch contains a non-editable field" };
  }
  const value: VdLookLockManualPatch = {};
  if ("styleName" in raw) {
    const parsed = validateString(raw.styleName);
    if (!parsed) return { ok: false, error: "styleName is invalid" };
    value.styleName = parsed;
  }
  if ("lighting" in raw) {
    const parsed = validateString(raw.lighting);
    if (!parsed) return { ok: false, error: "lighting is invalid" };
    value.lighting = parsed;
  }
  if ("cameraGrammar" in raw) {
    const parsed = validateString(raw.cameraGrammar);
    if (!parsed) return { ok: false, error: "cameraGrammar is invalid" };
    value.cameraGrammar = parsed;
  }
  if ("palette" in raw) {
    const parsed = validateStringArray(raw.palette, 3, 6);
    if (!parsed) return { ok: false, error: "palette is invalid" };
    value.palette = parsed;
  }
  if ("imagePromptFragments" in raw) {
    if (!isRecord(raw.imagePromptFragments)) {
      return { ok: false, error: "imagePromptFragments is invalid" };
    }
    const positive = validateStringArray(raw.imagePromptFragments.positive);
    const negative = validateStringArray(raw.imagePromptFragments.negative);
    if (!positive || !negative) return { ok: false, error: "imagePromptFragments is invalid" };
    value.imagePromptFragments = { positive, negative };
  }
  return { ok: true, value };
}

function appendUniqueCsv(base: string | undefined, additions: readonly string[]): string | undefined {
  const parts = (base ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const seen = new Set(parts.map(value => value.toLocaleLowerCase()));
  for (const addition of additions.map(value => value.trim()).filter(Boolean)) {
    const key = addition.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      parts.push(addition);
    }
  }
  return parts.length ? parts.join(", ") : undefined;
}

/** Final provider-bound fragment merge. Idempotent and never mutates identity. */
export function applySeriesLookToImagePrompt(params: {
  prompt: string;
  negativePrompt?: string;
  identity?: VerticalDramaPresetVisualIdentity;
}): { prompt: string; negativePrompt?: string } {
  if (!params.identity) return { prompt: params.prompt, negativePrompt: params.negativePrompt };
  return {
    prompt: appendUniqueCsv(params.prompt, params.identity.imagePromptFragments.positive) ?? "",
    negativePrompt: appendUniqueCsv(
      params.negativePrompt,
      params.identity.imagePromptFragments.negative,
    ),
  };
}
