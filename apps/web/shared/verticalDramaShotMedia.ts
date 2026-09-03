import { z } from "zod";

import {
  canonicalJsonStringify,
  sha256Hex,
} from "./verticalDramaSeries/artifacts";

/** Versioned, server-resolved media contract for one Vertical Drama shot. */
export const VERTICAL_DRAMA_SHOT_MEDIA_CONTRACT_VERSION =
  "vd-shot-media/1" as const;

export const shotMediaTypeSchema = z.enum(["image", "video", "audio"]);
export type ShotMediaType = z.infer<typeof shotMediaTypeSchema>;

export const shotReferenceRoleSchema = z.enum([
  "reference",
  "character",
  "location",
  "prop",
  "style",
  "continuity",
  "action",
  "barrier_reference",
  "soundscape",
]);
export type ShotReferenceRole = z.infer<typeof shotReferenceRoleSchema>;

export const shotReferenceSourceSchema = z.enum([
  "prop_object",
  "upload",
  "library",
  "generated",
  "history",
  "grid_cut",
  "reference_frame",
  "previous_main",
]);
export type ShotReferenceSource = z.infer<typeof shotReferenceSourceSchema>;

const assetIdSchema = z.number().int().positive();
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const shotFrameAssetSchema = z
  .object({
    assetId: assetIdSchema,
    mediaType: z.literal("image"),
    mediaFingerprint: fingerprintSchema,
    resolvedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ShotFrameAsset = z.infer<typeof shotFrameAssetSchema>;

export const shotReferenceSegmentSchema = z
  .object({
    inPointSec: z.number().finite().min(0),
    outPointSec: z.number().finite().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outPointSec <= value.inPointSec) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outPointSec"],
        message: "segment end must be after segment start",
      });
    }
  });

export const shotReferenceSchema = z
  .object({
    referenceId: z.string().trim().min(1).max(160),
    assetId: assetIdSchema,
    mediaType: shotMediaTypeSchema,
    role: shotReferenceRoleSchema,
    source: shotReferenceSourceSchema,
    order: z.number().int().nonnegative().max(49),
    label: z.string().trim().min(1).max(120),
    mediaFingerprint: fingerprintSchema,
    segment: shotReferenceSegmentSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.segment && value.mediaType !== "video") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["segment"],
        message: "segments are supported for video references only",
      });
    }
  });
export type ShotReference = z.infer<typeof shotReferenceSchema>;

/** Untrusted, auditable evidence produced before prompt authoring. */
export const attachmentInspectionSchema = z
  .object({
    referenceId: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(120),
    status: z.enum(["inspected", "derived", "unavailable"]),
    method: z.enum(["native", "keyframes", "transcript", "metadata_only"]),
    observations: z.array(z.string().trim().min(1).max(400)).max(16),
    uncertainties: z.array(z.string().trim().min(1).max(400)).max(16),
    sourceFingerprint: fingerprintSchema,
    skillSlug: z.string().trim().min(1).max(160),
    skillVersion: z.string().trim().min(1).max(80),
  })
  .strict();
export type AttachmentInspection = z.infer<typeof attachmentInspectionSchema>;

export const videoShotMediaBundleSchema = z
  .object({
    contractVersion: z.literal(VERTICAL_DRAMA_SHOT_MEDIA_CONTRACT_VERSION),
    bundleRevision: z.number().int().positive(),
    startFrame: shotFrameAssetSchema.nullable(),
    stopFrame: shotFrameAssetSchema.nullable(),
    references: z.array(shotReferenceSchema).max(50),
    bundleFingerprint: fingerprintSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const orders = new Set<number>();
    const ids = new Set<string>();
    for (const reference of value.references) {
      if (orders.has(reference.order)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["references"],
          message: "reference order must be unique",
        });
      }
      if (ids.has(reference.referenceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["references"],
          message: "referenceId must be unique",
        });
      }
      orders.add(reference.order);
      ids.add(reference.referenceId);
    }
  });
export type VideoShotMediaBundle = z.infer<typeof videoShotMediaBundleSchema>;

type FingerprintInput = Omit<
  VideoShotMediaBundle,
  "bundleFingerprint" | "bundleRevision"
>;

export function computeVideoShotMediaBundleFingerprint(
  input: FingerprintInput
): string {
  return sha256Hex(
    canonicalJsonStringify({
      ...input,
      references: [...input.references].sort((a, b) => a.order - b.order),
    })
  );
}

export function normalizeVideoShotMediaBundle(
  input: Omit<VideoShotMediaBundle, "bundleFingerprint">
): VideoShotMediaBundle {
  const sortedReferences = [...input.references].sort(
    (a, b) => a.order - b.order
  );
  const withLabels = sortedReferences.map(reference => ({
    ...reference,
    label:
      reference.label.trim() ||
      `REFERENCE_${reference.mediaType.toUpperCase()}_${String(reference.order + 1).padStart(2, "0")}`,
  }));
  const fingerprintInput = {
    contractVersion: input.contractVersion,
    startFrame: input.startFrame,
    stopFrame: input.stopFrame,
    references: withLabels,
  } satisfies FingerprintInput;
  return videoShotMediaBundleSchema.parse({
    ...fingerprintInput,
    bundleRevision: input.bundleRevision,
    bundleFingerprint: computeVideoShotMediaBundleFingerprint(fingerprintInput),
  });
}

