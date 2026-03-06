/**
 * Shared TypeScript types for the Automation Copilot feature.
 * Used by both tRPC router and React frontend.
 */

import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────────

export const automationIntentTypeSchema = z.enum([
  "browser_rpa",
  "workflow",
  "agency",
  "hybrid",
]);

export const automationStatusSchema = z.enum([
  "queued",
  "analyzing",
  "ready",
  "executing",
  "success",
  "failed",
  "cancelled",
]);

export const analyzeInputSchema = z.object({
  prompt: z.string().min(1).max(10000),
});

export const getStatusInputSchema = z.object({
  taskId: z.string().min(1).max(200),
});

export const executeInputSchema = z.object({
  taskId: z.string().min(1).max(200),
  executionId: z.string().min(1).max(200),
  intentJson: z.string().min(1),
});

export const cancelInputSchema = z.object({
  taskId: z.string().min(1).max(200),
});

// ── TypeScript Types ────────────────────────────────────────

export type AutomationIntentType = z.infer<typeof automationIntentTypeSchema>;
export type AutomationStatus = z.infer<typeof automationStatusSchema>;

export interface AutomationStatusResponse {
  status: AutomationStatus;
  tenant_id?: string;
  user_id?: number;
  actual_credits_used?: number;
  intent?: Record<string, unknown>;
  error_message?: string;
  steps_completed?: number;
  steps_total?: number;
}
