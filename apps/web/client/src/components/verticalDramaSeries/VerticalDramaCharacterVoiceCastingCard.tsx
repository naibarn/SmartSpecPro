/**
 * VerticalDramaCharacterVoiceCastingCard (spec feature 131, W12-B voice chain
 * wave — client half of W12-A's server-shipped voice-casting contracts).
 *
 * Per-character voice casting card, mounted inside the selected-character
 * detail column of `VerticalDramaCharacterStockPanel.tsx` (the Characters
 * surface) once the `verticalDramaSeriesVoiceChain` tenant flag is on. Fully
 * presentational — props in, callbacks out — so it is directly unit/RTL
 * testable without mocking tRPC; the parent panel owns the
 * `listVoiceCatalog` / `setCharacterVoiceConfig` / `previewCharacterVoice`
 * queries+mutations and the completion poll (mirroring that panel's own
 * `pollCharacterImageTask` -> `utils.media.getTask.fetch` convention).
 *
 * Covers: current-voice chip (+ locked-at timestamp), a searchable/grouped-
 * by-language voice picker dialog, a paid confirm-gated preview with an
 * inline `<audio>` player, and a "clear voice" action. Every mutating action
 * is disabled/hidden when `readOnly` (archived series).
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  Save,
  Search,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  pickCopy,
  verticalDramaCopy,
  voiceCastingLockedAtText,
  voiceCastingPreviewCreditCostText,
  type VerticalDramaLang,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import type {
  VerticalDramaCharacterVoiceConfig,
  VerticalDramaVoiceCatalogEntry,
} from "@shared/verticalDramaSeries/voiceCasting";
import type { VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";
import { Textarea } from "@/components/ui/textarea";

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing)                            */
/* -------------------------------------------------------------------------- */

/** Bucket key for catalog entries with no `language` field. Not a real BCP-47
 *  code on purpose, so it can never collide with a real provider language. */
export const VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY = "__unknown__";

export interface VoiceCatalogGroup {
  language: string;
  entries: VerticalDramaVoiceCatalogEntry[];
}

/**
 * Filters the flat voice catalog by a case-insensitive substring match
 * against label/language/ageTag, then groups the result by `language`
 * (entries with no `language` bucket under `VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY`).
 * Group order follows first-seen order in the input catalog; entry order
 * within a group is preserved from the input. Pure, DB/network-free.
 */
export function filterAndGroupVoiceCatalog(
  voices: VerticalDramaVoiceCatalogEntry[],
  query: string,
): VoiceCatalogGroup[] {
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? voices.filter((v) => {
        const haystack = `${v.label} ${v.voiceId} ${v.language ?? ""} ${v.ageTag ?? ""} ${v.gender ?? ""}`.toLowerCase();
        return haystack.includes(trimmed);
      })
    : voices;

  const order: string[] = [];
  const byLanguage = new Map<string, VerticalDramaVoiceCatalogEntry[]>();
  for (const entry of filtered) {
    const key = entry.language?.trim() || VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY;
    if (!byLanguage.has(key)) {
      byLanguage.set(key, []);
      order.push(key);
    }
    byLanguage.get(key)!.push(entry);
  }
  return order.map((language) => ({ language, entries: byLanguage.get(language)! }));
}

/** Chip label for a character's current casting — the placeholder copy when
 *  uncast, else `voiceLabel` (captured at cast time) falling back to the raw
 *  `voiceId`. */
export function formatVoiceChipLabel(
  lang: VerticalDramaLang,
  voiceConfig: VerticalDramaCharacterVoiceConfig | undefined,
): string {
  if (!voiceConfig) return pickCopy(lang, verticalDramaCopy.voiceCastingChipUncast);
  return voiceConfig.voiceLabel?.trim() || voiceConfig.voiceId;
}

