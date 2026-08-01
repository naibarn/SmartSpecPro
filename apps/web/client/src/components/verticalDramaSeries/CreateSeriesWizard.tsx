/**
 * CreateSeriesWizard (spec feature 131, section 03 · §8.2).
 *
 * 6-step Create-Series Wizard, extracted from VerticalDramaSeriesPage so it can
 * be mounted once by VerticalDramaShell and triggered from any of the three
 * vertical-drama pages. Runs in DRY-RUN mode — reaching Review and confirming
 * creates a series shell only and never triggers paid generation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ImageIcon,
  AlertCircle,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  genrePresetCategoryLabel,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES,
  VERTICAL_DRAMA_SERIES_LOCALES,
  clampToCreateSeriesLimit,
  CREATE_SERIES_FIELD_LIMITS,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import type {
  VerticalDramaBlendReport,
  VerticalDramaPresetMixWeight,
  VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import type { NarrativeRole, RoleTier } from "@shared/verticalDramaSeries/narrativeRole";
import {
  AUDIENCE_AGE_RATINGS,
  AUDIENCE_AGE_RATING_LABELS,
  DEFAULT_AUDIENCE_AGE_RATING,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import {
  VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES,
  type VerticalDramaCarryOverAvailability,
  type VerticalDramaCarryOverCharacterDecision,
  type VerticalDramaSeasonCarryOverDraft,
  type VerticalDramaSeriesCreateMode,
  type VerticalDramaSeriesLineage,
} from "@shared/verticalDramaSeries/lineage";
import type {
  VdOpenThread,
  VdRelationshipState,
} from "@shared/verticalDramaSeries/seriesMemoryState";
import { detectGenrePollution } from "@shared/verticalDramaSeries/genrePollutionGuard";
import type { VdLookLockGenre, VdLookLockMode } from "@shared/verticalDramaSeries/seriesLookLock";
import { VerticalDramaBlendReportPanel } from "./VerticalDramaBlendReportPanel";
import { SeriesLookLockPicker } from "./SeriesLookLockPicker";
import { DisclosureBadge } from "./VerticalDramaSeriesMemoryStateTab";
import {
  carryOverAvailabilityCopy,
  carryOverCopy,
  createSeriesNoSeedActionCopy,
  createModeToggleCopy,
  defaultLlmModelFieldCopy,
  genreLockedHintCopy,
  lineageCoverageLinkCopy,
  lineageReviewSummaryCopy,
  mixWeightLabel,
  parentSeriesPickerCopy,
  pickCopy,
  resolveWizardSteps,
  seasonNumberFieldCopy,
  specialEditionCopy,
  specialEditionEpisodeCountLockedHintCopy,
  toneLockedHintCopy,
  verticalDramaCopy,
  verticalDramaRoutes,
  visualStyleLabel,
} from "./verticalDramaCopy";
import {
  coverageHeadlineText,
  coverageSecondaryText,
  threadClassCopy,
} from "./verticalDramaSeriesMemoryCopy";

interface WizardState {
  title: string;
  genre: string;
  /**
   * Feature 132 §4 (F132A) — free-form "โจทย์เรื่องที่อยากได้" creative-intent
   * input, positioned directly above `logline`. When non-empty, the SERVER
   * (gated behind the `verticalDramaUserPremise` tenant flag) treats it as
   * the primary story spine and the selected preset(s) as supporting flavor.
   * Sent unconditionally on both `synthesizeGenrePreset` and `create` (same
   * "server decides" convention as Preset Mix v2's `selections` field) — see
   * `handleSynthesizePreset`/`handleCreate` below.
   */
  userPremise: string;
  /**
   * Series-level target-audience age tier — contract:
   * `@shared/verticalDramaSeries/audienceAgeRating`. Shapes how mature every
   * generation stage (story, script, dialogue, storyboard) authors this
   * series. Always a defined enum value, never undefined — seeded from
   * `DEFAULT_AUDIENCE_AGE_RATING` in `INITIAL_WIZARD` below.
   */
  audienceAgeRating: AudienceAgeRating;
  logline: string;
  targetEpisodeCount: string;
  locale: VerticalDramaSeriesLocale;
  targetDurationSeconds: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: string;
  /** Structured role facts retained alongside the free-text draft so preset
   * roles survive the wizard serialization step. */
  characterProfiles?: Array<{
    name: string;
    role: string;
    description: string;
    narrativeRole?: string;
    roleTier?: string;
    occupation?: string;
  }>;
  /**
   * Location Visual Bible (dedicated series tab + wizard seed field) —
   * free-form "one location per line" draft, same shape/convention as
   * `characters` above. Sent as `bible.locationsDraft` on `create` (see
   * `handleCreate` below) so the durable `vertical_drama_locations` roster
   * (read by the Series Detail Locations/"ฉาก" tab) can be bulk-seeded at
   * series-creation time, mirroring how `characters` seeds
   * `vertical_drama_characters` via `charactersDraft`.
   */
  locations: string;
  visualBible: string;
  productTieInEnabled: boolean;
  productName: string;
  productId?: string;
  productImageUrl?: string;
  forbiddenClaims: string;
  /**
   * Genre preset id the wizard applied directly (spec §8.2.2.A flow-through
   * rule, section-15) — set only by the single-preset "Use this preset" path
   * (`applyPreset`), never by the AI-mixed draft path (`applyPresetDraft`
   * clears it, since a synthesized draft is not itself a stored preset row).
   * Forwarded on `create` so the server can additively stamp the preset's
   * `visualIdentityJson` (if any) into the new series' bible.
   */
  appliedPresetId?: string;
  /** Complete AI-mix look candidate; server validates and strips client asset ids before persistence. */
  aiMixVisualIdentity?: VerticalDramaPresetVisualIdentity;
  /**
   * Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) — season 2 /
   * special-edition create modes. `undefined` is the ONLY valid "original
   * series" value (never the string `"original"` — see
   * `@shared/verticalDramaSeries/lineage`'s own doc comment on why: it
   * mirrors the `createMode` DB column's own "NULL = original" invariant so
   * a reset wizard is provably the pre-existing wizard, not a third enum
   * member masquerading as one).
   */
  createMode?: VerticalDramaSeriesCreateMode;
  /** The chosen parent series' id (string, same convention as every other id in this wizard/router). Required by `createValid` whenever `createMode` is set. */
  parentSeriesId?: string;
  /** Sequel only — kept as a plain numeric-text field like `targetEpisodeCount`, parsed at `create` time. */
  seasonNumber?: string;
  /** Free-form "โจทย์ภาคใหม่ที่อยากได้" sent to `proposeSeasonCarryOver` — separate from `userPremise` (which is a top-level `create` field for ALL modes). */
  carryOverPremise: string;
  /**
   * User edits layered on top of `proposeSeasonCarryOver`'s AI-proposed
   * `characters[]` — keyed by `characterKey` so `handleCreate` can merge
   * them back into the draft without losing the AI's original judgment for
   * any field the user never touched (see `resolveCarryOverCharacters`).
   */
  carryOverOverrides: Record<
    string,
    Partial<
      Pick<
        VerticalDramaCarryOverCharacterDecision,
        "availability" | "returnJustification" | "suggestedStateUpdate"
      >
    >
  >;
  /** Stage 2.5 special-edition sources — story-function choice (source 3). */
  storyFunctionChoice?: "review" | "tie_in_solution";
  /** Stage 2.5 source 1 (marketplace) — description companion to the existing `productName`/`productId` fields shared with the Product tie-in step. */
  productDescription?: string;
  /** Stage 2.5 source 2 — uploaded reference images, kept as plain `{url,mimeType,fileName}` (never `resolveMediaAssetForImport`, which requires a series id that doesn't exist yet in this wizard). */
  uploadedReferences: Array<{ url: string; mimeType: string; fileName: string }>;
  /** Stage 2.5 source 2 — short summary of what was uploaded. */
  uploadedSummary?: string;
  /**
   * Manual LLM model pin at creation time (mirrors
   * `VerticalDramaSettingsTab`'s post-creation "Settings" field) — sent as
   * `create`'s `defaultModelId`. `null` (the default) = automatic, byte-
   * identical to the pre-existing wizard payload. Mode-independent: shown
   * and honored for every `createMode` (new / sequel / special edition).
   */
  defaultModelId: string | null;
  lookLockMode: VdLookLockMode;
  lookLockGenreKey?: VdLookLockGenre;
}

const INITIAL_WIZARD: WizardState = {
  title: "",
  genre: "",
  userPremise: "",
  audienceAgeRating: DEFAULT_AUDIENCE_AGE_RATING,
  logline: "",
  targetEpisodeCount: "10",
  locale: "th",
  targetDurationSeconds: "60",
  mainPlot: "",
  seasonArc: "",
  tone: "",
  cliffhangerStyle: "",
  characters: "",
  locations: "",
  visualBible: "",
  productTieInEnabled: false,
  productName: "",
  forbiddenClaims: "",
  // Stage 2.6 — `createMode: undefined` (never `"original"`), see the field's
  // own doc comment above.
  createMode: undefined,
  parentSeriesId: undefined,
  seasonNumber: undefined,
  carryOverPremise: "",
  carryOverOverrides: {},
  storyFunctionChoice: undefined,
  productDescription: "",
  uploadedReferences: [],
  uploadedSummary: "",
  defaultModelId: null,
  lookLockMode: "none",
  lookLockGenreKey: undefined,
};

/**
 * Manual LLM model override — sentinel `<Select>` value standing in for
 * "automatic" (`null`/unset `defaultModelId`), since Radix `Select.Item`
 * doesn't accept an empty-string value. Same value/convention as
 * `VerticalDramaSettingsTab`'s own `AUTOMATIC_LLM_MODEL_VALUE` (kept as a
 * separate local const there — no shared module currently exports this
 * sentinel — but the literal MUST stay identical since both pickers write to
 * the same server-side `defaultModelId` contract).
 */
const AUTOMATIC_LLM_MODEL_VALUE = "__automatic__";

/** Default weight for a newly-selected preset (spec §8.2.2.C.1 — "default equal"). */
const DEFAULT_MIX_WEIGHT: VerticalDramaPresetMixWeight = 3;

/**
 * Clamps/rounds an arbitrary number (e.g. straight off a Radix `Slider`'s
 * `onValueChange`) into the 1-5 `VerticalDramaPresetMixWeight` union.
 * Pure — exported for direct unit testing.
 */
export function clampMixWeight(value: number): VerticalDramaPresetMixWeight {
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as VerticalDramaPresetMixWeight;
}

/**
 * vd-premise-first-wizard plan, Phase 3 — the premise is the spine, presets
 * are supplements, never the reverse. Pure decision of what step 1's single
 * preset CTA does (and what it's labeled) for a given premise/preset-count
 * combination. Exported for direct unit testing without rendering.
 *
 * | userPremise | presetCount | kind                              |
 * |---|---|---|
 * | yes | 0     | synthesize_from_premise_only  (AI builds from premise alone) |
 * | yes | 1..5  | synthesize_premise_and_presets (premise primary, preset(s) as flavor) |
 * | no  | 1     | apply_preset_verbatim         (unchanged legacy "Use this preset") |
 * | no  | 2..5  | synthesize_presets_only        (unchanged legacy AI preset mix) |
 * | no  | 0     | synthesize_from_basics when defaults/basic facts exist |
 * | no  | 0     | blocked only when no basic seed exists at all |
 */
export type CreateSeriesPresetActionKind =
  | "apply_preset_verbatim"
  | "synthesize_from_premise_only"
  | "synthesize_premise_and_presets"
  | "synthesize_presets_only"
  | "synthesize_from_basics"
  | "blocked";

export interface CreateSeriesPresetAction {
  kind: CreateSeriesPresetActionKind;
  /** CTA button label matching what this action will actually do. */
  label: string;
  /**
   * Only meaningful when `kind === "blocked"` — explains why no AI action can
   * run yet (surfaced as a toast if the disabled CTA is somehow triggered
   * anyway, e.g. a defensive check in the mutation handler).
   */
  blockedReason?: string;
  /**
   * Short answer to "what happens when I press this" for the AI-synthesis
   * kinds — surfaced next to the CTA so the button label itself can stay
   * concise while the panel still states the concrete outcome (title,
   * logline, main plot, season arc, cast). Undefined for
   * `apply_preset_verbatim` (nothing to explain — it just applies the
   * preset) and `blocked` (explained by `blockedReason` instead).
   */
  outcomeHint?: string;
}

export function resolveCreateSeriesPresetAction(params: {
  hasUserPremise: boolean;
  presetCount: number;
  hasBasicSeed?: boolean;
  hasLineageSeed?: boolean;
  lang: "th" | "en";
}): CreateSeriesPresetAction {
  const {
    hasUserPremise,
    presetCount,
    hasBasicSeed = false,
    hasLineageSeed = false,
    lang,
  } = params;
  const th = lang === "th";

  // No premise + exactly 1 preset — legacy verbatim path, byte-identical to
  // pre-Phase-3 behavior (nothing else to build from besides the preset).
  if (presetCount === 1 && !hasUserPremise) {
    return {
      kind: "apply_preset_verbatim",
      label: th ? "ใช้ Preset นี้" : "Use this preset",
    };
  }

  // What the synthesis actually produces, spelled out once here so every
  // synthesize_* kind below can point the CTA's surrounding hint at it
  // instead of leaving the button label ("ผสม"/"mix") as the only
  // explanation of what pressing it does.
  // Phase 2 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
  // — widened to name every tab this fills in (per the owner's own request:
  // "พอกดให้สร้าง ก็ช่วยสร้างข้อมูลช่องอื่น ๆ จนครบทุก tab"), including the
  // title CANDIDATES (plural — Stage 1's `titleOptions`, still just one of
  // several possibly-undefined server fields) and `locations`, which
  // `applyPresetDraft` now actually writes (see its own doc comment).
  const outcomeHint = th
    ? "ระบบจะสร้างดราฟต์ซีรีย์ให้ครบทุกแท็บ: ชื่อเรื่อง (ให้เลือก 4-5 แบบ) เรื่องย่อ โครงเรื่องหลัก อาร์กของซีซัน ตัวละคร ฉาก/สถานที่ และ Visual Bible — แก้ไขทับได้ทุกช่องก่อนกดสร้างจริง"
    : "This fills in every tab — title candidates to choose from, logline, main plot, season arc, cast, locations, and visual bible — all still editable before you confirm.";

  // A premise exists — it is always the spine; 0..5 presets are supplements.
  if (hasUserPremise) {
    return presetCount === 0
      ? {
          kind: "synthesize_from_premise_only",
          label: hasLineageSeed
            ? th
              ? "ให้ AI สร้างภาคต่อจากเรื่องเดิม + โจทย์"
              : "Let AI continue the original story with your premise"
            : th
              ? "ให้ AI สร้างดราฟต์ซีรีย์จากโจทย์"
              : "Let AI build a series draft from your premise",
          outcomeHint,
        }
      : {
          kind: "synthesize_premise_and_presets",
          label: hasLineageSeed
            ? th
              ? "ให้ AI สร้างภาคต่อจากเรื่องเดิม + โจทย์ + preset"
              : "Let AI continue the original story with your premise and presets"
            : th
              ? "ให้ AI ผสมโจทย์กับ preset เป็นดราฟต์ซีรีย์"
              : "Let AI blend your premise with the preset(s) into a series draft",
          outcomeHint,
        };
  }

  // No premise, 2-5 presets — legacy AI preset-mix path, unchanged.
  if (presetCount >= 2) {
    return {
      kind: "synthesize_presets_only",
      label: th
        ? "ให้ AI ผสม Preset เป็นดราฟต์ซีรีย์"
        : "Let AI blend the presets into a series draft",
      outcomeHint,
    };
  }

  // No premise/preset, but the wizard still has useful planning facts
  // (defaults count: locale, audience tier, Sub-episode count; plus any
  // title/genre/tone/business/lineage facts the creator supplied).
  if (hasBasicSeed) {
    return {
      kind: "synthesize_from_basics",
      label: pickCopy(lang, createSeriesNoSeedActionCopy.label),
    };
  }

  // Pure helper fallback for callers that truly have no seed at all. The
  // actual wizard normally has defaults, so users are not trapped here.
  return {
    kind: "blocked",
    label: pickCopy(lang, createSeriesNoSeedActionCopy.label),
    blockedReason: pickCopy(lang, createSeriesNoSeedActionCopy.blockedReason),
  };
}

/**
 * AI synthesis returns separate `title` and `category` fields. The wizard's
 * genre must never be populated from `draft.title`: doing so makes the final
 * create payload fail the genre-pollution guard, and in lineage modes it also
 * overwrites the inherited parent genre despite that field being locked.
 */
export function resolveGenreAfterPresetDraft(
  currentGenre: string,
  draftCategory: string,
  seriesTitle: string,
): string {
  const existing = currentGenre.trim();
  if (existing && !detectGenrePollution(existing, seriesTitle)) {
    return existing;
  }

  const category = draftCategory.trim();
  const clampedCategory =
    clampToCreateSeriesLimit(category, "genre") ?? category;
  return detectGenrePollution(clampedCategory, seriesTitle)
    ? ""
    : clampedCategory;
}

