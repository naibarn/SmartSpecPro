/**
 * Marketplace spare-image repair — shared thumbnail strip.
 *
 * Extracted 2026-07-23 (direct user feedback on b661284a6) so the strip
 * renders in TWO places with byte-identical test ids and copy:
 *  - `SequentialShotEditorCard.tsx` — the collapsed "ช็อตภาพทั้งหมด 9 ภาพ"
 *    grid section. Original placement; clicking a thumbnail selects a spare
 *    immediately (legacy behavior, preserved exactly via the `layout="scroll"`
 *    / `size="sm"` defaults below).
 *  - `StoryboardBatchReviewDialog.tsx` clip list — the PRIMARY placement
 *    (moved here 2026-07-23, then relocated again the same day per
 *    follow-up feedback on 09f311ad1: the first placement squeezed the
 *    strip into the ~130px-wide left column next to the Ref thumbnail,
 *    forcing a horizontal scrollbar for even 2 thumbnails; it now renders
 *    full width in the wide middle column, directly below the action
 *    button row, using `layout="wrap"` + `size="md"` so every alternate
 *    fits without scrolling). Clicking a thumbnail there opens a
 *    full-screen preview instead of swapping immediately (`onOpenPreview`),
 *    with an explicit "use this image" action living in that preview.
 *
 * Thumbnails always preserve the shot's 9:16 vertical aspect
 * (`aspect-[9/16]`) — never squashed into a square or wide crop, so the
 * product/character in the frame stays legible.
 *
 * Renders nothing when `alternates.length < 2` (the common single-wave
 * case) — no layout shift, matching the rest of this feature.
 */
import { Badge } from "@/components/ui/badge";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { cn } from "@/lib/utils";
import type { SequentialShotAlternate } from "@/lib/marketplaceSequentialStoryboardUi";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

const THUMBNAIL_SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "w-16",
  md: "w-24",
};

export interface SequentialShotAlternatesStripProps {
  shotId: number;
  alternates: SequentialShotAlternate[];
  /** True while this shot's spare-image swap mutation is in flight —
   *  disables every thumbnail for this shot, mirroring the per-card
   *  `busy`/`saving` convention used across this feature. */
  swapping?: boolean;
  onSelectAlternate: (input: { shotId: number; attempt: number }) => void;
  /**
   * When provided, clicking a non-selected, non-disabled thumbnail calls
   * this INSTEAD of `onSelectAlternate` — the caller is expected to open a
   * full-screen preview with its own explicit "use this image" action that
   * then calls `onSelectAlternate`. Omit to keep the original
   * click-to-select-immediately behavior used by `SequentialShotEditorCard`.
   */
  onOpenPreview?: (input: {
    attempt: number;
    imageUrl: string;
    label: string;
    isSelected: boolean;
  }) => void;
  locale?: MarketplaceHyperframesUiLocale | string;
  /** Merged onto the root element, e.g. for grid placement in a caller's
   *  own layout. */
  className?: string;
  /**
   * `"scroll"` (default) — thumbnails stay on one row with horizontal
   * overflow-scroll, matching `SequentialShotEditorCard`'s original,
   * narrow-column behavior.
   * `"wrap"` — no horizontal scroll; thumbnails wrap onto additional rows
   * once they no longer fit, for placements with a wide, mostly-empty row
   * (the clip list's middle column).
   */
  layout?: "scroll" | "wrap";
  /** `"sm"` (default, 64px) matches the original size. `"md"` (96px) is a
   *  bit larger for placements with room to spare — still true 9:16, never
   *  letterboxed. */
  size?: "sm" | "md";
}

export function SequentialShotAlternatesStrip({
  shotId,
  alternates,
  swapping,
  onSelectAlternate,
  onOpenPreview,
  locale,
  className,
  layout = "scroll",
  size = "sm",
}: SequentialShotAlternatesStripProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);

  if (alternates.length < 2) return null;

  return (
    <div
      data-testid={`sequential-shot-alternates-${shotId}`}
      className={cn("space-y-1", className)}
    >
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {copy.spareImagesTitle}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {copy.spareImageSelectionHint} · {copy.spareImageUseThisLabel}
      </p>
      <div
        className={cn(
          "flex gap-2",
          layout === "wrap" ? "flex-wrap" : "overflow-x-auto pb-1"
        )}
      >
        {alternates.map(alternate => {
          const attemptLabel = copy.spareImageAttemptLabel(alternate.attempt);
          const scoreSuffix =
            typeof alternate.qualityScore === "number"
              ? copy.spareImageQualityScoreSuffix(alternate.qualityScore)
              : "";
          const disabled = alternate.isSelected || Boolean(swapping);
          return (
            <button
              key={alternate.attempt}
              type="button"
              data-testid={`sequential-shot-alternate-${shotId}-${alternate.attempt}`}
              disabled={disabled}
              aria-pressed={alternate.isSelected}
              aria-label={
                alternate.isSelected
                  ? `${attemptLabel} — ${copy.spareImageCurrentBadge}`
                  : onOpenPreview
                    ? copy.spareImagePreviewAriaLabel(alternate.attempt)
                    : copy.spareImageSelectAriaLabel(alternate.attempt)
              }
              title={`${attemptLabel}${scoreSuffix}`}
              onClick={() =>
                onOpenPreview
                  ? onOpenPreview({
                      attempt: alternate.attempt,
                      imageUrl: alternate.imageUrl,
                      label: `${attemptLabel}${scoreSuffix}`,
                      isSelected: alternate.isSelected,
                    })
                  : onSelectAlternate({ shotId, attempt: alternate.attempt })
              }
              className={cn(
                "relative aspect-[9/16] shrink-0 overflow-hidden rounded-md border-2 transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed",
                THUMBNAIL_SIZE_CLASSES[size],
                alternate.isSelected
                  ? "border-emerald-500 ring-2 ring-emerald-100"
                  : "border-slate-200 hover:border-sky-500 disabled:opacity-90"
              )}
            >
              <AuthenticatedMediaImage
                src={alternate.imageUrl}
                alt={attemptLabel}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] leading-tight text-white">
                {attemptLabel}
                {scoreSuffix}
              </span>
              {alternate.isSelected ? (
                <Badge
                  variant="default"
                  className="absolute right-0 top-0 rounded-none rounded-bl-md border-0 bg-emerald-700 px-1 py-0 text-[9px] text-white"
                >
                  {copy.spareImageCurrentBadge}
                </Badge>
              ) : null}
              {!alternate.isSelected ? (
                <span className="absolute inset-x-0 top-0 bg-sky-700/90 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                  {copy.spareImageUseThisLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
