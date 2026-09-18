import { z } from "zod";

export const runnerReleaseBuildRequestSchema = z.object({
  version: z.string().trim().min(1).max(64).regex(/^[0-9A-Za-z._-]+$/),
  ref: z.string().trim().min(1).max(256).default("main"),
  platform: z.enum(["all", "windows", "macos-intel", "macos-arm64", "linux"]),
  profile: z.enum(["local_device", "shared_container", "all"]),
  releaseId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  releaseNotes: z.string().max(20_000).default(""),
  publish: z.boolean().default(true),
  signingMode: z.enum(["unsigned-review", "required-secret"]).default("required-secret"),
}).superRefine((value, context) => {
  if (value.publish && value.signingMode !== "required-secret") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signingMode"],
      message: "runner_release_publish_requires_signing",
    });
  }
});

export type RunnerReleaseBuildRequest = z.infer<typeof runnerReleaseBuildRequestSchema>;

export const runnerReleaseBuildStatusSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  releaseId: z.string().min(1),
  repository: z.string().min(1),
  workflow: z.string().min(1),
  ref: z.string().min(1),
  publish: z.boolean(),
  status: z.string().min(1),
  syncStatus: z.string().min(1),
  workflowRunId: z.string().nullable(),
  workflowRunUrl: z.string().url().nullable(),
  syncError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RunnerReleaseBuildStatus = z.infer<typeof runnerReleaseBuildStatusSchema>;
