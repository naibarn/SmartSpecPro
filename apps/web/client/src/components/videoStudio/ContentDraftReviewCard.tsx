import { useEffect, useState } from "react";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { VideoProjectDocumentSchema, type VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import {
  CONTENT_DRAFT_DURATION_OPTIONS_SECONDS,
  CONTENT_DRAFT_MOTION_STYLES,
  CONTENT_DRAFT_VOICE_TONES,
  DEFAULT_CONTENT_DRAFT_DURATION_SECONDS,
  DEFAULT_CONTENT_DRAFT_MOTION_STYLE,
  DEFAULT_CONTENT_DRAFT_VOICE_TONE,
  type ContentDraftDurationSeconds,
  type ContentDraftMotionStyle,
  type ContentDraftVoiceTone,
  type VideoContentDraftState,
} from "@shared/videoIntelligence/contentDraft";
import { describeViError, pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import { useGenerationJobPoll } from "./useGenerationJobPoll";

function formatDraftDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
    : `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)} วินาที`;
}

function estimateSpeechDuration(narration: string | null): string {
  const characters = narration?.trim().length ?? 0;
  return `บทพูดประมาณ ${Math.max(1, Math.round(characters / 17))} วินาที · ${characters} ตัวอักษร`;
}

export function ContentDraftReviewCard({
  lang,
  projectId,
  document,
  projectRevision,
  hasUnsavedChanges,
  onDocumentSaved,
  onPrepareForDraft,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument | null;
  projectRevision?: number;
  hasUnsavedChanges?: boolean;
  onDocumentSaved?: (document?: VideoProjectDocument, revision?: number) => void;
  /** Persist the current brief/document and return the revision to use. */
  onPrepareForDraft?: () => Promise<number | undefined>;
}) {
  const utils = trpc.useUtils();
  const poll = useGenerationJobPoll(projectId, "content_draft");
  const draftQuery = trpc.videoProjects.getContentDraft.useQuery(
    { projectId },
    { enabled: Boolean(document && projectRevision != null), staleTime: 0 },
  );
  const modelQuery = trpc.videoProjects.listRecommendedStageModels.useQuery(undefined, { staleTime: 60_000 });
  const [selectedModelId, setSelectedModelId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [durationLimitSeconds, setDurationLimitSeconds] = useState<ContentDraftDurationSeconds>(
    DEFAULT_CONTENT_DRAFT_DURATION_SECONDS,
  );
  const [voiceTone, setVoiceTone] = useState<ContentDraftVoiceTone>(DEFAULT_CONTENT_DRAFT_VOICE_TONE);
  const [motionStyle, setMotionStyle] = useState<ContentDraftMotionStyle>(DEFAULT_CONTENT_DRAFT_MOTION_STYLE);
  const [isPreparing, setIsPreparing] = useState(false);
  const handledJobId = useState<string | null>(null);
  const handledJobIdRef = handledJobId[0];
  const setHandledJobId = handledJobId[1];

  const runDraft = trpc.videoProjects.runContentDraft.useMutation({
    onSuccess: result => poll.setJobId(result.jobId),
    onError: error => toast.error(error.message),
  });
  const acceptDraft = trpc.videoProjects.acceptContentDraft.useMutation({
    onSuccess: result => {
      toast.success(pickCopy(lang, { th: "ยืนยันเนื้อหาแล้ว", en: "Content draft accepted" }));
      setFeedback("");
      const response = result as { document?: unknown; revision?: unknown };
      const acceptedDocument = VideoProjectDocumentSchema.safeParse(response.document);
      onDocumentSaved?.(
        acceptedDocument.success ? acceptedDocument.data : undefined,
        typeof response.revision === "number" ? response.revision : undefined,
      );
      void utils.videoProjects.getContentDraft.invalidate({ projectId });
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (poll.jobStatus?.status !== "succeeded" || !poll.jobId || handledJobIdRef === poll.jobId) return;
    setHandledJobId(poll.jobId);
    void utils.videoProjects.getContentDraft.invalidate({ projectId });
  }, [handledJobIdRef, poll.jobId, poll.jobStatus?.status, projectId, setHandledJobId, utils]);

  useEffect(() => {
    const models = modelQuery.data?.models ?? [];
    const defaultModel = models.find(model => model.isDefault) ?? models[0];
    if (defaultModel && !models.some(model => model.modelId === selectedModelId)) {
      setSelectedModelId(defaultModel.modelId);
    }
  }, [modelQuery.data?.models, selectedModelId]);

  const draft = draftQuery.data as VideoContentDraftState | null | undefined;
  const isBusy = isPreparing || runDraft.isPending || poll.jobStatus?.status === "queued" || poll.jobStatus?.status === "running";
  const blocked = !document || projectRevision == null || (Boolean(hasUnsavedChanges) && !onPrepareForDraft);
  const canAccept = draft?.status === "ready" && Boolean(draft.document) && !isBusy && !blocked;
  const modelOptions = modelQuery.data?.models ?? [];
  const totalNarrationCharacters = draft?.totalNarrationCharacters ?? draft?.document?.scenes.reduce(
    (total, scene) => total + (scene.narration?.trim().length ?? 0),
    0,
  ) ?? 0;

  useEffect(() => {
    if (!draft) return;
    if (draft.durationLimitSeconds) setDurationLimitSeconds(draft.durationLimitSeconds);
    if (draft.voiceTone) setVoiceTone(draft.voiceTone);
    if (draft.motionStyle) setMotionStyle(draft.motionStyle);
  }, [draft]);

  const selectedToneLabel = CONTENT_DRAFT_VOICE_TONES.find((tone) => tone.id === (draft?.voiceTone ?? voiceTone));
  const selectedMotionLabel = CONTENT_DRAFT_MOTION_STYLES.find((style) => style.id === (draft?.motionStyle ?? motionStyle));

  async function launchDraft(input: {
    feedback?: string;
  }) {
    if (isBusy || blocked || !selectedModelId || projectRevision == null) return;
    setIsPreparing(true);
    try {
      const preparedRevision = await onPrepareForDraft?.();
      runDraft.mutate({
        projectId,
        baseRevision: preparedRevision ?? projectRevision,
        feedback: input.feedback,
        modelId: selectedModelId,
        durationLimitSeconds,
        voiceTone,
        motionStyle,
      });
    } catch {
      // `updateBrief` and `saveDocument` already surface their own mutation
      // errors. Avoid showing the same failure twice from this orchestration
      // layer while still preventing the draft request from being dispatched.
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <Card data-testid="video-studio-content-draft-card">
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="body" weight="medium">
            {pickCopy(lang, { th: "ร่างเนื้อหาให้ตรวจสอบก่อน", en: "Review the content draft first" })}
          </Text>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, {
              th: "ระบบจะสร้างบทและโครงฉากก่อน ยังไม่สร้างเสียงพากย์จนกว่าคุณจะยืนยัน",
              en: "The system creates the script and scene outline first. Voice-over starts only after you accept it.",
            })}
          </Text>
        </VStack>

        {blocked ? (
          <Banner
            status="warning"
            data-testid="video-studio-content-draft-blocked"
            title={pickCopy(lang, videoStudioCopy.saveBeforeRunning)}
          />
        ) : hasUnsavedChanges ? (
          <Banner
            status="info"
            data-testid="video-studio-content-draft-auto-save"
            title={pickCopy(lang, videoStudioCopy.autoSaveBeforeDraft)}
          />
        ) : null}

        <Selector
          label={pickCopy(lang, { th: "ความยาวสูงสุดของ draft", en: "Draft duration limit" })}
          options={CONTENT_DRAFT_DURATION_OPTIONS_SECONDS.map((seconds) => ({
            value: String(seconds),
            label: pickCopy(lang, {
              th: `${seconds} วินาที${seconds === DEFAULT_CONTENT_DRAFT_DURATION_SECONDS ? " — แนะนำ" : ""}`,
              en: `${seconds} seconds${seconds === DEFAULT_CONTENT_DRAFT_DURATION_SECONDS ? " — recommended" : ""}`,
            }),
          }))}
          value={String(durationLimitSeconds)}
          onChange={(value) => setDurationLimitSeconds(Number(value) as ContentDraftDurationSeconds)}
          data-testid="video-studio-content-draft-duration"
        />

        <Selector
          label={pickCopy(lang, { th: "โทนการพูด", en: "Speaking tone" })}
          options={CONTENT_DRAFT_VOICE_TONES.map((tone) => ({
            value: tone.id,
            label: pickCopy(lang, { th: tone.th, en: tone.en }),
          }))}
          value={voiceTone}
          onChange={(value) => setVoiceTone(value as ContentDraftVoiceTone)}
          data-testid="video-studio-content-draft-voice-tone"
        />

        <Selector
          label={pickCopy(lang, { th: "รูปแบบภาพและ motion", en: "Visual and motion style" })}
          options={CONTENT_DRAFT_MOTION_STYLES.map((style) => ({
            value: style.id,
            label: pickCopy(lang, { th: style.th, en: style.en }),
          }))}
          value={motionStyle}
          onChange={(value) => setMotionStyle(value as ContentDraftMotionStyle)}
          data-testid="video-studio-content-draft-motion-style"
        />

        <Text type="supporting" color="secondary">
          {pickCopy(lang, {
            th: "ระบบจะเขียนบทพูดให้พอดีกับเพดานเวลานี้ และปรับจำนวนฉากตามความหนาแน่นของเนื้อหา ไม่ได้ล็อกจำนวนฉากตายตัว",
            en: "The script is sized to this time limit and the scene count adapts to the content instead of being fixed.",
          })}
        </Text>

        <Selector
          label={pickCopy(lang, { th: "โมเดลสร้าง draft (เฉพาะที่แนะนำ)", en: "Draft model (recommended only)" })}
          options={modelOptions.map(model => ({
            value: model.modelId,
            label: `${model.providerName} / ${model.modelId}${model.isDefault ? " — default" : ""}`,
          }))}
          value={selectedModelId}
          onChange={setSelectedModelId}
          data-testid="video-studio-content-draft-model"
        />

        {draft?.status === "ready" && draft.document ? (
          <VStack gap={2} data-testid="video-studio-content-draft-preview">
            <Card padding={3} data-testid="video-studio-content-draft-summary">
              <VStack gap={1}>
                <Text type="body" weight="medium">เนื้อหาที่จะได้จาก draft นี้</Text>
                <Text type="supporting" color="secondary">
                  {draft.summary || `โครงวิดีโอ ${draft.document.scenes.length} ฉาก`}
                </Text>
                <Text type="supporting" color="secondary">
                  ความยาวประมาณ {formatDraftDuration(draft.document.format.durationMs)} · {draft.document.scenes.length} ฉากตามเนื้อหา · บทพูดรวมประมาณ {Math.max(1, Math.round(totalNarrationCharacters / 17))} วินาที ({totalNarrationCharacters} ตัวอักษร)
                </Text>
                <Text type="supporting" color="secondary">
                  โทนการพูด: {pickCopy(lang, { th: selectedToneLabel?.th ?? "เป็นกันเอง ฟังง่าย", en: selectedToneLabel?.en ?? "Friendly and conversational" })} · ภาพและ motion: {pickCopy(lang, { th: selectedMotionLabel?.th ?? "ให้ระบบเลือกตามเนื้อหา", en: selectedMotionLabel?.en ?? "Choose based on the content" })}
                </Text>
              </VStack>
            </Card>
            {draft.document.scenes.map((scene, index) => (
              <Card key={scene.sceneId} padding={2}>
                <VStack gap={1}>
                  <Text type="supporting" weight="medium">
                    {pickCopy(lang, { th: `ฉากที่ ${index + 1} · ${formatDraftDuration(scene.startMs)}–${formatDraftDuration(scene.endMs)}`, en: `Scene ${index + 1} · ${formatDraftDuration(scene.startMs)}–${formatDraftDuration(scene.endMs)}` })}
                  </Text>
                  <Text type="supporting" color="secondary">
                    ภาพ/โมชัน: {scene.visual.kind === "template" ? scene.visual.templateId : "รอเลือกภาพหรือโมชัน"} · กล้อง {scene.motion.camera}
                  </Text>
                  <Text type="supporting" color="secondary">{estimateSpeechDuration(scene.narration)}</Text>
                  <Text type="body" className="whitespace-pre-wrap">{scene.narration || "—"}</Text>
                </VStack>
              </Card>
            ))}
            <TextArea
              label={pickCopy(lang, { th: "สิ่งที่ต้องการให้ปรับปรุง", en: "What should be improved?" })}
              value={feedback}
              rows={3}
              maxLength={2000}
              onChange={setFeedback}
              placeholder={pickCopy(lang, {
                th: "เช่น ขอให้เปิดเรื่องกระชับขึ้น เน้นจุดเด่นสินค้า และลดคำซ้ำ",
                en: "For example: make the opening shorter, emphasize the key benefit, and remove repetition.",
              })}
              data-testid="video-studio-content-draft-feedback"
            />
            <HStack gap={2} wrap="wrap">
              <Button
                type="button"
                variant="secondary"
                label={pickCopy(lang, { th: "ขอ draft ใหม่", en: "Request a new draft" })}
                isDisabled={isBusy || blocked}
                isLoading={isBusy}
                onClick={() => void launchDraft({ feedback: feedback.trim() || undefined })}
                data-testid="video-studio-content-draft-regenerate"
              />
              <Button
                type="button"
                variant="primary"
                label={pickCopy(lang, { th: "ยืนยันเนื้อหา", en: "Accept content" })}
                isDisabled={!canAccept || acceptDraft.isPending}
                isLoading={acceptDraft.isPending}
                onClick={() => acceptDraft.mutate({ projectId, baseRevision: projectRevision! })}
                data-testid="video-studio-content-draft-accept"
              />
            </HStack>
          </VStack>
        ) : null}

        {draft?.status !== "ready" ? (
          <Button
            type="button"
            variant="primary"
            label={pickCopy(lang, { th: "สร้าง draft เนื้อหา", en: "Create content draft" })}
            isDisabled={Boolean(blocked) || isBusy || !selectedModelId}
            isLoading={isBusy}
            onClick={() => void launchDraft({})}
            data-testid="video-studio-content-draft-run"
          />
        ) : null}

        {poll.jobStatus?.status === "failed" ? (
          <Banner
            status="error"
            data-testid="video-studio-content-draft-error"
            title={pickCopy(lang, videoStudioCopy.stageFailedTitle)}
            description={describeViError(lang, poll.jobStatus.error ?? pickCopy(lang, videoStudioCopy.jobErrorGeneric))}
          />
        ) : null}
      </VStack>
    </Card>
  );
}
