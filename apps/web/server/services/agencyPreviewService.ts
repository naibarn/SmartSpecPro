import { z } from "zod";
import { AIPresentationSlideSchema } from "../../shared/presentation/aiTypes";
import {
  comparisonKindFromIntent,
  normalizeAgencyComparisonPayload,
  type AgencyComparisonPayload,
} from "../../shared/agencyComparison";
import type { PreviewArtifactMetadata, RunResult } from "./agencyBridge";

export type PreviewArtifactLifecycleState =
  | "preview_generated"
  | "expired_preview"
  | "commit_pending"
  | "committed"
  | "commit_failed";

const INLINE_PREVIEW_THRESHOLD_BYTES = 64 * 1024;
const MAX_DIRECT_PREVIEW_BYTES = 5 * 1024 * 1024;
const RUN_STRUCTURED_RESULT_PAYLOAD_STORAGE_KEY = "run_structured_result_payload";
const SUMMARY_ONLY_PREVIEW_STORAGE_KEY = "preview_summary_only";

const researchPayloadSchema = z.object({
  title: z.string().min(1),
  executive_summary: z.string().min(1),
  sections: z.array(z.object({
    heading: z.string().min(1),
    content: z.string().min(1),
    sources: z.array(z.string()).default([]),
  })).default([]),
  key_findings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

const storyboardPayloadSchema = z.object({
  title: z.string().min(1),
  total_duration_seconds: z.number().int().nonnegative(),
  style: z.string().min(1),
  scenes: z.array(z.object({
    scene_number: z.number().int().positive(),
    duration_seconds: z.number().int().positive(),
    description: z.string().min(1),
    dialogue: z.string().nullable().optional(),
    camera: z.string().min(1),
    lighting: z.string().min(1),
    video_prompt: z.string().min(1),
    audio_prompt: z.string().nullable().optional(),
  })).default([]),
});

const normalizedPresentationSlideSchema = z.object({
  templateId: AIPresentationSlideSchema.shape.templateId,
  title: AIPresentationSlideSchema.shape.title,
  body: AIPresentationSlideSchema.shape.body,
  notes: AIPresentationSlideSchema.shape.notes,
  sections: AIPresentationSlideSchema.shape.sections,
  graphicCategory: AIPresentationSlideSchema.shape.graphicCategory,
  imagePromptKeywords: z.string().min(1).max(500).default("presentation visual"),
});

const presentationPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.enum(["auto", "en", "th"]).default("auto"),
  style_preset: z.string().nullable().optional(),
  slides: z.array(normalizedPresentationSlideSchema).min(1).max(30),
});

const mediaPromptPayloadSchema = z.object({
  mediaType: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1),
  model: z.string().nullable().optional(),
  referenceImageUrls: z.array(z.string()).default([]),
  extraParams: z.record(z.unknown()).optional(),
});

const textContentPayloadSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().min(1),
  format: z.enum(["plain", "markdown", "html"]).default("markdown"),
});

type ResearchPayload = z.infer<typeof researchPayloadSchema>;
type StoryboardPayload = z.infer<typeof storyboardPayloadSchema>;
type PresentationPayload = z.infer<typeof presentationPayloadSchema>;
type ComparisonPayload = AgencyComparisonPayload;

interface PreviewProvenanceEntry {
  documentId: string | null;
  chunkId: string | null;
  title: string | null;
  url: string | null;
  source: string | null;
}

interface PreviewAuditState {
  payloadMode: "inline" | "run_structured_result" | "summary_only" | "missing";
  payloadStorageKey: string | null;
  inlineThresholdBytes: number;
  maxDirectBytes: number;
  inlineBytes: number | null;
  truncated: boolean;
}

interface PreviewCommitState {
  status: string;
  token: string;
  available: boolean;
  supported: boolean;
  mutation: "agency.commitPreview";
  targetType: string | null;
  targetId: string | null;
}

interface PreviewBase<TType extends string, TData> {
  previewType: TType;
  artifactId: string;
  intent: string;
  artifactType: string;
  lifecycleState: PreviewArtifactLifecycleState;
  summaryText: string;
  responseText: string;
  provenance: PreviewProvenanceEntry[];
  commit: PreviewCommitState;
  audit: PreviewAuditState;
  data: TData;
}

