/**
 * VerticalDramaBlendReportPanel (spec feature 131, §8.2.2.C ·
 * section-15-genre-preset-visual-identity-and-mix — "Component Map").
 *
 * Renders the Mix and Match v2 blend provenance report returned by
 * `trpc.verticalDramaSeries.synthesizeGenrePreset` whenever the response is
 * shaped like v2 (`contract_version: 2`, carries `blendReport`) — the SERVER
 * decides whether v2 fields exist (tenant feature flag
 * `verticalDramaSeriesPresetMixV2`); this component only ever renders when
 * its caller already found a v2-shaped result, so it never needs its own
 * flag check.
 *
 * Two views over the same `blendReport`, per the section-15 UI/UX Contract:
 *  1. Per-preset coverage summary — proves every selection contributed,
 *     using the Copy Contract's exact "สิ่งที่ preset นี้เพิ่มเข้ามา: {elements}"
 *     string — plus an under-blend warning card for any preset that fell
 *     short of `minFacetsPerPreset` even after the server's one corrective
 *     retry (Copy Contract: "preset '{title}' ยังไม่ถูกผสมจริง...").
 *  2. Per-facet contribution detail (collapsible per facet via native
 *     `<details>` — keyboard/AT accessible with zero extra JS — satisfies
 *     the Responsive Matrix's "blend report collapses per facet" on mobile).
 *
 * Kept/dropped is always TEXT + ICON (never color-only) per the section-15
 * Accessibility Acceptance.
 */

