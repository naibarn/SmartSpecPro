import { describe, expect, it, vi } from "vitest";

import {
  CURRENT_CHECKPOINT_SCHEMA_VERSION,
  CURRENT_RUNTIME_CONTRACT_VERSION,
  CURRENT_TRACE_SCHEMA_VERSION,
  type AgentCapabilityManifest,
  type AgentRuntimeResponse,
} from "../../../shared/agentRuntime/types";
import {
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
  SharedSkillRuntimeError,
  type SharedSkillRuntimeTextResult,
} from "../agentRuntime/skillRuntimeOrchestrator";

function makeContextPack() {
  return {
    surface: "chat" as const,
    query: "Enhance the current media prompt",
    intent: "prompting",
    budgetProfile: "balanced" as const,
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
        role: "system" as const,
        content: "Keep the prompt grounded and production-ready.",
      },
    ],
    slots: [
      {
        id: "slot-1",
        kind: "retrieved_evidence" as const,
        role: "system" as const,
        title: "Songkran brief",
        content: "Research evidence for the current prompt run.",
        tokenEstimate: 120,
        source: "hybrid",
        trust: "untrusted" as const,
        freshness: "recent" as const,
        refs: ["doc://songkran-brief"],
        provenance: {
          ownerScope: {
            type: "room" as const,
            id: "room-1",
            tenantId: "tenant-1",
          },
          sourceRef: "doc://songkran-brief",
          source: "hybrid",
          trust: "untrusted" as const,
          freshness: "recent" as const,
          includedReason: "Prompt refinement needs the current brief.",
        },
      },
    ],
    estimatedTokens: 120,
    retrievalModes: ["hybrid"],
    includedSources: ["doc://songkran-brief"],
    excludedSources: [],
    compaction: {
      dedupedMessages: 1,
      injectedMessages: 1,
      tokenHeadroom: 400,
    },
    notes: ["context ready"],
  };
}

function makeAgentManifest(
  overrides: Partial<AgentCapabilityManifest> = {},
): AgentCapabilityManifest {
  return {
    slug: "create-image-prompt",
    manifestSchemaVersion: 1,
    name: "Create Image Prompt",
    purpose: "Refine prompt text for Media Studio prompt workflows.",
    supportedSurfaces: ["skill"],
    supportedOriginSurfaces: ["media_studio"],
    supportedEntryPoints: ["enhance_prompt", "execute_custom_skill"],
    taskTypes: ["prompt_refinement"],
    requiredContext: ["objective_brief"],
    preferredContext: ["retrieved_sources"],
    supportedArtifactTypes: ["prompt_text"],
    requiredEvidenceKinds: ["objective"],
    reviewChecklist: ["Prompt remains grounded."],
    failureModes: ["generic_prompt"],
    doNotUseWhen: ["direct_media_submit"],
    ...overrides,
  };
}

function makeActivationGate(allowed: boolean) {
  return {
    allowed,
    candidates: allowed
      ? [
          {
            skillSlug: "create-image-prompt",
            skillName: "Create Image Prompt",
            manifest: {} as any,
            agentManifest: makeAgentManifest(),
            skillDefinition: {} as any,
          },
        ]
      : [],
    diagnostics: allowed
      ? []
      : [
          {
            code: "manifest_missing" as const,
            severity: "error" as const,
            skillSlug: "create-image-prompt",
            message:
              "No manifest-backed skill candidates were available for shared skill runtime.",
          },
        ],
  };
}

function makeRuntimeResponse(
  overrides: Partial<AgentRuntimeResponse> = {},
): AgentRuntimeResponse {
  return {
    runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION,
    traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION,
    checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION,
    status: "completed",
    selectedAgentName: "Prompt Refiner",
    selectedSkillSlug: "create-image-prompt",
    providerId: "1",
    modelId: "openai/gpt-4.1-mini",
    gatewayRouteId: "chat-completions",
    resolvedGatewayModelId: "openai/gpt-4.1-mini",
    finalOutput: {
      rawContent: "Runtime-enhanced prompt",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
      },
      creditsUsed: 2,
      providerName: "openrouter",
      modelId: "openai/gpt-4.1-mini",
    },
    artifacts: [],
    toolCallsMade: [],
    handoffsExecuted: [],
    reviewVerdict: {
      status: "pass",
      issues: [],
    },
    repairInstructions: [],
    evidenceRefs: ["doc://songkran-brief"],
    events: [],
    traceId: "trace-shared-runtime-1",
    traceMetadata: {},
    adapterVersion: "adapter-test",
    sdkVersion: "sdk-test",
    checkpoint: null,
    terminalReason: "plan_completed",
    nextAction: null,
    stepId: null,
    attemptId: null,
    checkpointMetadata: null,
    eventSequenceMetadata: {},
    stepLinks: [],
    ...overrides,
  };
}

