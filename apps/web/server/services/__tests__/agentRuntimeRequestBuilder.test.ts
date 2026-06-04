import { describe, expect, it, vi } from "vitest";

import type { ContextPack } from "../../../shared/contextEngine";
import {
  extractCandidateEvidenceRefsFromRuntimeResponse,
  buildAgentRuntimeRequest,
} from "../agentRuntime/requestBuilder";
import { verifyAgentRuntimeResponseForRequest } from "../agentRuntime/client";

function makeContextPack(): ContextPack {
  return {
    surface: "chat",
    query: "Summarize the plan",
    intent: "planning",
    budgetProfile: "balanced",
    budget: {
      total: 3000,
      system: 400,
      sessionState: 300,
      activeNote: 300,
      recentNotes: 300,
      projectState: 300,
      durableMemory: 300,
      retrieval: 600,
      tools: 200,
      answerReserve: 300,
    },
    messages: [
      {
        role: "system",
        content: "You are the planner.",
      },
    ],
    slots: [
      {
        id: "slot-1",
        kind: "retrieved_evidence",
        role: "system",
        title: "Source note",
        content: "Songkran sources",
        tokenEstimate: 120,
        source: "hybrid",
        trust: "untrusted",
        freshness: "recent",
        refs: ["doc://source-1"],
        provenance: {
          ownerScope: {
            type: "room",
            id: "room-1",
            tenantId: "tenant-1",
          },
          sourceRef: "doc://source-1",
          source: "hybrid",
          trust: "untrusted",
          freshness: "recent",
          includedReason: "Selected for planning",
        },
      },
    ],
    estimatedTokens: 120,
    retrievalModes: ["hybrid"],
    includedSources: ["doc://source-1"],
    excludedSources: [],
    compaction: {
      dedupedMessages: 1,
      injectedMessages: 1,
      tokenHeadroom: 400,
    },
    notes: ["context ready"],
  };
}

function makeInput() {
  return {
    surface: "chat" as const,
    entryPoint: "chat_turn" as const,
    tenantId: "tenant-1",
    roomId: "room-1",
    requestId: "req-builder-1",
    idempotencyKey: "idem-builder-1",
    objective: "Produce the next approved deliverable.",
    contextPackRequest: {
      surface: "chat" as const,
      request: {
        tenantId: "tenant-1",
        messages: [
          {
            role: "user",
            content: "Create the plan.",
          },
        ],
      } as any,
    },
    modelConfig: {
      providerId: "openrouter",
      modelId: "openai/gpt-4.1-mini",
      gatewayRouteId: "gateway-auto",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
    },
    executionEnvelope: {
      envelopeId: "env-builder-1",
      tenantId: "tenant-1",
      issuedAt: "2026-04-20T00:00:00.000Z",
      expiresAt: "2026-04-20T01:00:00.000Z",
      allowedTools: ["search"],
      allowedSkills: ["brainstorm"],
      allowedAgents: ["Planner"],
      sideEffectPolicy: "read_only" as const,
    },
    allowedTools: ["search"],
    allowedSkills: ["brainstorm"],
    allowedAgents: ["Planner"],
  };
}

