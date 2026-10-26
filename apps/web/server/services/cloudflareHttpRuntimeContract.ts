import { z } from "zod";

export const HTTP_RUNTIME_JOB = "cloudflare.production.native.runtime.verify";
export const HTTP_RUNTIME_CONTRACT = "cloudflare-native-runtime-verify-v1";
export const HTTP_RUNTIME_CATEGORY = "cloudflare_production_native_runtime";
export const httpRuntimeJobSchema = z.object({ contractVersion: z.literal(HTTP_RUNTIME_CONTRACT),
  projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(), submissionId: z.string().uuid(),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