function makeLegacyTextResult(
  overrides: Partial<SharedSkillRuntimeTextResult> = {},
): SharedSkillRuntimeTextResult {
  return {
    rawContent: "Legacy prompt output",
    usage: {
      promptTokens: 3,
      completionTokens: 2,
    },
    creditsUsed: 1,
    providerName: "openrouter",
    modelId: "openai/gpt-4.1-mini",
    rawResponse: {
      choices: [],
    },
    ...overrides,
  };
}

function makeInput() {
  return {
    tenantId: "tenant-1",
    userId: 42,
    objective:
      "Enhance the Media Studio prompt while preserving the original prompt contract.",
    originSurface: "media_studio" as const,
    entryPoint: "enhance_prompt" as const,
    requestLabel: "enhance_prompt:create-image-prompt",
    skillSlugs: ["create-image-prompt"],
    systemPrompt: "Refine the prompt without changing the user intent.",
    userPrompt: "Make this Songkran prompt more cinematic.",
    schemaHint: {
      name: "prompt_enhancement_text_output",
      validationMode: "text_output" as const,
    },
    planContext: {
      maxPromptLength: 1600,
      skillName: "Create Image Prompt",
    },
    modelConfig: buildRuntimeModelConfig({
      modelId: "openai/gpt-4.1-mini",
      providerId: 1,
      gatewayRouteId: "chat-completions",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
    }),
    featureFlags: {
      openAiAgentsRuntimeEnabled: true,
      openAiAgentsRuntimeChatShadow: false,
      openAiAgentsRuntimeTeamShadow: false,
      openAiAgentsRuntimeChatActive: false,
      openAiAgentsRuntimeTeamActive: false,
      openAiAgentsRuntimeResponsesShadow: false,
      openAiAgentsRuntimeResponsesActive: false,
      openAiAgentsRuntimeSkillShadow: true,
      openAiAgentsRuntimeSkillActive: false,
      openAiAgentsRuntimeForceRollback: false,
    },
    approvalGranted: true,
    activationGate: makeActivationGate(true),
    builderDeps: {
      buildContextPack: vi.fn().mockResolvedValue({
        contextPack: makeContextPack(),
        contextPackRef: "context-pack:skill:req-shared-runtime-1",
      }),
    },
  };
}

