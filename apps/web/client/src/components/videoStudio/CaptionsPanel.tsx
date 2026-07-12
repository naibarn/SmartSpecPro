/**
 * Captions stage panel (Feature 133, section-08). Caption preset/burn-in/
 * language settings on `document.captions`, plus SRT/VTT export
 * (`trpc.videoProjects.exportCaptions`, downloaded as a file — same
 * Blob->object-URL->anchor-click convention used elsewhere in this app,
 * e.g. `FinanceReports.tsx`).
 */
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
    <div className="flex flex-col gap-4" data-testid="video-studio-captions-panel">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">
            {pickCopy(lang, { th: "การตั้งค่าคำบรรยาย", en: "Caption settings" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>{pickCopy(lang, { th: "รูปแบบคำบรรยาย", en: "Caption preset" })}</Label>
            <Select
              value={document.captions.presetId}
              onValueChange={(value) =>
                onChange({
                  ...document,
                  captions: { ...document.captions, presetId: value as CaptionPresetId },
                })
              }
            >
              <SelectTrigger data-testid="video-studio-caption-preset-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {preset}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <Label htmlFor="video-studio-caption-burn-in">
              {pickCopy(lang, { th: "เผาคำบรรยายลงวิดีโอ", en: "Burn captions into video" })}
            </Label>
            <Switch
              id="video-studio-caption-burn-in"
              checked={document.captions.burnIn}
              onCheckedChange={(checked) =>
                onChange({ ...document, captions: { ...document.captions, burnIn: checked } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{pickCopy(lang, { th: "ภาษาคำบรรยาย", en: "Caption language" })}</Label>
            <Input
              value={document.captions.language}
              onChange={(e) =>
                onChange({ ...document, captions: { ...document.captions, language: e.target.value } })
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => exportFormat("srt")}>
              <Download className="h-4 w-4" />
              {pickCopy(lang, videoStudioCopy.exportSrt)}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportFormat("vtt")}>
              <Download className="h-4 w-4" />
              {pickCopy(lang, videoStudioCopy.exportVtt)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
