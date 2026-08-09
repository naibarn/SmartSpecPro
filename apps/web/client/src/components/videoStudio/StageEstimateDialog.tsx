/**
 * The estimate -> confirm gate required by decision D4 (Feature 142,
 * section-07). Used by scene plan, quality review and quality repair. This
 * dialog NEVER calls a mutation itself — it only calls `onConfirm`; the
 * caller is responsible for dispatching the actual stage after confirm. The
 * headline number is `ceilingCredits`, explicitly labelled a ceiling:
 * under-quoting a number the user clicks "confirm" on is the failure mode
 * this design exists to avoid.
 *
 * Reuses the Astryx `Dialog` + `Layout` / `LayoutContent` / `LayoutFooter` +
 * `DialogHeader` composition already used by `CatalogCreateDialog.tsx`.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useEffect, useState } from "react";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { describeViError, pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

/** `videoProjects.getStageEstimate` output shape (section-04 spec §4.4). */
export type StageEstimate = {
  stage: "scene_plan" | "quality_review" | "quality_repair" | "auto_draft" | "motion" | "narration";
  modelId: string;
  maxLoops: number;
  perRoundCredits: number;
  typicalCredits: number;
  ceilingCredits: number;
  callsPerRoundCeiling: number;
  basis: {
    sceneCount: number;
    narrationChars: number;
    captionChars: number;
    layerCount: number;
    claimCount: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
  };
  isCeiling: true;
};

/** Maps the two admin-actionable estimate errors to specific copy; any other
 *  value routes through the FE03 `renderableJobError` allowlist so an
 *  arbitrary non-`VI_` error is never echoed verbatim. */
function describeEstimateError(lang: VideoStudioLang, error: string | null | undefined): string | null {
  if (!error) return null;
  if (error.includes("VI_NO_RECOMMENDED_MODEL")) return pickCopy(lang, videoStudioCopy.noRecommendedModel);
  if (error.includes("VI_INSUFFICIENT_CREDITS")) return pickCopy(lang, videoStudioCopy.insufficientCredits);
  return describeViError(lang, error);
}

export function StageEstimateDialog({
  lang,
  open,
  onOpenChange,
  estimate,
  isLoading,
  error,
  destructive,
  isConfirming,
  onConfirm,
}: {
  lang: VideoStudioLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: "scene_plan" | "quality_review" | "quality_repair" | "auto_draft" | "motion" | "narration";
  /** section-04 §4.4 payload; undefined while loading or on error. */
  estimate: StageEstimate | undefined;
  isLoading: boolean;
  /** Raw error from the estimate query — routed through `renderableJobError`. */
  error?: string | null;
  /** Destructive re-run (scene plan `replace`): renders a warning and gates
   *  Confirm behind an explicit acknowledgement control. */
  destructive?: { title: string; body: string } | null;
  isConfirming?: boolean;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset the acknowledgement whenever the dialog closes/reopens or the
  // destructive warning changes, so a stale ack never survives to a
  // different (destructive) run.
  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);

  const describedError = describeEstimateError(lang, error);
  const isConfirmDisabled =
    isLoading || !estimate || Boolean(error) || (Boolean(destructive) && !acknowledged);

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      width={560}
      data-testid="video-studio-stage-estimate-dialog"
    >
      <Layout
        height="auto"
        header={
          <DialogHeader title={pickCopy(lang, videoStudioCopy.estimateTitle)} onOpenChange={onOpenChange} />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {isLoading ? (
                <HStack gap={2} align="center">
                  <Spinner size="sm" />
                  <Text type="body" color="secondary">
                    {pickCopy(lang, videoStudioCopy.loading)}
                  </Text>
                </HStack>
              ) : describedError ? (
                <Banner
                  status="error"
                  data-testid="video-studio-stage-estimate-error"
                  title={describedError}
                />
              ) : estimate ? (
                <VStack gap={3}>
                  <VStack gap={1}>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, videoStudioCopy.estimateCeiling)}
                      </Text>
                      <Text type="body" weight="bold" data-testid="video-studio-estimate-ceiling">
                        {estimate.ceilingCredits}
                      </Text>
                    </HStack>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, videoStudioCopy.estimateTypical)}
                      </Text>
                      <Text type="body" data-testid="video-studio-estimate-typical">
                        {estimate.typicalCredits}
                      </Text>
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {estimate.perRoundCredits} × {estimate.callsPerRoundCeiling} × {estimate.maxLoops} ={" "}
                      {estimate.ceilingCredits}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {pickCopy(lang, videoStudioCopy.estimateCeilingNote)}
                    </Text>
                  </VStack>

                  <HStack gap={2} wrap="wrap">
                    <Badge
                      variant="neutral"
                      label={`${pickCopy(lang, videoStudioCopy.estimateModel)}: ${estimate.modelId}`}
                    />
                    <Badge
                      variant="neutral"
                      label={`${pickCopy(lang, videoStudioCopy.estimateMaxLoops)}: ${estimate.maxLoops}`}
                    />
                  </HStack>

                  <Collapsible
                    trigger={pickCopy(lang, videoStudioCopy.estimateBasis)}
                    defaultIsOpen={false}
                    data-testid="video-studio-estimate-basis"
                  >
                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "ฉาก", en: "Scenes" })}: {estimate.basis.sceneCount}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "ตัวอักษรบทบรรยาย", en: "Narration chars" })}:{" "}
                        {estimate.basis.narrationChars}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "ตัวอักษรคำบรรยาย", en: "Caption chars" })}:{" "}
                        {estimate.basis.captionChars}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "จำนวนเลเยอร์", en: "Layers" })}: {estimate.basis.layerCount}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "การอ้างสิทธิ์", en: "Claims" })}: {estimate.basis.claimCount}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, { th: "โทเค็นโดยประมาณ", en: "Est. tokens" })}:{" "}
                        {estimate.basis.estimatedInputTokens} / {estimate.basis.estimatedOutputTokens}
                      </Text>
                    </VStack>
                  </Collapsible>
                </VStack>
              ) : null}

              {destructive ? (
                <VStack gap={2}>
                  <Banner
                    status="warning"
                    data-testid="video-studio-estimate-destructive-warning"
                    title={destructive.title}
                    description={destructive.body}
                  />
                  <CheckboxInput
                    label={pickCopy(lang, videoStudioCopy.destructiveAcknowledge)}
                    value={acknowledged}
                    onChange={checked => setAcknowledged(checked)}
                    data-testid="video-studio-estimate-destructive-ack"
                  />
                </VStack>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end">
              <Button
                type="button"
                variant="secondary"
                label={pickCopy(lang, videoStudioCopy.cancel)}
                onClick={() => onOpenChange(false)}
              />
              <Button
                type="button"
                variant="primary"
                data-testid="video-studio-stage-estimate-confirm"
                label={pickCopy(lang, videoStudioCopy.estimateConfirm)}
                isDisabled={isConfirmDisabled}
                isLoading={isConfirming}
                onClick={onConfirm}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
