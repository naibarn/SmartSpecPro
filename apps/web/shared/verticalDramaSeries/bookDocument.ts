import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const text = z.string().max(40_000);
const sourceRef = z.object({
  episodeId: z.number().int().positive(),
  episodeRevisionId: z.number().int().positive().nullable().default(null),
  locator: z.string().trim().min(1).max(240),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const verticalDramaBookImageDensitySchema = z.enum([
  "none", "chapter_openers", "occasional", "all_shots",
]);
export type VerticalDramaBookImageDensity = z.infer<typeof verticalDramaBookImageDensitySchema>;

const baseBlock = z.object({
  id,
  sourceRefs: z.array(sourceRef).max(64).default([]),
});

export const verticalDramaBookBlockSchema = z.discriminatedUnion("type", [
  baseBlock.extend({ type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text }),
  baseBlock.extend({ type: z.literal("paragraph"), text }),
  baseBlock.extend({ type: z.literal("dialogue"), speaker: z.string().max(500).nullable(), text }),
  baseBlock.extend({ type: z.literal("scene_break") }),
  baseBlock.extend({
    type: z.literal("illustration"),
    mediaAssetId: z.number().int().positive(),
    mediaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    placement: z.enum(["inline", "chapter_opener"]),
    altText: z.string().max(2000),
    caption: z.string().max(2000).nullable().default(null),
    decorative: z.boolean().default(false),
  }),
  baseBlock.extend({ type: z.literal("caption"), text }),
  baseBlock.extend({ type: z.literal("quote"), text }),
]);
export type VerticalDramaBookBlock = z.infer<typeof verticalDramaBookBlockSchema>;

export const verticalDramaBookDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: z.object({
    title: z.string().trim().min(1).max(255),
    subtitle: z.string().max(255).nullable().default(null),
    author: z.string().trim().min(1).max(255),
    language: z.string().trim().min(2).max(35),
    description: z.string().max(5000).nullable().default(null),
    copyrightText: z.string().max(3000).nullable().default(null),
    coverMediaAssetId: z.number().int().positive().nullable().default(null),
    coverChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
    coverAltText: z.string().max(2000).nullable().default(null),
  }).strict(),
  source: z.object({
    seriesId: z.number().int().positive(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    episodeIds: z.array(z.number().int().positive()).min(1).max(500),
  }).strict(),
  chapters: z.array(z.object({
    id,
    title: z.string().trim().min(1).max(255),
    sourceEpisodeIds: z.array(z.number().int().positive()).min(1).max(100),
    blocks: z.array(verticalDramaBookBlockSchema).max(20_000),
  }).strict()).min(1).max(500),
}).strict().superRefine((document, ctx) => {
  if (Boolean(document.metadata.coverMediaAssetId) !== Boolean(document.metadata.coverChecksum)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "coverChecksum"], message: "Cover asset and checksum must be selected together" });
  }
  if (document.metadata.coverMediaAssetId && !document.metadata.coverAltText?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "coverAltText"], message: "Informative book covers require alternative text" });
  }
  const chapterIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const [chapterIndex, chapter] of document.chapters.entries()) {
    if (chapterIds.has(chapter.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chapters", chapterIndex, "id"], message: "Duplicate chapter ID" });
    chapterIds.add(chapter.id);
    for (const [blockIndex, block] of chapter.blocks.entries()) {
      if (blockIds.has(block.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chapters", chapterIndex, "blocks", blockIndex, "id"], message: "Duplicate block ID" });
      blockIds.add(block.id);
      if (block.type === "illustration" && !block.decorative && !block.altText.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chapters", chapterIndex, "blocks", blockIndex, "altText"], message: "Informative illustrations require alternative text" });
      }
    }
  }
});
export type VerticalDramaBookDocument = z.infer<typeof verticalDramaBookDocumentSchema>;

export const verticalDramaBookSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  seriesId: z.number().int().positive(),
  seriesFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  seriesPayload: z.record(z.string(), z.unknown()),
  capturedAt: z.string().datetime(),
  episodes: z.array(z.object({
    episodeId: z.number().int().positive(),
    episodeRevisionId: z.number().int().positive().nullable(),
    revisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    payload: z.record(z.string(), z.unknown()),
    shots: z.array(z.object({
      shotNumber: z.number().int().positive(),
      mediaAssetId: z.number().int().positive().nullable(),
      mediaChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      locator: z.string().trim().min(1).max(240),
    }).strict()).max(200),
  }).strict()).min(1).max(500),
  assets: z.array(z.object({
    mediaAssetId: z.number().int().positive(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    purpose: z.enum(["cover", "shot"]),
  }).strict()).max(10_000),
}).strict();
export type VerticalDramaBookSourceSnapshot = z.infer<typeof verticalDramaBookSourceSnapshotSchema>;
