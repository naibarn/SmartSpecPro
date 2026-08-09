import { z } from "zod";

export const verticalDramaEpisodePreviewSlotIds = [1, 2, 3, 4] as const;
export type VerticalDramaEpisodePreviewSlotId =
  (typeof verticalDramaEpisodePreviewSlotIds)[number];

export const verticalDramaEpisodePreviewSlotIdSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const verticalDramaEpisodePreviewSelectedShotsSchema = z
  .array(z.number().int().min(1).max(9))
  .length(2)
  .refine(values => new Set(values).size === 2, {
    message: "Select exactly two different shots",
  });

export const verticalDramaEpisodePreviewStateSchema = z.object({
  slotId: verticalDramaEpisodePreviewSlotIdSchema,
  selectedShotNumbers: verticalDramaEpisodePreviewSelectedShotsSchema,
  status: z.enum(["pending", "completed", "failed"]),
  pendingJobId: z.string().trim().min(1).optional(),
  videoUrl: z.string().trim().min(1).optional(),
  durationSeconds: z.number().positive().optional(),
  createdAt: z.string().trim().min(1).optional(),
  completedAt: z.string().trim().min(1).optional(),
  error: z.string().trim().max(2_000).optional(),
});

export const verticalDramaEpisodePreviewsSchema = z
  .array(verticalDramaEpisodePreviewStateSchema)
  .max(4);

export type VerticalDramaEpisodePreviewState = z.infer<
  typeof verticalDramaEpisodePreviewStateSchema
>;

export function isVerticalDramaEpisodePreviewSlotId(
  value: unknown
): value is VerticalDramaEpisodePreviewSlotId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    verticalDramaEpisodePreviewSlotIds.includes(
      value as VerticalDramaEpisodePreviewSlotId
    )
  );
}

export function readVerticalDramaEpisodePreviews(
  value: unknown
): VerticalDramaEpisodePreviewState[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => verticalDramaEpisodePreviewStateSchema.safeParse(item))
    .filter(
      (
        result
      ): result is { success: true; data: VerticalDramaEpisodePreviewState } =>
        result.success
    )
    .map(result => result.data)
    .sort((a, b) => a.slotId - b.slotId);
}

export function upsertVerticalDramaEpisodePreview(
  current: readonly VerticalDramaEpisodePreviewState[],
  next: VerticalDramaEpisodePreviewState
): VerticalDramaEpisodePreviewState[] {
  return [...current.filter(item => item.slotId !== next.slotId), next].sort(
    (a, b) => a.slotId - b.slotId
  );
}
