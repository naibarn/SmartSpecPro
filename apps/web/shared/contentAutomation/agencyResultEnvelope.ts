/**
 * AgencyResultEnvelope — Structured output contract for Agency results.
 *
 * All agency experience templates (Deck Builder, Deep Research, Storyboard Planner)
 * produce results conforming to this schema. The ResultRouter uses the `resultType`
 * discriminator to dispatch results to the correct UI destination.
 *
 * Backward-compatible: agencies that don't use this envelope continue to work
 * through the normal chat/message flow.
 */

import { z } from "zod";

// ── Result Types ─────────────────────────────────────────────

export const AGENCY_RESULT_TYPES = [
  "presentation_deck",
  "media_prompt",
  "video_storyboard",
  "research_report",
  "text_content",
] as const;

export type AgencyResultType = (typeof AGENCY_RESULT_TYPES)[number];

// ── Type-specific payloads ───────────────────────────────────

export const PresentationDeckPayloadSchema = z.object({
  deckId: z.number().int().positive(),
  libraryItemId: z.number().int().positive(),
  slideCount: z.number().int().min(0),
  title: z.string().min(1).max(255),
  previewImageUrl: z.string().max(2048).optional(),
  warnings: z.array(z.string()).max(50).optional(),
});

export const MediaPromptPayloadSchema = z.object({
  mediaType: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1).max(5000),
  model: z.string().max(100).optional(),
  referenceImageUrls: z.array(z.string().max(2048)).max(5).optional(),
  extraParams: z.record(z.unknown()).optional(),
});

export const VideoStoryboardSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  durationSeconds: z.number().positive().max(600).optional(),
  mediaPrompt: z.string().max(2000).optional(),
  narration: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

export const VideoStoryboardPayloadSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(2000).optional(),
  totalScenes: z.number().int().positive(),
  totalDurationSeconds: z.number().positive().optional(),
  scenes: z.array(VideoStoryboardSceneSchema).min(1).max(50),
});

export const ResearchReportSectionSchema = z.object({
  heading: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  sources: z.array(z.object({
    title: z.string().max(500),
    url: z.string().max(2048).optional(),
    excerpt: z.string().max(1000).optional(),
  })).max(20).optional(),
});

export const ResearchReportPayloadSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().min(1).max(5000),
  sections: z.array(ResearchReportSectionSchema).min(1).max(20),
  methodology: z.string().max(2000).optional(),
  limitations: z.string().max(2000).optional(),
});

export const TextContentPayloadSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(50000),
  format: z.enum(["plain", "markdown", "html"]).default("markdown"),
});

// ── Discriminated Envelope ───────────────────────────────────

const BaseEnvelopeSchema = z.object({
  version: z.literal(1),
  agencyId: z.string().min(1).max(36),
  agencyRunId: z.string().min(1).max(100).optional(),
  agentName: z.string().min(1).max(100).optional(),
  createdAt: z.string().datetime().optional(),
});

export const PresentationDeckEnvelopeSchema = BaseEnvelopeSchema.extend({
  resultType: z.literal("presentation_deck"),
  payload: PresentationDeckPayloadSchema,
});

export const MediaPromptEnvelopeSchema = BaseEnvelopeSchema.extend({
  resultType: z.literal("media_prompt"),
  payload: MediaPromptPayloadSchema,
});

export const VideoStoryboardEnvelopeSchema = BaseEnvelopeSchema.extend({
  resultType: z.literal("video_storyboard"),
  payload: VideoStoryboardPayloadSchema,
});

export const ResearchReportEnvelopeSchema = BaseEnvelopeSchema.extend({
  resultType: z.literal("research_report"),
  payload: ResearchReportPayloadSchema,
});

export const TextContentEnvelopeSchema = BaseEnvelopeSchema.extend({
  resultType: z.literal("text_content"),
  payload: TextContentPayloadSchema,
});

export const AgencyResultEnvelopeSchema = z.discriminatedUnion("resultType", [
  PresentationDeckEnvelopeSchema,
  MediaPromptEnvelopeSchema,
  VideoStoryboardEnvelopeSchema,
  ResearchReportEnvelopeSchema,
  TextContentEnvelopeSchema,
]);

export type AgencyResultEnvelope = z.infer<typeof AgencyResultEnvelopeSchema>;
export type PresentationDeckPayload = z.infer<typeof PresentationDeckPayloadSchema>;
export type MediaPromptPayload = z.infer<typeof MediaPromptPayloadSchema>;
export type VideoStoryboardPayload = z.infer<typeof VideoStoryboardPayloadSchema>;
export type ResearchReportPayload = z.infer<typeof ResearchReportPayloadSchema>;
export type TextContentPayload = z.infer<typeof TextContentPayloadSchema>;
export type VideoStoryboardScene = z.infer<typeof VideoStoryboardSceneSchema>;
export type ResearchReportSection = z.infer<typeof ResearchReportSectionSchema>;

// ── Utility: Try to parse a raw object as an envelope ────────

export function tryParseAgencyResultEnvelope(
  raw: unknown,
): AgencyResultEnvelope | null {
  const result = AgencyResultEnvelopeSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ── Routing destinations ─────────────────────────────────────

export const RESULT_TYPE_DESTINATIONS: Record<AgencyResultType, {
  destination: "presentation_editor" | "media_studio" | "chat";
  label: string;
  description: string;
}> = {
  presentation_deck: {
    destination: "presentation_editor",
    label: "Presentation Editor",
    description: "Open the generated deck in the Presentation Editor",
  },
  media_prompt: {
    destination: "media_studio",
    label: "Media Studio",
    description: "Send prompt to Media Studio for generation",
  },
  video_storyboard: {
    destination: "chat",
    label: "Storyboard Viewer",
    description: "Display structured storyboard with scene details",
  },
  research_report: {
    destination: "chat",
    label: "Research Report",
    description: "Display structured research report in chat",
  },
  text_content: {
    destination: "chat",
    label: "Text Content",
    description: "Display text content in chat",
  },
};