describe("executeSharedSkillTextRuntime", () => {
  it("preserves the legacy caller-visible output in shadow mode while routing the normalized request through the shared skill surface", async () => {
    const client = {
      run: vi.fn().mockResolvedValue(
        makeRuntimeResponse({
          finalOutput: {
            rawContent: "Runtime shadow comparison output",
            usage: {
              promptTokens: 22,
              completionTokens: 11,
            },
            creditsUsed: 4,
          },
        }),
      ),
    };
    const legacyExecute = vi
      .fn()
      .mockResolvedValue(makeLegacyTextResult({ rawContent: "Legacy visible output" }));

    const result = await executeSharedSkillTextRuntime({
      ...makeInput(),
      client,
      legacyExecute,
    });

    expect(result.value.rawContent).toBe("Legacy visible output");
    expect(legacyExecute).toHaveBeenCalledTimes(1);
    expect(client.run).toHaveBeenCalledTimes(1);
    expect(result.runtime.selection.mode).toBe("shadow");
    expect(result.runtimeRequest).not.toBeNull();
    expect(result.runtimeRequest?.surface).toBe("skill");
    expect(result.runtimeRequest?.originSurface).toBe("media_studio");
    expect(result.runtimeRequest?.entryPoint).toBe("enhance_prompt");
    expect(result.runtimeRequest?.modelConfig).toMatchObject({
      providerId: "1",
      modelId: "openai/gpt-4.1-mini",
      gatewayRouteId: "chat-completions",
    });
    expect(result.runtime.comparison).toMatchObject({
      selectedSkillSlug: "create-image-prompt",
      sameRawContent: false,
    });
  });

  it("returns the runtime output directly in active mode and skips the legacy executor", async () => {
    const client = {
      run: vi.fn().mockResolvedValue(
        makeRuntimeResponse({
          traceId: "trace-shared-runtime-active",
          finalOutput: {
            rawContent: "Active runtime output",
            usage: {
              promptTokens: 30,
              completionTokens: 12,
            },
            creditsUsed: 7,
            providerName: "openrouter",
            modelId: "openai/gpt-4.1-mini",
          },
        }),
      ),
    };
    const legacyExecute = vi.fn();

    const result = await executeSharedSkillTextRuntime({
      ...makeInput(),
      client,
      legacyExecute,
      featureFlags: {
        ...makeInput().featureFlags,
        openAiAgentsRuntimeSkillShadow: false,
        openAiAgentsRuntimeSkillActive: true,
      },
    });

    expect(result.value.rawContent).toBe("Active runtime output");
    expect(result.value.usage).toEqual({
      promptTokens: 30,
      completionTokens: 12,
    });
    expect(result.runtime.selection.mode).toBe("active");
    expect(result.runtime.status).toBe("completed");
    expect(legacyExecute).not.toHaveBeenCalled();
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it("passes publicUrl into the context-pack request for relative reference images", async () => {
    const input = makeInput();
    const buildContextPack = vi.fn().mockResolvedValue({
      contextPack: makeContextPack(),
      contextPackRef: "context-pack:skill:req-shared-runtime-public-url",
    });
    const result = await executeSharedSkillTextRuntime({
      ...input,
      publicUrl: "https://smartaihub.app",
      referenceImages: ["/api/storage/files/marketplace-captures/cap-123/images/product.png"],
      builderDeps: {
        ...input.builderDeps,
        buildContextPack,
      },
      client: {
        run: vi.fn().mockResolvedValue(makeRuntimeResponse()),
      },
      legacyExecute: vi.fn().mockResolvedValue(makeLegacyTextResult()),
    });

    expect(buildContextPack).toHaveBeenCalledTimes(1);
    const contextPackRequest = buildContextPack.mock.calls[0]?.[0];
    expect(
      contextPackRequest?.request.conversationContext?.publicUrl
    ).toBe("https://smartaihub.app");
    expect(contextPackRequest?.request.attachments).toEqual([
      {
        type: "image",
        url: "/api/storage/files/marketplace-captures/cap-123/images/product.png",
      },
    ]);
  });

  it("fails closed in active mode when the manifest gate blocks execution", async () => {
    await expect(
      executeSharedSkillTextRuntime({
        ...makeInput(),
        client: {
          run: vi.fn(),
        },
        activationGate: makeActivationGate(false),
        featureFlags: {
          ...makeInput().featureFlags,
          openAiAgentsRuntimeSkillShadow: false,
          openAiAgentsRuntimeSkillActive: true,
        },
        legacyExecute: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "manifest_missing",
    } satisfies Partial<SharedSkillRuntimeError>);
  });

  it("stops recursive active execution at the configured ceiling before the runtime is called", async () => {
    const client = {
      run: vi.fn(),
    };

    await expect(
      executeSharedSkillTextRuntime({
        ...makeInput(),
        client,
        legacyExecute: vi.fn(),
        recursion: {
          currentDepth: 2,
          maxDepth: 2,
          traceId: "trace-parent",
        },
        featureFlags: {
          ...makeInput().featureFlags,
          openAiAgentsRuntimeSkillShadow: false,
          openAiAgentsRuntimeSkillActive: true,
        },
      }),
    ).rejects.toMatchObject({
      code: "runtime_recursion_ceiling_reached",
    } satisfies Partial<SharedSkillRuntimeError>);

    expect(client.run).not.toHaveBeenCalled();
  });

  it("suppresses shadow execution for user-visible side effects and records the reason", async () => {
    const client = {
      run: vi.fn(),
    };
    const legacyExecute = vi.fn().mockResolvedValue(makeLegacyTextResult());

    const result = await executeSharedSkillTextRuntime({
      ...makeInput(),
      client,
      legacyExecute,
      sideEffectKind: "user_visible_message",
    });

    expect(result.value.rawContent).toBe("Legacy prompt output");
    expect(client.run).not.toHaveBeenCalled();
    expect(result.runtime.status).toBe("shadow_skipped");
    expect(result.runtime.errorCode).toBe(
      "user_visible_message_suppressed_in_shadow_mode",
    );
    expect(result.runtime.diagnostics).toContain(
      "user_visible_message_suppressed_in_shadow_mode",
    );
  });
});
