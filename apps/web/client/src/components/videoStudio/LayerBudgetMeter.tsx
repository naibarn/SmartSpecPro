/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1, §4.6.
 *
 * The 40-layer render budget as a permanent, always-visible meter above the
 * timeline — never a toast, never dependent on a throwing call. Reads
 * `trpc.videoProjects.getLayerBudget`, which is built on the SAME
 * non-throwing dry-estimate the server's `compiledTotal` uses (see that
 * procedure's docstring), so it keeps rendering a number even when brand
 * locks would make an actual compile throw.
 *
 * Breakdown is presented in the exact Thai nouns the user sees elsewhere
 * (`แม่แบบฉาก N · ที่คุณวางเอง N · ซับไทเทิล N · เสียง N = N/40`) per §4.15's
 * consistency rule — `เลเยอร์` is reserved for THIS component; the timeline
 * itself never uses that word for an individual item (that's `คลิป`).
 *
 * Amber at >=34; at 40/40 the two cheapest remedies are stated inline
 * (never a toast/dialog) per §4.6/AC11.
 */
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

import { trpc } from "@/lib/trpc";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

/** §4.6 — amber threshold. */
const AMBER_THRESHOLD = 34;

export interface LayerBudgetMeterProps {
  lang: VideoStudioLang;
  projectId: number;
}

export function LayerBudgetMeter({ lang, projectId }: LayerBudgetMeterProps) {
  const budgetQuery = trpc.videoProjects.getLayerBudget.useQuery({ projectId });

  if (budgetQuery.isLoading || !budgetQuery.data) {
    return (
      <Card data-testid="vs-budget-meter" data-state="loading">
        <Text type="supporting" color="secondary">
          {pickCopy(lang, videoStudioCopy.budgetMeterLoading)}
        </Text>
      </Card>
    );
  }

  const budget = budgetQuery.data;
  const isFull = budget.compiledTotal >= budget.max;
  const isAmber = budget.compiledTotal >= AMBER_THRESHOLD;
  const status: "error" | "warning" | "neutral" = isFull ? "error" : isAmber ? "warning" : "neutral";

  const breakdown = [
    `${pickCopy(lang, videoStudioCopy.budgetMeterTemplate)} ${budget.templateLayers}`,
    `${pickCopy(lang, videoStudioCopy.budgetMeterHandAuthored)} ${budget.handAuthoredLayers}`,
    `${pickCopy(lang, videoStudioCopy.budgetMeterCaptions)} ${budget.captionLayers}`,
    `${pickCopy(lang, videoStudioCopy.budgetMeterAudio)} ${budget.audioLayers}`,
  ].join(" · ");

  return (
    <Card data-testid="vs-budget-meter" data-state={status}>
      <VStack gap={2}>
        <HStack justify="between" align="center" wrap="wrap">
          <Text type="body" weight="medium">
            {pickCopy(lang, videoStudioCopy.budgetMeterLabel)}
          </Text>
          <Badge
            variant={isFull ? "error" : isAmber ? "warning" : "neutral"}
            label={`${breakdown} = ${budget.compiledTotal}/${budget.max}`}
          />
        </HStack>

        {isFull ? (
          <VStack gap={1} data-testid="vs-budget-meter-remedies">
            <Text type="supporting" weight="medium" className="text-red-500">
              {pickCopy(lang, videoStudioCopy.budgetMeterFullTitle)}
            </Text>
            <Text type="supporting" color="secondary">
              • {pickCopy(lang, videoStudioCopy.budgetMeterRemedyBurnIn)}
            </Text>
            <Text type="supporting" color="secondary">
              • {pickCopy(lang, videoStudioCopy.budgetMeterRemedyDeleteDecorative)}
            </Text>
          </VStack>
        ) : null}
      </VStack>
    </Card>
  );
}
