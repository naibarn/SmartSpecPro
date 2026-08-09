/**
 * Scenes stage panel (Feature 133, section-08; reworked in Feature 142,
 * section-07 now that `runScenePlanStage` is real) — consolidates the plan's
 * "Content" and "Scenes" stages into one scene-list editor (both operate on
 * the same `document.scenes` array; there is no separate underlying data
 * structure to justify two panels — documented UI simplification).
 * Add/remove scenes, edit timing + narration text. Visual/motion template
 * assignment lives in `MotionPanel` (a separate concern).
 *
 * The AI scene-plan launch goes through `StageEstimateDialog` (D4) with a
 * `fill_empty` (default, additive) / `replace` (destructive) re-run mode
 * selector; `replace` requires an explicit destructive acknowledgement
 * before Confirm (spec §6.7) — the previous document survives as a
 * revertable revision either way.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from "lucide-react";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { trpc } from "@/lib/trpc";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { StageEstimateDialog, type StageEstimate } from "./StageEstimateDialog";
import { StageLaunchCard } from "./StageLaunchCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

function nextSceneId(scenes: Scene[]): string {
  let n = scenes.length + 1;
  const existing = new Set(scenes.map((s) => s.sceneId));
  while (existing.has(`scene-${n}`)) n += 1;
  return `scene-${n}`;
}

/** Recomputes `startMs`/`endMs` sequentially from each scene's own duration
 *  (`endMs - startMs`) so reordering/duplicating/deleting never leaves gaps
 *  or overlaps behind for the user to hand-fix. Each scene's duration is
 *  preserved exactly; only its position on the timeline shifts. */
function resequenceScenes(scenes: Scene[]): Scene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const duration = Math.max(0, scene.endMs - scene.startMs);
    const resequenced = { ...scene, startMs: cursor, endMs: cursor + duration };
    cursor += duration;
    return resequenced;
  });
}

/** A scene is "empty" (safe to delete without confirmation) only if it has
 *  no narration text, no caption cues, and no non-default visual/layers
 *  configured yet. Anything else is real authored content and must be
 *  confirmed before deletion (spec: safe delete). */
function hasSceneContent(scene: Scene): boolean {
  const hasNarration = Boolean(scene.narration && scene.narration.trim().length > 0);
  const hasCaptions = scene.captionCues.length > 0;
  const hasVisual = scene.visual.kind !== "layers" || scene.layers.length > 0;
  return hasNarration || hasCaptions || hasVisual;
}

