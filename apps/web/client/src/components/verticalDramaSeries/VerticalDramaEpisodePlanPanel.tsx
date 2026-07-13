/**
 * VerticalDramaEpisodePlanPanel (planning/`polished-toasting-gadget.md`
 * Part A2) — read-only reference card for the episode's ชื่อตอน / เรื่องย่อ /
 * จุดดำเนินเรื่อง / จุดค้าง (workingTitle / logline / keyBeats /
 * cliffhangerLine), replacing the `VerticalDramaProductionWizard` mount in
 * `VerticalDramaEpisodeWorkspace.tsx`.
 *
 * Pure read-only display: no mutations, no edit affordances. The data comes
 * straight from `getEpisodeDetail`'s `episodePlan` field (resolved
 * server-side from the series bible's ACTIVE breakdown item for this
 * episode) — `null` when the episode has no drafted plan item yet, in which
 * case this renders a placeholder/empty state instead.
 *
 * Visual pattern matches the existing read-only card convention already
 * used across this workspace (`VerticalDramaProductionWizard`'s
 * `CriterionRow`/section wrappers, `VerticalDramaStoryboardPanel`'s muted
 * labeled text blocks): `rounded-lg border border-border p-4` container with
 * small muted uppercase section labels
 * (`text-[10px] font-medium uppercase tracking-wide text-muted-foreground`).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { VerticalDramaLang } from "./verticalDramaCopy";
import { vdCopy } from "./verticalDramaWorkspaceCopy";

export interface VerticalDramaEpisodePlanSummaryView {
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  cliffhangerLine: string | null;
}

export interface VerticalDramaEpisodePlanPanelProps {
  lang: VerticalDramaLang;
  episodePlan: VerticalDramaEpisodePlanSummaryView | null;
  className?: string;
}

function PlanField({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export function VerticalDramaEpisodePlanPanel({
  lang,
  episodePlan,
  className,
}: VerticalDramaEpisodePlanPanelProps) {
  const t = vdCopy(lang);

  return (
    <section
      aria-label="Sub-episode plan"
      className={cn("rounded-lg border border-border p-4 text-sm", className)}
      data-testid="vd-episode-plan-panel"
    >
      <h3 className="mb-3 text-sm font-semibold">{t.episodePlanPanelTitle}</h3>
      {episodePlan ? (
        <div className="flex flex-col gap-3">
          <PlanField
            label={t.episodePlanWorkingTitleLabel}
            testId="vd-episode-plan-working-title"
          >
            <p className="font-medium">{episodePlan.workingTitle}</p>
          </PlanField>

          <PlanField
            label={t.episodePlanLoglineLabel}
            testId="vd-episode-plan-logline"
          >
            <p className="whitespace-pre-wrap text-muted-foreground">
              {episodePlan.logline}
            </p>
          </PlanField>

          {episodePlan.keyBeats.length > 0 ? (
            <PlanField
              label={t.episodePlanKeyBeatsLabel}
              testId="vd-episode-plan-key-beats"
            >
              <ul className="list-inside list-disc text-muted-foreground">
                {episodePlan.keyBeats.map((beat, i) => (
                  <li key={i}>{beat}</li>
                ))}
              </ul>
            </PlanField>
          ) : null}

          {episodePlan.cliffhangerLine ? (
            <PlanField
              label={t.episodePlanCliffhangerLabel}
              testId="vd-episode-plan-cliffhanger"
            >
              <p className="text-muted-foreground">
                {episodePlan.cliffhangerLine}
              </p>
            </PlanField>
          ) : null}
        </div>
      ) : (
        <p
          className="text-muted-foreground"
          data-testid="vd-episode-plan-empty"
        >
          {t.episodePlanEmptyState}
        </p>
      )}
    </section>
  );
}

export default VerticalDramaEpisodePlanPanel;
