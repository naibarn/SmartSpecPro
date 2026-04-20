import { describe, expect, it } from "vitest";
import {
  AgentRuntimeRequestSchema,
  AgentRuntimeStepLinkSchema,
  CURRENT_CHECKPOINT_SCHEMA_VERSION,
  CURRENT_RUNTIME_CONTRACT_VERSION,
  CURRENT_TRACE_SCHEMA_VERSION,
  ReviewVerdictSchema,
  RuntimeTerminalReasonSchema,
} from "../agentRuntime/types";

const baseVersions = {
  runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION,
  traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION,
  checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION,
};

const baseEnvelope = {
  envelopeId: "env-1",
  tenantId: "tenant-1",
  issuedAt: "2026-04-20T00:00:00.000Z",
  expiresAt: "2026-04-20T01:00:00.000Z",
  allowedTools: ["search"],
  allowedSkills: ["planner"],
  allowedAgents: ["planner-agent"],
  sideEffectPolicy: "read_only" as const,
};

const baseModel = {
  providerId: "openrouter",
  modelId: "openai/gpt-4.1-mini",
  gatewayRouteId: "gateway-auto",
  resolvedGatewayModelId: "openai/gpt-4.1-mini",
};

describe("Agent runtime shared DTO schemas", () => {
  it("accepts a valid Chat request fixture with active persona snapshot", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      surface: "chat",
      entryPoint: "chat_turn",
      tenantId: "tenant-1",
      roomId: "room-1",
      requestId: "req-chat-1",
      idempotencyKey: "idem-chat-1",
      objective: "Help summarize this meeting.",
      activePersonaId: "persona-1",
      personaSnapshot: {
        personaId: "persona-1",
        displayLabel: "Buddy",
        nickname: "Buddy",
        provenance: "conversation_override",
        promptSegmentRef: "persona:1",
        guidanceSummary: "Friendly and concise",
      },
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: ["search"],
      allowedSkills: ["planner"],
      allowedAgents: ["planner-agent"],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a valid Team step request fixture with owner/reviewer assignments", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      surface: "team",
      entryPoint: "team_step",
      tenantId: "tenant-1",
      roomId: "room-1",
      runId: "run-1",
      requestId: "req-team-1",
      idempotencyKey: "idem-team-1",
      objective: "Produce the next approved step artifact.",
      stepContext: {
        stepId: "step-id-1",
        stepKey: "research-cultural-angle",
        attemptId: "attempt-1",
      },
      teamMembers: [
        {
          memberId: "member-owner",
          memberKind: "assistant",
          memberRole: "specialist",
          personaId: "persona-owner",
          displayLabel: "Trend Researcher",
          personaDisplayLabel: "Trend Researcher",
          isLead: false,
          preferredLanguage: "th",
          personaGuidanceSummary: "Research-first",
        },
        {
          memberId: "member-reviewer",
          memberKind: "assistant",
          memberRole: "reviewer",
          personaId: "persona-reviewer",
          displayLabel: "Content Director",
          personaDisplayLabel: "Content Director",
          isLead: true,
          preferredLanguage: "th",
          personaGuidanceSummary: "Quality gate",
        },
      ],
      stepAssignment: {
        ownerMemberId: "member-owner",
        ownerPersonaId: "persona-owner",
        ownerDisplayLabel: "Trend Researcher",
        reviewerMemberId: "member-reviewer",
        reviewerPersonaId: "persona-reviewer",
        reviewerDisplayLabel: "Content Director",
      },
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: ["search"],
      allowedSkills: ["research"],
      allowedAgents: ["research-agent"],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a valid Media Studio shared-skill request fixture", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "enhance_prompt",
      tenantId: "tenant-1",
      requestId: "req-skill-1",
      idempotencyKey: "idem-skill-1",
      objective: "Enhance this visual prompt.",
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: [],
      allowedSkills: ["prompt-enhancer"],
      allowedAgents: ["prompt-agent"],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid review verdict status", () => {
    const parsed = ReviewVerdictSchema.safeParse({
      status: "almost_pass",
      issues: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("includes plan_incomplete_cap_reached in terminal reasons", () => {
    expect(RuntimeTerminalReasonSchema.safeParse("plan_incomplete_cap_reached").success).toBe(true);
  });

  it("accepts the current contract version fixture", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      surface: "chat",
      entryPoint: "chat_turn",
      tenantId: "tenant-1",
      requestId: "req-current-1",
      idempotencyKey: "idem-current-1",
      objective: "Answer the prompt.",
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: [],
      allowedSkills: [],
      allowedAgents: [],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts current - 1 contract versions for mixed deploy compatibility", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION - 1,
      traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION - 1,
      checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION - 1,
      surface: "chat",
      entryPoint: "chat_turn",
      tenantId: "tenant-1",
      requestId: "req-prev-1",
      idempotencyKey: "idem-prev-1",
      objective: "Answer the prompt.",
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: [],
      allowedSkills: [],
      allowedAgents: [],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a future unsupported contract version", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION + 1,
      surface: "chat",
      entryPoint: "chat_turn",
      tenantId: "tenant-1",
      requestId: "req-future-1",
      idempotencyKey: "idem-future-1",
      objective: "Answer the prompt.",
      contextEvidenceItems: [],
      candidateSkillManifests: [],
      allowedTools: [],
      allowedSkills: [],
      allowedAgents: [],
      completionPolicy: {},
      reviewPolicy: {},
      retryPolicy: {},
      traceCorrelationIds: {},
      modelConfig: baseModel,
      executionEnvelope: baseEnvelope,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts valid owner_result and review_result step links", () => {
    expect(
      AgentRuntimeStepLinkSchema.safeParse({
        linkType: "owner_result",
        stepKey: "step-1",
        attemptId: "attempt-1",
        traceId: "trace-1",
        checkpointId: null,
        messageId: "message-1",
        anchorId: "anchor-owner",
        label: "Owner result",
        isPrimary: true,
        status: "available",
      }).success
    ).toBe(true);

    expect(
      AgentRuntimeStepLinkSchema.safeParse({
        linkType: "review_result",
        stepKey: "step-1",
        attemptId: "attempt-1",
        traceId: "trace-2",
        checkpointId: null,
        messageId: "message-2",
        anchorId: "anchor-review",
        label: "Review result",
        isPrimary: false,
        status: "available",
      }).success
    ).toBe(true);
  });
});

