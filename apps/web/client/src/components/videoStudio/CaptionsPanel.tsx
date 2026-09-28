/**
 * Captions stage panel (Feature 133, section-08). Caption preset/burn-in/
 * language settings on `document.captions`, plus SRT/VTT export
 * (`trpc.videoProjects.exportCaptions`, downloaded as a file — same
 * Blob->object-URL->anchor-click convention used elsewhere in this app,
 * e.g. `FinanceReports.tsx`).
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import { trpc } from "@/lib/trpc";
import type { CaptionPresetId, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const CAPTION_PRESETS: CaptionPresetId[] = [
  "classic_box",
  "minimal_shadow",
  "creator_pop",
  "karaoke_word",
  "highlight_bar",
  "lower_third",
  "cinematic_wide",
  "neon_glow",
  "review_bubble",
  "no_subtitle_style",
];

/** Thai/English labels for the caption preset Selector — matches how
 *  MotionPanel/BriefPanel build `{value,label}` Selector options rather
 *  than passing bare enum ids. Falls back to the raw id for any preset not
 *  (yet) in this map, mirroring the fallback pattern used for the motion
 *  template id map. */
const CAPTION_PRESET_LABEL: Record<CaptionPresetId, { th: string; en: string }> = {
  classic_box: { th: "กล่องคลาสสิก", en: "Classic box" },
  minimal_shadow: { th: "เงาแบบมินิมอล", en: "Minimal shadow" },
  creator_pop: { th: "ป๊อปสไตล์ครีเอเตอร์", en: "Creator pop" },
  karaoke_word: { th: "คาราโอเกะทีละคำ", en: "Karaoke word" },
  highlight_bar: { th: "แถบไฮไลต์", en: "Highlight bar" },
  lower_third: { th: "แถบล่างจอ (Lower third)", en: "Lower third" },
  cinematic_wide: { th: "ซีนีมาติกจอกว้าง", en: "Cinematic wide" },
  neon_glow: { th: "เรืองแสงนีออน", en: "Neon glow" },
  review_bubble: { th: "บับเบิลรีวิว", en: "Review bubble" },
  no_subtitle_style: { th: "ไม่มีสไตล์ซับไทเทิล", en: "No subtitle style" },
};

export function captionPresetLabel(lang: VideoStudioLang, presetId: string): string {
  const known = CAPTION_PRESET_LABEL[presetId as CaptionPresetId];
  return known ? pickCopy(lang, known) : presetId;
}

function formatCueTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CaptionsPanel({
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
  const utils = trpc.useUtils();

  async function exportFormat(format: "srt" | "vtt") {
    try {
      const result = await utils.videoProjects.exportCaptions.fetch({ projectId, format });
      downloadTextFile(`captions-${projectId}.${format}`, result.content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const scenesWithCues = document.scenes.filter((scene) => scene.captionCues.length > 0);

  return (
    <VStack gap={4} data-testid="video-studio-captions-panel">
      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, videoStudioCopy.captionsCueListTitle)}</Heading>

          {scenesWithCues.length === 0 ? (
            <Text type="body" color="secondary">
              {pickCopy(lang, videoStudioCopy.captionsCueListEmpty)}
            </Text>
          ) : (
            <VStack gap={2} data-testid="captions-cue-list">
              {scenesWithCues.map((scene) => (
                <Card key={scene.sceneId} variant="muted" padding={2}>
                  <VStack gap={1.5}>
                    <HStack justify="between" align="center">
                      <Text type="body" weight="medium">
                        {scene.sceneId}
                      </Text>
                      <Badge variant="neutral" label={String(scene.captionCues.length)} />
                    </HStack>
                    {scene.captionCues.map((cue, index) => (
                      <div
                        key={`${scene.sceneId}-${index}`}
                        data-testid="captions-cue-item"
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <Text type="body">{cue.text}</Text>
                        <Text type="body" color="secondary" className="whitespace-nowrap font-mono text-xs">
                          {formatCueTime(cue.startMs)}–{formatCueTime(cue.endMs)}
                        </Text>
                      </div>
                    ))}
                  </VStack>
                </Card>
              ))}
            </VStack>
          )}
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, videoStudioCopy.captionsStyleExportTitle)}</Heading>

          <Selector
            label={pickCopy(lang, { th: "รูปแบบคำบรรยาย", en: "Caption preset" })}
            options={CAPTION_PRESETS.map((id) => ({ value: id, label: captionPresetLabel(lang, id) }))}
            value={document.captions.presetId}
            onChange={(value) =>
              onChange({
                ...document,
                captions: { ...document.captions, presetId: value as CaptionPresetId },
              })
            }
            data-testid="video-studio-caption-preset-select"
          />

          <Card variant="muted" padding={2}>
            <Switch
              label={pickCopy(lang, { th: "เผาคำบรรยายลงวิดีโอ", en: "Burn captions into video" })}
              value={document.captions.burnIn}
              onChange={(checked) =>
                onChange({ ...document, captions: { ...document.captions, burnIn: checked } })
              }
            />
          </Card>

          <TextInput
            label={pickCopy(lang, { th: "ภาษาคำบรรยาย", en: "Caption language" })}
            value={document.captions.language}
            onChange={(value) =>
              onChange({ ...document, captions: { ...document.captions, language: value } })
            }
          />

          <HStack gap={2} wrap="wrap">
            <Button
              type="button"
              variant="secondary"
              icon={<Download className="h-4 w-4" aria-hidden="true" />}
              label={pickCopy(lang, videoStudioCopy.exportSrt)}
              onClick={() => exportFormat("srt")}
            />
            <Button
              type="button"
              variant="secondary"
              icon={<Download className="h-4 w-4" aria-hidden="true" />}
              label={pickCopy(lang, videoStudioCopy.exportVtt)}
              onClick={() => exportFormat("vtt")}
            />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
