/**
 * Brief stage panel (Feature 133, section-08). Two responsibilities:
 *  1. Edit `video_projects.brief` (free-form JSON, `trpc.videoProjects.updateBrief`).
 *  2. Initialize (or edit) the neutral `VideoProjectDocument`'s `format`/
 *     `content` — the first document a fresh project needs before any other
 *     stage panel has anything to operate on (`document` is `null` until
 *     the first `saveDocument` call).
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

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { createDefaultDocument } from "./createDefaultDocument";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

interface VideoProjectRowLike {
  id: number;
  name: string;
  studioType: string;
  brief: unknown;
}

const PLATFORM_PRESET_OPTIONS = [
  { value: "tiktok_9_16", label: "TikTok (9:16)" },
  { value: "reels_9_16", label: "Reels (9:16)" },
  { value: "youtube_16_9", label: "YouTube (16:9)" },
  { value: "square_1_1", label: "Square (1:1)" },
];

export function BriefPanel({
  lang,
  project,
  document,
  onDocumentInitialized,
  onDocumentChange,
}: {
  lang: VideoStudioLang;
  project: VideoProjectRowLike;
  document: VideoProjectDocument | null;
  onDocumentInitialized: (doc: VideoProjectDocument) => void;
  onDocumentChange: (doc: VideoProjectDocument) => void;
}) {
  const brief = (project.brief ?? {}) as { topic?: string; audience?: string; notes?: string };
  const [topic, setTopic] = useState(brief.topic ?? "");
  const [audience, setAudience] = useState(brief.audience ?? "");
  const [notes, setNotes] = useState(brief.notes ?? "");
  const [platformPreset, setPlatformPreset] = useState<
    "tiktok_9_16" | "reels_9_16" | "youtube_16_9" | "square_1_1"
  >("tiktok_9_16");

  const utils = trpc.useUtils();
  const updateBrief = trpc.videoProjects.updateBrief.useMutation({
    onSuccess: async () => {
      toast.success(pickCopy(lang, videoStudioCopy.saved));
      await utils.videoProjects.get.invalidate({ projectId: project.id });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <VStack gap={4} data-testid="video-studio-brief-panel">
      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "โจทย์โปรเจกต์", en: "Project brief" })}</Heading>

          <TextInput
            label={pickCopy(lang, { th: "หัวข้อ", en: "Topic" })}
            value={topic}
            onChange={(value) => setTopic(value)}
          />
          <TextInput
            label={pickCopy(lang, { th: "กลุ่มเป้าหมาย", en: "Audience" })}
            value={audience}
            onChange={(value) => setAudience(value)}
          />
          <TextInput
            label={pickCopy(lang, { th: "หมายเหตุ", en: "Notes" })}
            value={notes}
            onChange={(value) => setNotes(value)}
          />

          <Button
            type="button"
            variant="primary"
            label={pickCopy(lang, videoStudioCopy.save)}
            isDisabled={updateBrief.isPending}
            isLoading={updateBrief.isPending}
            onClick={() =>
              updateBrief.mutate({
                projectId: project.id,
                brief: { ...(project.brief as Record<string, unknown> | null), topic, audience, notes },
              })
            }
            className="self-start"
          />
        </VStack>
      </Card>

      {document ? (
        <Card>
          <VStack gap={3}>
            <Heading level={4}>{pickCopy(lang, { th: "รูปแบบวิดีโอ", en: "Video format" })}</Heading>

            {/* Responsive fix: was a bare `grid grid-cols-2 sm:grid-cols-4`
                (2-column jump straight to 4 on mobile squeezed number
                inputs). Astryx `Grid` with `minWidth` auto-fits the column
                count to available width instead of a hard breakpoint
                jump. */}
            <Grid columns={{ minWidth: 140, max: 4 }} gap={3}>
              <NumberInput
                label={pickCopy(lang, { th: "ความกว้าง", en: "Width" })}
                value={document.format.width}
                onChange={(value) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, width: value },
                  })
                }
              />
              <NumberInput
                label={pickCopy(lang, { th: "ความสูง", en: "Height" })}
                value={document.format.height}
                onChange={(value) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, height: value },
                  })
                }
              />
              <NumberInput
                label="FPS"
                value={document.format.fps}
                onChange={(value) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, fps: value },
                  })
                }
              />
              <NumberInput
                label={pickCopy(lang, { th: "ความยาว (มิลลิวินาที)", en: "Duration (ms)" })}
                value={document.format.durationMs}
                onChange={(value) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, durationMs: value },
                  })
                }
              />
              <GridSpan columns="full">
                <TextInput
                  label={pickCopy(lang, { th: "ภาษา", en: "Language" })}
                  value={document.content.language}
                  onChange={(value) =>
                    onDocumentChange({
                      ...document,
                      content: { ...document.content, language: value },
                    })
                  }
                />
              </GridSpan>
            </Grid>
          </VStack>
        </Card>
      ) : (
        <Card>
          <VStack gap={3}>
            <Heading level={4}>{pickCopy(lang, { th: "เริ่มต้นโปรเจกต์", en: "Initialize project" })}</Heading>

            <Text type="body" color="secondary">
              {pickCopy(lang, {
                th: "โปรเจกต์นี้ยังไม่มีเอกสารวิดีโอ เลือกอัตราส่วนภาพเพื่อเริ่มต้น",
                en: "This project has no video document yet. Pick an aspect ratio to get started.",
              })}
            </Text>

            <Selector
              label={pickCopy(lang, { th: "อัตราส่วนภาพ", en: "Aspect ratio" })}
              options={PLATFORM_PRESET_OPTIONS}
              value={platformPreset}
              onChange={(value) => setPlatformPreset(value as typeof platformPreset)}
              data-testid="video-studio-init-platform-preset"
            />

            <Button
              type="button"
              variant="primary"
              data-testid="video-studio-init-document-button"
              label={pickCopy(lang, { th: "สร้างเอกสารวิดีโอ", en: "Create video document" })}
              onClick={() =>
                onDocumentInitialized(
                  createDefaultDocument({
                    platformPreset,
                    topic,
                    language: "th",
                  }),
                )
              }
              className="self-start"
            />
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
