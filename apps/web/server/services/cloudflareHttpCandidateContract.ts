import { z } from "zod";

export const HTTP_CANDIDATE_JOB = "cloudflare.production.native.prepare";
export const HTTP_CANDIDATE_CONTRACT = "cloudflare-production-native-prepare-v1";
export const CANDIDATE_MODULE = "applicationHttpCandidateEntrypoint.js";
export const httpCandidateJobSchema = z.object({ contractVersion: z.literal(HTTP_CANDIDATE_CONTRACT),
  projectId: z.string().min(1).max(36), submissionId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