/**
 * F132F speech-profile "prefill from speech profile" suggestion (spec 132
 * §7.3, added 2026-07-09) — maps `speechProfile.speakingSpeed`/
 * `emotionalDefault` into a proposed `voiceConfig.styleHints[]` entry. Pure,
 * side-effect-free — the caller decides whether/how to insert the result
 * into the (editable, never-auto-saved) style-hints draft text; this
 * function never writes anywhere itself. Mirrors `voiceCasting.ts`'s own
 * doc comment on `styleHints`: "informational only; never sent verbatim...
 * as control parameters" — this is a SUGGESTION for the user to review, not
 * an automatic assignment.
 */
export function suggestStyleHintsFromSpeechProfile(
  profile: VerticalDramaSpeechProfile,
): string[] {
  const speedPhrase: Record<VerticalDramaSpeechProfile["speakingSpeed"], string> = {
    slow: "slow, deliberate pacing",
    measured: "measured, unhurried pacing",
    normal: "normal conversational pacing",
    fast: "quick, energetic pacing",
    rapid_fire: "rapid-fire, breathless pacing",
  };
  const hints = [speedPhrase[profile.speakingSpeed], profile.emotionalDefault.trim()].filter(
    (hint): hint is string => Boolean(hint),
  );
  return hints;
}

/** Splits a comma-separated style-hints textarea value into a trimmed, non-empty-only array — the form <-> `styleHints[]` boundary. */
export function parseStyleHintsText(text: string): string[] {
  return text
    .split(",")
    .map((hint) => hint.trim())
    .filter(Boolean);
}

