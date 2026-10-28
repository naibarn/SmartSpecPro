import { z } from "zod";
import { m3ParityOperationSchema } from "./cloudflareM3ParityContract";

export const M3_PARITY_JOB = "cloudflare.production.m3.parity.acceptance";
export const M3_PARITY_CONTRACT = "cloudflare-m3-parity-acceptance-v1";
export const M3_PARITY_CATEGORY = "cloudflare_production_m3_parity";
export const m3ParityJobInputSchema = z
  .object({
    contractVersion: z.literal(M3_PARITY_CONTRACT),
    tenantId: z.string().min(1).max(36),
    projectId: z.string().min(1).max(36),
    candidateJobId: z.string().uuid(),
    operation: m3ParityOperationSchema,
    submissionId: z.string().uuid(),
    mandateGrantRef: z.string().uuid().optional(),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
