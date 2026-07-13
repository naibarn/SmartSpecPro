/**
 * Scenes stage panel (Feature 133, section-08) — consolidates the plan's
 * "Content" and "Scenes" stages into one scene-list editor (both operate on
 * the same `document.scenes` array; there is no separate underlying data
 * structure to justify two panels — documented UI simplification).
 * Add/remove scenes, edit timing + narration text. Visual/motion template
 * assignment lives in `MotionPanel` (a separate concern).
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { trpc } from "@/lib/trpc";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { NotWiredJobCard } from "./NotWiredJobCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

function nextSceneId(scenes: Scene[]): string {
  let n = scenes.length + 1;
  const existing = new Set(scenes.map((s) => s.sceneId));
  while (existing.has(`scene-${n}`)) n += 1;
  return `scene-${n}`;
}

export function ScenesPanel({
  lang,
  projectId,
  document,
  onChange,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
}) {
  const scenePlanPoll = useGenerationJobPoll(projectId, "scene_plan");
  const runScenePlan = trpc.videoProjects.runScenePlanStage.useMutation({
    onSuccess: (result) => scenePlanPoll.setJobId(result.jobId),
  });

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

  function removeScene(index: number) {
    if (document.scenes.length <= 1) return;
    onChange({ ...document, scenes: document.scenes.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-scenes-panel">
      <NotWiredJobCard
        lang={lang}
        title={pickCopy(lang, { th: "วางแผนฉากด้วย AI", en: "AI scene planning" })}
        buttonLabel={pickCopy(lang, videoStudioCopy.runScenePlan)}
        icon={<Sparkles className="h-4 w-4" />}
        testId="video-studio-run-scene-plan"
        jobStatus={scenePlanPoll.jobStatus}
        disabled={runScenePlan.isPending}
        onRun={() => runScenePlan.mutate({ projectId })}
      />
      {document.scenes.map((scene, index) => (
        <Card key={scene.sceneId} data-testid={`video-studio-scene-${scene.sceneId}`}>
          <VStack gap={3}>
            <HStack justify="between" align="center" gap={2}>
              <Heading level={4}>{scene.sceneId}</Heading>
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Trash2 className="h-4 w-4" />}
                label={pickCopy(lang, videoStudioCopy.removeScene)}
                isDisabled={document.scenes.length <= 1}
                onClick={() => removeScene(index)}
              />
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
      <Button
        variant="secondary"
        icon={<Plus className="h-4 w-4" />}
        label={pickCopy(lang, videoStudioCopy.addScene)}
        onClick={addScene}
        className="self-start"
      />
    </div>
  );
}
