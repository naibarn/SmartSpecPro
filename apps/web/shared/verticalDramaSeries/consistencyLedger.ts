import { z } from "zod";

export const verticalDramaConsistencyLedgerEntrySchema = z
  .object({
    assetId: z.string().min(1),
    generatedAt: z.string().min(1),
    issues: z.array(z.string().min(1)).default([]),
    verdict: z.enum(["ok", "drift", "revise"]),
  })
  .passthrough();

export const verticalDramaConsistencyLedgerSchema = z
  .object({
    anchorAssetId: z.string().min(1).optional(),
    approvedAgeRange: z.string().min(1).optional(),
    faceIdentityNotes: z.string().min(1).optional(),
    hairIdentityNotes: z.string().min(1).optional(),
    wardrobeBase: z.string().min(1).optional(),
    colorPalette: z.string().min(1).optional(),
    signatureCues: z.array(z.string().min(1)).optional(),
    allowedVariations: z.array(z.string().min(1)).optional(),
    forbiddenDrift: z.array(z.string().min(1)).optional(),
    entries: z.array(verticalDramaConsistencyLedgerEntrySchema).default([]),
  })
  .passthrough();

export type VerticalDramaConsistencyLedgerEntry = z.infer<
  typeof verticalDramaConsistencyLedgerEntrySchema
>;
export type VerticalDramaConsistencyLedger = z.infer<
  typeof verticalDramaConsistencyLedgerSchema
>;

export function emptyVerticalDramaConsistencyLedger(): VerticalDramaConsistencyLedger {
  return { entries: [] };
}