import { useState } from "react";
import { AlertTriangle, Blend, CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  VerticalDramaBlendFacetContribution,
  VerticalDramaBlendReport,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import {
  blendContributionSummary,
  blendFacetCopy,
  pickCopy,
  underBlendedWarningText,
  verticalDramaCopy,
  type VerticalDramaLang,
} from "./verticalDramaCopy";

export interface VerticalDramaPresetContributionSummary {
  presetId: string;
  title: string;
  /** Facet count with a `kept: true` contribution — from `contributionCoverage`. */
  coverage: number;
  /** `element` text from every `kept: true` contribution this preset has, in facet order. */
  keptElements: string[];
  underBlended: boolean;
}

/**
 * Pure projection of `blendReport` into one summary row per preset, ordered
 * by `presetOrder` (the caller's selection order — `contributionCoverage`'s
 * own key order is NOT reliable for this: numeric-looking preset id strings
 * get reordered ascending by the JS engine regardless of insertion order).
 * Exported for direct unit testing.
 */
export function buildPresetContributionSummaries(
  blendReport: Pick<VerticalDramaBlendReport, "facets" | "contributionCoverage" | "underBlended">,
  presetOrder: string[],
  presetTitleById: Record<string, string>,
): VerticalDramaPresetContributionSummary[] {
  const underBlendedSet = new Set(blendReport.underBlended);
  const orderedIds = [
    ...presetOrder,
    ...Object.keys(blendReport.contributionCoverage).filter((id) => !presetOrder.includes(id)),
  ];

  return orderedIds
    .filter((presetId) => presetId in blendReport.contributionCoverage)
    .map((presetId) => {
      const keptElements: string[] = [];
      for (const facetEntry of blendReport.facets) {
        for (const contribution of facetEntry.contributions) {
          if (contribution.presetId === presetId && contribution.kept) {
            keptElements.push(contribution.element);
          }
        }
      }
      return {
        presetId,
        title: presetTitleById[presetId] ?? presetId,
        coverage: blendReport.contributionCoverage[presetId] ?? 0,
        keptElements,
        underBlended: underBlendedSet.has(presetId),
      };
    });
}

export interface VerticalDramaBlendReportPanelProps {
  lang: VerticalDramaLang;
  blendReport: VerticalDramaBlendReport;
  /** Selection order (e.g. the wizard's `mixPresetIds`) — drives display order. */
  presetOrder: string[];
  presetTitleById: Record<string, string>;
  /** CTA on an under-blend warning — scrolls/focuses back to the weight sliders. */
  onAdjustWeights?: () => void;
}

export function VerticalDramaBlendReportPanel({
  lang,
  blendReport,
  presetOrder,
  presetTitleById,
  onAdjustWeights,
}: VerticalDramaBlendReportPanelProps) {
  const th = lang === "th";
  const summaries = buildPresetContributionSummaries(blendReport, presetOrder, presetTitleById);
  const underBlendedSummaries = summaries.filter((s) => s.underBlended);
  // One facet open at a time (spec/UX: `<details open>` on every facet forced
  // them all expanded) — defaults to the first facet so there's always
  // something visible on first render.
  const [openFacet, setOpenFacet] = useState<string | null>(
    blendReport.facets[0]?.facet ?? null,
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3" data-testid="vd-blend-report-panel">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Blend aria-hidden="true" className="h-4 w-4" />
          {pickCopy(lang, verticalDramaCopy.blendReportTitle)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.blendMinFacetsLabel)}: {blendReport.minFacetsPerPreset}{" "}
          {pickCopy(lang, verticalDramaCopy.blendCoverageUnit)}
        </p>
      </div>
      <div className="grid gap-4 text-sm">
        <div className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.blendReportCoverageTitle)}
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summaries.map((summary) => (
              <li key={summary.presetId} className="rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{summary.title}</p>
                  <Badge variant={summary.underBlended ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                    {summary.coverage}/{blendReport.minFacetsPerPreset}+ {pickCopy(lang, verticalDramaCopy.blendCoverageUnit)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {blendContributionSummary(lang, summary.keptElements)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {underBlendedSummaries.length > 0 && (
          <div className="grid gap-2" role="alert">
            {underBlendedSummaries.map((summary) => (
              <div
                key={summary.presetId}
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p>
                    {underBlendedWarningText(
                      lang,
                      summary.title,
                      summary.coverage,
                      blendReport.minFacetsPerPreset,
                    )}
                  </p>
                  {onAdjustWeights && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 px-2 text-xs"
                      onClick={onAdjustWeights}
                    >
                      {pickCopy(lang, verticalDramaCopy.blendAdjustWeightsCta)}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.blendReportFacetsTitle)}
          </p>
          <div className="grid gap-1.5">
            {blendReport.facets.map((facetEntry) => (
              <details
                key={facetEntry.facet}
                open={openFacet === facetEntry.facet}
                onToggle={(e) => {
                  if (e.currentTarget.open) setOpenFacet(facetEntry.facet);
                }}
                className="rounded-md border p-2 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="cursor-pointer py-1.5 text-xs font-medium">
                  {pickCopy(lang, blendFacetCopy[facetEntry.facet]) ?? facetEntry.facet}
                </summary>
                <ul className="mt-2 grid gap-1.5">
                  {facetEntry.contributions.map((contribution, i) => (
                    <ContributionRow
                      key={`${contribution.presetId}-${i}`}
                      lang={lang}
                      contribution={contribution}
                      presetTitle={presetTitleById[contribution.presetId] ?? contribution.presetId}
                    />
                  ))}
                  {facetEntry.contributions.length === 0 && (
                    <li className="text-xs italic text-muted-foreground">
                      {th ? "ไม่มีข้อมูลด้านนี้" : "No contributions for this facet"}
                    </li>
                  )}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributionRow({
  lang,
  contribution,
  presetTitle,
}: {
  lang: VerticalDramaLang;
  contribution: VerticalDramaBlendFacetContribution;
  presetTitle: string;
}) {
  const Icon = contribution.kept ? CheckCircle2 : Circle;
  const statusLabel = pickCopy(
    lang,
    contribution.kept ? verticalDramaCopy.blendKeptLabel : verticalDramaCopy.blendNotKeptLabel,
  );
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon
        className={
          contribution.kept
            ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
            : "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        }
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">
        <span className="font-medium">{presetTitle}</span>
        {": "}
        <span className={contribution.kept ? undefined : "text-muted-foreground line-through"}>
          {contribution.element}
        </span>
        <span className="ml-1 text-muted-foreground">({statusLabel})</span>
      </span>
    </li>
  );
}
