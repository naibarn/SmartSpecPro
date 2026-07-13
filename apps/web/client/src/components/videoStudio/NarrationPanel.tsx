/**
 * Narration stage panel (Feature 133, section-08). `runNarrationStage` runs
 * synchronously in the mutation itself (TTS synthesis for a handful of
 * scenes — documented in `routers/videoProjects.ts`), so this is a plain
 * mutation button + result summary, not a job-polling flow.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

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
    <VStack gap={4} data-testid="video-studio-narration-panel">
      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "สังเคราะห์เสียงบรรยาย", en: "Synthesize narration" })}</Heading>

          <Text type="body" color="secondary">
            {pickCopy(lang, {
              th: `พบ ${narratableScenes.length} ฉากที่มีบทบรรยาย จะสร้างเสียงพูดและคำบรรยายอัตโนมัติ`,
              en: `${narratableScenes.length} scene(s) have narration text; TTS + auto captions will be generated.`,
            })}
          </Text>

          <Button
            type="button"
            variant="primary"
            icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
            label={pickCopy(lang, videoStudioCopy.runNarration)}
            isDisabled={runNarration.isPending || narratableScenes.length === 0}
            isLoading={runNarration.isPending}
            onClick={() => runNarration.mutate({ projectId })}
            className="self-start"
          />
        </VStack>
      </Card>

      <VStack gap={2}>
        {document.scenes.map((scene) => (
          <Card key={scene.sceneId} variant="muted" padding={2}>
            <HStack justify="between" align="center">
              <Text type="body">{scene.sceneId}</Text>
              {scene.narrationAudioAssetId ? (
                <Badge variant="success" label={pickCopy(lang, { th: "มีเสียงแล้ว", en: "Narrated" })} />
              ) : (scene.narration ?? "").trim().length > 0 ? (
                <Badge variant="warning" label={pickCopy(lang, { th: "รอสังเคราะห์เสียง", en: "Pending" })} />
              ) : (
                <Badge variant="neutral" label={pickCopy(lang, { th: "ไม่มีบทบรรยาย", en: "No narration" })} />
              )}
            </HStack>
          </Card>
        ))}
      </VStack>
    </VStack>
  );
}
