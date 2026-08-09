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

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { createDefaultDocument } from "./createDefaultDocument";
import { ContentDraftReviewCard } from "./ContentDraftReviewCard";
import { migrateForFormatChange } from "./timelineEdits";
import {
  BRIEF_AUDIENCE_PRESETS,
  BRIEF_TOPIC_PRESETS,
  pickCopy,
  videoStudioCopy,
  type VideoStudioLang,
} from "./videoStudioCopy";

const AUDIENCE_CUSTOM_ID = "__custom__";

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
  projectRevision,
  hasUnsavedChanges,
  onDocumentSaved,
  onSaveDocument,
}: {
  lang: VideoStudioLang;
  project: VideoProjectRowLike;
  document: VideoProjectDocument | null;
  onDocumentInitialized: (doc: VideoProjectDocument) => void;
  onDocumentChange: (doc: VideoProjectDocument) => void;
  /** Current server-side document revision — only meaningful once `document`
   *  exists; required to dispatch the auto-draft launcher below. */
  projectRevision?: number;
  /** Same "block launch while there are unsaved edits" gate every other
   *  stage launcher uses (spec §6.4 rule 2). */
  hasUnsavedChanges?: boolean;
  /** Fired once per terminal `auto_draft` job so the draft is refreshed from
   *  the server — otherwise the next Save silently overwrites the AI's
   *  draft (same contract as `ScenesPanel`'s `onDocumentSaved`). */
  onDocumentSaved?: (document?: VideoProjectDocument, revision?: number) => void;
  /** Persist the canonical document before a paid/content generation step. */
  onSaveDocument?: () => Promise<number | undefined>;
}) {
  const brief = (project.brief ?? {}) as {
    topic?: string;
    audience?: string;
    notes?: string;
    productName?: string;
  };
  const [topic, setTopic] = useState(brief.topic ?? "");
  const [audience, setAudience] = useState(brief.audience ?? "");
  const [notes, setNotes] = useState(brief.notes ?? "");
  const [platformPreset, setPlatformPreset] = useState<
    "tiktok_9_16" | "reels_9_16" | "youtube_16_9" | "square_1_1"
  >("tiktok_9_16");

  // Presets only *fill* the input (still freely editable). Track which chip
  // is selected purely for visual highlight; typing a custom value clears
  // the selection instead of fighting the user's edit.
  const [selectedTopicPreset, setSelectedTopicPreset] = useState<string | null>(null);
  const [selectedAudiencePreset, setSelectedAudiencePreset] = useState<string | null>(null);
  const productName =
    brief.productName?.trim() || pickCopy(lang, { th: "สินค้านี้", en: "this product" });

  const utils = trpc.useUtils();
  const updateBrief = trpc.videoProjects.updateBrief.useMutation({
    onSuccess: async () => {
      toast.success(pickCopy(lang, videoStudioCopy.saved));
      await utils.videoProjects.get.invalidate({ projectId: project.id });
    },
    onError: (error) => toast.error(error.message),
  });

  const persistedBrief = brief;
  const briefHasUnsavedChanges =
    topic !== (persistedBrief.topic ?? "") ||
    audience !== (persistedBrief.audience ?? "") ||
    notes !== (persistedBrief.notes ?? "");

  async function prepareDraft() {
    if (briefHasUnsavedChanges) {
      await updateBrief.mutateAsync({
        projectId: project.id,
        brief: { ...(project.brief as Record<string, unknown> | null), topic, audience, notes },
      });
    }
    return onSaveDocument?.();
  }

  // Feature 143 §4.11/AC17 — a format edit (fps/width/height) silently
  // retimes every hand-authored layer and un-scales text size unless
  // migrated. This file isn't owned by the Video Studio timeline agent this
  // round, so this is the smallest possible addition: intercept ONLY the
  // three format fields with an existing hand-authored layer, route them
  // through `timelineEdits.ts`'s already-exported `migrateForFormatChange`
  // behind a confirm, and leave every other field/handler in this file
  // untouched (still calling `onDocumentChange` directly).
  const hasHandAuthoredLayers = Boolean(document?.scenes.some((scene) => scene.layers.length > 0));
  const [pendingFormatChange, setPendingFormatChange] = useState<{
    field: "width" | "height" | "fps";
    value: number;
  } | null>(null);

  function handleFormatFieldChange(field: "width" | "height" | "fps", value: number) {
    if (!document || value === document.format[field]) return;
    if (hasHandAuthoredLayers) {
      setPendingFormatChange({ field, value });
      return;
    }
    onDocumentChange({ ...document, format: { ...document.format, [field]: value } });
  }

  function confirmFormatChange() {
    if (!document || !pendingFormatChange) return;
    const { field, value } = pendingFormatChange;
    const fromFps = document.format.fps;
    const fromWidth = document.format.width;
    const fromHeight = document.format.height;
    const migrated = migrateForFormatChange(document, {
      fromFps,
      toFps: field === "fps" ? value : fromFps,
      fromWidth,
      toWidth: field === "width" ? value : fromWidth,
      fromHeight,
      toHeight: field === "height" ? value : fromHeight,
    });
    onDocumentChange(migrated);
    setPendingFormatChange(null);
  }

  return (
    <VStack gap={4} data-testid="video-studio-brief-panel">
      <Card>
        <VStack gap={3}>
          <Heading level={4}>{pickCopy(lang, { th: "โจทย์โปรเจกต์", en: "Project brief" })}</Heading>

          <VStack gap={2}>
            <Text type="supporting" color="secondary">
              {pickCopy(lang, videoStudioCopy.briefTopicPresetsLabel)}
            </Text>
            <ToggleButtonGroup
              type="single"
              label={pickCopy(lang, videoStudioCopy.briefTopicPresetsLabel)}
              value={selectedTopicPreset}
              onChange={(presetId) => {
                setSelectedTopicPreset(presetId);
                if (presetId) {
                  const preset = BRIEF_TOPIC_PRESETS.find((item) => item.id === presetId);
                  if (preset) {
                    setTopic(pickCopy(lang, { th: preset.th(productName), en: preset.en(productName) }));
                  }
                }
              }}
              data-testid="brief-topic-preset"
            >
              {BRIEF_TOPIC_PRESETS.map((preset) => (
                <ToggleButton
                  key={preset.id}
                  value={preset.id}
                  size="sm"
                  label={pickCopy(lang, { th: preset.th(productName), en: preset.en(productName) })}
                />
              ))}
            </ToggleButtonGroup>
            <TextInput
              label={pickCopy(lang, videoStudioCopy.briefTopicLabel)}
              description={pickCopy(lang, videoStudioCopy.briefTopicHelper)}
              value={topic}
              onChange={(value) => {
                setTopic(value);
                setSelectedTopicPreset(null);
              }}
            />
          </VStack>

          <VStack gap={2}>
            <Text type="supporting" color="secondary">
              {pickCopy(lang, videoStudioCopy.briefAudiencePresetsLabel)}
            </Text>
            <ToggleButtonGroup
              type="single"
              label={pickCopy(lang, videoStudioCopy.briefAudiencePresetsLabel)}
              value={selectedAudiencePreset}
              onChange={(presetId) => {
                setSelectedAudiencePreset(presetId);
                if (presetId && presetId !== AUDIENCE_CUSTOM_ID) {
                  const preset = BRIEF_AUDIENCE_PRESETS.find((item) => item.id === presetId);
                  if (preset) setAudience(pickCopy(lang, preset));
                }
              }}
              data-testid="brief-audience-preset"
            >
              {BRIEF_AUDIENCE_PRESETS.map((preset) => (
                <ToggleButton key={preset.id} value={preset.id} size="sm" label={pickCopy(lang, preset)} />
              ))}
              <ToggleButton
                value={AUDIENCE_CUSTOM_ID}
                size="sm"
                label={pickCopy(lang, videoStudioCopy.briefAudienceCustom)}
              />
            </ToggleButtonGroup>
            <TextInput
              label={pickCopy(lang, videoStudioCopy.briefAudienceLabel)}
              description={pickCopy(lang, videoStudioCopy.briefAudienceHelper)}
              value={audience}
              onChange={(value) => {
                setAudience(value);
                setSelectedAudiencePreset(null);
              }}
            />
          </VStack>

          <TextInput
            label={pickCopy(lang, videoStudioCopy.briefNotesLabel)}
            description={pickCopy(lang, videoStudioCopy.briefNotesHelper)}
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

      {document && projectRevision != null ? (
        <ContentDraftReviewCard
          lang={lang}
          projectId={project.id}
          document={document}
          projectRevision={projectRevision}
          hasUnsavedChanges={hasUnsavedChanges}
          onDocumentSaved={onDocumentSaved}
          onPrepareForDraft={prepareDraft}
        />
      ) : null}

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
                onChange={(value) => handleFormatFieldChange("width", value)}
              />
              <NumberInput
                label={pickCopy(lang, { th: "ความสูง", en: "Height" })}
                value={document.format.height}
                onChange={(value) => handleFormatFieldChange("height", value)}
              />
              <NumberInput
                label="FPS"
                value={document.format.fps}
                onChange={(value) => handleFormatFieldChange("fps", value)}
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
            <Heading level={4}>{pickCopy(lang, videoStudioCopy.briefInitTitle)}</Heading>

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
              label={pickCopy(lang, videoStudioCopy.briefInitButton)}
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
            <Text type="supporting" color="secondary">
              {pickCopy(lang, videoStudioCopy.briefInitCaption)}
            </Text>
          </VStack>
        </Card>
      )}

      <AlertDialog
        isOpen={pendingFormatChange != null}
        onOpenChange={(open) => !open && setPendingFormatChange(null)}
        data-testid="vs-format-migrate-confirm"
        title={pickCopy(lang, videoStudioCopy.formatMigrateConfirmTitle)}
        description={pickCopy(lang, videoStudioCopy.formatMigrateConfirmBody)}
        actionLabel={pickCopy(lang, videoStudioCopy.formatMigrateConfirmAction)}
        actionVariant="primary"
        onAction={confirmFormatChange}
      />
    </VStack>
  );
}
