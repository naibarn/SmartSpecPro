import { describe, expect, it } from "vitest";
import {
  AgentRuntimeEventSchema,
  AgentRuntimeRequestSchema,
  AgentRuntimeResponseSchema,
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

  it("rejects a request when execution envelope tenant does not match", () => {
    const parsed = AgentRuntimeRequestSchema.safeParse({
      ...baseVersions,
      surface: "chat",
      entryPoint: "chat_turn",
      tenantId: "tenant-1",
      requestId: "req-envelope-mismatch",
      idempotencyKey: "idem-envelope-mismatch",
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
      executionEnvelope: {
        ...baseEnvelope,
        tenantId: "tenant-2",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a runtime event fixture that matches the Python adapter contract", () => {
    const parsed = AgentRuntimeEventSchema.safeParse({
      ...baseVersions,
      eventId: "evt-1",
      eventName: "response.output_text.delta",
      surface: "chat",
      requestId: "req-chat-1",
      idempotencyKey: "idem-chat-1",
      sequence: 1,
      sourceComponent: "openai_agents_adapter",
      traceId: "trace-1",
      stepId: null,
      stepKey: null,
      attemptId: null,
      sdkVersion: "0.14.2",
      adapterVersion: "0.1.0",
      redactedPayload: {
        delta: "hello",
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a runtime response fixture that includes status, events, and checkpoint metadata", () => {
    const parsed = AgentRuntimeResponseSchema.safeParse({
      ...baseVersions,
      status: "paused",
      selectedAgentName: "Planner",
      selectedSkillSlug: "brainstorm",
      providerId: "openrouter",
      modelId: "openai/gpt-4.1-mini",
      gatewayRouteId: "gateway-auto",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
      finalOutput: {
        summary: "Need approval before continuing.",
      },
      artifacts: [
        {
          artifactId: "artifact-1",
          artifactType: "plan_draft",
          contentRef: "artifact://plan/1",
          metadata: {
            origin: "chat",
          },
        },
      ],
      actingPersona: null,
      stepAssignment: null,
      toolCallsMade: ["search"],
      handoffsExecuted: [],
      reviewVerdict: {
        status: "needs_repair",
        issues: ["Need a clearer reviewer gate."],
      },
      repairInstructions: ["Clarify the quality gate before execution."],
      evidenceRefs: ["artifact://plan/1"],
      events: [
        {
          ...baseVersions,
          eventId: "evt-1",
          eventName: "response.output_text.done",
          surface: "team",
          requestId: "req-team-1",
          idempotencyKey: "idem-team-1",
          sequence: 0,
          sourceComponent: "openai_agents_adapter",
          traceId: "trace-team-1",
          stepId: "step-id-1",
          stepKey: "research-cultural-angle",
          attemptId: "attempt-1",
          sdkVersion: "0.14.2",
          adapterVersion: "0.1.0",
          redactedPayload: {
            outputText: "Draft ready",
          },
        },
      ],
      traceId: "trace-team-1",
      traceMetadata: {
        groupId: "run-1",
      },
      adapterVersion: "0.1.0",
      sdkVersion: "0.14.2",
      checkpoint: {
        ...baseVersions,
        checkpointId: "checkpoint-1",
        surface: "team",
        requestId: "req-team-1",
        tenantId: "tenant-1",
        resumeCursor: "cursor-1",
        status: "pending",
        checkpointPayload: {
          state: "waiting_for_review",
        },
      },
      terminalReason: "approval_required",
      nextAction: "Await human approval",
      stepId: "step-id-1",
      attemptId: "attempt-1",
      checkpointMetadata: {
        checkpointRef: "checkpoint-1",
      },
      eventSequenceMetadata: {
        latest: 1,
      },
      stepLinks: [
        {
          linkType: "checkpoint",
          stepKey: "research-cultural-angle",
          attemptId: "attempt-1",
          traceId: "trace-team-1",
          checkpointId: "checkpoint-1",
          messageId: "message-1",
          anchorId: "checkpoint-anchor",
          label: "Checkpoint",
          isPrimary: true,
          status: "available",
        },
      ],
    });

    expect(parsed.success).toBe(true);
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
