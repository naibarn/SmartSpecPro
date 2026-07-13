/**
 * CreateSeriesWizard (spec feature 131, section 03 · §8.2).
 *
 * 6-step Create-Series Wizard, extracted from VerticalDramaSeriesPage so it can
 * be mounted once by VerticalDramaShell and triggered from any of the three
 * vertical-drama pages. Runs in DRY-RUN mode — reaching Review and confirming
 * creates a series shell only and never triggers paid generation.
 */

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ImageIcon,
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
import {
  AUDIENCE_AGE_RATINGS,
  AUDIENCE_AGE_RATING_LABELS,
  DEFAULT_AUDIENCE_AGE_RATING,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import { VerticalDramaBlendReportPanel } from "./VerticalDramaBlendReportPanel";
import {
  mixWeightLabel,
  pickCopy,
  verticalDramaCopy,
  visualStyleLabel,
  wizardSteps,
} from "./verticalDramaCopy";

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
};

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
  const productsQuery = trpc.marketplaceCapture.listProducts.useQuery(
    { query: productSearch || undefined, limit: 20 },
    { enabled: form.productTieInEnabled }
  );
  const products = productsQuery.data ?? [];

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
        toast.error(
          err?.message ||
            (lang === "th"
              ? "ผสมแนวเรื่องไม่สำเร็จ ลองลดจำนวนแนวหรือใส่บริบทให้ชัดขึ้น"
              : "Could not mix these story flavors. Try fewer flavors or clearer context.")
        );
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
    set("visualBible", preset.visualBible);
    // Spec §8.2.2.A flow-through rule (section-15) — remembered so `create`
    // can additively stamp this preset's `visualIdentityJson` (if any) into
    // the new series' bible; a no-op server side for presets without one.
    set("appliedPresetId", preset.id);
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
    setForm(prev => ({
      ...prev,
      title: prev.title.trim() ? prev.title : draft.title,
      genre: clampToCreateSeriesLimit(draft.title, "genre") ?? draft.title,
      logline: draft.logline,
      mainPlot: draft.mainPlot,
      seasonArc: draft.seasonArc,
      tone: clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone,
      cliffhangerStyle: draft.cliffhangerStyle,
      characters: draft.characters
        .map(c => `${c.name} — ${c.role}: ${c.description}`)
        .join("\n"),
      visualBible: draft.visualBible,
      // An AI-mixed draft is not itself a single stored preset row — clear
      // any single-preset `appliedPresetId` a prior "Use this preset" click
      // may have left behind so `create` doesn't stamp the wrong identity.
      appliedPresetId: undefined,
      // Feature 132 §4.1 (F132A) distinctness rule — `userPremise` is
      // creative-intent input, never overwritten by preset application.
      // `prev` is already spread above, so `userPremise` is deliberately not
      // listed here (leaving it untouched).
    }));
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
      return [...prev, category];
    });
  }

  function setMixWeight(id: string, weight: VerticalDramaPresetMixWeight) {
    setMixWeights(prev => ({ ...prev, [id]: weight }));
  }

  function handleSynthesizePreset() {
    if (mixPresetIds.length < 2) {
      toast.error(
        lang === "th"
          ? "เลือกอย่างน้อย 2 preset ก่อนให้ AI ผสม"
          : "Choose at least 2 presets first"
      );
      return;
    }
    synthesizePresetMutation.mutate({
      locale: lang,
      selectedPresetIds: mixPresetIds,
      selectedCategories: [],
      primarySelectionId: mixPrimarySelectionId,
      businessContext: mixBusinessContext || undefined,
      productContext: form.productName || undefined,
      targetEpisodeCount: Number(form.targetEpisodeCount) || undefined,
      toneHint: form.tone || undefined,
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
      // tenant flag gates whether the server honors it).
      // TODO: server accepts this once verticalDramaSeries.ts's deferred
      // userPremise wiring lands (section-02 plan item 3/4).
      userPremise: form.userPremise.trim() || undefined,
      // Contract: `@shared/verticalDramaSeries/audienceAgeRating` — steers
      // preset-mix synthesis to match the series' target maturity tier.
      // Always a defined enum value (see `handleCreate` above).
      audienceAgeRating: form.audienceAgeRating,
    } as Parameters<typeof synthesizePresetMutation.mutate>[0]);
  }

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
  // this only gates the final Create action, never tab navigation.
  const createValid =
    form.title.trim().length > 0 && Number(form.targetEpisodeCount) > 0;
  const createBlockedReason = !createValid
    ? lang === "th"
      ? "กรุณากรอกชื่อซีรีย์และจำนวนตอนย่อยที่ถูกต้องในแท็บ 'ตั้งค่าพื้นฐาน'"
      : "Enter a series title and a valid Sub-episode count in the 'Basic setup' tab"
    : "";

  const isLast = stepIndex === wizardSteps.length - 1;

  const handleCreate = () => {
    if (createMutation.isPending || generateStoryMutation.isPending) return;
    createMutation.mutate({
      title: form.title.trim(),
      locale: form.locale,
      genre: form.genre.trim() || undefined,
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
              locationsDraft: form.locations,
            }
          : undefined,
      productTieIn: form.productTieInEnabled
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
            {wizardSteps.map((step, i) => (
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
            stepIndex={stepIndex}
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
            onToggleMixPreset={toggleMixPreset}
            onToggleMixCategory={toggleMixCategory}
            onSynthesizePreset={handleSynthesizePreset}
            onApplyPresetDraft={applyPresetDraft}
            onApplyPreset={applyPreset}
            products={products as MarketplaceProductOption[]}
            productsLoading={productsQuery.isLoading}
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
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
                  setStepIndex(i => Math.min(wizardSteps.length - 1, i + 1))
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
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: GenrePresetCharacter[];
  visualBible: string;
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

interface MarketplaceProductOption {
  id: string;
  productName: string;
  imageUrl?: string | null;
  platform?: string | null;
  priceCurrent?: string | number | null;
  currency?: string | null;
}

function WizardStep({
  stepIndex,
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
  onToggleMixPreset,
  onToggleMixCategory,
  onSynthesizePreset,
  onApplyPresetDraft,
  onApplyPreset,
  products,
  productsLoading,
  productSearch,
  onProductSearchChange,
}: {
  stepIndex: number;
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
  onToggleMixPreset: (id: string) => void;
  onToggleMixCategory: (category: string) => void;
  onSynthesizePreset: () => void;
  onApplyPresetDraft: (draft: SynthesizedGenrePresetDraft) => void;
  onApplyPreset: (preset: GenrePreset) => void;
  products: MarketplaceProductOption[];
  productsLoading: boolean;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
}) {
  const th = lang === "th";
  // Preset browser height: toggle between compact and tall; the list is also
  // user-draggable via CSS resize-y for anything in between.
  const [presetListExpanded, setPresetListExpanded] = useState(false);
  switch (stepIndex) {
    case 0:
      return (
        <div className="grid min-h-full gap-4 lg:grid-cols-[minmax(0,2.35fr)_minmax(22rem,0.85fr)] lg:items-start">
          <div className="flex min-h-[32rem] flex-col rounded-xl border bg-muted/20 p-4 shadow-sm xl:min-h-[calc(90dvh-15rem)]">
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  {th ? "คลัง Preset แนวเรื่อง" : "Story preset library"}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {th
                    ? "เลือก preset เดี่ยว หรือให้ AI ผสมหลายแนวเป็น draft เดียว"
                    : "Choose one preset or let AI mix several flavors into one draft."}
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
              draft={mixDraft}
              loading={mixDraftLoading}
              onTogglePreset={onToggleMixPreset}
              onToggleCategory={onToggleMixCategory}
              onGenerate={onSynthesizePreset}
              onApplyDraft={onApplyPresetDraft}
              onApplySinglePreset={onApplyPreset}
              expanded={presetListExpanded}
              // Feature 132 §4.1 (F132A) — the badge only signals that a
              // premise is present; it does not itself gate anything (the
              // server decides whether the tenant flag honors it).
              hasUserPremise={form.userPremise.trim().length > 0}
            />
          </div>

          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-sm font-semibold">
                {th ? "ข้อมูลพื้นฐาน" : "Basic setup"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {th
                  ? "เลือก preset ก่อน แล้วค่อยปรับข้อมูลสำคัญด้านนี้"
                  : "Pick a preset first, then refine the essentials here."}
              </p>
            </div>
            <div className="grid gap-4">
              <Field label={th ? "ชื่อซีรีย์ *" : "Series title *"}>
                <Input
                  value={form.title}
                  onChange={e => set("title", e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label={th ? "แนวเรื่อง" : "Genre"}>
                <Input
                  value={form.genre}
                  onChange={e => set("genre", e.target.value)}
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
                  value={form.targetEpisodeCount}
                  onChange={e => set("targetEpisodeCount", e.target.value)}
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
              <Field
                label={
                  th
                    ? "โจทย์เรื่องที่อยากได้ (ไม่บังคับ)"
                    : "Story premise you want (optional)"
                }
                helperText={
                  th
                    ? "ถ้าระบุ ระบบจะใช้โจทย์ของคุณเป็นแกนเรื่องหลัก แล้วนำ preset ที่เลือก (1–5 แบบ) มาผสมเพื่อเสริมความเข้มข้นและความร่วมสมัย"
                    : "If provided, the system uses your premise as the primary story spine and blends the selected preset(s) (1-5) to intensify and add contemporary flavor."
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
              <Field label={th ? "เรื่องย่อ (logline)" : "Logline"}>
                <Textarea
                  value={form.logline}
                  onChange={e => set("logline", e.target.value)}
                  rows={3}
                />
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
                    onChange={e => set("targetDurationSeconds", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
      );
    case 1:
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
            <Field label={th ? "โทน" : "Tone"}>
              <Input
                value={form.tone}
                onChange={e => set("tone", e.target.value)}
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
        </div>
      );
    case 2:
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
              onChange={e => set("characters", e.target.value)}
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
    case 3:
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
    case 4:
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
        </div>
      );
    case 5:
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
  draft,
  loading,
  onTogglePreset,
  onToggleCategory,
  onGenerate,
  onApplyDraft,
  onApplySinglePreset,
  expanded,
  hasUserPremise,
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
  draft?: SynthesizedGenrePresetDraft;
  loading: boolean;
  onTogglePreset: (id: string) => void;
  onToggleCategory: (category: string) => void;
  onGenerate: () => void;
  onApplyDraft: (draft: SynthesizedGenrePresetDraft) => void;
  onApplySinglePreset: (preset: GenrePreset) => void;
  expanded: boolean;
  /** Feature 132 §4.1 (F132A) — true when `form.userPremise` is non-empty (trimmed); shows the premise-primary badge below. */
  hasUserPremise?: boolean;
}) {
  const th = lang === "th";
  const selectionCount = selectedPresetIds.length;
  const canApplySingle = selectionCount === 1 && !loading;
  const canGenerate = selectionCount >= 2 && selectionCount <= 5 && !loading;
  const selectedPresetIdSet = new Set(selectedPresetIds);
  const searchQuery = presetSearch.trim().toLowerCase();
  const categoryCounts = presets.reduce<Record<string, number>>(
    (acc, preset) => {
      acc[preset.category] = (acc[preset.category] ?? 0) + 1;
      return acc;
    },
    {}
  );
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

  // Preset Mix v2 (spec §8.2.2.C.1, section-15) — the weight sliders' scroll
  // target for the blend report's "adjust weights" CTA below.
  const weightsSectionRef = useRef<HTMLDivElement>(null);
  const scrollToWeights = () =>
    weightsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

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
              {th ? "เลือก Preset ได้ 1-5 แบบ" : "Choose 1-5 presets"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {th
                ? "เลือก 1 แบบเพื่อใช้ preset เดี่ยวแบบเดิม หรือเลือก 2-5 แบบเพื่อให้ AI ช่วย mix เป็น draft เดียว"
                : "Choose 1 preset to use it directly, or choose 2-5 presets for AI to mix into one draft."}
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
              ? `${selectedCategories.length} หมวดที่ใช้กรอง`
              : `${selectedCategories.length} filter categories`}
          </p>
        </div>
        <div
          className={cn(
            "grid grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border bg-background p-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
            expanded ? "max-h-[18rem]" : "max-h-[14rem]"
          )}
        >
          {categories.map(category => {
            const selected = selectedCategories.includes(category);
            const count = categoryCounts[category] ?? 0;
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggleCategory(category)}
                aria-pressed={selected}
                className={cn(
                  "min-h-8 rounded-md border px-2 py-1 text-left text-xs leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          })}
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
            "grid auto-rows-min grid-cols-1 gap-2 overflow-y-auto rounded-lg border bg-background/80 p-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {th
            ? `เลือก preset แล้ว ${selectionCount}/5 แบบ`
            : `${selectionCount}/5 presets selected`}
        </p>
        {canApplySingle ? (
          <Button
            type="button"
            onClick={() =>
              selectedSinglePreset && onApplySinglePreset(selectedSinglePreset)
            }
            disabled={!selectedSinglePreset}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {th ? "ใช้ Preset นี้" : "Use this preset"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="gap-2"
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
              : th
                ? "ให้ AI ผสมเป็น Preset"
                : "Mix into a preset"}
          </Button>
        )}
      </div>

      {selectionCount === 0 && (
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
              {draft.mixRecipe?.rationale && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {draft.mixRecipe.rationale}
                </p>
              )}
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
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {draft.warnings[0]?.message}
            </div>
          )}
          {draft.contract_version === 2 && (
            <div className="mt-3">
              <VerticalDramaBlendReportPanel
                lang={lang}
                blendReport={draft.blendReport}
                presetOrder={selectedPresetIds}
                presetTitleById={presetTitleById}
                onAdjustWeights={scrollToWeights}
              />
            </div>
          )}
        </div>
      )}
    </div>
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
