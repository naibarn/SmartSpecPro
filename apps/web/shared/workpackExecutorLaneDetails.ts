import { z } from "zod";

import { localFolderIngestProgressStageSchema } from "./workerRuntime";

const stringListSchema = z.array(z.string()).default([]);
const nullableStringSchema = z.string().nullable().default(null);
const nullableIntSchema = z.number().int().nonnegative().nullable().default(null);

export const workpackBrowserLaneDetailSchema = z.object({
  lane: z.literal("browser"),
  stage: nullableStringSchema,
  sessionId: nullableStringSchema,
  browserState: nullableStringSchema,
  sourceCount: nullableIntSchema,
  connectorFamilies: stringListSchema,
  fallbackPaths: stringListSchema,
  currentUrl: nullableStringSchema,
  pageTitle: nullableStringSchema,
  publishedArtifacts: stringListSchema,
});

export const workpackWorkflowLaneDetailSchema = z.object({
  lane: z.literal("workflow"),
  stage: nullableStringSchema,
  workflowRunId: nullableStringSchema,
  connectorFamilies: stringListSchema,
  sourceCount: nullableIntSchema,
  fallbackPaths: stringListSchema,
  publishedArtifacts: stringListSchema,
  intent: nullableStringSchema,
  resultSummary: nullableStringSchema,
});

export const workpackDesktopLocalLaneDetailSchema = z.object({
  lane: z.literal("desktop_local"),
  stage: localFolderIngestProgressStageSchema.nullable().default(null),
  rootCount: nullableIntSchema,
  rootLabels: stringListSchema,
  indexedFileCount: nullableIntSchema,
  snippetQuery: nullableStringSchema,
  includePreviewText: z.boolean().nullable().default(null),
  publishedArtifacts: stringListSchema,
});

export const workpackClusterLaneDetailSchema = z.object({
  lane: z.enum(["worker_fabric", "hybrid", "agency"]),
  stage: nullableStringSchema,
  teamId: nullableStringSchema,
  capabilityFamilies: stringListSchema,
  intent: nullableStringSchema,
  sourceCount: nullableIntSchema,
  fallbackPaths: stringListSchema,
  connectorFamilies: stringListSchema,
  publishedArtifacts: stringListSchema,
});

export const workpackGenericLaneDetailSchema = z.object({
  lane: z.literal("generic"),
  stage: nullableStringSchema,
  sourceCount: nullableIntSchema,
  connectorFamilies: stringListSchema,
  capabilityFamilies: stringListSchema,
  publishedArtifacts: stringListSchema,
});

export const workpackExecutorLaneDetailSchema = z.union([
  workpackBrowserLaneDetailSchema,
  workpackWorkflowLaneDetailSchema,
  workpackDesktopLocalLaneDetailSchema,
  workpackClusterLaneDetailSchema,
  workpackGenericLaneDetailSchema,
]);

export type WorkpackExecutorLaneDetail = z.infer<typeof workpackExecutorLaneDetailSchema>;
