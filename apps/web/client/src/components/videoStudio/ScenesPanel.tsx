/**
 * Scenes stage panel (Feature 133, section-08) — consolidates the plan's
 * "Content" and "Scenes" stages into one scene-list editor (both operate on
 * the same `document.scenes` array; there is no separate underlying data
 * structure to justify two panels — documented UI simplification).
 * Add/remove scenes, edit timing + narration text. Visual/motion template
 * assignment lives in `MotionPanel` (a separate concern).
 */
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
        <Card
          key={scene.sceneId}
          className="border-border/60"
          data-testid={`video-studio-scene-${scene.sceneId}`}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">{scene.sceneId}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label={pickCopy(lang, videoStudioCopy.removeScene)}
              disabled={document.scenes.length <= 1}
              onClick={() => removeScene(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{pickCopy(lang, { th: "เริ่มที่ (มิลลิวินาที)", en: "Start (ms)" })}</Label>
                <Input
                  type="number"
                  value={scene.startMs}
                  onChange={(e) => updateScene(index, { startMs: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{pickCopy(lang, { th: "สิ้นสุดที่ (มิลลิวินาที)", en: "End (ms)" })}</Label>
                <Input
                  type="number"
                  value={scene.endMs}
                  onChange={(e) => updateScene(index, { endMs: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{pickCopy(lang, { th: "บทบรรยาย", en: "Narration" })}</Label>
              <Textarea
                value={scene.narration ?? ""}
                onChange={(e) => updateScene(index, { narration: e.target.value || null })}
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" className="self-start gap-2" onClick={addScene}>
        <Plus className="h-4 w-4" />
        {pickCopy(lang, videoStudioCopy.addScene)}
      </Button>
    </div>
  );
}
