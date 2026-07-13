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
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useState } from "react";

import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";

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
    <VStack gap={4} data-testid="video-studio-motion-panel">
      {document.scenes.map((scene) => {
        const templateId = scene.visual.kind === "template" ? scene.visual.templateId : NO_TEMPLATE_VALUE;
        const meta = templates.find((t) => t.id === templateId);
        const paramsText =
          paramsDraft[scene.sceneId] ??
          (scene.visual.kind === "template" ? JSON.stringify(scene.visual.params ?? {}, null, 2) : "{}");

        return (
          <Card key={scene.sceneId} data-testid={`video-studio-motion-scene-${scene.sceneId}`}>
            <VStack gap={3}>
              <Heading level={4}>{scene.sceneId}</Heading>

              <Selector
                label={pickCopy(lang, { th: "เทมเพลตโมชัน", en: "Motion template" })}
                options={[
                  {
                    value: NO_TEMPLATE_VALUE,
                    label: pickCopy(lang, { th: "ไม่ใช้เทมเพลต (ว่าง)", en: "No template (blank)" }),
                  },
                  ...templates.map((template) => ({ value: template.id, label: template.id })),
                ]}
                value={templateId}
                onChange={(value) =>
                  setSceneTemplate(scene.sceneId, value === NO_TEMPLATE_VALUE ? null : value)
                }
                data-testid={`video-studio-motion-select-${scene.sceneId}`}
              />

              {meta ? (
                <HStack gap={1.5} wrap="wrap">
                  {meta.categories.map((category) => (
                    <Badge key={category} variant="neutral" label={category} />
                  ))}
                  <Badge variant="info" label={`${meta.minDurationMs}-${meta.maxDurationMs}ms`} />
                </HStack>
              ) : null}

              {scene.visual.kind === "template" ? (
                <TextArea
                  label={pickCopy(lang, { th: "พารามิเตอร์ (JSON)", en: "Params (JSON)" })}
                  rows={4}
                  value={paramsText}
                  onChange={(value) => setSceneParams(scene.sceneId, value)}
                  className="font-mono text-xs"
                  status={
                    paramsError[scene.sceneId]
                      ? { type: "error", message: paramsError[scene.sceneId]! }
                      : undefined
                  }
                />
              ) : null}
            </VStack>
          </Card>
        );
      })}
    </VStack>
  );
}
