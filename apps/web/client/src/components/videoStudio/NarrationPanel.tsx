/**
 * Narration stage panel (Feature 133, section-08). `runNarrationStage` runs
 * synchronously in the mutation itself (TTS synthesis for a handful of
 * scenes — documented in `routers/videoProjects.ts`), so this is a plain
 * mutation button + result summary, not a job-polling flow.
 */
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export function NarrationPanel({
  lang,
  projectId,
  document,
  onDocumentSaved,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onDocumentSaved: () => void;
}) {
  const runNarration = trpc.videoProjects.runNarrationStage.useMutation({
    onSuccess: (result) => {
      toast.success(
        pickCopy(lang, {
          th: `สร้างเสียงบรรยายแล้ว ${result.scenesNarrated} ฉาก (ใช้ ${result.creditsCharged} เครดิต)`,
          en: `Narrated ${result.scenesNarrated} scene(s) (${result.creditsCharged} credits used)`,
        }),
      );
      onDocumentSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  const narratableScenes = document.scenes.filter((scene) => (scene.narration ?? "").trim().length > 0);

  return (
    <div className="flex flex-col gap-4" data-testid="video-studio-narration-panel">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">
            {pickCopy(lang, { th: "สังเคราะห์เสียงบรรยาย", en: "Synthesize narration" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {pickCopy(lang, {
              th: `พบ ${narratableScenes.length} ฉากที่มีบทบรรยาย จะสร้างเสียงพูดและคำบรรยายอัตโนมัติ`,
              en: `${narratableScenes.length} scene(s) have narration text; TTS + auto captions will be generated.`,
            })}
          </p>
          <Button
            className="self-start gap-2"
            disabled={runNarration.isPending || narratableScenes.length === 0}
            onClick={() => runNarration.mutate({ projectId })}
          >
            <Volume2 className="h-4 w-4" />
            {pickCopy(lang, videoStudioCopy.runNarration)}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {document.scenes.map((scene) => (
          <div
            key={scene.sceneId}
            className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
          >
            <span>{scene.sceneId}</span>
            {scene.narrationAudioAssetId ? (
              <Badge variant="default">{pickCopy(lang, { th: "มีเสียงแล้ว", en: "Narrated" })}</Badge>
            ) : (scene.narration ?? "").trim().length > 0 ? (
              <Badge variant="outline">{pickCopy(lang, { th: "รอสังเคราะห์เสียง", en: "Pending" })}</Badge>
            ) : (
              <Badge variant="secondary">{pickCopy(lang, { th: "ไม่มีบทบรรยาย", en: "No narration" })}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