/** Joins `styleHints[]` back into the comma-separated textarea display value — inverse of `parseStyleHintsText`. */
export function formatStyleHintsText(hints: string[] | undefined): string {
  return (hints ?? []).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaCharacterVoiceCastingCardProps {
  lang: VerticalDramaLang;
  characterName: string;
  /** When true (archived series), every mutating control is hidden. */
  readOnly?: boolean;
  voiceConfig?: VerticalDramaCharacterVoiceConfig;
  voices: VerticalDramaVoiceCatalogEntry[];
  voicesLoading?: boolean;
  /** `setCharacterVoiceConfig` in flight for a cast (not clear). */
  casting?: boolean;
  onCast: (entry: VerticalDramaVoiceCatalogEntry) => void;
  onClear: () => void;
  /** `setCharacterVoiceConfig` in flight for a clear (`voiceConfig: null`). */
  clearing?: boolean;
  onPreview: () => void;
  previewing?: boolean;
  previewAudioUrl?: string | null;
  /** Resolved `creditCost` from the most recent `previewCharacterVoice`
   *  response (debt-item-2, 2026-07-08) — `null`/`undefined` before any
   *  preview has been submitted yet. Shown as small muted text next to the
   *  preview action so the paid-preview confirm dialog's "this spends
   *  credits" warning is followed by the actual resolved amount. */
  previewCreditCost?: number | null;
  /** F132F `verticalDramaCharacterProfiles` (spec 132 §7.3, added
   *  2026-07-09) — when present, shows a "suggest from speech profile"
   *  action that proposes style hints derived from this profile. Absent
   *  (flag off, or no profile yet) renders byte-identical to before this
   *  addition — no style-hints section at all. */
  speechProfile?: VerticalDramaSpeechProfile;
  /** Persists the (user-reviewed, possibly-edited) style-hints text as
   *  `styleHints[]` — only ever called on an explicit user Save click,
   *  never automatically. Omitted -> the Save action is hidden (a caller
   *  that doesn't wire persistence yet still gets the suggest/edit UI, just
   *  without a way to save). */
  onSaveStyleHints?: (hints: string[]) => void;
  /** `setCharacterVoiceConfig` in flight for a style-hints-only save. */
  savingStyleHints?: boolean;
  className?: string;
}

export function VerticalDramaCharacterVoiceCastingCard({
  lang,
  characterName,
  readOnly = false,
  voiceConfig,
  voices,
  voicesLoading = false,
  casting = false,
  onCast,
  onClear,
  clearing = false,
  onPreview,
  previewing = false,
  previewAudioUrl,
  previewCreditCost,
  speechProfile,
  onSaveStyleHints,
  savingStyleHints = false,
  className,
}: VerticalDramaCharacterVoiceCastingCardProps) {
  const t = (key: keyof typeof verticalDramaCopy) => pickCopy(lang, verticalDramaCopy[key]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingPreview, setConfirmingPreview] = useState(false);
  /** `null` (not yet edited by the user this session) means "always mirror
   *  the persisted `voiceConfig.styleHints` on every render" — once the user
   *  types or clicks "suggest", this takes over so their in-progress edit
   *  isn't clobbered by a re-render. Never auto-saved (spec 132 §7.3 hard
   *  rule) — only `handleSaveStyleHints` below persists it. */
  const [styleHintsDraft, setStyleHintsDraft] = useState<string | null>(null);
  const styleHintsText = styleHintsDraft ?? formatStyleHintsText(voiceConfig?.styleHints);

  const handleSuggestStyleHints = () => {
    if (!speechProfile) return;
    const suggested = suggestStyleHintsFromSpeechProfile(speechProfile);
    if (suggested.length === 0) return;
    const existingHints = parseStyleHintsText(styleHintsText);
    const merged = [...existingHints, ...suggested.filter((hint) => !existingHints.includes(hint))];
    setStyleHintsDraft(formatStyleHintsText(merged));
  };

  const handleSaveStyleHints = () => {
    onSaveStyleHints?.(parseStyleHintsText(styleHintsText));
  };

  const groups = useMemo(() => filterAndGroupVoiceCatalog(voices, searchQuery), [voices, searchQuery]);
  const hasAnyVoices = voices.length > 0;
  const hasResults = groups.length > 0;

  const handleSelect = (entry: VerticalDramaVoiceCatalogEntry) => {
    onCast(entry);
    setDialogOpen(false);
    setSearchQuery("");
  };

  const chipLabel = formatVoiceChipLabel(lang, voiceConfig);
  const lockedAtText = voiceConfig?.lockedAt ? voiceCastingLockedAtText(lang, voiceConfig.lockedAt) : null;

  return (
    <Card className={className} data-testid="vd-voice-casting-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Mic aria-hidden="true" className="h-4 w-4" />
          {t("voiceCastingSectionTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={voiceConfig ? "default" : "outline"}
            className="gap-1"
            data-testid="vd-voice-casting-chip"
          >
            {voiceConfig ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
            {chipLabel}
          </Badge>
          {lockedAtText && (
            <span className="text-xs text-muted-foreground" data-testid="vd-voice-casting-locked-at">
              {lockedAtText}
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={casting}
              onClick={() => setDialogOpen(true)}
              data-testid="vd-voice-casting-select-cta"
            >
              {casting ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {t("voiceCastingSelectCta")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              disabled={!voiceConfig || previewing}
              onClick={() => setConfirmingPreview(true)}
              data-testid="vd-voice-casting-preview-cta"
            >
              {previewing ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {previewing ? t("voiceCastingPreviewing") : t("voiceCastingPreviewCta")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-destructive"
              disabled={!voiceConfig || clearing}
              onClick={onClear}
              data-testid="vd-voice-casting-clear-cta"
            >
              {clearing ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {t("voiceCastingClearCta")}
            </Button>
          </div>
        )}

        {previewCreditCost != null && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="vd-voice-casting-preview-credit-cost"
          >
            {voiceCastingPreviewCreditCostText(lang, previewCreditCost)}
          </p>
        )}

        {previewAudioUrl && (
          <audio
            controls
            src={previewAudioUrl}
            aria-label={`${characterName} — ${t("voiceCastingCurrentlyCast")}`}
            data-testid="vd-voice-casting-preview-player"
            className="w-full"
          />
        )}

        {/* Voice picker dialog — searchable, grouped by language (mirrors
            `ModelSelectorDialog.tsx`'s search + grouped-card pattern). */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg" data-testid="vd-voice-casting-dialog">
            <DialogHeader>
              <DialogTitle>{t("voiceCastingDialogTitle")}</DialogTitle>
              <DialogDescription>{t("voiceCastingSearchAriaLabel")}</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("voiceCastingSearchPlaceholder")}
                aria-label={t("voiceCastingSearchAriaLabel")}
                className="pl-9"
                data-testid="vd-voice-casting-search"
              />
            </div>
            {voicesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="sr-only">{t("voiceCastingLoading")}</span>
              </div>
            ) : !hasAnyVoices ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("voiceCastingEmptyCatalog")}</p>
            ) : !hasResults ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("voiceCastingNoResults")}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((group) => (
                  <div key={group.language} className="flex flex-col gap-1.5">
                    <h4 className="sticky top-0 bg-background py-1 text-xs font-medium uppercase text-muted-foreground">
                      {group.language === VOICE_CATALOG_UNKNOWN_LANGUAGE_KEY
                        ? t("voiceCastingUnknownLanguageGroup")
                        : group.language}
                    </h4>
                    <div className="grid gap-1.5">
                      {group.entries.map((entry) => {
                        const isCurrent =
                          voiceConfig?.voiceModelId === entry.voiceModelId &&
                          voiceConfig?.voiceId === entry.voiceId;
                        return (
                          <button
                            key={`${entry.voiceModelId}::${entry.voiceId}`}
                            type="button"
                            onClick={() => handleSelect(entry)}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition-colors",
                              isCurrent
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-muted-foreground/40 hover:bg-muted",
                            )}
                            data-testid={`vd-voice-casting-option-${entry.voiceModelId}-${entry.voiceId}`}
                          >
                            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {entry.ageTag && (
                                <Badge variant="outline" className="text-[10px]">
                                  {entry.ageTag}
                                </Badge>
                              )}
                              {entry.gender && (
                                <Badge variant="outline" className="text-[10px]">
                                  {entry.gender}
                                </Badge>
                              )}
                              {isCurrent && <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Paid-preview confirm (mirrors the AlertDialog + local `confirming*`
            state convention already used by e.g. `VerticalDramaTieInReportCard.tsx`). */}
        <AlertDialog open={confirmingPreview} onOpenChange={setConfirmingPreview}>
          <AlertDialogContent data-testid="vd-voice-casting-preview-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("voiceCastingPreviewConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("voiceCastingPreviewConfirmBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("voiceCastingCancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmingPreview(false);
                  onPreview();
                }}
                data-testid="vd-voice-casting-preview-confirm-submit"
              >
                {t("voiceCastingConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!voiceConfig && !readOnly && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="vd-voice-casting-uncast-hint">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {t("voiceCastingPreviewErrorNoVoice")}
          </p>
        )}

        {/* F132F `verticalDramaCharacterProfiles` (spec 132 §7.3, added
            2026-07-09) — style-hints editor + "suggest from speech profile".
            Informational only (mirrors `voiceCasting.ts`'s own
            `styleHints` doc comment) — never sent verbatim to a TTS
            provider as control parameters, and never auto-saved: only an
            explicit click on the Save button below persists anything. */}
        {!readOnly && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">
              {t("voiceCastingStyleHintsLabel")}
            </Label>
            <Textarea
              rows={2}
              value={styleHintsText}
              onChange={(e) => setStyleHintsDraft(e.target.value)}
              placeholder={t("voiceCastingStyleHintsPlaceholder")}
              data-testid="vd-voice-casting-style-hints-input"
            />
            <div className="flex flex-wrap items-center gap-2">
              {speechProfile && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleSuggestStyleHints}
                  data-testid="vd-voice-casting-suggest-style-hints"
                >
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("voiceCastingSuggestStyleHintsCta")}
                </Button>
              )}
              {onSaveStyleHints && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  disabled={!voiceConfig || savingStyleHints}
                  onClick={handleSaveStyleHints}
                  data-testid="vd-voice-casting-save-style-hints"
                >
                  {savingStyleHints ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t("voiceCastingSaveStyleHintsCta")}
                </Button>
              )}
            </div>
            {!voiceConfig && onSaveStyleHints && (
              <p className="text-xs text-muted-foreground">
                {t("voiceCastingStyleHintsRequiresCastVoice")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default VerticalDramaCharacterVoiceCastingCard;
