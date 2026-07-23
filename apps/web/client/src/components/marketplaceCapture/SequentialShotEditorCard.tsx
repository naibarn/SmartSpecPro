/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.5. One per-shot card: view + edit + regenerate. Character
 * counts recompute from the LOCAL edited text for display only (never
 * client-side truncation or rewriting — spec §5.4). Errors render inside
 * the affected card with the blocker id shown as a code chip and the
 * server message as the body; `getSequentialShotBlockerHint` may add an
 * optional "what to fix" line (fallback = server message alone).
 *
 * Marketplace spare-image repair (2026-07-23) — when `shot.alternates` has
 * more than one entry, a compact thumbnail strip renders under the image
 * so a bad shot (e.g. wrong product material) can be repaired by swapping
 * in an already-generated, already-paid-for frame at zero extra credit.
 * Renders nothing for 0 or 1 alternates — the common single-wave case gets
 * no layout shift.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SequentialShotCardModel } from "@/lib/marketplaceSequentialStoryboardUi";
import {
  getMarketplaceHyperframesUiCopy,
  getSequentialShotBlockerHint,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialShotEditorCardShotError {
  shotId: number;
  blockerId: string;
  message: string;
}

export interface SequentialShotEditorCardSaveInput {
  shotId: number;
  dialogue: string;
  imagePrompt: string;
  videoPrompt: string;
}

export interface SequentialShotEditorCardProps {
  shot: SequentialShotCardModel;
  imageMaxChars: number;
  videoMaxChars: number;
  busy?: boolean;
  saving?: boolean;
  /** True while this shot's spare-image swap mutation is in flight. Follows
   *  the same per-card boolean convention as `busy`/`saving`. */
  swappingAlternate?: boolean;
  error?: SequentialShotEditorCardShotError;
  onRegenerate: (shotId: number) => void;
  onSaveEdits: (input: SequentialShotEditorCardSaveInput) => void;
  /** Marketplace spare-image repair — swap this shot's live frame to an
   *  already-generated, already-paid-for alternate. Never charges credits. */
  onSelectAlternate: (input: { shotId: number; attempt: number }) => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialShotEditorCard({
  shot,
  imageMaxChars,
  videoMaxChars,
  busy,
  saving,
  swappingAlternate,
  error,
  onRegenerate,
  onSaveEdits,
  onSelectAlternate,
  locale,
}: SequentialShotEditorCardProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const thai = copy.locale === "th";
  // Local edit buffers, initialized once from the projected shot model.
  // Never reset from `error` (binding decision §3.6 / spec §5.7 — a
  // rejected save must retain exactly what the user typed).
  const [dialogue, setDialogue] = useState(shot.dialogue);
  const [imagePrompt, setImagePrompt] = useState(shot.imagePrompt);
  const [videoPrompt, setVideoPrompt] = useState(shot.videoPrompt);

  const imageOverBudget = imagePrompt.length > imageMaxChars;
  const videoOverBudget = videoPrompt.length > videoMaxChars;
  const hint = error ? getSequentialShotBlockerHint(error.blockerId, copy.locale) : null;

  return (
    <div
      data-testid={`sequential-shot-card-${shot.shotId}`}
      className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {thai ? `ช็อตที่ ${shot.shotId}` : `Shot ${shot.shotId}`}
          </span>
          {shot.purpose ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{shot.purpose}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {shot.qcStatus ? <Badge variant="outline">{shot.qcStatus}</Badge> : null}
          {shot.demonstrationType ? (
            <Badge variant="secondary">{shot.demonstrationType}</Badge>
          ) : null}
          {shot.guardianRequired ? <Badge>{copy.guardianBadge}</Badge> : null}
        </div>
      </div>

      {shot.frameUrl ? (
        <img
          src={shot.frameUrl}
          alt=""
          className="h-32 w-full rounded-md border object-cover dark:border-slate-700"
        />
      ) : null}

      {shot.alternates.length > 1 ? (
        <div
          data-testid={`sequential-shot-alternates-${shot.shotId}`}
          className="space-y-1"
        >
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.spareImagesTitle}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shot.alternates.map(alternate => {
              const attemptLabel = copy.spareImageAttemptLabel(
                alternate.attempt
              );
              const scoreSuffix =
                typeof alternate.qualityScore === "number"
                  ? copy.spareImageQualityScoreSuffix(alternate.qualityScore)
                  : "";
              const disabled =
                alternate.isSelected || Boolean(swappingAlternate);
              return (
                <button
                  key={alternate.attempt}
                  type="button"
                  data-testid={`sequential-shot-alternate-${shot.shotId}-${alternate.attempt}`}
                  disabled={disabled}
                  aria-pressed={alternate.isSelected}
                  aria-label={
                    alternate.isSelected
                      ? `${attemptLabel} — ${copy.spareImageCurrentBadge}`
                      : copy.spareImageSelectAriaLabel(alternate.attempt)
                  }
                  title={`${attemptLabel}${scoreSuffix}`}
                  onClick={() =>
                    onSelectAlternate({
                      shotId: shot.shotId,
                      attempt: alternate.attempt,
                    })
                  }
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed ${
                    alternate.isSelected
                      ? "border-emerald-500 ring-2 ring-emerald-100"
                      : "border-slate-200 hover:border-sky-500 disabled:opacity-60"
                  }`}
                >
                  <img
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
                      className="absolute right-0 top-0 rounded-none rounded-bl-md border-0 bg-emerald-600 px-1 py-0 text-[9px] text-white"
                    >
                      {copy.spareImageCurrentBadge}
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-1 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-mono">{error.blockerId}</p>
          <p>{error.message}</p>
          {hint ? <p className="text-red-700 dark:text-red-300">{hint}</p> : null}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {thai ? "บทพูด" : "Dialogue"}
        </span>
        <Textarea
          value={dialogue}
          onChange={event => setDialogue(event.target.value)}
          className="min-h-12"
        />
      </label>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>{thai ? "Prompt ภาพเริ่มต้น" : "Start-frame image prompt"}</span>
          <span className={imageOverBudget ? "text-amber-700 dark:text-amber-400" : ""}>
            {copy.promptCharCount(imagePrompt.length, imageMaxChars)}
          </span>
        </span>
        <Textarea
          value={imagePrompt}
          onChange={event => setImagePrompt(event.target.value)}
          className="min-h-24"
        />
        {imageOverBudget ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{copy.promptOverBudget}</p>
        ) : null}
      </label>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>{thai ? "Prompt วิดีโอ" : "Video prompt"}</span>
          <span className={videoOverBudget ? "text-amber-700 dark:text-amber-400" : ""}>
            {copy.promptCharCount(videoPrompt.length, videoMaxChars)}
          </span>
        </span>
        <Textarea
          value={videoPrompt}
          onChange={event => setVideoPrompt(event.target.value)}
          className="min-h-20"
        />
        {videoOverBudget ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{copy.promptOverBudget}</p>
        ) : null}
      </label>

      {shot.claimSources.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {shot.claimSources.map((claim, index) => (
            <li key={index}>
              {claim.text}{" "}
              <span className="text-slate-400 dark:text-slate-500">({claim.support})</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={Boolean(saving)}
          onClick={() =>
            onSaveEdits({ shotId: shot.shotId, dialogue, imagePrompt, videoPrompt })
          }
        >
          {copy.saveShotEdits}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => onRegenerate(shot.shotId)}
        >
          {copy.regenerateShot}
        </Button>
      </div>
    </div>
  );
}
