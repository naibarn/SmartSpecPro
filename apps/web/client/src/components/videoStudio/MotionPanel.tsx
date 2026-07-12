/**
 * Motion stage panel (Feature 133, section-08) — per-scene Motion Template
 * assignment. Lists the ~10 registry templates via
 * `trpc.videoProjects.listMotionTemplates` (client-safe metadata,
 * `shared/videoIntelligence/motionTemplates.ts`) and lets the user pick one
 * per scene (`visual.kind = "template"`) or fall back to a blank/no-op
 * visual (`visual.kind = "layers"`, empty layers — compiler-safe).
 * Template-specific `params` are edited as a JSON object (Phase 1: no
 * per-template bespoke form — the ~10 builders each take different
 * `Record<string, unknown>` shapes with no client-safe schema exported for
 * form-generation this phase, only a server-side Zod `paramsSchema`).
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const NO_TEMPLATE_VALUE = "__none__";

export function MotionPanel({
  lang,
  document,
  onChange,
}: {
  lang: VideoStudioLang;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
}) {
  const templatesQuery = trpc.videoProjects.listMotionTemplates.useQuery({});
  const templates = templatesQuery.data ?? [];
  const [paramsDraft, setParamsDraft] = useState<Record<string, string>>({});
  const [paramsError, setParamsError] = useState<Record<string, string | null>>({});

  function setSceneTemplate(sceneId: string, templateId: string | null) {
    const scenes = document.scenes.map((scene) => {
      if (scene.sceneId !== sceneId) return scene;
      if (!templateId) {
        return { ...scene, visual: { kind: "layers" as const } };
      }
      return {
        ...scene,
        visual: {
          kind: "template" as const,
          templateId,
          params: scene.visual.kind === "template" ? scene.visual.params : {},
        },
      };
    });
    onChange({ ...document, scenes });
  }

  function setSceneParams(sceneId: string, raw: string) {
    setParamsDraft((prev) => ({ ...prev, [sceneId]: raw }));
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      setParamsError((prev) => ({ ...prev, [sceneId]: null }));
      const scenes = document.scenes.map((scene) =>
        scene.sceneId === sceneId && scene.visual.kind === "template"
          ? { ...scene, visual: { ...scene.visual, params: parsed } }
          : scene,
      );
      onChange({ ...document, scenes });
    } catch {
      setParamsError((prev) => ({
        ...prev,
        [sceneId]: pickCopy(lang, { th: "JSON ไม่ถูกต้อง", en: "Invalid JSON" }),
      }));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-motion-panel">
      {document.scenes.map((scene) => {
        const templateId = scene.visual.kind === "template" ? scene.visual.templateId : NO_TEMPLATE_VALUE;
        const meta = templates.find((t) => t.id === templateId);
        const paramsText =
          paramsDraft[scene.sceneId] ??
          (scene.visual.kind === "template" ? JSON.stringify(scene.visual.params ?? {}, null, 2) : "{}");

        return (
          <Card key={scene.sceneId} data-testid={`video-studio-motion-scene-${scene.sceneId}`}>
            <CardHeader>
              <CardTitle className="text-base">{scene.sceneId}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label>{pickCopy(lang, { th: "เทมเพลตโมชัน", en: "Motion template" })}</Label>
                <Select
                  value={templateId}
                  onValueChange={(value) =>
                    setSceneTemplate(scene.sceneId, value === NO_TEMPLATE_VALUE ? null : value)
                  }
                >
                  <SelectTrigger data-testid={`video-studio-motion-select-${scene.sceneId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE_VALUE}>
                      {pickCopy(lang, { th: "ไม่ใช้เทมเพลต (ว่าง)", en: "No template (blank)" })}
                    </SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {meta ? (
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {meta.categories.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                  <Badge variant="secondary">
                    {meta.minDurationMs}-{meta.maxDurationMs}ms
                  </Badge>
                </div>
              ) : null}
              {scene.visual.kind === "template" ? (
                <div className="grid gap-1.5">
                  <Label>{pickCopy(lang, { th: "พารามิเตอร์ (JSON)", en: "Params (JSON)" })}</Label>
                  <Textarea
                    className="font-mono text-xs"
                    rows={4}
                    value={paramsText}
                    onChange={(e) => setSceneParams(scene.sceneId, e.target.value)}
                  />
                  {paramsError[scene.sceneId] ? (
                    <p className="text-xs text-destructive">{paramsError[scene.sceneId]}</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
