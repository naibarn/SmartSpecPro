import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { agencyBridge } from "./agencyBridge";
import { buildAutoTeamBudgetKey, assessAutoTeamBudget } from "./autoTeamBudgetService";
import { autoTeamExecutionStages, type AutoTeamExecutionStageRow, type AutoTeamRouteDecisionRow } from "../../drizzle/schema";

export interface AutoTeamAgencyExecutionInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  stageId?: string | null;
  workItemId?: string | null;
  routeDecisionId?: string | null;
  routeDecision: Pick<AutoTeamRouteDecisionRow, "routeClass" | "language" | "id">;
  objective: string;
  language?: "en" | "th" | null;
  selectedAgencyTemplateId?: string | null;
  attempt?: number;
  userToken: string;
}

export interface AutoTeamAgencyExecutionResult {
  runId: string;
  response: string;
  creditsUsed: number;
  budgetKey: string;
  taskMetadata: Record<string, unknown> | null;
}

function now(): Date {
  return new Date();
}

export function buildAgencyIdempotencyKey(input: AutoTeamAgencyExecutionInput): string {
  return crypto
    .createHash("sha256")
    .update([input.tenantId, input.runId, input.stageId ?? "", input.objective, input.selectedAgencyTemplateId ?? "", String(input.attempt ?? 1)].join("|"))
    .digest("hex");
}

export function sanitizeAgencyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "Unknown agency error")).replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function assertBudgetAllowsAgencyRun(
  input: AutoTeamAgencyExecutionInput,
): Promise<{ allowed: boolean; budgetKey: string; creditsNeeded: number; blockedReason: string | null }> {
  const decision = assessAutoTeamBudget({
    tenantId: input.tenantId,
    runId: input.runId,
    stageId: input.stageId ?? null,
    routeClass: "agency.swarm",
    stageType: "agency_delegate",
    objective: input.objective,
    requestedProvider: "agency",
    requestedModel: input.selectedAgencyTemplateId ?? null,
    attempt: input.attempt ?? 1,
  });
  return {
    allowed: decision.allowed,
    budgetKey: decision.budgetKey ?? buildAutoTeamBudgetKey({
      tenantId: input.tenantId,
      runId: input.runId,
      stageId: input.stageId ?? null,
      routeClass: "agency.swarm",
      stageType: "agency_delegate",
      objective: input.objective,
      requestedModel: input.selectedAgencyTemplateId ?? null,
      requestedProvider: "agency",
      attempt: input.attempt ?? 1,
    }),
    creditsNeeded: decision.creditsNeeded,
    blockedReason: decision.blockedReason,
  };
}

export async function executeAgencyStage(
  input: AutoTeamAgencyExecutionInput,
): Promise<AutoTeamAgencyExecutionResult> {
  const budget = await assertBudgetAllowsAgencyRun(input);
  if (!budget.allowed) {
    throw new Error(budget.blockedReason ?? "budget_exceeded");
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const team = await agencyBridge.executeRun({
    agencyId: input.selectedAgencyTemplateId ?? "default",
    conversationId: `${input.runId}:${input.roomId ?? "room"}`,
    message: input.objective,
    userToken: input.userToken,
    tenantId: input.tenantId,
    userId: 0,
    additionalInstructions: input.language ? `Room language: ${input.language}` : undefined,
  });

  const [stage] = await db
    .update(autoTeamExecutionStages)
    .set({
      status: team.status === "completed" ? "completed" : "in_progress",
      selectedProvider: "agency",
      selectedSkillId: input.selectedAgencyTemplateId ?? null,
      metadataJson: {
        agencyRunId: team.runId,
        agencyConversationId: team.conversationId ?? null,
        agencyStatus: team.status,
        agencyResponse: team.response,
        taskMetadata: team.structuredResult as unknown as Record<string, unknown> | null,
        budgetKey: budget.budgetKey,
      },
      updatedAt: now(),
    })
    .where(and(eq(autoTeamExecutionStages.runId, input.runId), eq(autoTeamExecutionStages.id, input.stageId ?? "")))
    .returning();

  return {
    runId: team.runId,
    response: team.response,
    creditsUsed: team.creditsUsed,
    budgetKey: budget.budgetKey,
    taskMetadata: team.structuredResult as unknown as Record<string, unknown> | null,
  };
}

export async function startAgencyRun(
  input: AutoTeamAgencyExecutionInput,
): Promise<AutoTeamAgencyExecutionResult> {
  return executeAgencyStage(input);
}

export async function pollAgencyRun(
  input: AutoTeamAgencyExecutionInput,
): Promise<AutoTeamAgencyExecutionResult> {
  return executeAgencyStage(input);
}

export async function attachAgencyArtifacts(
  _input: AutoTeamAgencyExecutionInput,
): Promise<AutoTeamExecutionStageRow | null> {
  return null;
}
