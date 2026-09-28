/**
 * Narration stage: model/voice selection is driven by the same recommended
 * media-model catalogue used by Media Studio.  The panel only prepares the
 * request; pressing the single action button is what starts paid TTS.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

import { trpc } from "@/lib/trpc";
import { parseModelInputFields, type ModelInputField } from "@/lib/mediaModelInputs";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import { useGenerationJobPoll } from "./useGenerationJobPoll";

type RecommendedAudioModel = {
  modelId: string;
  name: string;
  provider: string;
  creditCost: number;
  voices?: string[] | null;
  configJson?: unknown;
  isRecommended?: boolean;
  isDefault?: boolean;
};

type NarrationOption = { value: string; label: string; previewUrl?: string };

function fieldOptions(field: ModelInputField | undefined, voices: string[] | null | undefined, dynamicOptions: unknown[] = []): NarrationOption[] {
  const options = (field?.options ?? []).map((option) => ({
    value: String(option.value),
    label: option.label,
    ...(option.previewUrl ? { previewUrl: option.previewUrl } : {}),
  }));
  for (const raw of dynamicOptions) {
    if (!raw || typeof raw !== "object") continue;
    const option = raw as { value?: unknown; label?: unknown; previewUrl?: unknown };
    const value = String(option.value ?? "").trim();
    if (value && !options.some((candidate) => candidate.value === value)) {
      options.push({ value, label: String(option.label ?? value), ...(option.previewUrl ? { previewUrl: String(option.previewUrl) } : {}) });
    }
  }
  const existing = new Set(options.map((option) => option.value));
  for (const voice of voices ?? []) {
    if (!existing.has(voice)) options.push({ value: voice, label: voice });
  }
  return options;
}

export function NarrationPanel({
  lang,
  projectId,
  document,
  onDocumentSaved,
  onGoToScenes,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onDocumentSaved: () => void;
  onGoToScenes?: () => void;
}) {
  const modelQuery = trpc.mediaModels.listRecommendedAudioModels.useQuery(undefined, { staleTime: 60_000 });
  const models = (modelQuery.data?.models ?? []) as RecommendedAudioModel[];
  const savedSettings = document.narrationSettings;
  const [selectedModelId, setSelectedModelId] = useState(savedSettings?.modelId ?? "");
  const [selectedVoice, setSelectedVoice] = useState(savedSettings?.voice ?? "");
  const [extraParams, setExtraParams] = useState<Record<string, unknown>>(savedSettings?.extraParams ?? {});

  useEffect(() => {
    if (models.length === 0) return;
    const savedExists = savedSettings?.modelId && models.some((model) => model.modelId === savedSettings.modelId);
    const nextModelId = savedExists
      ? savedSettings!.modelId
      : models.find((model) => model.isDefault)?.modelId ?? models[0]!.modelId;
    setSelectedModelId(nextModelId);
  }, [models, savedSettings?.modelId]);

  const selectedModel = models.find((model) => model.modelId === selectedModelId) ?? null;
  const inputFields = useMemo(
    () => parseModelInputFields(selectedModel ? { id: selectedModel.modelId, name: selectedModel.name, configJson: selectedModel.configJson } : undefined),
    [selectedModel],
  );
  const voiceField = inputFields.find((field) => /voice/i.test(field.key));
  const dynamicVoiceOptionsQuery = trpc.media.listModelFieldOptions.useQuery(
    { modelId: selectedModelId || "__no_model__", fieldKey: voiceField?.key || "__no_voice__", limit: 2000 },
    { enabled: Boolean(selectedModelId && voiceField?.searchable && voiceField.optionsSource), staleTime: 5 * 60 * 1000, retry: false },
  );
  const voiceOptions = useMemo(
    () => fieldOptions(voiceField, selectedModel?.voices, dynamicVoiceOptionsQuery.data?.options ?? []),
    [voiceField, selectedModel?.voices, dynamicVoiceOptionsQuery.data?.options],
  );
  const extraFields = useMemo(() => inputFields.filter((field) => field.key !== voiceField?.key && !field.hidden && field.key !== "text"), [inputFields, voiceField?.key]);

  useEffect(() => {
    if (!selectedModel) return;
    const defaultVoice = voiceField?.default != null ? String(voiceField.default) : voiceOptions[0]?.value ?? "";
    setSelectedVoice((current) => current && voiceOptions.some((option) => option.value === current) ? current : String(defaultVoice));
    setExtraParams((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of extraFields) {
        if (next[field.key] === undefined && field.default !== undefined) {
          next[field.key] = field.default;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedModelId, selectedModel, voiceField, voiceOptions, extraFields]);

  const narrationJob = useGenerationJobPoll(projectId, "narration");
  const narrationAssetsQuery = trpc.videoProjects.getNarrationAssets.useQuery(
    { projectId },
    { staleTime: 0, refetchOnWindowFocus: true },
  );
  const handledTerminalJobId = useRef<string | null>(null);

  const runNarration = trpc.videoProjects.runNarrationStageAsync.useMutation({
    onSuccess: (result) => {
      toast.success(pickCopy(lang, {
        th: "เริ่มสร้างเสียงพากย์แล้ว ระบบจะแสดงปุ่มเล่นเมื่อเสร็จ",
        en: "Voice-over generation started. Play controls will appear when it finishes.",
      }));
      narrationJob.setJobId(result.jobId);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    const status = narrationJob.jobStatus?.status;
    const jobId = narrationJob.jobStatus?.jobId ?? narrationJob.jobId;
    if (!jobId || !status || handledTerminalJobId.current === jobId) return;
    if (status === "succeeded") {
      handledTerminalJobId.current = jobId;
      toast.success(pickCopy(lang, {
        th: "สร้างเสียงพากย์เสร็จแล้ว กดเล่นเพื่อฟังได้เลย",
        en: "Voice-over is ready. Press play to listen.",
      }));
      onDocumentSaved();
      void narrationAssetsQuery.refetch();
    } else if (status === "failed") {
      handledTerminalJobId.current = jobId;
      toast.error(narrationJob.jobStatus?.error || pickCopy(lang, {
        th: "สร้างเสียงพากย์ไม่สำเร็จ",
        en: "Voice-over generation failed",
      }));
    }
  }, [lang, narrationAssetsQuery, narrationJob.jobId, narrationJob.jobStatus, onDocumentSaved]);

  const narratableScenes = document.scenes.filter((scene) => (scene.narration ?? "").trim().length > 0);
  const hasModel = Boolean(selectedModelId && selectedModel);
  const isNarrationRunning = Boolean(narrationJob.jobId) && narrationJob.jobStatus?.status !== "succeeded" && narrationJob.jobStatus?.status !== "failed";
  const narrationAudioBySceneId = new Map(
    (narrationAssetsQuery.data?.items ?? []).map(item => [item.sceneId, item]),
  );

  return (
    <VStack gap={4} data-testid="video-studio-narration-panel">
      <Card variant="muted" padding={2} data-testid="narration-captions-note">
        <VStack gap={1.5}>
          <Text type="body" color="secondary">{pickCopy(lang, videoStudioCopy.narrationCaptionsNote)}</Text>
          {onGoToScenes ? (
            <Button type="button" variant="ghost" size="sm" label={pickCopy(lang, videoStudioCopy.goToScenes)} onClick={onGoToScenes} className="self-start" />
          ) : null}
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "เสียงพากย์", en: "Voice-over" })}</Heading>
          <Text type="body" color="secondary">
            {pickCopy(lang, {
              th: `พบ ${narratableScenes.length} ฉาก ระบบจะสร้างเสียงจาก model และ voice ที่เลือก พร้อมจัดซับตาม timestamp ของเสียงจริง`,
              en: `${narratableScenes.length} scene(s) will use the selected model and voice; subtitles are aligned to the generated audio timestamps.`,
            })}
          </Text>

          <label className="grid gap-1 text-sm">
            <span>{pickCopy(lang, { th: "โมเดล TTS (แนะนำอยู่ด้านบน)", en: "TTS model (recommended first)" })}</span>
            <select
              data-testid="narration-model-select"
              value={selectedModelId}
              disabled={modelQuery.isLoading || models.length === 0}
              onChange={(event) => {
                setSelectedModelId(event.target.value);
                setSelectedVoice("");
                setExtraParams({});
              }}
              className="rounded-md border px-3 py-2"
            >
              {models.length === 0 ? <option value="">{modelQuery.isLoading ? "กำลังโหลดโมเดล…" : "ไม่พบโมเดล TTS ที่ใช้งานได้"}</option> : null}
              {models.map((model) => <option key={model.modelId} value={model.modelId}>{model.name} · {model.provider} · {model.creditCost} credits{model.isRecommended ? " · recommended" : ""}{model.isDefault ? " · default" : ""}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span>{pickCopy(lang, { th: "เสียง / Voice ID", en: "Voice / Voice ID" })}</span>
            {voiceOptions.length > 0 ? (
              <select data-testid="narration-voice-select" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} className="rounded-md border px-3 py-2">
                <option value="">{pickCopy(lang, { th: "เลือกเสียง", en: "Choose a voice" })}</option>
                {voiceOptions.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}{option.previewUrl ? " · preview" : ""}</option>)}
              </select>
            ) : (
              <input data-testid="narration-voice-input" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} placeholder="voice_id" className="rounded-md border px-3 py-2" />
            )}
          </label>

          {extraFields.map((field) => (
            <label key={field.key} className="grid gap-1 text-sm">
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select value={String(extraParams[field.key] ?? field.default ?? "")} onChange={(event) => setExtraParams((current) => ({ ...current, [field.key]: event.target.value }))} className="rounded-md border px-3 py-2">
                  {fieldOptions(field, undefined).map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                </select>
              ) : (
                <input type={field.type === "number" ? "number" : "text"} value={String(extraParams[field.key] ?? field.default ?? "")} onChange={(event) => setExtraParams((current) => ({ ...current, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))} className="rounded-md border px-3 py-2" />
              )}
            </label>
          ))}

          <Button
            type="button"
            variant="primary"
            icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
            label={pickCopy(lang, videoStudioCopy.runNarration)}
            isDisabled={runNarration.isPending || isNarrationRunning || narratableScenes.length === 0 || !hasModel}
            isLoading={runNarration.isPending}
            onClick={() => runNarration.mutate({
              projectId,
              narrationSettings: {
                modelId: selectedModelId,
                ...(selectedVoice ? { voice: selectedVoice } : {}),
                ...(Object.keys(extraParams).length > 0 ? { extraParams } : {}),
              },
            })}
            className="self-start"
          />
          {isNarrationRunning ? (
            <Text type="body" color="secondary" data-testid="narration-job-status">
              {pickCopy(lang, {
                th: narrationJob.jobStatus?.status === "queued" ? "อยู่ในคิวสร้างเสียงพากย์…" : "กำลังสร้างเสียงพากย์…",
                en: narrationJob.jobStatus?.status === "queued" ? "Voice-over is queued…" : "Generating voice-over…",
              })}
            </Text>
          ) : null}
        </VStack>
      </Card>

      <VStack gap={2}>
        {document.scenes.map((scene) => (
          <Card key={scene.sceneId} variant="muted" padding={2}>
            <VStack gap={2}>
              <HStack justify="between" align="center">
                <Text type="body">{scene.sceneId}</Text>
                {scene.narrationAudioAssetId ? (
                  <HStack gap={2} align="center">
                    <Badge variant="success" label={pickCopy(lang, { th: "มีเสียงแล้ว", en: "Narrated" })} />
                    <Badge variant={scene.captionTimingSource === "aligned" ? "success" : "warning"} label={scene.captionTimingSource === "aligned" ? "ซับตรงเสียง" : "ซับประมาณการ"} />
                  </HStack>
                ) : (scene.narration ?? "").trim().length > 0 ? (
                  <Badge
                    variant="warning"
                    label={isNarrationRunning
                      ? pickCopy(lang, { th: "กำลังสร้างเสียง", en: "Generating" })
                      : pickCopy(lang, { th: "รอสังเคราะห์เสียง", en: "Pending" })}
                  />
                ) : (
                  <Badge variant="neutral" label={pickCopy(lang, { th: "ไม่มีบทบรรยาย", en: "No narration" })} />
                )}
              </HStack>
              <Text
                type="body"
                color="secondary"
                className="whitespace-pre-wrap"
                data-testid={`narration-script-${scene.sceneId}`}
              >
                {scene.narration?.trim() || pickCopy(lang, { th: "ยังไม่มีบทพูดสำหรับฉากนี้", en: "No spoken script for this scene yet" })}
              </Text>
              {scene.narrationAudioAssetId && narrationAudioBySceneId.get(scene.sceneId)?.audioUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={narrationAudioBySceneId.get(scene.sceneId)!.audioUrl}
                  data-testid={`narration-audio-${scene.sceneId}`}
                  className="w-full"
                />
              ) : scene.narrationAudioAssetId ? (
                <Text type="body" color="secondary">
                  {pickCopy(lang, { th: "กำลังโหลดไฟล์เสียง…", en: "Loading audio…" })}
                </Text>
              ) : null}
            </VStack>
          </Card>
        ))}
      </VStack>
    </VStack>
  );
}
