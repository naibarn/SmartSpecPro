/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.2. Presentational: angle chips + live capacity meter + trim
 * warning + evidence-only labels for the multi-angle product reference
 * picker (spec §21.2, §8.3). Renders `null` when `!enabled`. Chip rows
 * reuse the existing choice-group visual language of the Auto panel
 * (`renderCharacterChoiceGroup`, MPCPD) — a labeled group of
 * `aria-pressed` buttons, not a new design.
 *
 * `capacity` always comes from the caller (server `plan.referenceCapacity`
 * via `resolveSequentialCapacityMeter`, binding decision §3.2) — this
 * component never consults the model registry and never re-derives trim
 * arithmetic; it only projects the already-computed `entries` (via the
 * shared pure lib) for display and reports selection changes by image id.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  buildSequentialAngleSelectionEntries,
  SEQUENTIAL_ANGLE_LABELS,
  type SequentialAngleLabel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialProductAngleChipsImageInput {
  id: string;
  url: string;
  ref?: string | null;
  hash?: string | null;
  storageKey?: string | null;
  source?: string | null;
}

export interface SequentialProductAngleChipsCapacity {
  modelCap: number;
  attachedAngles: number;
  trimmedAngles: string[];
  capacityImpossible: boolean;
}

export interface SequentialProductAngleChipsProps {
  enabled: boolean;
  images: ReadonlyArray<SequentialProductAngleChipsImageInput>;
  primaryImageId?: string | null;
  angleLabels: Record<string, SequentialAngleLabel>;
  onAngleLabelChange: (imageId: string, label: SequentialAngleLabel) => void;
  capacity: SequentialProductAngleChipsCapacity;
  modelLabel: string;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialProductAngleChips({
  enabled,
  images,
  primaryImageId,
  angleLabels,
  onAngleLabelChange,
  capacity,
  modelLabel,
  locale,
}: SequentialProductAngleChipsProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const entries = useMemo(
    () =>
      buildSequentialAngleSelectionEntries({
        images,
        primaryImageId,
        angleLabels,
      }),
    [images, primaryImageId, angleLabels]
  );

  if (!enabled) return null;

  const trimmedLabels = capacity.trimmedAngles.map(
    label => copy.angleChipLabels[label as SequentialAngleLabel] ?? label
  );

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {copy.referenceCapacityMeter(
          capacity.attachedAngles,
          capacity.modelCap,
          modelLabel
        )}
      </p>
      {capacity.capacityImpossible ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {copy.referenceCapacityImpossible(modelLabel)}
        </div>
      ) : null}
      {trimmedLabels.length > 0 ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {copy.referenceTrimWarning(trimmedLabels)}
        </p>
      ) : null}
      {entries.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry, index) => (
            <fieldset
              key={entry.imageId}
              className={`rounded-md border p-2 ${
                entry.evidenceOnly
                  ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
              }`}
            >
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {copy.locale === "th" ? `รูปที่ ${index + 1}` : `Image ${index + 1}`}
              </legend>
              {entry.evidenceOnly ? (
                <Badge variant="outline" className="mb-1">
                  {copy.referenceEvidenceOnly}
                </Badge>
              ) : null}
              <div className="grid grid-cols-2 gap-1">
                {SEQUENTIAL_ANGLE_LABELS.map(label => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={entry.angleLabel === label}
                    onClick={() => onAngleLabelChange(entry.imageId, label)}
                    className={`min-h-8 rounded border px-2 py-1 text-xs font-medium transition ${
                      entry.angleLabel === label
                        ? "border-sky-500 bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950 dark:text-sky-100"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {copy.angleChipLabels[label]}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
    </div>
  );
}