export type AgencyPreview =
  | PreviewBase<"research", {
      title: string;
      executiveSummary: string;
      sections: Array<{ heading: string; content: string; sources: string[] }>;
      keyFindings: string[];
      recommendations: string[];
    }>
  | PreviewBase<"storyboard", {
      title: string;
      totalDurationSeconds: number;
      style: string;
      scenes: Array<{
        sceneNumber: number;
        durationSeconds: number;
        description: string;
        dialogue: string | null;
        camera: string;
        lighting: string;
        videoPrompt: string;
        audioPrompt: string | null;
      }>;
    }>
  | PreviewBase<"deck", {
      title: string;
      description: string | null;
      language: string;
      stylePreset: string | null;
      slides: Array<Record<string, unknown>>;
    }>
  | PreviewBase<"comparison", {
      comparisonKind: ComparisonPayload["comparisonKind"];
      title: string;
      summary: string | null;
      locationSummary: string | null;
      comparedAt: string | null;
      sortHint: string | null;
      recommendations: string[];
      options: ComparisonPayload["options"];
    }>
  | PreviewBase<"media_prompt", {
      mediaType: "image" | "video" | "audio";
      prompt: string;
      model: string | null;
      referenceImageUrls: string[];
    }>
  | PreviewBase<"text_content", {
      title: string;
      content: string;
      format: "plain" | "markdown" | "html";
    }>;

function getPrimaryPreviewArtifact(run: Pick<RunResult, "previewArtifacts">): PreviewArtifactMetadata | null {
  return run.previewArtifacts[0] ?? null;
}

function getPayloadMode(artifact: PreviewArtifactMetadata, inlineBytes: number | null): PreviewAuditState["payloadMode"] {
  if (artifact.payload_json) return "inline";
  if (artifact.payload_storage_key === RUN_STRUCTURED_RESULT_PAYLOAD_STORAGE_KEY) {
    return "run_structured_result";
  }
  if (artifact.payload_storage_key === SUMMARY_ONLY_PREVIEW_STORAGE_KEY) {
    return "summary_only";
  }
  return "missing";
}

function deriveLifecycleState(
  artifact: PreviewArtifactMetadata,
  now: Date,
): PreviewArtifactLifecycleState {
  if (artifact.commit_status === "committed") return "committed";
  if (artifact.commit_status === "commit_pending" || artifact.state === "commit_pending") {
    return "commit_pending";
  }
  if (artifact.commit_status === "commit_failed" || artifact.state === "commit_failed") {
    return "commit_failed";
  }
  if (artifact.expired_at && new Date(artifact.expired_at).getTime() <= now.getTime()) {
    return "expired_preview";
  }
  if (artifact.state === "expired_preview") return "expired_preview";
  return "preview_generated";
}

function normalizeProvenance(rawEntries: unknown): PreviewProvenanceEntry[] {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries.map((entry) => {
    const source = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      documentId: typeof source.document_id === "string" ? source.document_id : null,
      chunkId: typeof source.chunk_id === "string" ? source.chunk_id : null,
      title: typeof source.title === "string" ? source.title : null,
      url: typeof source.url === "string" ? source.url : null,
      source: typeof source.source === "string" ? source.source : null,
    };
  });
}

