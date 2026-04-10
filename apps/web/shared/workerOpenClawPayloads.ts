import { z } from "zod";

import { browserSessionPresentationStateSchema } from "./browserSession";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().trim().min(1).nullable().optional();
const stringListSchema = z.array(nonEmptyStringSchema).default([]);

export const workerPublishedArtifactSummarySchema = z.object({
  artifactId: nonEmptyStringSchema.optional(),
  publishedItemId: z.union([z.number().int().nonnegative(), nonEmptyStringSchema]).optional(),
  label: nonEmptyStringSchema.optional(),
  artifactType: nonEmptyStringSchema.optional(),
  safeServing: nonEmptyStringSchema.optional(),
}).passthrough();

export const workerBrowserSessionMetadataSchema = z.object({
  sessionId: nonEmptyStringSchema,
  state: browserSessionPresentationStateSchema.optional(),
  pageTitle: nullableStringSchema,
  url: nullableStringSchema,
  badgeLabel: nonEmptyStringSchema.optional(),
  statusLine: nonEmptyStringSchema.optional(),
}).passthrough();

const openClawPayloadBaseSchema = z.object({
  stage: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  resultSummary: nonEmptyStringSchema.optional(),
  sourceCount: z.number().int().nonnegative().optional(),
  connectorFamilies: stringListSchema,
  fallbackPaths: stringListSchema,
  publishedArtifacts: z.array(workerPublishedArtifactSummarySchema).default([]),
}).passthrough();

export const openClawBrowserJobPayloadSchema = openClawPayloadBaseSchema.extend({
  sessionId: nonEmptyStringSchema.optional(),
  currentUrl: nonEmptyStringSchema.optional(),
  url: nonEmptyStringSchema.optional(),
  pageUrl: nonEmptyStringSchema.optional(),
  targetUrl: nonEmptyStringSchema.optional(),
  pageTitle: nullableStringSchema,
  title: nullableStringSchema,
  browserState: browserSessionPresentationStateSchema.optional(),
  browserSession: workerBrowserSessionMetadataSchema.optional(),
}).passthrough();

export const openClawWorkflowJobPayloadSchema = openClawPayloadBaseSchema.extend({
  workflowRunId: nonEmptyStringSchema.optional(),
  intent: nonEmptyStringSchema.optional(),
}).passthrough();

export const workerCallbackMetadataSchema = z.object({
  lane: z.enum([
    "browser",
    "workflow",
    "skill",
    "desktop_local",
    "worker_fabric",
    "hybrid",
    "agency",
    "generic",
  ]).optional(),
  workpackId: nonEmptyStringSchema.optional(),
  runId: nonEmptyStringSchema.optional(),
  stepId: nonEmptyStringSchema.optional(),
  teamId: nonEmptyStringSchema.optional(),
  sessionId: nonEmptyStringSchema.optional(),
  workflowRunId: nonEmptyStringSchema.optional(),
  currentUrl: nonEmptyStringSchema.optional(),
  pageTitle: nullableStringSchema,
  connectorFamilies: stringListSchema,
  publishedArtifacts: z.array(workerPublishedArtifactSummarySchema).default([]),
  browserSession: workerBrowserSessionMetadataSchema.optional(),
  browserPayload: openClawBrowserJobPayloadSchema.optional(),
  workflowPayload: openClawWorkflowJobPayloadSchema.optional(),
}).passthrough();

export type WorkerPublishedArtifactSummary = z.infer<typeof workerPublishedArtifactSummarySchema>;
export type WorkerBrowserSessionMetadata = z.infer<typeof workerBrowserSessionMetadataSchema>;
export type OpenClawBrowserJobPayload = z.infer<typeof openClawBrowserJobPayloadSchema>;
export type OpenClawWorkflowJobPayload = z.infer<typeof openClawWorkflowJobPayloadSchema>;
export type WorkerCallbackMetadata = z.infer<typeof workerCallbackMetadataSchema>;