describe("buildAgentRuntimeRequest", () => {
  it("calls the shared context-pack builder", async () => {
    const buildContextPack = vi.fn().mockResolvedValue({
      contextPack: makeContextPack(),
      contextPackRef: "context-pack:chat:req-builder-1",
    });

    await buildAgentRuntimeRequest(makeInput(), {
      buildContextPack,
      loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      }),
    });

    expect(buildContextPack).toHaveBeenCalledTimes(1);
  });

  it("carries the context pack ref and slot metadata into the runtime request", async () => {
    const request = await buildAgentRuntimeRequest(makeInput(), {
      buildContextPack: vi.fn().mockResolvedValue({
        contextPack: makeContextPack(),
        contextPackRef: "context-pack:chat:req-builder-1",
      }),
      loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      }),
    });

    expect(request.structuredContextPackRef).toBe(
      "context-pack:chat:req-builder-1"
    );
    expect(request.contextEvidenceItems[0]).toMatchObject({
      artifactId: "context-slot:slot-1",
      contextPackSlot: "slot-1",
      sourceRef: "doc://source-1",
      tokenEstimate: 120,
      trustLevel: "retrieved_untrusted",
    });
  });

  it("carries the active persona snapshot for persona-bound chat turns", async () => {
    const request = await buildAgentRuntimeRequest(
      {
        ...makeInput(),
        activePersonaId: "persona-1",
        personaSnapshot: {
          personaId: "persona-1",
          displayLabel: "Buddy",
          nickname: "Buddy",
          provenance: "conversation_override",
          promptSegmentRef: "persona:1",
          guidanceSummary: "Friendly and concise",
        },
      },
      {
        buildContextPack: vi.fn().mockResolvedValue(makeContextPack()),
        loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      }
    );

    expect(request.activePersonaId).toBe("persona-1");
    expect(request.personaSnapshot?.displayLabel).toBe("Buddy");
  });

  it("carries roster snapshots plus owner and reviewer assignments for team steps", async () => {
    const request = await buildAgentRuntimeRequest(
      {
        ...makeInput(),
        surface: "team",
        entryPoint: "team_step",
        contextPackRequest: {
          ...makeInput().contextPackRequest,
          surface: "team_room",
        },
        teamMembers: [
          {
            memberId: "member-owner",
            memberKind: "assistant",
            memberRole: "researcher",
            personaId: "persona-owner",
            displayLabel: "Trend Researcher",
            personaDisplayLabel: "Trend Researcher",
            isLead: false,
            preferredLanguage: "th",
            personaGuidanceSummary: "Research first",
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
      },
      {
        buildContextPack: vi.fn().mockResolvedValue({
          contextPack: {
            ...makeContextPack(),
            surface: "team_room",
          },
          contextPackRef: "context-pack:team:req-builder-1",
        }),
        loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      }
    );

    expect(request.teamMembers).toHaveLength(2);
    expect(request.stepAssignment).toMatchObject({
      ownerMemberId: "member-owner",
      reviewerMemberId: "member-reviewer",
    });
  });

  it("does not include direct memory-store credentials or persona query instructions", async () => {
    const request = await buildAgentRuntimeRequest(
      {
        ...makeInput(),
        planContext: {
          memoryStoreCredentials: {
            apiKey: "secret",
          },
          personaQueryInstruction:
            "Query the persona table directly to resolve the active profile.",
          safeField: "keep me",
        },
      },
      {
        buildContextPack: vi.fn().mockResolvedValue(makeContextPack()),
        loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      }
    );

    const rendered = JSON.stringify(request);
    expect(rendered).not.toContain("memoryStoreCredentials");
    expect(rendered).not.toContain("personaQueryInstruction");
    expect(request.planContext).toMatchObject({
      safeField: "keep me",
    });
  });

  it("converts SDK output into candidate evidence refs instead of direct memory writes", () => {
    const refs = extractCandidateEvidenceRefsFromRuntimeResponse({
      evidenceRefs: ["artifact://ref-1"],
      artifacts: [
        {
          contentRef: "artifact://ref-2",
        },
        {
          contentRef: "artifact://ref-1",
        },
      ],
    });

    expect(refs).toEqual(["artifact://ref-1", "artifact://ref-2"]);
  });

  it("delegates promotion and pruning lifecycle to the context engine", async () => {
    const request = await buildAgentRuntimeRequest(makeInput(), {
      buildContextPack: vi.fn().mockResolvedValue(makeContextPack()),
      loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
        candidates: [],
        diagnostics: [],
      }),
    });

    expect(request.planContext?.memoryLifecycle).toMatchObject({
      authority: "context_engine",
      directAdapterReadsAllowed: false,
      directAdapterWritesAllowed: false,
      promotionDelegated: true,
      pruningDelegated: true,
    });
  });

  it("fails closed when context pack construction fails", async () => {
    const buildContextPack = vi
      .fn()
      .mockRejectedValue(new Error("context engine unavailable"));

    await expect(
      buildAgentRuntimeRequest(makeInput(), {
        buildContextPack,
      })
    ).rejects.toThrow("context engine unavailable");
  });

  it("carries Media Studio origin surface and entry point for shared skill execution", async () => {
    const request = await buildAgentRuntimeRequest(
      {
        ...makeInput(),
        surface: "skill",
        originSurface: "media_studio",
        entryPoint: "enhance_prompt",
      },
      {
        buildContextPack: vi.fn().mockResolvedValue(makeContextPack()),
        loadSkillCapabilityManifests: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      }
    );

    expect(request.surface).toBe("skill");
    expect(request.originSurface).toBe("media_studio");
    expect(request.entryPoint).toBe("enhance_prompt");
  });

  it("rejects generic media production selected agent and mismatched response identity", () => {
    const request = {
      requestId: "req-media-production-1",
      surface: "media_production" as const,
      allowedSkills: ["marketplace-production-director"],
      allowedTools: [],
      allowedAgents: ["Production Director"],
      stepContext: {
        stepId: "concept_story:run-1",
        stepKey: "concept_story",
        attemptId: "attempt-1",
      },
      gatewayInvocationMetadata: {
        tenantId: "tenant-1",
        userId: "user-1",
        surface: "media_production" as const,
        originSurface: "marketplace_capture" as const,
        productionProjectId: "production-run-1",
        productionRunId: "production-run-1",
        agentRunId: "run-1",
        agentName: "Production Director",
        agentRole: "Production Director",
        stageKey: "concept_story",
        stepId: "concept_story:run-1",
        attemptId: "attempt-1",
        modelPolicyId: "gateway-auto",
        selectedModelId: "openai/gpt-4.1-mini",
        creditCategory: "llm_planning" as const,
        idempotencyKey: "idem-media-production-1",
        creditReservationRef: "credit:reservation-1",
        creditLedgerRef: "credit-ledger:reservation-1",
        creditPayerRef: "tenant:tenant-1:user:user-1",
        preflightSnapshotRef: "preflight:run-1",
        creditAuditRef: "credit-audit:run-1",
      },
      productionAgentsSdkCapabilityManifest: {
        schemaVersion: "1.0" as const,
        tenantId: "tenant-1",
        userId: "user-1",
        runId: "run-1",
        stageKey: "concept_story",
        attemptId: "attempt-1",
        manifestHash: "manifest-hash-1",
        allowedAgents: ["Production Director"],
        allowedHandoffs: [],
        allowedTools: [],
        hostedSdkCapabilities: {
          webSearch: false,
          fileSearch: false,
          computerUse: false,
          codeInterpreter: false,
          imageGeneration: false,
          audioGeneration: false,
          videoGeneration: false,
          remoteMcp: false,
          shell: false,
        },
        outputSchemas: [],
        sessionPolicy: {
          persistRawSdkSession: false,
          checkpointRefsOnly: true,
          resumeCursorRef: null,
          maxSessionEventBytes: 2048,
        },
        tracePolicy: {
          captureSensitiveInputOutput: false,
          externalSdkTraceExport: "disabled" as const,
          redactionProfileId: "media-production-safe",
          maxTraceEventBytes: 2048,
          platformTraceEventRefs: [],
        },
        streamPolicy: {
          normalizeEvents: true,
          stableEventIds: true,
          duplicateEventBehavior: "idempotent_noop" as const,
        },
        approvedByNodeAt: "2026-04-20T00:00:00.000Z",
      },
    };
    const response = {
      status: "completed" as const,
      selectedAgentName: "Production Director",
      selectedSkillSlug: "marketplace-production-director",
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      gatewayRouteId: "gateway-auto",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
      finalOutput: { ok: true },
      artifacts: [],
      toolCallsMade: [],
      handoffsExecuted: [],
      evidenceRefs: [],
      events: [],
      traceMetadata: {
        manifestHash: "manifest-hash-1",
        stageKey: "concept_story",
        attemptId: "attempt-1",
      },
      adapterVersion: "0.1.0",
      sdkVersion: "0.14.2",
      checkpoint: null,
      terminalReason: null,
      stepId: "concept_story:run-1",
      attemptId: "attempt-1",
      checkpointMetadata: null,
      eventSequenceMetadata: {
        manifestHash: "manifest-hash-1",
        stageKey: "concept_story",
        attemptId: "attempt-1",
      },
      stepLinks: [],
    };

    expect(verifyAgentRuntimeResponseForRequest(request, response)).toBe(
      response
    );
    expect(() =>
      verifyAgentRuntimeResponseForRequest(request, {
        ...response,
        selectedAgentName: "SmartSpecPro Runtime Agent",
      })
    ).toThrow("outside the execution envelope");
    expect(() =>
      verifyAgentRuntimeResponseForRequest(request, {
        ...response,
        traceMetadata: {
          ...response.traceMetadata,
          manifestHash: "different-manifest",
        },
      })
    ).toThrow("does not match the media production manifest authority");
  });
});