/**
 * Stage 2.2/2.6 — folds the AI-proposed carry-over draft's `characters[]`
 * with the user's per-`characterKey` overrides (`WizardState.carryOverOverrides`)
 * into the final array `create` persists at `lineage.carryOver.characters`.
 * Pure — exported for direct unit testing without rendering. A character
 * with no override at all is forwarded UNCHANGED (the AI's own judgment);
 * an override only ever replaces the 3 user-editable fields
 * (`availability`/`returnJustification`/`suggestedStateUpdate`), never
 * `characterKey`/`name`/`postFinaleStatus`.
 */
export function resolveCarryOverCharacters(
  draftCharacters: VerticalDramaCarryOverCharacterDecision[],
  overrides: Record<
    string,
    Partial<
      Pick<
        VerticalDramaCarryOverCharacterDecision,
        "availability" | "returnJustification" | "suggestedStateUpdate"
      >
    >
  >
): VerticalDramaCarryOverCharacterDecision[] {
  return draftCharacters.map(character => ({
    ...character,
    ...overrides[character.characterKey],
  }));
}

export function CreateSeriesWizard({
  open,
  lang,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  lang: "th" | "en";
  onOpenChange: (open: boolean) => void;
  onCreated: (seriesId: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_WIZARD);
  const [presetSearch, setPresetSearch] = useState("");
  const [mixPresetIds, setMixPresetIds] = useState<string[]>([]);
  const [mixCategories, setMixCategories] = useState<string[]>([]);
  const [mixBusinessContext, setMixBusinessContext] = useState("");
  const [mixPrimarySelectionId, setMixPrimarySelectionId] = useState<
    string | undefined
  >();
  // Preset Mix v2 (spec §8.2.2.C.1, section-15) — sparse map, missing entries
  // default to DEFAULT_MIX_WEIGHT at read time; intentionally NOT cleared when
  // a preset is deselected, so re-selecting it remembers the user's prior
  // adjustment instead of silently resetting it.
  const [mixWeights, setMixWeights] = useState<
    Record<string, VerticalDramaPresetMixWeight>
  >({});
  const [productSearch, setProductSearch] = useState("");

  const presetsQuery = trpc.verticalDramaSeries.listGenrePresets.useQuery({
    locale: lang,
  });
  const presets = presetsQuery.data?.presets ?? [];
  const presetCategories = useMemo(
    () => Array.from(new Set(presets.map(p => p.category))),
    [presets]
  );
  // Stage 2.5 3-source picker (source 1) — widened `enabled` (this query and
  // component were already wired for the Product tie-in step): a special
  // edition needs the marketplace picker even when the unrelated
  // `productTieInEnabled` checkbox is off.
  const productsQuery = trpc.marketplaceCapture.listProducts.useQuery(
    { query: productSearch || undefined, limit: 20 },
    { enabled: form.productTieInEnabled || form.createMode === "special_edition" }
  );
  const products = productsQuery.data ?? [];

  // Stage 2.6 — the whole lineage UI (mode toggle, picker, carry-over grid,
  // special-edition sources) is hidden behind this tenant flag; `createMode`
  // itself can only ever become non-`undefined` through UI this flag gates,
  // so flag-off is provably identical to the pre-existing wizard.
  const lineageEnabled = useTenantFeatureFlag("verticalDramaSeriesLineage");
  const lookLockEnabled = useTenantFeatureFlag("verticalDramaSeriesLookLock");
  const presetMixEnabled = useTenantFeatureFlag("verticalDramaSeriesPresetMixV2");

  const seriesListQuery = trpc.verticalDramaSeries.list.useQuery(
    { limit: 100 },
    { enabled: lineageEnabled && Boolean(form.createMode) }
  );
  const parentSeriesOptions = seriesListQuery.data?.series ?? [];

  // Manual LLM model pin (mirrors `VerticalDramaSettingsTab`'s own query) —
  // mode-independent, so always enabled (no `enabled` gate).
  const planningModelsQuery =
    trpc.verticalDramaSeries.listQualityPlanningModels.useQuery();
  const planningModels = planningModelsQuery.data ?? [];

  // Parent series full row (genre/tone/bible/memory snapshot) — used to
  // prefill+lock genre/tone and seed `visualBible`/`lineage.priorSeasonSummary`.
  // `get` is the ONLY existing procedure that returns the raw row (`list`
  // does not carry `bible`/`memory`/`genre`/`tone`).
  const parentSeriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId: form.parentSeriesId ?? "" },
    { enabled: lineageEnabled && Boolean(form.parentSeriesId) }
  );
  const parentSeries = parentSeriesQuery.data?.series;

  // Sequel-only — parent's memory coverage (review-step thin-season warning).
  const parentMemoryQuery = trpc.verticalDramaSeries.getSeriesMemory.useQuery(
    { seriesId: form.parentSeriesId ?? "" },
    {
      enabled:
        lineageEnabled &&
        form.createMode === "sequel" &&
        Boolean(form.parentSeriesId),
    }
  );

  const carryOverMutation =
    trpc.verticalDramaSeries.proposeSeasonCarryOver.useMutation({
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "เสนอการกลับมาของตัวละครไม่สำเร็จ"
              : "Failed to propose cast carry-over")
        );
      },
    });

  const specialEditionMutation =
    trpc.verticalDramaSeries.proposeSpecialEditionBrief.useMutation({
      onSuccess: data => {
        // Same "propose -> transient draft -> user applies" shape as
        // `applyPresetDraft` — auto-fill `userPremise` only the FIRST time so
        // a regenerate never silently clobbers a user's edits to the applied
        // text. Functional `setForm` update (not the `set` helper closing
        // over a possibly-stale `form`) since this runs asynchronously after
        // the mutation resolves.
        setForm(prev => ({
          ...prev,
          userPremise: prev.userPremise.trim()
            ? prev.userPremise
            : data.suggestedUserPremise,
        }));
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "ร่างภาคพิเศษไม่สำเร็จ"
              : "Failed to draft the special edition")
        );
      },
    });

  const uploadMutation = trpc.ai.upload.useMutation();

  const synthesizePresetMutation =
    trpc.verticalDramaSeries.synthesizeGenrePreset.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "AI ผสมแนวเรื่องเป็น draft ให้แล้ว"
            : "AI created a mixed preset draft"
        );
      },
      onError: (err: { message?: string }) => {
        toast.error(formatPresetSynthesisError(err, lang));
      },
    });

  const generateStoryMutation =
    trpc.verticalDramaSeries.generateStoryBible.useMutation({
      onSuccess: (data: { creditsUsed: number }) => {
        toast.success(
          lang === "th"
            ? `สร้างเนื้อเรื่องเต็มแล้ว (ใช้ ${data.creditsUsed} เครดิต)`
            : `Full story generated (${data.creditsUsed} credits used)`
        );
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "สร้างเนื้อเรื่องเต็มไม่สำเร็จ — ลองใหม่ได้จากหน้าซีรีย์"
              : "Full story generation failed — retry from the series page")
        );
      },
    });

  const createMutation = trpc.verticalDramaSeries.create.useMutation({
    onSuccess: (data: { series: { id: string } }) => {
      toast.success(
        lang === "th"
          ? "สร้างโครงซีรีย์แล้ว (โหมดวางแผน)"
          : "Series shell created (planning mode)"
      );
      const seriesId = data.series.id;
      setForm(INITIAL_WIZARD);
      setStepIndex(0);
      onCreated(seriesId);
      // Best-effort: immediately expand the wizard's bible into a full story.
      // A failure here is non-fatal — the series shell still exists and the
      // user can retry "Generate story" from the series detail page. This
      // runs in the background after the dialog has already closed.
      generateStoryMutation.mutate({ seriesId });
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message || (lang === "th" ? "สร้างไม่สำเร็จ" : "Create failed")
      );
    },
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // Stage 2.6 — once a parent series loads for a sequel/special edition,
  // inherit genre (both modes) + tone (sequel only) verbatim and lock them in
  // the UI (`Field`s below check `form.createMode`/`parentSeries` directly),
  // and prefill `visualBible` from the parent's bible — but ONLY the very
  // first time (never clobber an edit the user already made, e.g. by
  // switching parents twice). Runs once per `parentSeriesId` via the ref
  // guard, same pattern as `VerticalDramaCharacterReferencePanel`'s
  // `defaultedForCharacterRef`.
  const lineagePrefilledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!form.createMode || !form.parentSeriesId || !parentSeries) return;
    if (lineagePrefilledForRef.current === form.parentSeriesId) return;
    lineagePrefilledForRef.current = form.parentSeriesId;
    setForm(prev => ({
      ...prev,
      genre: parentSeries.genre ?? prev.genre,
      tone:
        prev.createMode === "sequel" ? parentSeries.tone ?? prev.tone : prev.tone,
      visualBible: prev.visualBible.trim()
        ? prev.visualBible
        : typeof (parentSeries.bible as Record<string, unknown> | null)
              ?.visualStyle === "string"
          ? ((parentSeries.bible as Record<string, unknown>)
              .visualStyle as string)
          : prev.visualBible,
    }));
  }, [form.createMode, form.parentSeriesId, parentSeries]);

  /** Switching create mode resets the parent-selection-dependent state so a stale pick from a different mode can never leak into `create`'s payload. */
  function handleSetCreateMode(mode: VerticalDramaSeriesCreateMode | undefined) {
    lineagePrefilledForRef.current = null;
    setForm(prev => ({
      ...prev,
      createMode: mode,
      parentSeriesId: undefined,
      seasonNumber: mode === "sequel" ? "2" : undefined,
      carryOverPremise: "",
      carryOverOverrides: {},
      storyFunctionChoice: mode === "special_edition" ? "review" : undefined,
      // Stage 2.5 hard cap — clamp an existing (likely double-digit) planned
      // count down to the 1-2 special-edition range the moment the mode is
      // chosen, rather than waiting for the user to notice the field itself.
      targetEpisodeCount:
        mode === "special_edition"
          ? String(Math.min(2, Math.max(1, Number(prev.targetEpisodeCount) || 1)))
          : prev.targetEpisodeCount,
    }));
    carryOverMutation.reset();
    specialEditionMutation.reset();
  }

  function handleSelectParentSeries(seriesId: string) {
    lineagePrefilledForRef.current = null;
    setForm(prev => ({
      ...prev,
      parentSeriesId: seriesId,
      carryOverOverrides: {},
    }));
    carryOverMutation.reset();
    specialEditionMutation.reset();
  }

  function setCarryOverOverride(
    characterKey: string,
    patch: Partial<
      Pick<
        VerticalDramaCarryOverCharacterDecision,
        "availability" | "returnJustification" | "suggestedStateUpdate"
      >
    >
  ) {
    setForm(prev => ({
      ...prev,
      carryOverOverrides: {
        ...prev.carryOverOverrides,
        [characterKey]: { ...prev.carryOverOverrides[characterKey], ...patch },
      },
    }));
  }

  function handleProposeCarryOver() {
    if (!form.parentSeriesId) return;
    carryOverMutation.mutate({
      parentSeriesId: form.parentSeriesId,
      premise: form.carryOverPremise.trim() || undefined,
    });
  }

  function handleProposeSpecialEditionBrief() {
    if (!form.parentSeriesId || !form.storyFunctionChoice) return;
    specialEditionMutation.mutate({
      parentSeriesId: form.parentSeriesId,
      targetEpisodeCount: Math.min(2, Math.max(1, Number(form.targetEpisodeCount) || 1)),
      storyFunctionChoice: form.storyFunctionChoice,
      marketplaceProductName: form.productName.trim() || undefined,
      marketplaceProductDescription: form.productDescription?.trim() || undefined,
      uploadedSummary: form.uploadedSummary?.trim() || undefined,
    });
  }

  async function handleUploadReferenceFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileType: file.type || "image/jpeg",
        fileBase64: dataUrl,
      });
      setForm(prev => ({
        ...prev,
        uploadedReferences: [
          ...prev.uploadedReferences,
          {
            url: result.url,
            mimeType: result.fileType,
            fileName: file.name,
          },
        ],
      }));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "อัปโหลดรูปไม่สำเร็จ"
            : "Failed to upload image"
      );
    }
  }

  function applyPreset(preset: (typeof presets)[number]) {
    set(
      "genre",
      clampToCreateSeriesLimit(preset.title, "genre") ?? preset.title
    );
    set("logline", preset.logline);
    set("mainPlot", preset.mainPlot);
    set("seasonArc", preset.seasonArc);
    set("tone", clampToCreateSeriesLimit(preset.tone, "tone") ?? preset.tone);
    set("cliffhangerStyle", preset.cliffhangerStyle);
    set(
      "characters",
      preset.characters
        .map(c => `${c.name} — ${c.role}: ${c.description}`)
        .join("\n")
    );
    set(
      "characterProfiles",
      preset.characters.map(c => ({
        name: c.name,
        role: c.role,
        description: c.description,
        narrativeRole: c.narrativeRole,
        roleTier: c.roleTier,
        occupation: c.occupation,
      })),
    );
    set("visualBible", preset.visualBible);
    // Spec §8.2.2.A flow-through rule (section-15) — remembered so `create`
    // can additively stamp this preset's `visualIdentityJson` (if any) into
    // the new series' bible; a no-op server side for presets without one.
    set("appliedPresetId", preset.id);
    set("aiMixVisualIdentity", undefined);
    // Feature 132 §4.1 (F132A) distinctness rule — `userPremise` is
    // creative-intent input, never overwritten by preset application.
    // Deliberately not touched here.
    toast.success(
      lang === "th"
        ? `นำ Preset "${preset.title}" มาใช้แล้ว — แก้ไขต่อได้ทุกแท็บ`
        : `Applied preset "${preset.title}" — edit any tab freely`
    );
  }

  function applyPresetDraft(draft: SynthesizedGenrePresetDraft) {
    setForm(prev => {
      const resolvedTitle = prev.title.trim() ? prev.title : draft.title;
      return {
        ...prev,
        title: resolvedTitle,
        genre: resolveGenreAfterPresetDraft(
          prev.genre,
          draft.category,
          resolvedTitle,
        ),
        logline: draft.logline,
        mainPlot: draft.mainPlot,
        seasonArc: draft.seasonArc,
        tone: clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone,
        cliffhangerStyle: draft.cliffhangerStyle,
        characters: draft.characters
          .map(c => `${c.name} — ${c.role}: ${c.description}`)
          .join("\n"),
        characterProfiles: draft.characters.map(c => ({
          name: c.name,
          role: c.role,
          description: c.description,
          narrativeRole: c.narrativeRole,
          roleTier: c.roleTier,
          occupation: c.occupation,
        })),
        visualBible: draft.visualBible,
        // Stage 1/2 (fix-create-series-premise-blend plan-phase2-mode-first,
        // gap analysis item 2) — `locations` was never written here before,
        // leaving the "ตัวละคร & ฉาก" tab's location roster permanently
        // empty. Same join convention as `characters` above (`"name —
        // description"` per line, matching the server's
        // `parseLocationsDraft`). Optional/additive: an older or shorter
        // model response without `draft.locations` leaves `prev.locations`
        // untouched — byte-identical to before this field existed.
        locations: draft.locations
          ? draft.locations
              .map(l => `${l.name} — ${l.description}`)
              .join("\n")
          : prev.locations,
        // An AI-mixed draft is not itself a single stored preset row — clear
        // any single-preset `appliedPresetId` a prior "Use this preset" click
        // may have left behind so `create` doesn't stamp the wrong identity.
        appliedPresetId: undefined,
        aiMixVisualIdentity:
          draft.contract_version === 2 ? draft.visualIdentity : undefined,
        // Feature 132 §4.1 (F132A) distinctness rule — `userPremise` is
        // creative-intent input, never overwritten by preset application.
        // `prev` is already spread above, so `userPremise` is deliberately not
        // listed here (leaving it untouched).
      };
    });
    toast.success(
      lang === "th"
        ? "ใช้ draft นี้แล้ว — แก้ไขต่อได้ทุกแท็บ"
        : "Draft applied — edit any tab freely"
    );
  }

  function toggleMixPreset(id: string) {
    setMixPresetIds(prev => {
      if (prev.includes(id)) {
        if (mixPrimarySelectionId === id) setMixPrimarySelectionId(undefined);
        return prev.filter(value => value !== id);
      }
      if (prev.length >= 5) {
        toast.info(
          lang === "th"
            ? "เลือก preset ได้สูงสุด 5 รายการ"
            : "Choose up to 5 presets"
        );
        return prev;
      }
      return [...prev, id];
    });
  }

  function toggleMixCategory(category: string) {
    setMixCategories(prev => {
      if (prev.includes(category))
        return prev.filter(value => value !== category);
      if (prev.length >= 5) {
        toast.info(
          lang === "th"
            ? "เลือกหมวดแนวเรื่องได้สูงสุด 5 หมวด"
            : "Choose up to 5 story categories"
        );
        return prev;
      }
      return [...prev, category];
    });
  }

  function setMixWeight(id: string, weight: VerticalDramaPresetMixWeight) {
    setMixWeights(prev => ({ ...prev, [id]: weight }));
  }

  function handleSynthesizePreset() {
    // vd-premise-first-wizard plan Phase 3.1 — the premise stands on its own:
    // synthesis is allowed with 0 presets when a premise is present, and the
    // hard error now only fires for the genuinely-empty case (see
    // `resolveCreateSeriesPresetAction`'s "blocked" kind).
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: form.userPremise.trim().length > 0,
      presetCount: mixPresetIds.length,
      hasLineageSeed: Boolean(form.createMode && form.parentSeriesId),
      hasBasicSeed: Boolean(
        form.title.trim() ||
          form.genre.trim() ||
          form.tone.trim() ||
          mixCategories.length > 0 ||
          mixBusinessContext.trim() ||
          form.productName.trim() ||
          Number(form.targetEpisodeCount) > 0 ||
          form.audienceAgeRating ||
          (form.createMode && form.parentSeriesId)
      ),
      lang,
    });
    if (action.kind === "blocked") {
      toast.error(action.blockedReason);
      return;
    }
    // Clear the previous response/error before a new request so a stale draft
    // cannot look like the result of the current selection and no refresh is
    // needed to recover the wizard state after a failed request.
    synthesizePresetMutation.reset();
    synthesizePresetMutation.mutate({
      locale: lang,
      selectedPresetIds: mixPresetIds,
      // Category chips are filters while presets are selected. With zero
      // presets, however, the chosen categories become legitimate basics-only
      // genre seeds instead of forcing the creator to pick a preset card.
      selectedCategories: mixPresetIds.length === 0 ? mixCategories : [],
      primarySelectionId: mixPrimarySelectionId,
      businessContext: mixBusinessContext || undefined,
      productContext: form.productName || undefined,
      targetEpisodeCount: Number(form.targetEpisodeCount) || undefined,
      // Clamp every bounded hint to the same create-series limits the server
      // enforces (shared/verticalDramaSeries/createSeriesFieldLimits.ts).
      // Unclamped `form.genre` is exactly what produced the 2026-07-31
      // 09:14:56 production BAD_REQUEST — `{ code: "too_big", maximum: 100,
      // path: ["genreHint"] }` — when a full story premise was typed into
      // the 100-char genre field and sent straight through. The genre
      // `<Input>` intentionally has no `maxLength` (see the rescue notice
      // below), so clamping here is the only thing standing between an
      // oversized value and a hard 400 before any LLM/skill call runs.
      toneHint: clampToCreateSeriesLimit(form.tone, "tone"),
      seriesTitleHint: clampToCreateSeriesLimit(form.title, "title"),
      genreHint: clampToCreateSeriesLimit(form.genre, "genre"),
      // Preset Mix v2 (spec §8.2.2.C.1, section-15) — sent ALONGSIDE legacy
      // `selectedPresetIds` unconditionally; the SERVER decides whether the
      // tenant's `verticalDramaSeriesPresetMixV2` flag is on and only then
      // reads this field (flag-off requests ignore it, byte-identical v1
      // behavior). Missing weights default to DEFAULT_MIX_WEIGHT.
      selections: mixPresetIds.map(id => ({
        presetId: id,
        weight: mixWeights[id] ?? DEFAULT_MIX_WEIGHT,
      })),
      // Feature 132 §4.2 (F132A) — sent UNCONDITIONALLY, same "server
      // decides" convention as `selections` above (verticalDramaUserPremise
      // tenant flag gates whether the server honors it). The server already
      // accepts this field — see
      // server/routers/__tests__/verticalDramaSeries.userPremise.test.ts.
      userPremise: form.userPremise.trim() || undefined,
      // Contract: `@shared/verticalDramaSeries/audienceAgeRating` — steers
      // preset-mix synthesis to match the series' target maturity tier.
      // Always a defined enum value (see `handleCreate` above).
      audienceAgeRating: form.audienceAgeRating,
      // A sequel/special edition can synthesize before its series row exists;
      // pass the same bounded lineage/carry-over snapshot that `create` will
      // persist so the basics-only draft respects continuity.
      lineageContext: buildLineagePayload(),
    } as Parameters<typeof synthesizePresetMutation.mutate>[0]);
  }

  /**
   * Rescue action for the misplaced-premise UX bug (2026-07-31 09:14:56
   * production BAD_REQUEST) — the genre field is only 100 chars and reads
   * naturally in Thai as "story direction", so a full premise regularly ends
   * up typed there instead of in the 2000-char premise box above. Moves that
   * text into `userPremise` and clears `genre`, never overwriting existing
   * premise text: if a premise is already present, the genre text is
   * appended after it instead of replacing it.
   */
  function handleMoveGenreToPremise() {
    const misplacedText = form.genre.trim();
    if (!misplacedText) return;
    setForm(prev => {
      const existingPremise = prev.userPremise.trim();
      const combined = existingPremise
        ? `${existingPremise}\n\n${misplacedText}`
        : misplacedText;
      return {
        ...prev,
        userPremise: clampToCreateSeriesLimit(combined, "userPremise") ?? "",
        genre: "",
      };
    });
    toast.success(
      lang === "th"
        ? "ย้ายข้อความไปยังช่องโจทย์เรื่องแล้ว"
        : "Moved the text into the premise field"
    );
  }

  // Stage 2.6 — the ONLY thing that varies per `createMode` is the step
  // LABELS; the id list/count never changes (see `resolveWizardSteps`'s own
  // doc comment). `steps` for `form.createMode === undefined` is the exact
  // same array reference as `wizardSteps` — every existing byte-identity
  // guarantee below (`stepComplete`, `isLast`, the stepper markup) is
  // therefore untouched for the original wizard.
  const steps = resolveWizardSteps(form.createMode);

  // All steps are always reachable (freely-navigable tabs) — this only drives
  // a per-step completion badge so the user can see what's filled vs. still
  // needs attention before creating the series.
  const stepComplete = useMemo(() => {
    return [
      form.title.trim().length > 0 && Number(form.targetEpisodeCount) > 0,
      form.mainPlot.trim().length > 0 || form.seasonArc.trim().length > 0,
      form.characters.trim().length > 0,
      form.visualBible.trim().length > 0,
      !form.productTieInEnabled || form.productName.trim().length > 0,
      true, // review tab has nothing of its own to "complete"
    ];
  }, [form]);

  // Hard requirement to actually create the series (title + Sub-episode count) —
  // this only gates the final Create action, never tab navigation. Stage 2.6
  // adds: a sequel/special-edition create MUST have a chosen parent series.
  const createValid =
    form.title.trim().length > 0 &&
    Number(form.targetEpisodeCount) > 0 &&
    (!form.createMode || Boolean(form.parentSeriesId));
  const createBlockedReason = !createValid
    ? form.createMode && !form.parentSeriesId
      ? pickCopy(lang, parentSeriesPickerCopy.required)
      : lang === "th"
        ? "กรุณากรอกชื่อซีรีย์และจำนวนตอนย่อยที่ถูกต้องในแท็บ 'ตั้งค่าพื้นฐาน'"
        : "Enter a series title and a valid Sub-episode count in the 'Basic setup' tab"
    : "";

  const isLast = stepIndex === steps.length - 1;

  // Stage 2.6 — folds the AI-proposed carry-over draft + the user's
  // per-character overrides into the exact `VerticalDramaSeriesLineage`
  // shape `create` persists. `undefined` whenever this isn't a lineage
  // create (original mode, or a lineage mode with no draft/parent yet —
  // `createValid` already blocks that latter case from ever reaching here
  // for the picker itself, but the carry-over draft is optional even for a
  // sequel: a user may create before proposing one).
  const buildLineagePayload = ():
    | VerticalDramaSeriesLineage
    | undefined => {
    if (!form.createMode || !form.parentSeriesId) return undefined;
    const parentSeriesIdNum = Number(form.parentSeriesId);
    const parentTitle = parentSeries?.title ?? "";
    if (form.createMode === "sequel") {
      const draft = carryOverMutation.data?.draft;
      return {
        contractVersion: 1,
        parentSeriesId: parentSeriesIdNum,
        parentTitle,
        parentEpisodeCount: carryOverMutation.data?.parentEpisodeCount,
        createMode: "sequel",
        seasonNumber: Number(form.seasonNumber) || undefined,
        priorSeasonSummary: parentSeries?.memory
          ? ((parentSeries.memory as Record<string, unknown>)
              .compactSummary as string | undefined)
          : undefined,
        carryOver: draft
          ? {
              contractVersion: 1,
              characters: resolveCarryOverCharacters(
                draft.characters,
                form.carryOverOverrides
              ),
              newCharacterSuggestions: draft.newCharacterSuggestions,
              newConflictDirections: draft.newConflictDirections,
              antagonistStrategy: draft.antagonistStrategy,
              carriedRelationships: draft.carriedRelationships,
              carriedThreads: draft.carriedThreads,
              premise: form.carryOverPremise.trim() || undefined,
            }
          : undefined,
      };
    }
    return {
      contractVersion: 1,
      parentSeriesId: parentSeriesIdNum,
      parentTitle,
      parentEpisodeCount: specialEditionMutation.data?.parentEpisodeCount,
      createMode: "special_edition",
    };
  };

  const handleCreate = () => {
    if (createMutation.isPending || generateStoryMutation.isPending) return;
    const resolvedGenre = resolveGenreAfterPresetDraft(
      form.genre,
      synthesizePresetMutation.data?.draft.category ?? "",
      form.title,
    );
    createMutation.mutate({
      title: form.title.trim(),
      locale: form.locale,
      genre: resolvedGenre || undefined,
      tone: form.tone.trim() || undefined,
      targetEpisodeCount: Number(form.targetEpisodeCount) || undefined,
      defaultEpisodeDurationSeconds:
        Number(form.targetDurationSeconds) || undefined,
      bible:
        // Widened (previously `characters`/`locations`-only input silently
        // dropped the whole `bible` object, losing both drafts): a user who
        // fills in ONLY the characters and/or locations textarea — nothing
        // else in this list — must still have that draft seeded at series
        // creation.
        form.logline ||
        form.mainPlot ||
        form.seasonArc ||
        form.visualBible ||
        form.characters.trim() ||
        form.locations.trim()
          ? {
              logline: form.logline,
              mainPlot: form.mainPlot,
              seasonArc: form.seasonArc,
              visualStyle: form.visualBible,
              cliffhangerStyle: form.cliffhangerStyle,
              charactersDraft: form.characters,
              characterProfiles: form.characterProfiles,
              locationsDraft: form.locations,
            }
          : undefined,
      // Stage 2.5 special edition — a special edition IS a product tie-in for
      // its entire runtime regardless of the (original-mode-only)
      // `productTieInEnabled` checkbox, so this branch is sent unconditionally
      // whenever `createMode === "special_edition"`, at the exact key path
      // `verticalDramaSeries.ts`'s `create` handler reads
      // (`rawProductTieIn.uploadedReferences`/`.storyFunctionChoice`/
      // `.marketplaceCaptureId`, matching `buildSpecialEditionProductTieInConfig`'s
      // own recognized-keys doc comment) — previously `form.uploadedReferences`
      // and `form.storyFunctionChoice` were collected in the UI but never sent,
      // silently dropping special-edition source 2 (uploaded images) and
      // source 3 (story-function choice) at submit. `productSource` is left
      // unset here on purpose — the server infers it (uploaded_reference >
      // marketplace > manual) from `uploadedReferences`/`marketplaceCaptureId`.
      // Original mode's own productTieIn payload (below) is unchanged.
      productTieIn:
        form.createMode === "special_edition"
          ? {
              enabled: true,
              productName: form.productName || undefined,
              productDescription: form.productDescription?.trim() || undefined,
              marketplaceCaptureId: form.productId || undefined,
              productImageUrl: form.productImageUrl || undefined,
              storyFunctionChoice: form.storyFunctionChoice,
              uploadedReferences: form.uploadedReferences,
              forbiddenClaims: form.forbiddenClaims
                ? form.forbiddenClaims
                    .split(",")
                    .map(s => s.trim())
                    .filter(Boolean)
                : [],
            }
          : form.productTieInEnabled
            ? {
                enabled: true,
                productName: form.productName || undefined,
                productId: form.productId || undefined,
                productSource: form.productId ? "marketplace" : "manual",
                forbiddenClaims: form.forbiddenClaims
                  ? form.forbiddenClaims
                      .split(",")
                      .map(s => s.trim())
                      .filter(Boolean)
                  : [],
              }
            : undefined,
      // Spec §8.2.2.A flow-through rule (section-15) — best-effort on the
      // server; a no-op when unset, invalid, or the preset has no
      // `visualIdentityJson`. See `applyPreset`/`applyPresetDraft` above.
      appliedPresetId: form.appliedPresetId,
      // Feature 132 §4.2 (F132A) — top-level sibling of `bible` (NOT nested
      // inside it), matching the router schema shape; sent unconditionally,
      // server decides whether to honor it (`verticalDramaUserPremise` flag).
      // TODO: server accepts this once verticalDramaSeries.ts's deferred
      // userPremise wiring lands (section-02 plan item 3).
      userPremise: form.userPremise.trim() || undefined,
      // Contract: `@shared/verticalDramaSeries/audienceAgeRating` — enum with
      // a default (`DEFAULT_AUDIENCE_AGE_RATING`), unlike the free-form
      // `userPremise` above this is always a defined value, so it is sent
      // directly (never `|| undefined`).
      audienceAgeRating: form.audienceAgeRating,
      // Manual LLM model pin (mirrors `VerticalDramaSettingsTab`'s
      // post-creation "Settings" field) — `null` (the untouched default) is
      // the server's "automatic" value, so leaving this picker on Automatic
      // sends the exact same `null` this payload sent before this field
      // existed (byte-identical automatic behavior). Mode-independent.
      defaultModelId: form.defaultModelId,
      lookLock: lookLockEnabled
        ? {
            mode: form.lookLockMode,
            ...(form.lookLockMode === "genre" && form.lookLockGenreKey
              ? { genreKey: form.lookLockGenreKey }
              : {}),
            ...(form.lookLockMode === "inherit_source" && form.aiMixVisualIdentity
              ? { candidateIdentity: form.aiMixVisualIdentity }
              : {}),
          }
        : undefined,
      // Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) — every
      // one of these 4 fields is `undefined` for the original wizard
      // (`form.createMode` starts and stays `undefined` unless the
      // lineage-gated mode toggle is used), which the router's own doc
      // comment says writes every matching `vertical_drama_series` column as
      // `NULL` — the structural "original mode unchanged" guarantee.
      parentSeriesId: form.createMode ? form.parentSeriesId : undefined,
      createMode: form.createMode,
      seasonNumber:
        form.createMode === "sequel"
          ? Number(form.seasonNumber) || undefined
          : undefined,
      lineage: buildLineagePayload(),
    } as Parameters<typeof createMutation.mutate>[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Desktop uses viewport-based widths so the wizard can use the available
          canvas instead of staying at the shared dialog's compact default. */}
      <DialogContent className="flex h-[92dvh] max-h-[96dvh] !w-[96vw] !max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:h-[90dvh] sm:min-h-[28rem] sm:min-w-[24rem] sm:resize md:!w-[94vw] md:!max-w-[94vw] lg:!w-[92vw] lg:!max-w-[92vw] xl:!w-[90vw] xl:!max-w-[90vw] 2xl:!w-[88vw] 2xl:!max-w-[120rem]">
        <div className="shrink-0 border-b p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {pickCopy(lang, verticalDramaCopy.createSeries)}
            </DialogTitle>
            <DialogDescription>
              {pickCopy(lang, verticalDramaCopy.planningOnly)}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper — every step is always clickable; the dot shows completion, not access. */}
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="wizard steps">
            {steps.map((step, i) => (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={i === stepIndex ? "step" : undefined}
                  onClick={() => setStepIndex(i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    i === stepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {i + 1}. {pickCopy(lang, step)}
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      stepComplete[i]
                        ? "bg-emerald-500"
                        : i === stepIndex
                          ? "bg-primary-foreground/60"
                          : "bg-amber-500"
                    )}
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 xl:p-7">
          <WizardStep
            stepId={steps[stepIndex]?.id ?? "basic"}
            lang={lang}
            form={form}
            set={set}
            presets={presets as GenrePreset[]}
            presetsLoading={presetsQuery.isLoading}
            presetSearch={presetSearch}
            onPresetSearchChange={setPresetSearch}
            presetCategories={presetCategories}
            mixPresetIds={mixPresetIds}
            mixCategories={mixCategories}
            mixBusinessContext={mixBusinessContext}
            onMixBusinessContextChange={setMixBusinessContext}
            mixPrimarySelectionId={mixPrimarySelectionId}
            onMixPrimarySelectionIdChange={setMixPrimarySelectionId}
            mixWeights={mixWeights}
            onMixWeightChange={setMixWeight}
            mixDraft={synthesizePresetMutation.data?.draft}
            mixDraftLoading={synthesizePresetMutation.isPending}
            mixDraftError={
              synthesizePresetMutation.error
                ? formatPresetSynthesisError(synthesizePresetMutation.error, lang)
                : undefined
            }
            onToggleMixPreset={toggleMixPreset}
            onToggleMixCategory={toggleMixCategory}
            onSynthesizePreset={handleSynthesizePreset}
            onApplyPresetDraft={applyPresetDraft}
            onApplyPreset={applyPreset}
            onMoveGenreToPremise={handleMoveGenreToPremise}
            products={products as MarketplaceProductOption[]}
            productsLoading={productsQuery.isLoading}
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
            lineageEnabled={lineageEnabled}
            lookLockEnabled={lookLockEnabled}
            lookLockHasInheritedSource={Boolean(
              form.parentSeriesId || (presetMixEnabled && form.appliedPresetId)
                || form.aiMixVisualIdentity
            )}
            onSetCreateMode={handleSetCreateMode}
            parentSeriesOptions={parentSeriesOptions}
            parentSeriesOptionsLoading={seriesListQuery.isLoading}
            onSelectParentSeries={handleSelectParentSeries}
            parentSeries={parentSeries}
            carryOverDraft={carryOverMutation.data?.draft}
            carryOverLoading={carryOverMutation.isPending}
            carryOverError={
              carryOverMutation.error?.message
                ? String(carryOverMutation.error.message)
                : undefined
            }
            onProposeCarryOver={handleProposeCarryOver}
            onCarryOverPremiseChange={value => set("carryOverPremise", value)}
            onCarryOverOverride={setCarryOverOverride}
            specialEditionDraft={specialEditionMutation.data?.draft}
            specialEditionLoading={specialEditionMutation.isPending}
            specialEditionError={
              specialEditionMutation.error?.message
                ? String(specialEditionMutation.error.message)
                : undefined
            }
            onProposeSpecialEditionBrief={handleProposeSpecialEditionBrief}
            onUploadReferenceFile={handleUploadReferenceFile}
            uploadPending={uploadMutation.isPending}
            parentMemoryCoverage={parentMemoryQuery.data?.coverage}
            planningModels={planningModels}
          />
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t p-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                disabled={
                  createMutation.isPending || generateStoryMutation.isPending
                }
              >
                {pickCopy(lang, verticalDramaCopy.back)}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLast && createBlockedReason && (
              <span className="text-xs text-destructive" role="note">
                {createBlockedReason}
              </span>
            )}
            {isLast ? (
              <Button
                onClick={handleCreate}
                disabled={
                  createMutation.isPending ||
                  generateStoryMutation.isPending ||
                  !createValid
                }
                className="gap-2"
              >
                {(createMutation.isPending ||
                  generateStoryMutation.isPending) && (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {createMutation.isPending
                  ? lang === "th"
                    ? "กำลังสร้างซีรีย์…"
                    : "Creating series…"
                  : generateStoryMutation.isPending
                    ? lang === "th"
                      ? "กำลังสร้างเนื้อเรื่องเต็ม (ใช้เครดิต)…"
                      : "Generating full story (uses credits)…"
                    : lang === "th"
                      ? "สร้างซีรีย์และเนื้อเรื่องเต็ม"
                      : "Create series & generate story"}
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setStepIndex(i => Math.min(steps.length - 1, i + 1))
                }
              >
                {lang === "th" ? "ถัดไป" : "Next"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GenrePresetCharacter {
  name: string;
  role: string;
  description: string;
  narrativeRole?: NarrativeRole;
  roleTier?: RoleTier;
  occupation?: string;
}

interface GenrePreset {
  id: string;
  title: string;
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: GenrePresetCharacter[];
  visualBible: string;
  scope: "global" | "private";
  /**
   * Structured visual identity (spec §8.2.2.A, section-15) — additive,
   * nullable column on the preset row. NOT YET returned by
   * `listGenrePresets` today (its `toGenrePresetDto` mapper only forwards
   * the legacy preset fields above) — this field is feature-detected
   * (rendered only when present) so the chip row activates automatically
   * once the list procedure starts including it, with zero further UI
   * changes required.
   */
  visualIdentityJson?: VerticalDramaPresetVisualIdentity | null;
}

interface SynthesizedGenrePresetDraftBase {
  title: string;
  /**
   * Stage 1 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
   * — 4-5 candidate SERIES titles; `title` above is always one of them.
   * Optional/additive on the server's Zod schema (`verticalDramaPresetSynthesis.ts`),
   * so an older response (or a model that omits it) still parses — this
   * client type mirrors that with `?`. Never fabricated client-side: absent
   * simply means no title picker renders (see `PresetSynthesisActionPanel`).
   */
  titleOptions?: string[];
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  creatorSummary?: {
    whatItIsAbout: string;
    protagonistAndGoal: string;
    conflictAndDiscovery: string;
    centralMystery: string;
    decisionNotes: string[];
  };
  characters: GenrePresetCharacter[];
  visualBible: string;
  /**
   * Stage 1 — 3-6 recurring locations (skill.md "Locations" section),
   * mirroring `characters`' minimal shape. Optional/additive, same
   * backward-compatibility contract as `titleOptions` above. `applyPresetDraft`
   * joins these into `form.locations` using the exact "name — description"
   * per-line convention the server's `parseLocationsDraft` already expects
   * (`server/routers/verticalDramaSeries.ts`) — never a new taxonomy invented
   * here.
   */
  locations?: Array<{ name: string; description: string }>;
  mixRecipe?: {
    primaryFlavor?: string;
    supportingFlavors?: string[];
    rationale?: string;
  };
  warnings?: Array<{ code: string; message: string }>;
}

interface SynthesizedGenrePresetDraftV1 extends SynthesizedGenrePresetDraftBase {
  contract_version: 1;
}

/**
 * Preset Mix v2 (spec §8.2.2.C, section-15, `verticalDramaSeriesPresetMixV2`)
 * — a pure SUPERSET of v1: every v1 field is still present, plus the blend
 * provenance report (`VerticalDramaBlendReportPanel` renders this) and,
 * when at least one selected preset carried a `visualIdentityJson`, the
 * deterministically-merged `visualIdentity`. The server decides whether v2
 * fields exist (tenant flag) — this wizard only needs to branch on
 * `contract_version` in the RESPONSE, never check the flag itself.
 */
interface SynthesizedGenrePresetDraftV2 extends SynthesizedGenrePresetDraftBase {
  contract_version: 2;
  blendReport: VerticalDramaBlendReport;
  visualIdentity?: VerticalDramaPresetVisualIdentity;
}

type SynthesizedGenrePresetDraft =
  | SynthesizedGenrePresetDraftV1
  | SynthesizedGenrePresetDraftV2;

function formatPresetSynthesisError(
  error: unknown,
  lang: "th" | "en",
): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const normalized = raw.toLowerCase();
  if (/credit|เครดิต|insufficient/.test(normalized)) {
    return lang === "th"
      ? "เครดิตไม่พอสำหรับการผสมเรื่อง — ตรวจเครดิตแล้วลองใหม่"
      : "Not enough credits to mix the story — check credits and try again.";
  }
  if (/timeout|timed out|network|upstream|rate limit|429|502|503|504/.test(normalized)) {
    return lang === "th"
      ? "การเชื่อมต่อบริการ AI ขัดข้องชั่วคราว — กดลองใหม่ได้โดยไม่ต้องรีเฟรชหน้า"
      : "The AI service is temporarily unavailable — retry without refreshing the page.";
  }
  if (/schema|json|validation|unprocessable|preset synthesis/.test(normalized)) {
    return lang === "th"
      ? "AI สร้าง draft ที่อ่านได้ไม่ครบ ระบบยังไม่ได้ใช้ draft นี้ — กดลองใหม่ได้"
      : "The AI draft was incomplete or unreadable. It was not applied — retry to generate a new draft.";
  }
  return lang === "th"
    ? "ผสมแนวเรื่องไม่สำเร็จ — กดลองใหม่ได้โดยไม่ต้องรีเฟรชหน้า"
    : "The story mix failed — retry without refreshing the page.";
}

interface MarketplaceProductOption {
  id: string;
  productName: string;
  imageUrl?: string | null;
  platform?: string | null;
  priceCurrent?: string | number | null;
  currency?: string | null;
}

/** One row of `verticalDramaSeries.list`'s output — the series picker's option shape (Stage 2.6). */
interface ParentSeriesOption {
  id: string;
  title: string;
  status: string;
  targetEpisodeCount: number;
}

/** `verticalDramaSeries.get`'s `series` field — only the subset this wizard reads. */
interface ParentSeriesDetail {
  title: string;
  genre: string | null;
  tone: string | null;
  bible: unknown;
  memory: unknown;
}

function WizardStep({
  stepId,
  lang,
  form,
  set,
  presets,
  presetsLoading,
  presetSearch,
  onPresetSearchChange,
  presetCategories,
  mixPresetIds,
  mixCategories,
  mixBusinessContext,
  onMixBusinessContextChange,
  mixPrimarySelectionId,
  onMixPrimarySelectionIdChange,
  mixWeights,
  onMixWeightChange,
  mixDraft,
  mixDraftLoading,
  mixDraftError,
  onToggleMixPreset,
  onToggleMixCategory,
  onSynthesizePreset,
  onApplyPresetDraft,
  onApplyPreset,
  onMoveGenreToPremise,
  products,
  productsLoading,
  productSearch,
  onProductSearchChange,
  lineageEnabled,
  lookLockEnabled,
  lookLockHasInheritedSource,
  onSetCreateMode,
  parentSeriesOptions,
  parentSeriesOptionsLoading,
  onSelectParentSeries,
  parentSeries,
  carryOverDraft,
  carryOverLoading,
  carryOverError,
  onProposeCarryOver,
  onCarryOverPremiseChange,
  onCarryOverOverride,
  specialEditionDraft,
  specialEditionLoading,
  specialEditionError,
  onProposeSpecialEditionBrief,
  onUploadReferenceFile,
  uploadPending,
  parentMemoryCoverage,
  planningModels,
}: {
  stepId: string;
  lang: "th" | "en";
  form: WizardState;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  presets: GenrePreset[];
  presetsLoading: boolean;
  presetSearch: string;
  onPresetSearchChange: (value: string) => void;
  presetCategories: string[];
  mixPresetIds: string[];
  mixCategories: string[];
  mixBusinessContext: string;
  onMixBusinessContextChange: (value: string) => void;
  mixPrimarySelectionId?: string;
  onMixPrimarySelectionIdChange: (value: string | undefined) => void;
  mixWeights: Record<string, VerticalDramaPresetMixWeight>;
  onMixWeightChange: (id: string, weight: VerticalDramaPresetMixWeight) => void;
  mixDraft?: SynthesizedGenrePresetDraft;
  mixDraftLoading: boolean;
  mixDraftError?: string;
  onToggleMixPreset: (id: string) => void;
  onToggleMixCategory: (category: string) => void;
  onSynthesizePreset: () => void;
  onApplyPresetDraft: (draft: SynthesizedGenrePresetDraft) => void;
  onApplyPreset: (preset: GenrePreset) => void;
  /** Misplaced-premise rescue (fix-create-series-premise-blend plan) — moves an oversized genre value into `userPremise` and clears genre. */
  onMoveGenreToPremise: () => void;
  products: MarketplaceProductOption[];
  productsLoading: boolean;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  /** Stage 2.6 — false hides ALL lineage UI below (mode toggle never renders), so `createMode` can never be set for a tenant without the flag. */
  lineageEnabled: boolean;
  lookLockEnabled: boolean;
  lookLockHasInheritedSource: boolean;
  onSetCreateMode: (mode: VerticalDramaSeriesCreateMode | undefined) => void;
  parentSeriesOptions: ParentSeriesOption[];
  parentSeriesOptionsLoading: boolean;
  onSelectParentSeries: (seriesId: string) => void;
  parentSeries?: ParentSeriesDetail;
  carryOverDraft?: VerticalDramaSeasonCarryOverDraft;
  carryOverLoading: boolean;
  carryOverError?: string;
  onProposeCarryOver: () => void;
  onCarryOverPremiseChange: (value: string) => void;
  onCarryOverOverride: (
    characterKey: string,
    patch: Partial<
      Pick<
        VerticalDramaCarryOverCharacterDecision,
        "availability" | "returnJustification" | "suggestedStateUpdate"
      >
    >
  ) => void;
  specialEditionDraft?: {
    storyShape: string;
    premise: string;
    charactersUsed: Array<{ characterKey: string; roleInSpecial: string }>;
    episodeBriefs: Array<{
      episodeNumber: number;
      logline: string;
      protagonistStake: string;
      pricePaid: string;
    }>;
    continuityNotes: string;
  };
  specialEditionLoading: boolean;
  specialEditionError?: string;
  onProposeSpecialEditionBrief: () => void;
  onUploadReferenceFile: (file: File) => void;
  uploadPending: boolean;
  parentMemoryCoverage?: {
    targetEpisodeCount: number;
    episodeRowCount: number;
    episodesWithRealScript: number;
    episodesWithMemory: number;
    episodesWithMemoryAndRealScript: number;
  };
  /** Manual LLM model pin at creation time (mirrors `VerticalDramaSettingsTab`'s query of the same name) — mode-independent. */
  planningModels: Array<{ modelId: string; label: string }>;
}) {
  const th = lang === "th";
  // Stage 2.6 — used by both the "basic" (genre) and "story" (tone) cases
  // below to lock the inherited fields, and by "characters"/"product"/
  // "review" to swap in the lineage-specific body.
  const isSequel = form.createMode === "sequel";
  const isSpecialEdition = form.createMode === "special_edition";
  const isLineageMode = isSequel || isSpecialEdition;
  const [acceptedCharacterSuggestions, setAcceptedCharacterSuggestions] =
    useState<Set<string>>(new Set());
  // Preset browser height: toggle between compact and tall; the list is also
  // user-draggable via CSS resize-y for anything in between.
  const [presetListExpanded, setPresetListExpanded] = useState(false);
  // Phase 2 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
  // — explicit up-front choice of which section is primary on step 1: the
  // premise textarea or the preset library. PURELY a presentation gate (see
  // `ModeSection` below, which renders the non-primary section inside a
  // native, collapsed-by-default `<details>` — same disclosure pattern
  // already used for "Blend details" further down in this file); it never
  // adds a wizard step and never touches `resolveWizardSteps`/`stepComplete`.
  // Declared here (not in `CreateSeriesWizard`) so it persists across step
  // navigation exactly like `presetListExpanded` above (`WizardStep` stays
  // mounted; only `stepId` changes), while remaining pure UI state that is
  // never sent to `create` and never clears `form.userPremise`/preset
  // selections when toggled. Defaults to `"premise"` — matches the
  // pre-existing shipped default (premise-first hero, presets already
  // labelled optional) and the plan's own stated default.
  const [seriesMode, setSeriesMode] = useState<"premise" | "preset">(
    "premise"
  );
  // vd-premise-first-wizard follow-up (discoverability fix) — the weight
  // sliders live inside `MixAndMatchPresetPanel` (the preset rail), but the
  // "Adjust weights" link inside a blend report can now render either there
  // OR up in the hero's `PresetSynthesisActionPanel` (see step 0 below,
  // depending on `hasUserPremise`). The ref/scroll trigger is lifted up here
  // so both possible render sites can reach the SAME sliders section.
  const weightsSectionRef = useRef<HTMLDivElement>(null);
  const scrollToWeights = () =>
    weightsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  switch (stepId) {
    case "basic": {
      // vd-premise-first-wizard plan (Phase 4.1) — the user's own story idea
      // is the SPINE, presets are supplements, never the reverse. This flag
      // drives both the hero premise field below and how the (now-optional,
      // now-narrow) preset library and its copy present themselves.
      const hasUserPremise = form.userPremise.trim().length > 0;
      const hasBasicSeed = Boolean(
        form.title.trim() ||
          form.genre.trim() ||
          form.tone.trim() ||
          mixCategories.length > 0 ||
          mixBusinessContext.trim() ||
          form.productName.trim() ||
          Number(form.targetEpisodeCount) > 0 ||
          form.audienceAgeRating ||
          (form.createMode && form.parentSeriesId)
      );
      return (
        <div className="grid gap-4">
          {/* Phase 2 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
              — explicit up-front mode choice, ahead of every other section
              in this step (including the lineage toggle below): the creator
              picks BEFORE any data entry whether their own premise or the
              preset library is primary. Presentation-only — `seriesMode`
              never gates `resolveWizardSteps`/`stepComplete` and never
              clears `form.userPremise` or the preset selections when
              switched (see `ModeSection` usages below). */}
          <div
            className="rounded-xl border bg-muted/20 p-4 shadow-sm"
            role="radiogroup"
            aria-label={
              th ? "เริ่มต้นสร้างซีรีย์ยังไง" : "How do you want to start"
            }
          >
            <p className="text-sm font-semibold">
              {th ? "เริ่มต้นสร้างซีรีย์ยังไง" : "How do you want to start"}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                role="radio"
                aria-checked={seriesMode === "premise"}
                data-testid="vd-mode-premise"
                onClick={() => setSeriesMode("premise")}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  seriesMode === "premise"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background hover:bg-accent"
                )}
              >
                <span className="block text-sm font-semibold">
                  {th ? "เขียนแนวเรื่องเอง" : "Write my own premise"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {th
                    ? "พิมพ์โจทย์เรื่องที่อยากได้ แล้วให้ AI เติมช่องอื่นให้ครบทุกแท็บ — preset ยังเลือกเสริมได้ ไม่บังคับ"
                    : "Type your story idea and let AI fill in every other tab — presets remain available as an optional extra"}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={seriesMode === "preset"}
                data-testid="vd-mode-preset"
                onClick={() => setSeriesMode("preset")}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  seriesMode === "preset"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background hover:bg-accent"
                )}
              >
                <span className="block text-sm font-semibold">
                  {th ? "เลือกจาก preset" : "Start from presets"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {th
                    ? "เลือก preset 1-5 แบบ — 1 แบบใช้ทันที, 2-5 แบบให้ AI ผสมกัน"
                    : "Pick 1-5 presets — 1 applies directly, 2-5 get AI-blended together"}
                </span>
              </button>
            </div>
          </div>

          {/* Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) —
              the 3-way create-mode toggle + parent-series picker lives at the
              TOP of the `basic` step body (never a new wizard step — see the
              plan's own reasoning on why: adding a step would renumber every
              other case). Entirely gone when the tenant flag is off, so the
              rest of this step (and every other step) is provably unchanged
              for every tenant without it. */}
          {lineageEnabled && (
            <div className="rounded-xl border bg-muted/20 p-4 shadow-sm">
              <p className="text-sm font-semibold">
                {pickCopy(lang, createModeToggleCopy.label)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pickCopy(lang, createModeToggleCopy.hint)}
              </p>
              <div
                className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3"
                role="group"
                aria-label={pickCopy(lang, createModeToggleCopy.label)}
              >
                {(
                  [
                    { mode: undefined, copy: createModeToggleCopy.original },
                    { mode: "sequel", copy: createModeToggleCopy.sequel },
                    {
                      mode: "special_edition",
                      copy: createModeToggleCopy.specialEdition,
                    },
                  ] as const
                ).map(option => {
                  const selected = form.createMode === option.mode;
                  return (
                    <button
                      key={option.mode ?? "original"}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSetCreateMode(option.mode)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background hover:bg-accent"
                      )}
                    >
                      {pickCopy(lang, option.copy)}
                    </button>
                  );
                })}
              </div>

              {isLineageMode && (
                <div className="mt-3 grid gap-3">
                  <Field
                    label={pickCopy(lang, parentSeriesPickerCopy.label)}
                    helperText={
                      !form.parentSeriesId
                        ? pickCopy(lang, parentSeriesPickerCopy.required)
                        : undefined
                    }
                  >
                    <Select
                      value={form.parentSeriesId ?? ""}
                      onValueChange={v => onSelectParentSeries(v)}
                    >
                      <SelectTrigger
                        aria-label={pickCopy(lang, parentSeriesPickerCopy.label)}
                      >
                        <SelectValue
                          placeholder={pickCopy(
                            lang,
                            parentSeriesPickerCopy.placeholder
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,24rem)]">
                        {parentSeriesOptionsLoading ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            {th ? "กำลังโหลด…" : "Loading…"}
                          </div>
                        ) : parentSeriesOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            {pickCopy(lang, parentSeriesPickerCopy.empty)}
                          </div>
                        ) : (
                          parentSeriesOptions.map(option => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </Field>

                  {isSequel && (
                    <Field label={pickCopy(lang, seasonNumberFieldCopy.label)}>
                      <Input
                        type="number"
                        min={2}
                        value={form.seasonNumber ?? ""}
                        onChange={e => set("seasonNumber", e.target.value)}
                      />
                    </Field>
                  )}

                  {isSpecialEdition && (
                    <p className="rounded-md border border-dashed bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
                      {pickCopy(
                        lang,
                        specialEditionEpisodeCountLockedHintCopy
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {lookLockEnabled ? (
            <SeriesLookLockPicker
              lang={lang}
              value={{
                mode: form.lookLockMode,
                genreKey: form.lookLockGenreKey,
              }}
              hasInheritedLook={lookLockHasInheritedSource}
              onChange={value => {
                set("lookLockMode", value.mode);
                set("lookLockGenreKey", value.genreKey);
              }}
            />
          ) : null}

          {/* Premise leads step 1 as a full-width hero input — everything
              below (presets, basic setup) builds on top of it, not the
              reverse (see plan.md "target behaviour" table). Phase 2 —
              demoted to a collapsed `ModeSection` (native `<details>`,
              collapsed by default) whenever `seriesMode === "preset"`, so
              the preset library reads as primary in that mode without
              deleting the premise+preset blend capability underneath. */}
          <ModeSection
            primary={seriesMode === "premise"}
            collapsedSummary={
              th
                ? "เพิ่มโจทย์เรื่องเสริม (ไม่บังคับ)"
                : "Add a bonus premise (optional)"
            }
            className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm"
          >
            <Field
              label={
                th
                  ? isSequel || isSpecialEdition
                    ? "โจทย์ภาคใหม่ที่อยากได้ (ทิศทางต่อจากเรื่องเดิม, ไม่บังคับ)"
                    : "โจทย์เรื่องที่อยากได้ (แกนเรื่องหลัก, ไม่บังคับ)"
                  : isSequel || isSpecialEdition
                    ? "New-installment premise — direction layered onto canon (optional)"
                    : "Story premise — your story's spine (optional)"
              }
              helperText={
                th
                  ? isSequel || isSpecialEdition
                    ? "ระบบจะยึดเรื่องเดิม ตัวละคร ความสัมพันธ์ และปมค้างเป็นแกนหลัก แล้วใช้โจทย์นี้กำหนดทิศทางของภาคใหม่ — ไม่สร้างเรื่องใหม่ที่ไม่เกี่ยวข้อง"
                    : "ถ้าระบุ ระบบจะใช้โจทย์ของคุณเป็นแกนเรื่องหลัก แล้วนำ preset ที่เลือกด้านล่าง (0–5 แบบ ไม่บังคับ) มาผสมเสริมความเข้มข้นและความร่วมสมัย — ไม่เลือก preset เลยก็ได้ ให้ AI สร้างจากโจทย์ล้วน ๆ"
                  : isSequel || isSpecialEdition
                    ? "The original story, cast, relationships, and open threads remain primary canon; this premise only directs the new installment."
                    : "If provided, the system uses your premise as the primary story spine and blends any preset(s) you choose below (0-5, optional) to intensify and add contemporary flavor — skip presets entirely and AI will build purely from your premise."
              }
            >
              <Textarea
                value={form.userPremise}
                onChange={e => {
                  // Hard length cap only while typing (no trim here — trimming
                  // on every keystroke would eat trailing spaces the user is
                  // still mid-word on, breaking normal typing). Full
                  // trim + word-boundary clamp runs on blur below.
                  const raw = e.target.value;
                  const limit = CREATE_SERIES_FIELD_LIMITS.userPremise;
                  set(
                    "userPremise",
                    raw.length > limit ? raw.slice(0, limit) : raw
                  );
                }}
                onBlur={e =>
                  set(
                    "userPremise",
                    clampToCreateSeriesLimit(e.target.value, "userPremise") ??
                      ""
                  )
                }
                rows={4}
                maxLength={CREATE_SERIES_FIELD_LIMITS.userPremise}
                placeholder={
                  th
                    ? "อยากได้เรื่องเกี่ยวกับอะไร แนวไหน เกิดที่ไหน ตัวเอกเป็นใคร ปมหลักคืออะไร — ระบุเท่าที่อยากกำหนด ที่เหลือให้ AI ช่วยเติม"
                    : "What is it about, which genre, where does it happen, who's the lead, what's the core conflict — specify as much as you want, AI fills the rest."
                }
              />
            </Field>

            {/* Discoverability fix (2026-07-17 follow-up to
                vd-premise-first-wizard) — the user reported that after typing
                a premise, there was no visible action: the single button that
                acts on it lived at the bottom of the (now-optional) preset
                rail, a panel the copy itself tells you to ignore. The primary
                CTA now renders directly under the textarea the moment a
                premise is present, so pressing it (and seeing what it did)
                never requires looking anywhere else. When there is no
                premise yet, this renders nothing — the CTA stays in the
                preset rail below, unchanged (see `MixAndMatchPresetPanel`'s
                `actionSection` prop), since that is legacy behavior nobody
                reported an issue with. Exactly one CTA renders at a time.
                Phase 2 — also gated on `seriesMode !== "preset"`: when the
                preset library is the chosen primary section, the CTA always
                renders in the (now-primary, always-open) rail instead — see
                the mirrored condition on `actionSection` below — so a CTA is
                never left stranded inside the now-collapsed premise
                section. */}
            {hasUserPremise && seriesMode !== "preset" && (
              <div className="mt-4 border-t border-primary/15 pt-4">
                <PresetSynthesisActionPanel
                  lang={lang}
                  presets={presets}
                  selectedPresetIds={mixPresetIds}
                  hasUserPremise={hasUserPremise}
                  hasBasicSeed={hasBasicSeed}
                  hasLineageSeed={Boolean(form.createMode && form.parentSeriesId)}
                  loading={mixDraftLoading}
                  errorMessage={mixDraftError}
                  draft={mixDraft}
                  currentTitle={form.title}
                  onSelectTitle={value => set("title", value)}
                  onGenerate={onSynthesizePreset}
                  onApplySinglePreset={onApplyPreset}
                  onApplyDraft={onApplyPresetDraft}
                  onAdjustWeights={scrollToWeights}
                  emphasize
                />
              </div>
            )}
          </ModeSection>

          {/* Below the premise: basic setup (wide, primary data-entry column)
              is now on the LEFT where the preset library used to be, and the
              preset library (narrow, clearly-optional column) is on the
              RIGHT — inverted from the old layout, which taught the opposite
              mental model (plan.md root-cause item 4). */}
          <div className="grid min-h-full gap-4 lg:grid-cols-[minmax(0,2.35fr)_minmax(22rem,0.85fr)] lg:items-start">
            <div className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-4">
                <p className="text-sm font-semibold">
                  {th ? "ข้อมูลพื้นฐาน" : "Basic setup"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {th
                    ? "โจทย์ด้านบนคือแกนเรื่องหลัก กรอกรายละเอียดสำคัญของซีรีย์เพิ่มเติมได้ที่นี่"
                    : "The premise above is your story's spine — fill in the series' key details here."}
                </p>
              </div>
              <div className="grid gap-4">
                {/* Information-architecture follow-up (2026-07-17) — these
                    are REAL user settings `applyPresetDraft` (:413-420) never
                    touches (verified against its field list: title only when
                    blank, genre, logline, mainPlot, seasonArc, tone,
                    cliffhangerStyle, characters — never targetEpisodeCount,
                    audienceAgeRating, locale, or targetDurationSeconds).
                    They stay as plain, un-demoted inputs. */}
                <Field
                  label={th ? "ชื่อซีรีย์ *" : "Series title *"}
                  helperText={
                    th
                      ? "ถ้าเว้นว่างไว้ AI จะตั้งชื่อให้จากผลลัพธ์ที่สร้าง — ต้องมีชื่อก่อนสร้างซีรีย์จริงในขั้นตอนสุดท้าย"
                      : "Leave blank and AI will name it from the generated draft — a title is still required before the final Create step."
                  }
                >
                  <Input
                    value={form.title}
                    onChange={e => set("title", e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field
                  label={
                    th
                      ? "จำนวนตอนย่อย (Sub-episode) ในโครงสร้างเรื่อง"
                      : "Planned Sub-episodes in story structure"
                  }
                  helperText={
                    th
                      ? "ใช้กำหนดจำนวนตอนย่อยสำหรับวางโครงเรื่องและผลิตวิดีโอสั้น ไม่ใช่จำนวน Public EP ที่เผยแพร่จริง Public EP จะถูกรวมจากตอนย่อยภายหลัง"
                      : "Sets the number of Sub-episodes used for story planning and short-video production. This is not the number of Public Episodes; Public Episodes are grouped later."
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    // Stage 2.5 — a special edition is hard-capped at 1-2
                    // sub-episodes (`proposeSpecialEditionBrief`'s own zod
                    // input enforces the same range server-side); the `max`
                    // attribute is purely a UI nudge, never the enforcement
                    // itself, same convention as every other numeric field in
                    // this wizard.
                    max={isSpecialEdition ? 2 : undefined}
                    value={form.targetEpisodeCount}
                    onChange={e => {
                      if (!isSpecialEdition) {
                        set("targetEpisodeCount", e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      const parsed = Number(raw);
                      if (raw === "" || !Number.isFinite(parsed)) {
                        set("targetEpisodeCount", raw);
                        return;
                      }
                      set(
                        "targetEpisodeCount",
                        String(Math.min(2, Math.max(1, parsed)))
                      );
                    }}
                  />
                </Field>
                <Field
                  label={th ? "อายุผู้ชม" : "Audience age"}
                  helperText={
                    th
                      ? "มีผลต่อความเหมาะสมของเนื้อหาที่ระบบสร้าง (ค่าเริ่มต้น 18+)"
                      : "Shapes how mature the generated content is (default 18+)"
                  }
                >
                  <Select
                    value={form.audienceAgeRating}
                    onValueChange={v =>
                      set("audienceAgeRating", v as AudienceAgeRating)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(60vh,24rem)]">
                      {AUDIENCE_AGE_RATINGS.map(r => (
                        <SelectItem key={r} value={r}>
                          {AUDIENCE_AGE_RATING_LABELS[r][th ? "th" : "en"]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {/* Manual LLM model pin at creation time — mirrors
                    `VerticalDramaSettingsTab`'s post-creation "Settings"
                    field, same copy/sentinel convention. Mode-independent:
                    rendered for every `createMode` (new / sequel / special
                    edition), never gated by `isLineageMode`. */}
                <Field
                  label={pickCopy(lang, defaultLlmModelFieldCopy.label)}
                  helperText={pickCopy(lang, defaultLlmModelFieldCopy.helper)}
                >
                  <Select
                    value={form.defaultModelId ?? AUTOMATIC_LLM_MODEL_VALUE}
                    onValueChange={v =>
                      set(
                        "defaultModelId",
                        v === AUTOMATIC_LLM_MODEL_VALUE ? null : v
                      )
                    }
                  >
                    <SelectTrigger data-testid="vd-wizard-default-llm-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(60vh,24rem)]">
                      <SelectItem value={AUTOMATIC_LLM_MODEL_VALUE}>
                        {pickCopy(lang, defaultLlmModelFieldCopy.automatic)}
                      </SelectItem>
                      {planningModels.map(model => (
                        <SelectItem key={model.modelId} value={model.modelId}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Field label={th ? "ภาษา" : "Language"}>
                    <Select
                      value={form.locale}
                      onValueChange={v =>
                        set("locale", v as VerticalDramaSeriesLocale)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,24rem)]">
                        {VERTICAL_DRAMA_SERIES_LOCALES.map(code => (
                          <SelectItem key={code} value={code}>
                            {VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[code]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label={
                      th ? "ความยาวต่อตอน (วินาที)" : "Target duration (sec)"
                    }
                  >
                    <Input
                      type="number"
                      min={1}
                      value={form.targetDurationSeconds}
                      onChange={e =>
                        set("targetDurationSeconds", e.target.value)
                      }
                    />
                  </Field>
                </div>

                {/* Information-architecture follow-up (2026-07-17) — the user
                    reported confusion: "ทำไมมีทั้งโจทย์ที่อยากได้และเรื่องย่อ
                    ในเมื่อบอกโจทย์ไประบบต้องสร้างเรื่องย่อให้เอง" (why is
                    there both a premise AND a logline box, if the premise
                    already tells the system what to generate). `genre` and
                    `logline` ARE synthesis OUTPUTS (`applyPresetDraft`
                    :413-420 writes both), not inputs the user is expected to
                    hand-fill before generating — presenting them as plain
                    blank required-looking inputs directly under the premise
                    box reads as "please fill this in too". Visually
                    demoted (dashed border, muted background, explicit
                    "AI output" framing) so they read as editable OUTPUT, not
                    a second thing to fill in — never hidden, always fully
                    editable, same state keys/values as before (presentation
                    only, no `create`/`CREATE_SERIES_FIELD_LIMITS` change). */}
                <div className="grid gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <Wand2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {th
                          ? "ผลลัพธ์จาก AI — แก้ไขได้เสมอ"
                          : "AI-generated output — always editable"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {th
                          ? "สองช่องนี้ถูกเติมอัตโนมัติจากโจทย์ด้านบน (หรือ preset ที่เลือก) เมื่อกด \"ใช้ draft นี้\" — ไม่ต้องกรอกเองก็ได้ แต่แก้ไขทับได้ตลอดถ้าต้องการกำหนดเอง"
                          : "These two fields are auto-filled from your premise above (or the chosen preset) once you apply a draft — you don't need to fill them yourself, but you can always override them."}
                      </p>
                    </div>
                  </div>
                  <Field
                    label={th ? "แนวเรื่อง" : "Genre"}
                    helperText={
                      // Stage 2.6 — genre is inherited from the parent series
                      // for BOTH lineage modes and cannot be changed here
                      // ("ชื่อเรื่องตั้งไปแล้ว เปลี่ยนแนวเรื่องไม่ได้", the
                      // owner's own words in the plan's Context section).
                      isLineageMode
                        ? pickCopy(lang, genreLockedHintCopy)
                        : form.genre.trim()
                          ? undefined
                          : th
                            ? "ว่างไว้ก็ได้ — AI จะเติมให้"
                            : "Leave blank — AI will fill this in"
                    }
                  >
                    <Input
                      value={form.genre}
                      onChange={e => set("genre", e.target.value)}
                      disabled={isLineageMode}
                      placeholder={
                        th
                          ? "เว้นว่างไว้ให้ AI เติม หรือระบุเองที่นี่"
                          : "Leave blank for AI, or set it yourself"
                      }
                    />
                  </Field>
                  {/* Misplaced-premise rescue (2026-07-31 09:14:56 production
                      BAD_REQUEST) — "แนวเรื่อง" reads naturally in Thai as
                      "story direction", so a full story premise regularly
                      lands here instead of in the 2000-char premise box
                      above (which is easy to scroll past). Genre is capped
                      at 100 chars server-side; intentionally NO `maxLength`
                      on the `<Input>` above — silently truncating keystrokes
                      is what hid this bug from the user in the first place.
                      Instead: let them type, then offer a one-click move
                      once the text is clearly too long to be a genre label. */}
                  {!isLineageMode &&
                    form.genre.trim().length >
                      CREATE_SERIES_FIELD_LIMITS.genre && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                        <AlertCircle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                        <div className="flex-1 space-y-1.5">
                          <p className="text-[11px] text-amber-900 dark:text-amber-200">
                            {th
                              ? `ข้อความนี้ยาว ${form.genre.trim().length} ตัวอักษร — ดูเหมือนโจทย์เรื่อง ไม่ใช่แนวเรื่อง (สูงสุด ${CREATE_SERIES_FIELD_LIMITS.genre} ตัวอักษร) ลองย้ายไปที่ช่อง "โจทย์เรื่องที่อยากได้" ด้านบนแทน — ระบบจะตัดข้อความส่วนเกินก่อนส่งให้ AI มิฉะนั้น`
                              : `This text is ${form.genre.trim().length} characters — it looks like a story premise, not a genre label (max ${CREATE_SERIES_FIELD_LIMITS.genre} chars). Move it to the "Story premise" field above instead — otherwise the extra text is cut off before being sent to AI.`}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[11px]"
                            onClick={onMoveGenreToPremise}
                          >
                            {th
                              ? "ย้ายข้อความนี้ไปที่โจทย์เรื่อง"
                              : "Move this text to the premise field"}
                          </Button>
                        </div>
                      </div>
                    )}
                  <Field
                    label={th ? "เรื่องย่อ (logline)" : "Logline"}
                    helperText={
                      form.logline.trim()
                        ? undefined
                        : th
                          ? "ว่างไว้ก็ได้ — AI จะเขียนเรื่องย่อให้จากโจทย์ด้านบน"
                          : "Leave blank — AI will write this from your premise above"
                    }
                  >
                    <Textarea
                      value={form.logline}
                      onChange={e => set("logline", e.target.value)}
                      rows={3}
                      placeholder={
                        th
                          ? "เว้นว่างไว้ให้ AI เขียนให้ หรือเขียนเองที่นี่"
                          : "Leave blank for AI to write, or write it yourself"
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* Phase 2 — demoted to a collapsed `ModeSection` whenever
                `seriesMode === "premise"` (the default), mirroring the
                premise hero's own demotion when `seriesMode === "preset"`
                above. */}
            <ModeSection
              primary={seriesMode === "preset"}
              collapsedSummary={
                th
                  ? "เพิ่ม preset เสริมรสชาติ (ไม่บังคับ)"
                  : "Add optional presets"
              }
              className="flex min-h-[26rem] flex-col rounded-xl border bg-muted/20 p-4 shadow-sm xl:min-h-[calc(90dvh-22rem)]"
            >
              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    <Sparkles
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    {th ? "คลัง Preset แนวเรื่อง" : "Story preset library"}
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px] font-normal leading-4 text-muted-foreground"
                    >
                      {th
                        ? "เสริมให้สมบูรณ์ (ไม่บังคับ)"
                        : "Optional — adds flavor"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {hasUserPremise
                      ? th
                        ? "ไม่เลือกเลยก็ได้ — AI จะสร้างเรื่องจากโจทย์ของคุณด้านบน หรือเลือก preset เพื่อเพิ่มรสชาติ"
                        : "Skip this entirely — AI builds from your premise above, or choose presets to add flavor."
                      : pickCopy(
                          lang,
                          createSeriesNoSeedActionCopy.optionalPresetHint
                        )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => setPresetListExpanded(v => !v)}
                  aria-expanded={presetListExpanded}
                >
                  {presetListExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {presetListExpanded
                    ? th
                      ? "ย่อรายการ"
                      : "Collapse"
                    : th
                      ? "ขยายรายการ"
                      : "Expand"}
                </Button>
              </div>
              <MixAndMatchPresetPanel
                lang={lang}
                presets={presets}
                presetsLoading={presetsLoading}
                presetSearch={presetSearch}
                onPresetSearchChange={onPresetSearchChange}
                categories={presetCategories}
                selectedPresetIds={mixPresetIds}
                selectedCategories={mixCategories}
                businessContext={mixBusinessContext}
                onBusinessContextChange={onMixBusinessContextChange}
                primarySelectionId={mixPrimarySelectionId}
                onPrimarySelectionIdChange={onMixPrimarySelectionIdChange}
                weights={mixWeights}
                onWeightChange={onMixWeightChange}
                onTogglePreset={onToggleMixPreset}
                onToggleCategory={onToggleMixCategory}
                expanded={presetListExpanded}
                // Feature 132 §4.1 (F132A) — also now drives which primary CTA
                // and copy render inside the panel (see
                // `resolveCreateSeriesPresetAction`), not just the badge.
                hasUserPremise={hasUserPremise}
                weightsSectionRef={weightsSectionRef}
                // Discoverability fix — with a premise present the primary
                // CTA (+ its loading/error/draft result) already rendered in
                // the hero above (see `PresetSynthesisActionPanel` usage
                // there); rendering it again here would be a second,
                // competing button firing the same mutation. Only render it
                // in the rail for the unchanged no-premise legacy flow.
                // Phase 2 — also renders here whenever `seriesMode ===
                // "preset"` (mirrors the hero's own gate above), so the CTA
                // always lives in whichever section is currently primary and
                // open, never inside the collapsed one.
                actionSection={
                  hasUserPremise && seriesMode !== "preset" ? null : (
                    <PresetSynthesisActionPanel
                      lang={lang}
                      presets={presets}
                      selectedPresetIds={mixPresetIds}
                      hasUserPremise={hasUserPremise}
                      hasBasicSeed={hasBasicSeed}
                      hasLineageSeed={Boolean(form.createMode && form.parentSeriesId)}
                      loading={mixDraftLoading}
                      errorMessage={mixDraftError}
                      draft={mixDraft}
                      currentTitle={form.title}
                      onSelectTitle={value => set("title", value)}
                      onGenerate={onSynthesizePreset}
                      onApplySinglePreset={onApplyPreset}
                      onApplyDraft={onApplyPresetDraft}
                      onAdjustWeights={scrollToWeights}
                    />
                  )
                }
              />
            </ModeSection>
          </div>
        </div>
      );
    }
    case "story": {
      // Stage 2.6 — a special edition replaces this step entirely (per the
      // plan's per-mode-step table: "story: แทนที่ — จะรีวิว/แนะนำอะไร"). A
      // sequel keeps every existing field (tone additionally locked) and
      // appends the AI's `newConflictDirections`/`antagonistStrategy` once
      // proposed from the Characters step.
      if (isSpecialEdition) {
        return (
          <div className="grid gap-4">
            <Field label={pickCopy(lang, specialEditionCopy.storyFunctionLabel)}>
              <div className="grid gap-1.5" role="radiogroup">
                {(
                  [
                    ["review", specialEditionCopy.storyFunctionReview],
                    ["tie_in_solution", specialEditionCopy.storyFunctionTieIn],
                  ] as const
                ).map(([value, copy]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.storyFunctionChoice === value}
                    onClick={() => set("storyFunctionChoice", value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                      form.storyFunctionChoice === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    {pickCopy(lang, copy)}
                  </button>
                ))}
              </div>
            </Field>

            <div>
              <Button
                type="button"
                onClick={onProposeSpecialEditionBrief}
                disabled={
                  specialEditionLoading ||
                  !form.parentSeriesId ||
                  !form.storyFunctionChoice
                }
                className="gap-2"
              >
                {specialEditionLoading && (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {specialEditionDraft
                  ? pickCopy(lang, specialEditionCopy.regenerateBriefCta)
                  : pickCopy(lang, specialEditionCopy.generateBriefCta)}
              </Button>
            </div>

            {specialEditionError && (
              <p role="alert" className="text-xs text-destructive">
                {specialEditionError}
              </p>
            )}

            {specialEditionDraft && (
              <div className="grid gap-2 rounded-md border bg-background p-3 text-xs">
                <p className="font-medium">{specialEditionDraft.premise}</p>
                <p className="text-muted-foreground">
                  {specialEditionDraft.continuityNotes}
                </p>
              </div>
            )}

            <Field
              label={pickCopy(lang, specialEditionCopy.suggestedPremiseLabel)}
            >
              <Textarea
                value={form.userPremise}
                onChange={e => set("userPremise", e.target.value)}
                rows={5}
              />
            </Field>
          </div>
        );
      }
      return (
        <div className="grid gap-4">
          <Field label={th ? "โครงเรื่องหลัก" : "Main plot"}>
            <Textarea
              value={form.mainPlot}
              onChange={e => set("mainPlot", e.target.value)}
              rows={3}
            />
          </Field>
          <Field label={th ? "โครงซีซัน" : "Season arc"}>
            <Textarea
              value={form.seasonArc}
              onChange={e => set("seasonArc", e.target.value)}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={th ? "โทน" : "Tone"}
              helperText={isSequel ? pickCopy(lang, toneLockedHintCopy) : undefined}
            >
              <Input
                value={form.tone}
                onChange={e => set("tone", e.target.value)}
                disabled={isSequel}
              />
            </Field>
            <Field
              label={th ? "สไตล์ตอนจบค้าง (cliffhanger)" : "Cliffhanger style"}
            >
              <Input
                value={form.cliffhangerStyle}
                onChange={e => set("cliffhangerStyle", e.target.value)}
              />
            </Field>
          </div>

          {isSequel && carryOverDraft && (
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
              <div>
                <p className="text-xs font-semibold">
                  {pickCopy(lang, carryOverCopy.newConflictDirectionsTitle)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {carryOverDraft.newConflictDirections.map((direction, i) => (
                    <button
                      key={`${i}-${direction}`}
                      type="button"
                      onClick={() =>
                        set(
                          "mainPlot",
                          form.mainPlot.trim()
                            ? `${form.mainPlot}\n${direction}`
                            : direction
                        )
                      }
                      className="rounded-full border bg-background px-2.5 py-1 text-left text-[11px] hover:border-primary hover:bg-accent"
                    >
                      {direction}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold">
                  {pickCopy(lang, carryOverCopy.antagonistStrategyTitle)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {carryOverDraft.antagonistStrategy}
                </p>
              </div>
            </div>
          )}
          {isSequel && !carryOverDraft && (
            <p className="text-xs text-muted-foreground">
              {th
                ? 'ไปที่แท็บ "ตัวละคร" เพื่อให้ AI เสนอแนวทางปมใหม่ก่อน'
                : 'Go to the "Characters" tab to have AI propose new conflict directions first.'}
            </p>
          )}
        </div>
      );
    }
    case "characters": {
      // Stage 2.6 — special edition: the ENTIRE parent cast carries over
      // automatically (server-side clone-on-create, Stage 2.3); nothing to
      // choose here (per the plan's table: "characters: ซ่อน (ยกทั้ง cast)").
      if (isSpecialEdition) {
        return (
          <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            {th
              ? "ตัวละครทั้งหมดจากซีรีส์ต้นฉบับจะถูกยกมาใช้ในภาคพิเศษนี้โดยอัตโนมัติ — ไม่ต้องเลือกที่นี่"
              : "The entire cast from the parent series carries over into this special edition automatically — nothing to choose here."}
          </div>
        );
      }

      // Sequel: the AI-proposed carry-over grid (Stage 2.2/2.3).
      if (isSequel) {
        return (
          <div className="grid gap-4">
            <Field
              label={
                th
                  ? "โจทย์ภาคใหม่ที่อยากได้ (ไม่บังคับ)"
                  : "What you want for the new season (optional)"
              }
            >
              <Textarea
                value={form.carryOverPremise}
                onChange={e => onCarryOverPremiseChange(e.target.value)}
                rows={2}
              />
            </Field>
            <div>
              <Button
                type="button"
                onClick={onProposeCarryOver}
                disabled={carryOverLoading || !form.parentSeriesId}
                className="gap-2"
              >
                {carryOverLoading && (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {carryOverDraft
                  ? pickCopy(lang, carryOverCopy.regenerateCta)
                  : pickCopy(lang, carryOverCopy.proposeCta)}
              </Button>
            </div>

            {carryOverError && (
              <p role="alert" className="text-xs text-destructive">
                {carryOverError}
              </p>
            )}

            {carryOverDraft && (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {carryOverDraft.characters.map(character => {
                    const override = form.carryOverOverrides[character.characterKey];
                    const availability =
                      override?.availability ?? character.availability;
                    return (
                      <div
                        key={character.characterKey}
                        data-testid={`vd-carryover-character-${character.characterKey}`}
                        className="grid gap-1.5 rounded-md border bg-background p-2.5 text-xs"
                      >
                        <p className="font-medium">{character.name}</p>
                        <p className="text-muted-foreground">
                          {pickCopy(lang, carryOverCopy.postFinaleStatusLabel)}:{" "}
                          {character.postFinaleStatus}
                        </p>
                        <Select
                          value={availability}
                          onValueChange={v =>
                            onCarryOverOverride(character.characterKey, {
                              availability: v as VerticalDramaCarryOverAvailability,
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={pickCopy(
                              lang,
                              carryOverCopy.availabilityLabel
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES.map(
                              value => (
                                <SelectItem key={value} value={value}>
                                  {pickCopy(
                                    lang,
                                    carryOverAvailabilityCopy[value]
                                  )}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        {availability === "returns_with_explanation" && (
                          <Input
                            aria-label={pickCopy(
                              lang,
                              carryOverCopy.returnJustificationLabel
                            )}
                            value={
                              override?.returnJustification ??
                              character.returnJustification ??
                              ""
                            }
                            onChange={e =>
                              onCarryOverOverride(character.characterKey, {
                                returnJustification: e.target.value,
                              })
                            }
                          />
                        )}
                        <Textarea
                          aria-label={pickCopy(
                            lang,
                            carryOverCopy.suggestedStateUpdateLabel
                          )}
                          value={
                            override?.suggestedStateUpdate ??
                            character.suggestedStateUpdate ??
                            ""
                          }
                          onChange={e =>
                            onCarryOverOverride(character.characterKey, {
                              suggestedStateUpdate: e.target.value,
                            })
                          }
                          rows={2}
                        />
                      </div>
                    );
                  })}
                </div>

                {carryOverDraft.newCharacterSuggestions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold">
                      {pickCopy(lang, carryOverCopy.newCharacterSuggestionsTitle)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {carryOverDraft.newCharacterSuggestions.map(
                        (suggestion, i) => {
                          const accepted =
                            acceptedCharacterSuggestions.has(suggestion);
                          return (
                            <button
                              key={`${i}-${suggestion}`}
                              type="button"
                              disabled={accepted}
                              onClick={() => {
                                set(
                                  "characters",
                                  form.characters.trim()
                                    ? `${form.characters}\n${suggestion}`
                                    : suggestion
                                );
                                setAcceptedCharacterSuggestions(
                                  prev => new Set(prev).add(suggestion)
                                );
                              }}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px]",
                                accepted
                                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
                                  : "bg-background hover:border-primary hover:bg-accent"
                              )}
                            >
                              {suggestion}{" "}
                              {accepted
                                ? `— ${pickCopy(lang, carryOverCopy.addedSuggestion)}`
                                : `— ${pickCopy(lang, carryOverCopy.addSuggestionCta)}`}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {carryOverDraft.carriedRelationships.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold">
                      {pickCopy(lang, carryOverCopy.carriedRelationshipsTitle)}
                    </p>
                    <div className="mt-1.5 grid gap-1.5">
                      {carryOverDraft.carriedRelationships.map(
                        (relationship: VdRelationshipState, i: number) => (
                          <div
                            key={`${relationship.pair.join("-")}-${i}`}
                            className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs"
                          >
                            <span className="font-medium">
                              {relationship.pair.join(" ↔ ")}
                            </span>
                            <span className="text-muted-foreground">
                              {relationship.status}
                            </span>
                            <DisclosureBadge
                              disclosure={relationship.disclosure}
                              lang={lang}
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {carryOverDraft.carriedThreads.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold">
                      {pickCopy(lang, carryOverCopy.carriedThreadsTitle)}
                    </p>
                    <div className="mt-1.5 grid gap-1.5">
                      {carryOverDraft.carriedThreads.map(
                        (thread: VdOpenThread) => (
                          <div
                            key={thread.threadId}
                            className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs"
                          >
                            <Badge variant="outline" className="shrink-0">
                              {pickCopy(lang, threadClassCopy[thread.threadClass])}
                            </Badge>
                            <span>{thread.description}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      return (
        <div className="grid gap-4">
          <Field
            label={
              th
                ? "ตัวละคร / บทบาท / ความสัมพันธ์ (หนึ่งบรรทัดต่อหนึ่งตัว)"
                : "Characters / roles / relationships (one per line)"
            }
          >
            <Textarea
              value={form.characters}
              onChange={e => {
                set("characters", e.target.value);
                // Any free-text edit invalidates the structured preset
                // alignment; the server will normalize explicit role words
                // from the edited draft and mark ambiguous rows for review.
                set("characterProfiles", undefined);
              }}
              rows={6}
            />
            {/* F132F (spec 132 §7.3, added 2026-07-09) — this freeform textarea
                stays exactly as-is pre-generation; detailed voice/personality
                profiles are generated automatically afterward and editable in
                the character stock panel, not here. */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {th
                ? 'โปรไฟล์เสียงพูด/บุคลิกโดยละเอียดของแต่ละตัวละครจะถูกสร้างอัตโนมัติหลังจากสร้างซีรีส์ และแก้ไขได้ภายหลังในแท็บ "ตัวละคร"'
                : "Detailed voice/personality profiles for each character are generated automatically after the series is created, and can be edited afterward in the Characters tab."}
            </p>
          </Field>
          <Field
            label={
              th
                ? "สถานที่ / ฉากหลัก (หนึ่งบรรทัดต่อหนึ่งที่)"
                : "Locations / settings (one per line)"
            }
          >
            <Textarea
              value={form.locations}
              onChange={e => set("locations", e.target.value)}
              rows={6}
            />
            {/* Location Visual Bible wizard seed (dedicated series tab
                companion) — same "freeform now, refined later" convention as
                the characters field above: this draft is bulk-seeded into the
                durable location roster at series creation, and is editable
                afterward in the Locations/"ฉาก" tab. */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {th
                ? 'เช่น "ร้านสะดวกซื้อ — ร้านเล็กๆ ริมถนน มีชั้นวางขนม" — ภาพอ้างอิงของแต่ละสถานที่จะสร้างและแก้ไขได้ภายหลังในแท็บ "ฉาก"'
                : 'e.g. "Convenience store — a small corner shop with snack shelves" — reference images for each location can be generated and edited afterward in the Locations tab.'}
            </p>
          </Field>
        </div>
      );
    }
    case "bible":
      return (
        <Field
          label={
            th
              ? "วิชวลไบเบิล / สไตล์ภาพ (ร่าง)"
              : "Visual bible / style notes (draft)"
          }
        >
          <Textarea
            value={form.visualBible}
            onChange={e => set("visualBible", e.target.value)}
            rows={6}
          />
        </Field>
      );
    case "product": {
      return (
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.productTieInEnabled}
              onChange={e => set("productTieInEnabled", e.target.checked)}
            />
            {th
              ? "เปิดใช้สินค้าผูกเรื่อง (Product tie-in)"
              : "Enable product tie-in"}
          </label>
          {form.productTieInEnabled && (
            <>
              {form.productId ? (
                <div className="flex items-center gap-3 rounded-md border bg-background p-2.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {form.productImageUrl ? (
                      <img
                        src={form.productImageUrl}
                        alt={form.productName || "Product"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {form.productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {th
                        ? "สินค้าจากคลังสินค้า"
                        : "Linked from saved products"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      set("productId", undefined);
                      set("productImageUrl", undefined);
                    }}
                    aria-label={
                      th ? "ยกเลิกการเลือกสินค้า" : "Clear selected product"
                    }
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="relative mb-2">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={productSearch}
                      onChange={e => onProductSearchChange(e.target.value)}
                      placeholder={
                        th
                          ? "ค้นหาสินค้าที่บันทึกไว้..."
                          : "Search saved products..."
                      }
                      className="pl-9"
                    />
                  </div>
                  {productsLoading ? (
                    <p className="text-xs text-muted-foreground">
                      {th ? "กำลังโหลด…" : "Loading…"}
                    </p>
                  ) : products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {th
                        ? "ไม่พบสินค้าที่บันทึกไว้"
                        : "No saved products found"}
                    </p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {products.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            set("productId", product.id);
                            set("productName", product.productName);
                            set(
                              "productImageUrl",
                              product.imageUrl ?? undefined
                            );
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-md border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.productName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon
                                className="h-4 w-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {product.productName}
                            </p>
                            <p className="mt-0.5 truncate text-muted-foreground">
                              {[product.priceCurrent, product.currency]
                                .filter(Boolean)
                                .join(" ") || "-"}
                              {product.platform ? ` · ${product.platform}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Field
                label={
                  th
                    ? "หรือกรอกชื่อสินค้าเอง"
                    : "Or enter a product name manually"
                }
              >
                <Input
                  value={form.productName}
                  onChange={e => set("productName", e.target.value)}
                />
              </Field>
              <Field
                label={
                  th
                    ? "ข้อความต้องห้าม (คั่นด้วยจุลภาค)"
                    : "Forbidden claims (comma-separated)"
                }
              >
                <Input
                  value={form.forbiddenClaims}
                  onChange={e => set("forbiddenClaims", e.target.value)}
                />
              </Field>
            </>
          )}

          {/* Stage 2.5 (`planning/vd-series-memory-and-lineage/plan.md`) —
              special-edition sources 1 (product description companion to the
              marketplace picker above) + 2 (uploaded reference images +
              summary). Source 3 (story function choice) lives on the "story"
              step alongside the brief-generation trigger — see that case's
              own doc comment for why. */}
          {isSpecialEdition && (
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-semibold">
                {pickCopy(lang, specialEditionCopy.marketplaceSourceTitle)}
              </p>
              <Field
                label={pickCopy(lang, specialEditionCopy.productDescriptionLabel)}
              >
                <Textarea
                  value={form.productDescription ?? ""}
                  onChange={e => set("productDescription", e.target.value)}
                  rows={2}
                />
              </Field>

              <p className="text-xs font-semibold">
                {pickCopy(lang, specialEditionCopy.uploadSourceTitle)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  {uploadPending
                    ? pickCopy(lang, specialEditionCopy.uploadingLabel)
                    : pickCopy(lang, specialEditionCopy.uploadButtonLabel)}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadPending}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) onUploadReferenceFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.uploadedReferences.map(ref => (
                  <Badge key={ref.url} variant="outline" className="gap-1">
                    {ref.fileName}
                  </Badge>
                ))}
              </div>
              <Field label={pickCopy(lang, specialEditionCopy.uploadSummaryLabel)}>
                <Textarea
                  value={form.uploadedSummary ?? ""}
                  onChange={e => set("uploadedSummary", e.target.value)}
                  rows={2}
                />
              </Field>
            </div>
          )}
        </div>
      );
    }
    case "review":
    default:
      return (
        <div className="grid gap-3 text-sm">
          <p className="rounded-md bg-muted p-3 text-muted-foreground">
            {th
              ? "ตรวจสอบก่อนสร้าง: การกดสร้างจะสร้างเฉพาะโครงซีรีย์ (dry-run) เท่านั้น ยังไม่มีการสร้างสื่อที่มีค่าใช้จ่าย"
              : "Review before creating: confirming creates a series shell only (dry-run). No paid generation is triggered."}
          </p>
          <ReviewRow label={th ? "ชื่อ" : "Title"} value={form.title || "-"} />
          <ReviewRow
            label={th ? "แนวเรื่อง" : "Genre"}
            value={form.genre || "-"}
          />
          <ReviewRow
            label={th ? "ตอนย่อยในโครงสร้างเรื่อง" : "Planned Sub-episodes"}
            value={form.targetEpisodeCount || "-"}
          />
          <ReviewRow
            label={th ? "ภาษา" : "Language"}
            value={
              VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[form.locale] ??
              form.locale
            }
          />
          <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
            <span className="text-muted-foreground">
              {th ? "สินค้าผูกเรื่อง" : "Product tie-in"}
            </span>
            <span className="flex items-center gap-2 font-medium">
              {form.productTieInEnabled && form.productImageUrl && (
                <img
                  src={form.productImageUrl}
                  alt={form.productName || "Product"}
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              )}
              {form.productTieInEnabled
                ? form.productName || (th ? "เปิดใช้งาน" : "Enabled")
                : th
                  ? "ไม่มี"
                  : "None"}
            </span>
          </div>

          {/* Stage 2.6 — lineage summary + (sequel-only) thin-season memory
              coverage warning, reusing the SAME copy fns as the Series
              Memory tab (`coverageHeadlineText`/`coverageSecondaryText`)
              rather than inventing a second dialect. */}
          {isLineageMode && form.parentSeriesId && (
            <div className="mt-2 grid gap-2 rounded-md border bg-muted/20 p-3 text-xs">
              <p className="font-medium">
                {isSequel
                  ? pickCopy(lang, lineageReviewSummaryCopy.sequelTitle)
                  : pickCopy(
                      lang,
                      lineageReviewSummaryCopy.specialEditionTitle
                    )}{" "}
                {parentSeries?.title ?? form.parentSeriesId}
              </p>
              {isSequel && form.seasonNumber && (
                <p className="text-muted-foreground">
                  {pickCopy(lang, lineageReviewSummaryCopy.seasonNumberRow)}{" "}
                  {form.seasonNumber}
                </p>
              )}
              {isSequel && parentMemoryCoverage && (
                <div
                  data-testid="vd-lineage-coverage-warning"
                  className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  <p>
                    {coverageHeadlineText(
                      lang,
                      parentMemoryCoverage.episodesWithRealScript,
                      parentMemoryCoverage.targetEpisodeCount
                    )}
                  </p>
                  <p>
                    {coverageSecondaryText(
                      lang,
                      parentMemoryCoverage.episodesWithMemory,
                      parentMemoryCoverage.targetEpisodeCount,
                      parentMemoryCoverage.episodesWithMemoryAndRealScript
                    )}
                  </p>
                  <a
                    href={verticalDramaRoutes.seriesDetail(form.parentSeriesId)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {pickCopy(lang, lineageCoverageLinkCopy)}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      );
  }
}

function PresetCard({
  preset,
  lang,
  selected,
  onClick,
}: {
  preset: GenrePreset;
  lang: "th" | "en";
  selected?: boolean;
  onClick: () => void;
}) {
  const th = lang === "th";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-md border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="font-medium">{preset.title}</p>
        {preset.scope === "private" && (
          <Badge
            variant="secondary"
            className="px-1.5 py-0 text-[10px] leading-4"
          >
            {th ? "ของฉัน" : "Mine"}
          </Badge>
        )}
        {selected && (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] leading-4"
          >
            {th ? "เลือกแล้ว" : "Selected"}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground/80">
        {genrePresetCategoryLabel(preset.category, lang)}
      </p>
      <p className="mt-0.5 line-clamp-2 text-muted-foreground">
        {preset.logline}
      </p>
      {preset.visualIdentityJson && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] leading-4"
          >
            {visualStyleLabel(lang, preset.visualIdentityJson.styleName)}
          </Badge>
          <VisualIdentityPaletteSwatches
            palette={preset.visualIdentityJson.palette}
          />
        </div>
      )}
    </button>
  );
}

/**
 * Palette swatches for a preset's/draft's visual identity (spec §8.2.2.A,
 * section-15 Accessibility Acceptance: "Palette swatches carry text labels
 * (color names), never color-only"). `palette` entries may be a color NAME
 * or a hex code — the swatch attempts a best-effort CSS background from the
 * raw value (a non-CSS-color string is simply ignored by the browser, never
 * an error), but the color NAME is always rendered as real text regardless
 * of whether the swatch itself renders a recognizable color.
 */
function VisualIdentityPaletteSwatches({ palette }: { palette: string[] }) {
  return (
    <>
      {palette.slice(0, 6).map(color => (
        <span
          key={color}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0 text-[10px] leading-4 text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/30"
            style={{ backgroundColor: color }}
          />
          {color}
        </span>
      ))}
    </>
  );
}

function MixAndMatchPresetPanel({
  lang,
  presets,
  presetsLoading,
  presetSearch,
  onPresetSearchChange,
  categories,
  selectedPresetIds,
  selectedCategories,
  businessContext,
  onBusinessContextChange,
  primarySelectionId,
  onPrimarySelectionIdChange,
  weights,
  onWeightChange,
  onTogglePreset,
  onToggleCategory,
  expanded,
  hasUserPremise,
  weightsSectionRef,
  actionSection,
}: {
  lang: "th" | "en";
  presets: GenrePreset[];
  presetsLoading: boolean;
  presetSearch: string;
  onPresetSearchChange: (value: string) => void;
  categories: string[];
  selectedPresetIds: string[];
  selectedCategories: string[];
  businessContext: string;
  onBusinessContextChange: (value: string) => void;
  primarySelectionId?: string;
  onPrimarySelectionIdChange: (value: string | undefined) => void;
  weights: Record<string, VerticalDramaPresetMixWeight>;
  onWeightChange: (id: string, weight: VerticalDramaPresetMixWeight) => void;
  onTogglePreset: (id: string) => void;
  onToggleCategory: (category: string) => void;
  expanded: boolean;
  /** Feature 132 §4.1 (F132A) — true when `form.userPremise` is non-empty (trimmed); shows the premise-primary badge below. */
  hasUserPremise?: boolean;
  /**
   * Discoverability fix (2026-07-17 follow-up) — lifted up to `WizardStep` so
   * a blend report's "Adjust weights" link can scroll here regardless of
   * whether it renders from THIS panel's own `actionSection` (no-premise
   * path) or from the hero's `PresetSynthesisActionPanel` above (premise
   * path) — the weight sliders themselves always live in this panel.
   */
  weightsSectionRef: React.RefObject<HTMLDivElement | null>;
  /**
   * The primary CTA + its loading/error/draft-result UI, rendered by the
   * PARENT (`WizardStep`) as exactly one `PresetSynthesisActionPanel`
   * instance — here when there's no premise (unchanged legacy position),
   * `null` when a premise is present (it already rendered in the hero, see
   * `WizardStep` case 0). Never both, so there is never a second, competing
   * CTA firing the same mutation.
   */
  actionSection: React.ReactNode;
}) {
  const th = lang === "th";
  // Local-only category filter (purely a UI aid — never touches which
  // categories are actually SELECTED for the mix). Matches against the raw
  // slug plus BOTH the Thai and English labels so a search works regardless
  // of the current UI language.
  const [categorySearch, setCategorySearch] = useState("");
  const selectionCount = selectedPresetIds.length;
  const selectedPresetIdSet = new Set(selectedPresetIds);
  const searchQuery = presetSearch.trim().toLowerCase();
  const categoryCounts = presets.reduce<Record<string, number>>(
    (acc, preset) => {
      acc[preset.category] = (acc[preset.category] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const categorySearchQuery = categorySearch.trim().toLowerCase();
  const visibleCategories = categorySearchQuery
    ? categories.filter(
        category =>
          category.toLowerCase().includes(categorySearchQuery) ||
          genrePresetCategoryLabel(category, "th")
            .toLowerCase()
            .includes(categorySearchQuery) ||
          genrePresetCategoryLabel(category, "en")
            .toLowerCase()
            .includes(categorySearchQuery)
      )
    : categories;
  const filteredPresets = presets.filter(preset => {
    if (selectedPresetIdSet.has(preset.id)) return true;
    const matchesCategory =
      selectedCategories.length > 0 &&
      selectedCategories.includes(preset.category);
    const matchesSearch =
      !searchQuery ||
      preset.title.toLowerCase().includes(searchQuery) ||
      preset.category.toLowerCase().includes(searchQuery) ||
      genrePresetCategoryLabel(preset.category, lang)
        .toLowerCase()
        .includes(searchQuery);
    return matchesCategory && matchesSearch;
  });
  const primaryOptions = [
    ...selectedPresetIds.map(id => {
      const preset = presets.find(item => item.id === id);
      return { id, label: preset?.title ?? id };
    }),
  ];
  // Still needed here (not just by the extracted action section) — the
  // weight sliders below label each row by preset title.
  const presetTitleById = presets.reduce<Record<string, string>>(
    (acc, preset) => {
      acc[preset.id] = preset.title;
      return acc;
    },
    {}
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <Wand2
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">
              {hasUserPremise
                ? th
                  ? "เสริมให้สมบูรณ์ (ไม่บังคับ)"
                  : "Enrich it further (optional)"
                : th
                  ? "เลือก Preset 0-5 แบบ (ไม่บังคับ)"
                  : "Choose 0-5 presets (optional)"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasUserPremise
                ? th
                  ? "ไม่เลือกเลยก็ได้ — AI จะสร้างเรื่องจากโจทย์ของคุณล้วน ๆ หรือเลือก preset 0-5 แบบเพื่อเสริมรสชาติและความร่วมสมัย"
                  : "Skip this entirely — AI builds purely from your premise, or choose 0-5 presets to add flavor and contemporary touches."
                : th
                  ? "ไม่เลือกเลยเพื่อให้ AI สร้างจากข้อมูลพื้นฐาน, เลือก 1 แบบเพื่อใช้ preset เดี่ยว หรือเลือก 2-5 แบบเพื่อให้ AI ผสมเป็น draft เดียว"
                  : "Choose none to let AI build from basics, 1 preset to use it directly, or 2-5 presets for AI to mix into one draft."}
            </p>
            {hasUserPremise && (
              <Badge
                variant="secondary"
                className="mt-1.5 whitespace-normal text-left text-[11px] leading-4"
              >
                {th
                  ? "ใช้โจทย์ของคุณเป็นแกนหลัก — preset ที่เลือกจะเป็นตัวเสริม"
                  : "Your premise is the spine — selected presets add supporting flavor"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {th ? "เลือกหมวดแนวเรื่อง" : "Choose categories"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {th
              ? `${selectedCategories.length} หมวดที่เลือก`
              : `${selectedCategories.length} categories selected`}
          </p>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
            placeholder={
              th ? "ค้นหาหมวดแนวเรื่อง…" : "Search categories…"
            }
            className="h-9 pl-9 text-xs"
            aria-label={th ? "ค้นหาหมวดแนวเรื่อง" : "Search categories"}
          />
        </div>
        {/* Discoverability follow-up (2026-07-17) — this grid used to be
            `grid-cols-2 sm:grid-cols-3`, i.e. a VIEWPORT-width breakpoint.
            That was fine back when this panel lived in the wide 2.35fr
            column, but Phase 4 moved it into the narrow
            `minmax(22rem,0.85fr)` rail — a fixed 3-column split of a ~22rem
            (352px) container leaves ~100px per chip, nowhere near enough for
            labels like "คลุมถุงชนศัตรูหัวใจ (1)" or "ทายาทถูกตัดขาดคัมแบ็ก
            (1)", and `sm:` doesn't know the rail is narrower than the
            viewport. `auto-fill`/`minmax` sizes columns off the GRID's own
            (container) width instead, so it never forces more columns than
            actually fit, at any viewport size or rail width — correctness
            (never clipped) over squeezing in an extra column. */}
        <div
          className={cn(
            "grid gap-1.5 overflow-y-auto rounded-lg border bg-background p-2 [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))]",
            expanded ? "max-h-[18rem]" : "max-h-[14rem]"
          )}
        >
          {visibleCategories.length > 0 ? (
            visibleCategories.map(category => {
              const selected = selectedCategories.includes(category);
              const count = categoryCounts[category] ?? 0;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onToggleCategory(category)}
                  aria-pressed={selected}
                  className={cn(
                    // `[overflow-wrap:anywhere]` (not just `break-words`) —
                    // Thai script has no spaces, so a run with no natural
                    // break opportunity must still be force-broken at the
                    // column's real width; `anywhere` is also honored by the
                    // grid track's min-content sizing, so the column itself
                    // never has to grow past its `minmax` share to avoid
                    // clipping the label.
                    "min-h-8 [overflow-wrap:anywhere] rounded-md border px-2 py-1 text-left text-xs leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-accent"
                  )}
                >
                  {genrePresetCategoryLabel(category, lang)}
                  {count > 0 && (
                    <span className="ml-1 opacity-70">({count})</span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
              {th
                ? `ไม่พบหมวดที่ตรงกับ “${categorySearch.trim()}”`
                : `No categories match “${categorySearch.trim()}”`}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={presetSearch}
            onChange={e => onPresetSearchChange(e.target.value)}
            placeholder={
              th
                ? "ค้นหา preset ในหมวดที่เลือก…"
                : "Search presets in selected categories…"
            }
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {th
              ? "เลือก preset ในหมวดที่เลือก"
              : "Choose presets from selected categories"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {selectedCategories.length > 0
              ? th
                ? `แสดง ${filteredPresets.length} preset`
                : `${filteredPresets.length} presets shown`
              : th
                ? "เลือกหมวดก่อนเพื่อกรอง preset"
                : "Choose categories first to filter presets"}
          </p>
        </div>
        <div
          className={cn(
            // vd-premise-first-wizard plan Phase 4.1 — this panel now lives in
            // the narrow "supplemental" rail (see step-1 layout below), so the
            // card grid no longer bumps past 2 columns regardless of viewport.
            "grid auto-rows-min grid-cols-1 gap-2 overflow-y-auto rounded-lg border bg-background/80 p-2 sm:grid-cols-2",
            expanded
              ? "min-h-[16rem] max-h-[34vh]"
              : "min-h-[12rem] max-h-[26vh]"
          )}
        >
          {presetsLoading ? (
            <div className="col-span-full flex min-h-40 items-center justify-center rounded-md border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
              {th ? "กำลังโหลด preset…" : "Loading presets..."}
            </div>
          ) : filteredPresets.length > 0 ? (
            filteredPresets.map(preset => (
              <PresetCard
                key={preset.id}
                preset={preset}
                lang={lang}
                selected={selectedPresetIds.includes(preset.id)}
                onClick={() => onTogglePreset(preset.id)}
              />
            ))
          ) : (
            <div className="col-span-full flex min-h-40 items-center justify-center rounded-md border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
              {th
                ? "เลือกหมวดแนวเรื่องด้านบนก่อน แล้วระบบจะแสดงเฉพาะ preset ในหมวดนั้น"
                : "Choose one or more categories above, then only matching presets will appear here."}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={
            th
              ? "ธุรกิจ/ร้าน/บริการที่อยากผูกเรื่อง"
              : "Business, shop, or service context"
          }
        >
          <Input
            value={businessContext}
            onChange={e => onBusinessContextChange(e.target.value)}
            placeholder={
              th
                ? "เช่น ร้านก๋วยเตี๋ยว, คาเฟ่ในชุมชน"
                : "e.g. noodle shop, neighborhood cafe"
            }
          />
        </Field>
        <Field label={th ? "แนวหลัก (ไม่บังคับ)" : "Primary flavor (optional)"}>
          <Select
            value={primarySelectionId ?? "auto"}
            onValueChange={value =>
              onPrimarySelectionIdChange(value === "auto" ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[min(50vh,20rem)]">
              <SelectItem value="auto">
                {th ? "ให้ AI เลือกให้" : "Let AI choose"}
              </SelectItem>
              {primaryOptions.map(option => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Preset Mix v2 (spec §8.2.2.C.1, section-15) — per-selection weight,
          shown once 2+ presets are picked (weight only matters when blending;
          a single-preset selection is applied directly, unweighted). Sending
          `selections` is unconditional (see `handleSynthesizePreset`) — the
          server decides whether the tenant's flag is on. */}
      {selectionCount >= 2 && (
        <div
          ref={weightsSectionRef}
          className="grid gap-2 rounded-lg border bg-background p-3"
        >
          <p className="text-xs font-medium">
            {pickCopy(lang, verticalDramaCopy.mixWeightSectionTitle)}
          </p>
          <div className="grid gap-3">
            {selectedPresetIds.map(id => {
              const weight = weights[id] ?? DEFAULT_MIX_WEIGHT;
              const presetTitle = presetTitleById[id] ?? id;
              return (
                <div key={id} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium">
                      {presetTitle}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {mixWeightLabel(lang, weight)}
                    </span>
                  </div>
                  <Slider
                    value={[weight]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={([value]) =>
                      onWeightChange(id, clampMixWeight(value))
                    }
                    aria-label={`${presetTitle} — ${mixWeightLabel(lang, weight)}`}
                    className="py-3"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {actionSection}
    </div>
  );
}

/**
 * Discoverability fix (2026-07-17 follow-up to vd-premise-first-wizard) — the
 * user reported that after typing a premise, there was no visible way to make
 * anything happen: the one button that acts on the premise/preset selection
 * lived at the bottom of the (now-optional) preset rail, a panel the UI
 * itself labels "เสริมให้สมบูรณ์ (ไม่บังคับ)" / optional. Extracted out of
 * `MixAndMatchPresetPanel` so the SAME button+result markup can render in
 * either of exactly two places, chosen by the caller (`WizardStep`):
 *   - the hero, directly under the premise textarea, the instant a premise is
 *     typed (this is the fix — see `WizardStep` case 0)
 *   - the (unchanged) bottom of the preset rail, for the legacy no-premise
 *     flow (apply-verbatim / mix-presets-only / blocked)
 * Only ONE of those two call sites is ever rendered at once (the other passes
 * `null`), so there is never a second, competing CTA that fires the same
 * mutation from two places.
 */
function PresetSynthesisActionPanel({
  lang,
  presets,
  selectedPresetIds,
  hasUserPremise,
  hasBasicSeed,
  hasLineageSeed,
  loading,
  errorMessage,
  draft,
  currentTitle,
  onSelectTitle,
  onGenerate,
  onApplySinglePreset,
  onApplyDraft,
  onAdjustWeights,
  emphasize,
}: {
  lang: "th" | "en";
  presets: GenrePreset[];
  selectedPresetIds: string[];
  hasUserPremise: boolean;
  hasBasicSeed: boolean;
  hasLineageSeed?: boolean;
  loading: boolean;
  errorMessage?: string;
  draft?: SynthesizedGenrePresetDraft;
  /** Stage 2 — the wizard's current `form.title`, so the title picker below can highlight the option (if any) that's already selected. */
  currentTitle: string;
  /** Stage 2 — writes the chosen candidate into `form.title` directly (an explicit user pick, so it may replace an existing value — unlike `applyPresetDraft`'s own no-clobber `resolvedTitle` rule, which only applies to the AUTOMATIC apply). */
  onSelectTitle: (title: string) => void;
  onGenerate: () => void;
  onApplySinglePreset: (preset: GenrePreset) => void;
  onApplyDraft: (draft: SynthesizedGenrePresetDraft) => void;
  onAdjustWeights: () => void;
  /** True when rendered in the hero — makes the CTA read as the page's main action (larger, full-width on mobile), not a quiet secondary link. */
  emphasize?: boolean;
}) {
  const th = lang === "th";
  const selectionCount = selectedPresetIds.length;
  const presetAction = resolveCreateSeriesPresetAction({
    hasUserPremise,
    presetCount: selectionCount,
    hasBasicSeed,
    hasLineageSeed,
    lang,
  });
  const canApplySingle =
    presetAction.kind === "apply_preset_verbatim" && !loading;
  const canGenerate =
    (presetAction.kind === "synthesize_from_premise_only" ||
      presetAction.kind === "synthesize_premise_and_presets" ||
      presetAction.kind === "synthesize_presets_only" ||
      presetAction.kind === "synthesize_from_basics") &&
    !loading;
  const selectedSinglePreset =
    selectionCount === 1
      ? presets.find(preset => preset.id === selectedPresetIds[0])
      : undefined;
  const presetTitleById = presets.reduce<Record<string, string>>(
    (acc, preset) => {
      acc[preset.id] = preset.title;
      return acc;
    },
    {}
  );

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {th
            ? `เลือก preset แล้ว ${selectionCount}/5 แบบ`
            : `${selectionCount}/5 presets selected`}
        </p>
        {canApplySingle ? (
          <Button
            type="button"
            size={emphasize ? "lg" : "default"}
            onClick={() =>
              selectedSinglePreset && onApplySinglePreset(selectedSinglePreset)
            }
            disabled={!selectedSinglePreset}
            className={cn("gap-2", emphasize && "w-full sm:w-auto")}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {presetAction.label}
          </Button>
        ) : (
          <Button
            type="button"
            size={emphasize ? "lg" : "default"}
            onClick={onGenerate}
            disabled={!canGenerate}
            className={cn("gap-2", emphasize && "w-full sm:w-auto")}
          >
            {loading && (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {loading
              ? th
                ? "AI กำลังจัดรสชาติเรื่องให้เข้ากัน..."
                : "AI is mixing the story flavors..."
              : presetAction.label}
          </Button>
        )}
      </div>

      {/* "What do I press, and what will the system do for me" — the button
          label alone used to just say "ผสม" (mix), which didn't say what
          pressing it actually produces. Only shown for the AI-synthesis
          kinds; `apply_preset_verbatim` needs no explanation and `blocked`
          has its own reason below. */}
      {presetAction.outcomeHint && (
        <p className="text-[11px] text-muted-foreground">
          {presetAction.outcomeHint}
        </p>
      )}

      {/* Defensive fallback: a disabled CTA must never be silent about why.
          The real wizard always has defaults/basic facts, so zero presets
          normally resolves to `synthesize_from_basics`, not `blocked`. */}
      {presetAction.kind === "blocked" && presetAction.blockedReason && (
        <p
          role="note"
          className="rounded-md border border-dashed bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          {presetAction.blockedReason}
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onGenerate}
            disabled={loading}
            className="shrink-0"
          >
            {th ? "ลองสร้างใหม่" : "Retry"}
          </Button>
        </div>
      )}

      {selectionCount === 0 && !hasUserPremise && (
        <p className="text-xs text-muted-foreground">
          {th
            ? "เริ่มจากเลือกหมวดเพื่อกรองรายการ แล้วเลือก preset 1-5 แบบ"
            : "Start by choosing categories, then select 1-5 presets."}
        </p>
      )}

      {draft && (
        <div className="rounded-md border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{draft.title}</p>
              {/* Stage 2 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
                  — 4-5 title candidates (`draft.titleOptions`), server-optional
                  and additive: renders nothing when absent (older/shorter
                  model response), same as today. `draft.title` above stays
                  visible either way — a user who never opens the picker still
                  sees exactly what applying the draft will set `form.title`
                  to. Picking a candidate writes `form.title` directly
                  (`onSelectTitle`); `applyPresetDraft`'s own no-clobber rule
                  (never overwrite a title the user already typed) still
                  governs what happens on "ใช้ draft นี้" for whichever title
                  ends up in `form.title` at that point. */}
              {draft.titleOptions && draft.titleOptions.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] text-muted-foreground">
                    {th
                      ? "เลือกชื่อเรื่อง (หรือแก้ไขเองที่ช่อง \"ชื่อซีรีย์\" ด้านล่างได้เสมอ)"
                      : 'Pick a title (or edit your own in the "Series title" field below — always editable)'}
                  </p>
                  <div
                    className="mt-1 flex flex-wrap gap-1.5"
                    role="group"
                    aria-label={
                      th ? "ตัวเลือกชื่อเรื่อง" : "Title candidates"
                    }
                  >
                    {draft.titleOptions.map(option => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={currentTitle.trim() === option}
                        onClick={() => onSelectTitle(option)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          currentTitle.trim() === option
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background hover:bg-accent"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.logline}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {genrePresetCategoryLabel(draft.category, lang)}
                </Badge>
                <Badge variant="outline">
                  {draft.characters.length} {th ? "ตัวละคร" : "characters"}
                </Badge>
              </div>
              {(() => {
                const summary = draft.creatorSummary ?? {
                  whatItIsAbout: draft.logline,
                  protagonistAndGoal: draft.mainPlot,
                  conflictAndDiscovery: draft.seasonArc,
                  centralMystery: draft.cliffhangerStyle,
                  decisionNotes: [
                    th
                      ? "ตรวจสอบตัวนำ เป้าหมาย และปมของเรื่องก่อนใช้ draft"
                      : "Review the protagonist, goal, and central mystery before applying this draft.",
                  ],
                };
                const summaryRows = [
                  [th ? "เรื่องนี้เกี่ยวกับอะไร" : "What the story is about", summary.whatItIsAbout],
                  [th ? "ตัวนำและเป้าหมาย" : "Protagonist and goal", summary.protagonistAndGoal],
                  [th ? "ความขัดแย้งและสิ่งที่พบ" : "Conflict and discovery", summary.conflictAndDiscovery],
                  [th ? "ปมสำคัญของเรื่อง" : "Central mystery", summary.centralMystery],
                ] as const;
                return (
                  <div
                    data-testid="vd-creator-summary"
                    className="mt-3 grid gap-2 rounded-md border border-primary/20 bg-primary/5 p-3"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {th ? "สรุปเรื่องก่อนยืนยัน" : "Story summary before applying"}
                    </p>
                    <div className="grid gap-2">
                      {summaryRows.map(([label, value]) => (
                        <div key={label} className="grid gap-0.5">
                          <p className="text-[11px] font-medium text-foreground/80">{label}</p>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-1">
                      <p className="text-[11px] font-medium text-foreground/80">
                        {th ? "สิ่งที่ควรรู้ก่อนตัดสินใจ" : "Know before deciding"}
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                        {summary.decisionNotes.map((note, index) => (
                          <li key={`${index}-${note}`}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
              {draft.contract_version === 2 && draft.visualIdentity && (
                <div className="mt-2">
                  <p className="text-xs font-medium">
                    {visualStyleLabel(lang, draft.visualIdentity.styleName)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <VisualIdentityPaletteSwatches
                      palette={draft.visualIdentity.palette}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onApplyDraft(draft)}
              >
                {th ? "ใช้ draft นี้" : "Use this draft"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onGenerate}
                disabled={loading}
              >
                {th ? "ปรับใหม่" : "Try again"}
              </Button>
            </div>
          </div>
          {draft.warnings && draft.warnings.length > 0 && (
            // Render EVERY warning, not just `warnings[0]` — the
            // `premise_coverage_low` warning ("the AI drifted from your
            // premise") is APPENDED to the end of `draft.warnings`
            // server-side (`appendPremiseCoverageWarning` in
            // `verticalDramaPresetSynthesis.ts`), so a preceding technical
            // warning like `preset_field_length_clamped` would otherwise bury
            // the one the creator most needs to see. The premise-coverage
            // warning is surfaced first so it never hides behind housekeeping
            // notices.
            <div className="mt-2 space-y-1.5">
              {[...draft.warnings]
                .sort((a, b) =>
                  a.code === "premise_coverage_low"
                    ? -1
                    : b.code === "premise_coverage_low"
                      ? 1
                      : 0
                )
                .map((warning, i) => (
                  <div
                    key={`${warning.code}-${i}`}
                    className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  >
                    {warning.message}
                  </div>
                ))}
            </div>
          )}
          {draft.contract_version === 2 && (
            <details className="mt-3 rounded-md border bg-muted/20 p-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                {th ? "รายละเอียดการผสม (สำหรับตรวจสอบเท่านั้น)" : "Blend details (technical)"}
              </summary>
              <div className="pt-2">
                <VerticalDramaBlendReportPanel
                  lang={lang}
                  blendReport={draft.blendReport}
                  presetOrder={selectedPresetIds}
                  presetTitleById={presetTitleById}
                  onAdjustWeights={onAdjustWeights}
                />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 2 (`planning/fix-create-series-premise-blend/plan-phase2-mode-first.md`)
 * — renders `children` either as the primary (open, unwrapped) section or
 * demoted inside a native, collapsed-by-default `<details>` disclosure, per
 * `primary`. Uses plain `<details>`/`<summary>` (the same pattern already
 * used for "Blend details (technical)" above) rather than a `Collapsible`
 * primitive: Radix's `CollapsibleContent` unmounts its children while
 * closed, which would make the demoted section's inputs/buttons
 * unreachable; `<details>` keeps its content in the DOM at all times
 * (browsers hide it visually via layout, not by removing it), so switching
 * `seriesMode` back and forth never loses anything the user already typed
 * or selected inside the demoted section.
 */
function ModeSection({
  primary,
  collapsedSummary,
  className,
  children,
}: {
  primary: boolean;
  collapsedSummary: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (primary) {
    return <div className={className}>{children}</div>;
  }
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground">
        {collapsedSummary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Field({
  label,
  helperText,
  children,
}: {
  label: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {helperText && (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