function narrationExcerpt(lang: VideoStudioLang, narration: string | null): string {
  const trimmed = narration?.trim() ?? "";
  if (!trimmed) return pickCopy(lang, videoStudioCopy.sceneNarrationEmpty);
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

type ScenePlanMode = "fill_empty" | "replace";

/** Maps section-05's fail-closed planner errors to specific, reassuring copy
 *  (the document was left unchanged in every case). Anything else falls
 *  through to `StageLaunchCard`'s own `renderableJobError` (FE03). */
function describeScenePlanError(lang: VideoStudioLang, error: string | null | undefined): string | null {
  if (!error) return null;
  if (error.startsWith("VI_PLAN_LAYER_BUDGET_EXCEEDED")) return pickCopy(lang, videoStudioCopy.planLayerBudget);
  if (error.startsWith("VI_PLAN_TIMELINE_INVALID")) return pickCopy(lang, videoStudioCopy.planTimelineInvalid);
  if (error.startsWith("VI_PLAN_TEMPLATE_UNKNOWN")) return pickCopy(lang, videoStudioCopy.planTemplateUnknown);
  if (error.startsWith("VI_PLAN_PARAMS_INVALID")) return pickCopy(lang, videoStudioCopy.planParamsInvalid);
  return null;
}

export function ScenesPanel({
  lang,
  projectId,
  document,
  onChange,
  projectRevision,
  hasUnsavedChanges,
  onDocumentSaved,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
  projectRevision: number;
  hasUnsavedChanges: boolean;
  /** Fired once per terminal `scene_plan` job so the draft is refreshed from
   *  the server — otherwise the next Save silently overwrites the AI's plan
   *  (spec §6.4). */
  onDocumentSaved: () => void;
}) {
  const scenePlanPoll = useGenerationJobPoll(projectId, "scene_plan");
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [mode, setMode] = useState<ScenePlanMode>("fill_empty");
  const handledJobId = useRef<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const estimateQuery = trpc.videoProjects.getStageEstimate.useQuery(
    { projectId, stage: "scene_plan" },
    { enabled: estimateOpen, staleTime: 0 },
  );

  const runScenePlan = trpc.videoProjects.runScenePlanStage.useMutation({
    onSuccess: (result) => {
      scenePlanPoll.setJobId(result.jobId);
      setEstimateOpen(false);
    },
  });

  useEffect(() => {
    if (
      scenePlanPoll.jobStatus?.status === "succeeded" &&
      scenePlanPoll.jobId &&
      handledJobId.current !== scenePlanPoll.jobId
    ) {
      handledJobId.current = scenePlanPoll.jobId;
      onDocumentSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenePlanPoll.jobStatus?.status, scenePlanPoll.jobId]);

  const mappedError = describeScenePlanError(lang, scenePlanPoll.jobStatus?.error);
  const jobStatusForCard =
    scenePlanPoll.jobStatus && mappedError
      ? { ...scenePlanPoll.jobStatus, error: null }
      : scenePlanPoll.jobStatus;

  function updateScene(index: number, patch: Partial<Scene>) {
    const scenes = document.scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene));
    onChange({ ...document, scenes });
  }

  function addScene() {
    const last = document.scenes[document.scenes.length - 1];
    const startMs = last ? last.endMs : 0;
    const endMs = startMs + 5000;
    const scene: Scene = {
      sceneId: nextSceneId(document.scenes),
      startMs,
      endMs,
      narration: null,
      narrationAudioAssetId: null,
      visual: { kind: "layers" },
      layers: [],
      motion: { intensity: "medium", camera: "static" },
      captionCues: [],
    };
    onChange({
      ...document,
      scenes: [...document.scenes, scene],
      format: { ...document.format, durationMs: Math.max(document.format.durationMs, endMs) },
    });
  }

  function performRemoveScene(index: number) {
    const scenes = resequenceScenes(document.scenes.filter((_, i) => i !== index));
    onChange({ ...document, scenes });
  }

  /** One-click delete for empty scenes; scenes with authored content require
   *  the `AlertDialog` confirmation below (spec: safe delete). */
  function requestRemoveScene(index: number) {
    if (document.scenes.length <= 1) return;
    if (hasSceneContent(document.scenes[index])) {
      setDeleteIndex(index);
      return;
    }
    performRemoveScene(index);
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= document.scenes.length) return;
    const scenes = [...document.scenes];
    const tmp = scenes[index];
    scenes[index] = scenes[target];
    scenes[target] = tmp;
    onChange({ ...document, scenes: resequenceScenes(scenes) });
  }

  /** Copies narration, visual/template params, layers, motion, and caption
   *  cues, but deliberately drops `narrationAudioAssetId` — the duplicate
   *  has no voice-over of its own until TTS runs for it. Inserted right
   *  after the source scene, then the whole timeline is re-sequenced. */
  function duplicateScene(index: number) {
    const source = document.scenes[index];
    const duplicate: Scene = {
      ...source,
      sceneId: nextSceneId(document.scenes),
      narrationAudioAssetId: null,
    };
    const scenes = [...document.scenes];
    scenes.splice(index + 1, 0, duplicate);
    const resequenced = resequenceScenes(scenes);
    const newDurationMs = resequenced[resequenced.length - 1]?.endMs ?? document.format.durationMs;
    onChange({
      ...document,
      scenes: resequenced,
      format: { ...document.format, durationMs: Math.max(document.format.durationMs, newDurationMs) },
    });
  }

  const blockedReason = hasUnsavedChanges
    ? { title: pickCopy(lang, videoStudioCopy.unsavedChanges), body: pickCopy(lang, videoStudioCopy.saveBeforeRunning) }
    : mode === "fill_empty" &&
        document.scenes.length > 0 &&
        !document.scenes.some(
          scene =>
            scene.visual.kind === "layers" &&
            (scene.narration === null || scene.narration.trim().length === 0),
        )
      ? {
          title: pickCopy(lang, videoStudioCopy.scenePlanAlreadyReady),
          body: pickCopy(lang, videoStudioCopy.scenePlanAlreadyReadyBody),
        }
      : null;

  const destructive =
    mode === "replace"
      ? {
          title: pickCopy(lang, videoStudioCopy.scenePlanModeReplace),
          body: pickCopy(lang, videoStudioCopy.scenePlanReplaceWarning),
        }
      : null;

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-scenes-panel">
      <StageLaunchCard
        lang={lang}
        title={pickCopy(lang, { th: "วางแผนฉากด้วย AI", en: "AI scene planning" })}
        buttonLabel={pickCopy(lang, videoStudioCopy.runScenePlan)}
        icon={<Sparkles className="h-4 w-4" />}
        testId="video-studio-run-scene-plan"
        jobStatus={jobStatusForCard}
        blockedReason={blockedReason}
        isPending={runScenePlan.isPending}
        onRun={() => setEstimateOpen(true)}
      >
        <Selector
          label={pickCopy(lang, videoStudioCopy.scenePlanMode)}
          data-testid="video-studio-scene-plan-mode"
          options={[
            { value: "fill_empty", label: pickCopy(lang, videoStudioCopy.scenePlanModeFillEmpty) },
            { value: "replace", label: pickCopy(lang, videoStudioCopy.scenePlanModeReplace) },
          ]}
          value={mode}
          onChange={(value) => setMode(value as ScenePlanMode)}
        />
      </StageLaunchCard>

      {mappedError ? (
        <Banner status="error" data-testid="video-studio-scene-plan-error" title={mappedError} />
      ) : null}

      {estimateOpen ? (
        <StageEstimateDialog
          lang={lang}
          open={estimateOpen}
          onOpenChange={setEstimateOpen}
          stage="scene_plan"
          estimate={estimateQuery.data as StageEstimate | undefined}
          isLoading={estimateQuery.isLoading}
          error={estimateQuery.error?.message}
          destructive={destructive}
          isConfirming={runScenePlan.isPending}
          onConfirm={() => runScenePlan.mutate({ projectId, baseRevision: projectRevision, mode })}
        />
      ) : null}

      {document.scenes.map((scene, index) => (
        <Card key={scene.sceneId} data-testid={`video-studio-scene-${scene.sceneId}`}>
          <VStack gap={3}>
            <HStack justify="between" align="start" gap={2}>
              <VStack gap={0}>
                <Heading level={4}>
                  {pickCopy(lang, videoStudioCopy.sceneCardTitle)} {index + 1}
                </Heading>
                <Text type="supporting" color="secondary">
                  {scene.sceneId}
                </Text>
                <Text type="supporting" color="secondary">
                  {narrationExcerpt(lang, scene.narration)}
                </Text>
              </VStack>
              <HStack gap={1} align="center">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<ArrowUp className="h-4 w-4" />}
                  label={pickCopy(lang, videoStudioCopy.sceneMoveUp)}
                  isDisabled={index === 0}
                  onClick={() => moveScene(index, -1)}
                  data-testid={`video-studio-scene-move-up-${scene.sceneId}`}
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<ArrowDown className="h-4 w-4" />}
                  label={pickCopy(lang, videoStudioCopy.sceneMoveDown)}
                  isDisabled={index === document.scenes.length - 1}
                  onClick={() => moveScene(index, 1)}
                  data-testid={`video-studio-scene-move-down-${scene.sceneId}`}
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<Copy className="h-4 w-4" />}
                  label={pickCopy(lang, videoStudioCopy.sceneDuplicate)}
                  onClick={() => duplicateScene(index)}
                  data-testid={`video-studio-scene-duplicate-${scene.sceneId}`}
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  label={pickCopy(lang, videoStudioCopy.removeScene)}
                  isDisabled={document.scenes.length <= 1}
                  onClick={() => requestRemoveScene(index)}
                />
              </HStack>
            </HStack>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput
                label={pickCopy(lang, { th: "เริ่มที่ (มิลลิวินาที)", en: "Start (ms)" })}
                isIntegerOnly
                min={0}
                value={scene.startMs}
                onChange={(value) => updateScene(index, { startMs: value })}
              />
              <NumberInput
                label={pickCopy(lang, { th: "สิ้นสุดที่ (มิลลิวินาที)", en: "End (ms)" })}
                isIntegerOnly
                min={0}
                value={scene.endMs}
                onChange={(value) => updateScene(index, { endMs: value })}
              />
            </div>
            <TextArea
              label={pickCopy(lang, { th: "บทบรรยาย", en: "Narration" })}
              value={scene.narration ?? ""}
              onChange={(value) => updateScene(index, { narration: value || null })}
            />
          </VStack>
        </Card>
      ))}
      <VStack gap={1} align="start">
        <Button
          variant="secondary"
          icon={<Plus className="h-4 w-4" />}
          label={pickCopy(lang, videoStudioCopy.addScene)}
          onClick={addScene}
          className="self-start"
        />
        <Text type="supporting" color="secondary">
          {pickCopy(lang, videoStudioCopy.addSceneHelper)}
        </Text>
      </VStack>

      <AlertDialog
        isOpen={deleteIndex != null}
        onOpenChange={(open) => !open && setDeleteIndex(null)}
        title={pickCopy(lang, videoStudioCopy.sceneDeleteTitle)}
        description={pickCopy(lang, videoStudioCopy.sceneDeleteConfirm)}
        actionLabel={pickCopy(lang, videoStudioCopy.sceneDeleteAction)}
        actionVariant="destructive"
        data-testid="scene-delete-confirm"
        onAction={() => {
          if (deleteIndex != null) {
            performRemoveScene(deleteIndex);
            setDeleteIndex(null);
          }
        }}
      />
    </div>
  );
}
