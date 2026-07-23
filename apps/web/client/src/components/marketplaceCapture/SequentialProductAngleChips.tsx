/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.2, redesigned (selection-UX overhaul, user-approved mockup
 * 2026-07-23). Presentational header strip for the multi-angle product
 * reference picker: live capacity meter + trim warning + capacity-impossible
 * alert + an optional discoverability hint. Renders `null` when `!enabled`.
 *
 * The picker itself (checkbox overlay + optional angle `<select>` per
 * image) now lives directly on each card in the Product Images grid
 * (`MarketplaceCaptureProductDetail.tsx`) — clicking a card's checkbox is
 * what enrolls it (adds/removes an entry in `autoReviewProductAngleLabels`),
 * NOT assigning a label. This component no longer renders per-image angle
 * buttons and no longer accepts `images` / `primaryImageId` / `angleLabels`
 * / `onAngleLabelChange` — it is pure presentation over the already-computed
 * `capacity` (server `plan.referenceCapacity` via
 * `resolveSequentialCapacityMeter`, binding decision §3.2) and a
 * parent-computed `showDiscoverabilityHint` flag. It never consults the
 * model registry and never re-derives trim/reservation arithmetic.
 */
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";
import type { SequentialAngleLabel } from "@/lib/marketplaceSequentialStoryboardUi";

export interface SequentialProductAngleChipsCapacity {
  modelCap: number;
  attachedAngles: number;
  trimmedAngles: string[];
  capacityImpossible: boolean;
}

export interface SequentialProductAngleChipsProps {
  enabled: boolean;
  capacity: SequentialProductAngleChipsCapacity;
  modelLabel: string;
  /** Feature 136 (selection redesign) — parent-computed eligibility:
   *  sequential active, more than one product image captured, and no angle
   *  images selected yet (only the locked hero counts as selected). This
   *  component additionally renders nothing when the capacity meter itself
   *  has not loaded yet (`capacity.modelCap <= 0`). */
  showDiscoverabilityHint: boolean;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialProductAngleChips({
  enabled,
  capacity,
  modelLabel,
  showDiscoverabilityHint,
  locale,
}: SequentialProductAngleChipsProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);

  if (!enabled) return null;

  const trimmedLabels = capacity.trimmedAngles.map(
    label => copy.angleChipLabels[label as SequentialAngleLabel] ?? label
  );
  const meterAvailable = capacity.modelCap > 0;
  const remainingCount = Math.max(
    0,
    capacity.modelCap - capacity.attachedAngles
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
      {showDiscoverabilityHint && meterAvailable ? (
        <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
          {copy.referenceDiscoverabilityHint(remainingCount)}
        </p>
      ) : null}
    </div>
  );
}
