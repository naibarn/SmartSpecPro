/**
 * Brief stage panel (Feature 133, section-08). Two responsibilities:
 *  1. Edit `video_projects.brief` (free-form JSON, `trpc.videoProjects.updateBrief`).
 *  2. Initialize (or edit) the neutral `VideoProjectDocument`'s `format`/
 *     `content` — the first document a fresh project needs before any other
 *     stage panel has anything to operate on (`document` is `null` until
 *     the first `saveDocument` call).
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex flex-col gap-4" data-testid="video-studio-brief-panel">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">
            {pickCopy(lang, { th: "โจทย์โปรเจกต์", en: "Project brief" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="video-studio-brief-topic">
              {pickCopy(lang, { th: "หัวข้อ", en: "Topic" })}
            </Label>
            <Input
              id="video-studio-brief-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="video-studio-brief-audience">
              {pickCopy(lang, { th: "กลุ่มเป้าหมาย", en: "Audience" })}
            </Label>
            <Input
              id="video-studio-brief-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="video-studio-brief-notes">
              {pickCopy(lang, { th: "หมายเหตุ", en: "Notes" })}
            </Label>
            <Input
              id="video-studio-brief-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="self-start"
            disabled={updateBrief.isPending}
            onClick={() =>
              updateBrief.mutate({
                projectId: project.id,
                brief: { ...(project.brief as Record<string, unknown> | null), topic, audience, notes },
              })
            }
          >
            {pickCopy(lang, videoStudioCopy.save)}
          </Button>
        </CardContent>
      </Card>

      {document ? (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">
              {pickCopy(lang, { th: "รูปแบบวิดีโอ", en: "Video format" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>{pickCopy(lang, { th: "ความกว้าง", en: "Width" })}</Label>
              <Input
                type="number"
                value={document.format.width}
                onChange={(e) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, width: Number(e.target.value) || document.format.width },
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{pickCopy(lang, { th: "ความสูง", en: "Height" })}</Label>
              <Input
                type="number"
                value={document.format.height}
                onChange={(e) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, height: Number(e.target.value) || document.format.height },
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>FPS</Label>
              <Input
                type="number"
                value={document.format.fps}
                onChange={(e) =>
                  onDocumentChange({
                    ...document,
                    format: { ...document.format, fps: Number(e.target.value) || document.format.fps },
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{pickCopy(lang, { th: "ความยาว (มิลลิวินาที)", en: "Duration (ms)" })}</Label>
              <Input
                type="number"
                value={document.format.durationMs}
                onChange={(e) =>
                  onDocumentChange({
                    ...document,
                    format: {
                      ...document.format,
                      durationMs: Number(e.target.value) || document.format.durationMs,
                    },
                  })
                }
              />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-4">
              <Label>{pickCopy(lang, { th: "ภาษา", en: "Language" })}</Label>
              <Input
                value={document.content.language}
                onChange={(e) =>
                  onDocumentChange({
                    ...document,
                    content: { ...document.content, language: e.target.value },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">
              {pickCopy(lang, { th: "เริ่มต้นโปรเจกต์", en: "Initialize project" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, {
                th: "โปรเจกต์นี้ยังไม่มีเอกสารวิดีโอ เลือกอัตราส่วนภาพเพื่อเริ่มต้น",
                en: "This project has no video document yet. Pick an aspect ratio to get started.",
              })}
            </p>
            <div className="grid gap-1.5">
              <Label>{pickCopy(lang, { th: "อัตราส่วนภาพ", en: "Aspect ratio" })}</Label>
              <Select
                value={platformPreset}
                onValueChange={(value) => setPlatformPreset(value as typeof platformPreset)}
              >
                <SelectTrigger data-testid="video-studio-init-platform-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok_9_16">TikTok (9:16)</SelectItem>
                  <SelectItem value="reels_9_16">Reels (9:16)</SelectItem>
                  <SelectItem value="youtube_16_9">YouTube (16:9)</SelectItem>
                  <SelectItem value="square_1_1">Square (1:1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              data-testid="video-studio-init-document-button"
              className="self-start"
              onClick={() =>
                onDocumentInitialized(
                  createDefaultDocument({
                    platformPreset,
                    topic,
                    language: "th",
                  }),
                )
              }
            >
              {pickCopy(lang, { th: "สร้างเอกสารวิดีโอ", en: "Create video document" })}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