export function hasUsableStopFrame(
  bundle: VideoShotMediaBundle | null | undefined
): boolean {
  return Boolean(
    bundle?.stopFrame?.assetId && bundle.stopFrame.mediaType === "image"
  );
}

/**
 * Produce the auditable pre-authoring evidence policy for a bundle. The
 * current chat vision adapter can natively inspect images; video/audio bytes
 * remain provider attachments and are explicitly marked metadata-only until
 * a native video/audio inspection adapter is configured. This prevents the
 * prompt skill from claiming it saw or heard media it did not receive.
 */
export function buildAttachmentInspectionRecords(
  bundle: VideoShotMediaBundle
): AttachmentInspection[] {
  const records: AttachmentInspection[] = [];
  const add = (
    referenceId: string,
    label: string,
    mediaType: ShotMediaType,
    fingerprint: string
  ) => {
    const nativeImage = mediaType === "image";
    records.push({
      referenceId,
      label,
      status: nativeImage ? "inspected" : "unavailable",
      method: nativeImage ? "native" : "metadata_only",
      observations: nativeImage
        ? [
            "Image attachment is available to the vision prompt-authoring skill.",
          ]
        : [
            "The canonical asset exists and is retained for provider transport, but its content is not available to the prompt-authoring vision adapter.",
          ],
      uncertainties: nativeImage
        ? []
        : [
            `${mediaType} content must not be inferred from its label, filename, or prompt text.`,
          ],
      sourceFingerprint: fingerprint,
      skillSlug: "vertical-drama-video-attachment-inspection",
      skillVersion: "1",
    });
  };
  if (bundle.startFrame)
    add(
      "start-frame",
      "START_FRAME_IMAGE",
      "image",
      bundle.startFrame.mediaFingerprint
    );
  if (bundle.stopFrame)
    add(
      "stop-frame",
      "STOP_FRAME_IMAGE",
      "image",
      bundle.stopFrame.mediaFingerprint
    );
  for (const reference of bundle.references) {
    add(
      reference.referenceId,
      reference.label,
      reference.mediaType,
      reference.mediaFingerprint
    );
  }
  return records;
}

/**
 * Build the canonical bundle used by both prompt authoring and provider
 * submission.  Frames are deliberately nullable: a shot may have neither a
 * start nor a stop frame, and a stop prompt without a real asset must never
 * become a stop-frame attachment.
 */
export function buildVideoShotMediaBundle(input: {
  bundleRevision: number;
  startFrame?: ShotFrameAsset | null;
  stopFrame?: ShotFrameAsset | null;
  references: ShotReference[];
}): VideoShotMediaBundle {
  return normalizeVideoShotMediaBundle({
    contractVersion: VERTICAL_DRAMA_SHOT_MEDIA_CONTRACT_VERSION,
    bundleRevision: input.bundleRevision,
    startFrame: input.startFrame ?? null,
    stopFrame: input.stopFrame ?? null,
    references: input.references,
  });
}

export function partitionShotReferences(references: ShotReference[]): {
  images: ShotReference[];
  videos: ShotReference[];
  audio: ShotReference[];
} {
  return references.reduce(
    (result, reference) => {
      if (reference.mediaType === "image") result.images.push(reference);
      else if (reference.mediaType === "video") result.videos.push(reference);
      else result.audio.push(reference);
      return result;
    },
    { images: [], videos: [], audio: [] } as {
      images: ShotReference[];
      videos: ShotReference[];
      audio: ShotReference[];
    }
  );
}

/** Stable, human-readable labels for the prompt authoring skill and the
 * provider-bound prompt. The labels mirror attachment order, so a provider
 * that only exposes ordered arrays still receives unambiguous semantics. */
export function renderVideoShotMediaReferenceInstruction(
  bundle: VideoShotMediaBundle
): string {
  const inspections = buildAttachmentInspectionRecords(bundle);
  const inspectionById = new Map(
    inspections.map(record => [record.referenceId, record])
  );
  const inspectionText = (referenceId: string) => {
    const record = inspectionById.get(referenceId);
    return record?.status === "inspected"
      ? "authoring inspection=native"
      : "authoring inspection=metadata_only/unavailable; do not invent unseen or unheard details";
  };
  const lines = [
    "ATTACHED SHOT MEDIA (AUTHORITATIVE; inspect every attached item before writing motion):",
    bundle.startFrame
      ? `START_FRAME_IMAGE: the attached image is the actual opening frame; preserve its identity, composition, and visible blocking (${inspectionText("start-frame")}).`
      : "START_FRAME_IMAGE: none attached.",
    bundle.stopFrame
      ? `STOP_FRAME_IMAGE: the attached image is the actual requested ending frame; explicitly describe motion that resolves into this image (${inspectionText("stop-frame")}).`
      : "STOP_FRAME_IMAGE: none attached; do not invent or imply a stop-frame image.",
  ];
  if (bundle.references.length === 0) {
    lines.push("REFERENCE_MEDIA: none attached.");
  } else {
    lines.push(
      ...bundle.references.map(
        reference =>
          `${reference.label}: attached ${reference.mediaType} reference; use it only for its declared role (${reference.role}) and preserve its order; ${inspectionText(reference.referenceId)}.`
      )
    );
  }
  return lines.join("\n");
}