function normalizeDeckSlides(rawSlides: unknown): PresentationPayload["slides"] {
  if (!Array.isArray(rawSlides)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rawSlides.map((slide): any => {
    const item = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    return {
      templateId:
        typeof item.templateId === "string"
          ? item.templateId
          : typeof item.template_id === "string"
            ? item.template_id
            : "title_subtitle",
      title: typeof item.title === "string" ? item.title : "",
      body: Array.isArray(item.body) ? item.body.filter((value): value is string => typeof value === "string") : [],
      notes: typeof item.notes === "string" ? item.notes : undefined,
      sections: Array.isArray(item.sections) ? item.sections as any : undefined,
      graphicCategory:
        typeof item.graphicCategory === "string"
          ? item.graphicCategory
          : typeof item.graphic_category === "string"
            ? item.graphic_category
            : "business",
      imagePromptKeywords:
        typeof item.imagePromptKeywords === "string"
          ? item.imagePromptKeywords
          : typeof item.image_prompt_keywords === "string"
            ? item.image_prompt_keywords
            : "presentation visual",
    };
  });
}

function resolvePayload(
  run: Pick<RunResult, "structuredResult">,
  artifact: PreviewArtifactMetadata,
): Record<string, unknown> | null {
  if (artifact.payload_json && typeof artifact.payload_json === "object") {
    return artifact.payload_json;
  }
  if (
    artifact.payload_storage_key === RUN_STRUCTURED_RESULT_PAYLOAD_STORAGE_KEY
    && run.structuredResult?.payload
    && typeof run.structuredResult.payload === "object"
  ) {
    return run.structuredResult.payload;
  }
  return null;
}

function buildAuditState(
  artifact: PreviewArtifactMetadata,
  payload: Record<string, unknown> | null,
): PreviewAuditState {
  const inlineBytes = artifact.payload_json ? Buffer.byteLength(JSON.stringify(artifact.payload_json), "utf8") : null;
  return {
    payloadMode: getPayloadMode(artifact, inlineBytes),
    payloadStorageKey: artifact.payload_storage_key ?? null,
    inlineThresholdBytes: INLINE_PREVIEW_THRESHOLD_BYTES,
    maxDirectBytes: MAX_DIRECT_PREVIEW_BYTES,
    inlineBytes,
    truncated: artifact.payload_storage_key === SUMMARY_ONLY_PREVIEW_STORAGE_KEY || payload == null,
  };
}

function buildCommitState(
  artifact: PreviewArtifactMetadata,
  lifecycleState: PreviewArtifactLifecycleState,
): PreviewCommitState {
  return {
    status: artifact.commit_status,
    token: artifact.commit_token,
    available: lifecycleState !== "expired_preview" && lifecycleState !== "committed",
    supported: true,
    mutation: "agency.commitPreview",
    targetType: artifact.target_type ?? null,
    targetId: artifact.target_id ?? null,
  };
}

export function buildAgencyPreview(
  run: Pick<RunResult, "response" | "structuredResult" | "previewArtifacts">,
  now: Date = new Date(),
): AgencyPreview | null {
  const artifact = getPrimaryPreviewArtifact(run);
  if (!artifact || !run.structuredResult) return null;

  const lifecycleState = deriveLifecycleState(artifact, now);
  const payload = resolvePayload(run, artifact);
  const audit = buildAuditState(artifact, payload);
  const provenance = normalizeProvenance(artifact.provenance_json ?? run.structuredResult.references ?? []);
  const commit = buildCommitState(artifact, lifecycleState);

  if (run.structuredResult.intent === "research_report" && payload) {
    const parsed = researchPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "research",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          title: parsed.data.title,
          executiveSummary: parsed.data.executive_summary,
          sections: parsed.data.sections,
          keyFindings: parsed.data.key_findings,
          recommendations: parsed.data.recommendations,
        },
      };
    }
  }

  if (run.structuredResult.intent === "video_storyboard" && payload) {
    const parsed = storyboardPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "storyboard",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          title: parsed.data.title,
          totalDurationSeconds: parsed.data.total_duration_seconds,
          style: parsed.data.style,
          scenes: parsed.data.scenes.map((scene) => ({
            sceneNumber: scene.scene_number,
            durationSeconds: scene.duration_seconds,
            description: scene.description,
            dialogue: scene.dialogue ?? null,
            camera: scene.camera,
            lighting: scene.lighting,
            videoPrompt: scene.video_prompt,
            audioPrompt: scene.audio_prompt ?? null,
          })),
        },
      };
    }
  }

  if (run.structuredResult.intent === "presentation_deck" && payload) {
    const rawPayload = payload as Record<string, unknown>;
    const parsed = presentationPayloadSchema.safeParse({
      ...rawPayload,
      slides: normalizeDeckSlides(rawPayload.slides),
    });
    if (parsed.success) {
      return {
        previewType: "deck",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          language: parsed.data.language,
          stylePreset: parsed.data.style_preset ?? null,
          slides: parsed.data.slides,
        },
      };
    }
  }

  if (run.structuredResult.intent === "media_prompt" && payload) {
    const parsed = mediaPromptPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "media_prompt",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          mediaType: parsed.data.mediaType,
          prompt: parsed.data.prompt,
          model: parsed.data.model ?? null,
          referenceImageUrls: parsed.data.referenceImageUrls,
        },
      };
    }
  }

  if (run.structuredResult.intent === "text_content" && payload) {
    const parsed = textContentPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return {
        previewType: "text_content",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? parsed.data.title ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          title: parsed.data.title ?? "Generated Content",
          content: parsed.data.content,
          format: parsed.data.format,
        },
      };
    }
  }

  const comparisonKind = comparisonKindFromIntent(run.structuredResult.intent);
  if (comparisonKind && payload) {
    const parsed = normalizeAgencyComparisonPayload(payload, comparisonKind);
    if (parsed) {
      return {
        previewType: "comparison",
        artifactId: artifact.id,
        intent: artifact.intent,
        artifactType: artifact.artifact_type,
        lifecycleState,
        summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
        responseText: run.response,
        provenance,
        commit,
        audit,
        data: {
          comparisonKind: parsed.comparisonKind,
          title: parsed.title,
          summary: parsed.summary ?? null,
          locationSummary: parsed.locationSummary ?? null,
          comparedAt: parsed.comparedAt ?? null,
          sortHint: parsed.sortHint ?? null,
          recommendations: parsed.recommendations,
          options: parsed.options,
        },
      };
    }
  }

  return null;
}
