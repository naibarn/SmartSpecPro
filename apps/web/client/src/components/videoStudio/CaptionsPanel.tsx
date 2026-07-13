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

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
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

  return (
    <VStack gap={4} data-testid="video-studio-captions-panel">
      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "การตั้งค่าคำบรรยาย", en: "Caption settings" })}</Heading>

          <Selector
            label={pickCopy(lang, { th: "รูปแบบคำบรรยาย", en: "Caption preset" })}
            options={CAPTION_PRESETS}
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
