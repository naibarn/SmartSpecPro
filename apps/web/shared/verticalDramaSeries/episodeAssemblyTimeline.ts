import { z } from "zod";

/**
 * One external footage item in an episode's final assembly timeline.
 *
 * The timeline deliberately stores source coordinates, not URLs. URLs are
 * resolved from owner-scoped media assets immediately before a Worker render.
 * This keeps the persisted plan portable, revocable, and safe to retry.
 */
export const episodeAssemblyFootageBlockSchema = z
  .object({
    blockId: z.string().trim().min(1).max(96),
    mediaAssetId: z.number().int().positive(),
    title: z.string().trim().max(240).optional(),
    sourceInMs: z.number().int().min(0),
    sourceOutMs: z.number().int().positive(),
    fitMode: z.enum(["cover", "contain"]).default("cover"),
    audioPolicy: z.enum(["keep", "mute"]).default("keep"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sourceOutMs <= value.sourceInMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceOutMs"],
        message: "sourceOutMs must be greater than sourceInMs",
      });
    }
  });

/**
 * The compound 9-shot block is implicit and always sits at insertAtMs in the
 * concatenated, trimmed footage track. An implicit block prevents accidental
 * deletion of the actual episode content while still allowing the user to
 * insert it inside any footage item.
 */
export const episodeAssemblyTimelineSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    insertAtMs: z.number().int().nonnegative(),
    footage: z.array(episodeAssemblyFootageBlockSchema).max(50),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type EpisodeAssemblyFootageBlock = z.infer<
  typeof episodeAssemblyFootageBlockSchema
>;
export type EpisodeAssemblyTimeline = z.infer<
  typeof episodeAssemblyTimelineSchema
>;

export interface EpisodeAssemblyTimelineSource {
  mediaAssetId: number;
  durationMs: number | null;
  title?: string | null;
}

export interface EpisodeAssemblyTimelineIssue {
  path: string;
  message: string;
}

export interface EpisodeAssemblyTimelineValidation {
  valid: boolean;
  issues: EpisodeAssemblyTimelineIssue[];
  totalFootageDurationMs: number;
}

export function emptyEpisodeAssemblyTimeline(): EpisodeAssemblyTimeline {
  return { version: 1, revision: 0, insertAtMs: 0, footage: [] };
}

/**
 * Validate persisted coordinates against the actual owner-scoped media
 * source catalog. This function is pure so the same rules can be used by the
 * API, UI preview, and focused tests.
 */
export function validateEpisodeAssemblyTimeline(
  timeline: EpisodeAssemblyTimeline,
  sources: readonly EpisodeAssemblyTimelineSource[],
): EpisodeAssemblyTimelineValidation {
  const sourceById = new Map(
    sources.map(source => [source.mediaAssetId, source]),
  );
  const issues: EpisodeAssemblyTimelineIssue[] = [];
  let totalFootageDurationMs = 0;

  timeline.footage.forEach((block, index) => {
    const path = `footage[${index}]`;
    const source = sourceById.get(block.mediaAssetId);
    if (!source) {
      issues.push({
        path: `${path}.mediaAssetId`,
        message: `Media asset ${block.mediaAssetId} is not available to this episode`,
      });
      return;
    }
    if (source.durationMs == null || !Number.isFinite(source.durationMs)) {
      issues.push({
        path: `${path}.sourceOutMs`,
        message: `Media asset ${block.mediaAssetId} has no usable duration`,
      });
      return;
    }
    if (block.sourceOutMs > source.durationMs) {
      issues.push({
        path: `${path}.sourceOutMs`,
        message: `Trim end ${block.sourceOutMs}ms exceeds source duration ${Math.round(source.durationMs)}ms`,
      });
    }
    if (block.sourceOutMs <= block.sourceInMs) {
      issues.push({
        path: `${path}.sourceOutMs`,
        message: "Trim end must be greater than trim start",
      });
    }
    if (block.sourceOutMs > block.sourceInMs) {
      totalFootageDurationMs += block.sourceOutMs - block.sourceInMs;
    }
  });

  if (timeline.insertAtMs > totalFootageDurationMs) {
    issues.push({
      path: "insertAtMs",
      message: `Insert point ${timeline.insertAtMs}ms exceeds trimmed footage duration ${totalFootageDurationMs}ms`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    totalFootageDurationMs,
  };
}

export type EpisodeAssemblyResolvedSegment =
  | {
      kind: "footage";
      blockId: string;
      mediaAssetId: number;
      sourceInSec: number;
      sourceOutSec: number;
      fitMode: "cover" | "contain";
      audioPolicy: "keep" | "mute";
      title?: string;
    }
  | { kind: "nine_shot_compound" };

/**
 * Expand the persisted plan into playback order. When the insertion point is
 * inside a footage block, that block is split into before/after segments and
 * the compound is placed between them. At a boundary, no zero-length segment
 * is emitted.
 */
export function resolveEpisodeAssemblySegments(
  timeline: EpisodeAssemblyTimeline,
): EpisodeAssemblyResolvedSegment[] {
  const result: EpisodeAssemblyResolvedSegment[] = [];
  const insertAtMs = timeline.insertAtMs;
  let cursorMs = 0;
  let inserted = false;

  const pushCompound = () => {
    if (!inserted) {
      result.push({ kind: "nine_shot_compound" });
      inserted = true;
    }
  };

  for (const block of timeline.footage) {
    const blockDurationMs = block.sourceOutMs - block.sourceInMs;
    const blockStartMs = cursorMs;
    const blockEndMs = cursorMs + blockDurationMs;
    const beforeMs = Math.max(
      0,
      Math.min(blockDurationMs, insertAtMs - blockStartMs),
    );

    if (!inserted && insertAtMs <= blockStartMs) pushCompound();

    if (!inserted && beforeMs > 0 && beforeMs < blockDurationMs) {
      result.push({
        kind: "footage",
        blockId: `${block.blockId}:before`,
        mediaAssetId: block.mediaAssetId,
        sourceInSec: block.sourceInMs / 1000,
        sourceOutSec: (block.sourceInMs + beforeMs) / 1000,
        fitMode: block.fitMode,
        audioPolicy: block.audioPolicy,
        title: block.title,
      });
      pushCompound();
      result.push({
        kind: "footage",
        blockId: `${block.blockId}:after`,
        mediaAssetId: block.mediaAssetId,
        sourceInSec: (block.sourceInMs + beforeMs) / 1000,
        sourceOutSec: block.sourceOutMs / 1000,
        fitMode: block.fitMode,
        audioPolicy: block.audioPolicy,
        title: block.title,
      });
    } else {
      result.push({
        kind: "footage",
        blockId: block.blockId,
        mediaAssetId: block.mediaAssetId,
        sourceInSec: block.sourceInMs / 1000,
        sourceOutSec: block.sourceOutMs / 1000,
        fitMode: block.fitMode,
        audioPolicy: block.audioPolicy,
        title: block.title,
      });
      if (!inserted && insertAtMs === blockEndMs) pushCompound();
    }
    cursorMs = blockEndMs;
  }

  if (!inserted) pushCompound();
  return result;
}
