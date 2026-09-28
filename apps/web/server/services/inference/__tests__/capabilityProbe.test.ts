import { describe, expect, it, vi } from "vitest";
import {
  runInferenceCapabilityProbe,
  type CapabilityProbeTarget,
} from "../capabilityProbe";

const target: CapabilityProbeTarget = {
  profileVersionId: 42,
  runtimeBindingHash: `sha256:${"d".repeat(64)}`,
  providerRecordId: 7,
  modelMappingId: 19,
  providerModelId: "vendor-model-r3",
  apiStyle: "responses",
  probePricing: {
    inputMicrosPerMillion: 0,
    outputMicrosPerMillion: 0,
    source: "mapping",
  },
  profile: {
    model: {
      logicalModelId: "model:general-r3",
      revision: "model-rev:3",
      providerNativeModelId: "vendor-model-r3",
      lifecycle: "POLICY_REVIEWED",
      capabilityRefs: ["capability:text-chat"],
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        toolContractRefs: [],
        maxContextTokens: 32_000,
        maxOutputTokens: 4_096,
      },
    },
    deployment: {
      deploymentId: "deployment:llm-provider-map:19",
      revision: "deployment-rev:3",
      logicalModelId: "model:general-r3",
      logicalModelRevision: "model-rev:3",
      providerId: "provider:llm-provider:7",
      credentialOwnerRef: "credential-owner:llm-provider:7",
      endpointSurface: "responses_compatible",
      executionSurface: "cloud",
      region: "TH",
      allowedRegions: ["TH"],
      allowedPrivacyClasses: ["tenant-confidential"],
      retention: "limited-retention",
      status: "DEGRADED",
      health: "degraded",
      healthObservedAtMs: 1,
      latencyP95Ms: 0,
      resolvedAliasRevision: "model-rev:3",
      probe: {
        source: "catalog_metadata",
        endpointSurface: "responses_compatible",
        probeSuiteRevision: "catalog:1",
        evidenceRef: "catalog:record-1",
        observedAtMs: 1,
        validUntilMs: 999_999,
        probedCapabilityRefs: [],
        checks: {
          basicRequestResponse: false,
          chatResponsesParity: false,
          streamingCancellation: false,
          toolsContinuation: false,
          strictSchema: false,
          reasoningUsage: false,
          multimodal: false,
          contextOutputLimits: false,
          regionRetention: false,
          credentialOwnership: false,
        },
      },
      price: {
        currency: "USD_MICROS",
        inputMicrosPerMillion: 0,
        outputMicrosPerMillion: 0,
        snapshotRef: "price:catalog-1",
        validUntilMs: 999_999,
      },
      runtimeBinding: {
        kind: "llm_provider_map",
        providerRecordId: 7,
        modelMappingId: 19,
      },
    },
  },
};

describe("Spec 231 live capability probe", () => {
  it("probes pinned Chat Completions tool-call identity and one continuation round trip", async () => {
    const toolTarget: CapabilityProbeTarget = {
      ...target,
      apiStyle: "chat-completions",
      profile: {
        model: {
          ...target.profile.model,
          capabilityRefs: ["capability:text-chat", "capability:tools"],
          capabilities: {
            ...target.profile.model.capabilities,
            features: ["tools"],
            toolContractRefs: ["tool-contract:fixture"],
          },
        },
        deployment: {
          ...target.profile.deployment,
          endpointSurface: "chat_compatible",
          probe: {
            ...target.profile.deployment.probe,
            endpointSurface: "chat_compatible",
          },
        },
      },
    };
    const execute = vi.fn(async (input: Record<string, unknown>) => {
      const messages = input.messages as Array<{
        role: string;
        content?: string;
      }>;
      const extra = input.extraBodyParams as
        Record<string, unknown> | undefined;
      const usesTools = Array.isArray(extra?.tools);
      const hasToolResult = messages.some(message => message.role === "tool");
      const content =
        usesTools && hasToolResult
          ? "SAH_TOOL_RESULT_A_V1|SAH_TOOL_RESULT_B_V1"
          : usesTools
            ? ""
            : messages[0]?.content?.includes("SAH_CONTEXT_START_V1")
              ? "SAH_CONTEXT_START_V1|SAH_CONTEXT_END_V1"
              : messages[0]?.content?.startsWith("Output only the character x")
                ? "x ".repeat(Number(input.maxTokens))
                : messages[0]?.content?.includes("single letter A")
                  ? "A"
                  : messages[0]?.content?.includes("single letter R")
                    ? "R"
                    : extra?.response_format
                      ? JSON.stringify({ marker: "SAH_CAPABILITY_JSON_V1" })
                      : "SAH_CAPABILITY_TEXT_V1";
      const message =
        usesTools && !hasToolResult
          ? {
              content,
              tool_calls: [
                {
                  id: "call_sah_probe_a",
                  type: "function",
                  function: {
                    name: "sah_capability_probe_a",
                    arguments: JSON.stringify({
                      marker: "SAH_TOOL_ARGUMENT_A_V1",
                    }),
                  },
                },
                {
                  id: "call_sah_probe_b",
                  type: "function",
                  function: {
                    name: "sah_capability_probe_b",
                    arguments: JSON.stringify({
                      marker: "SAH_TOOL_ARGUMENT_B_V1",
                    }),
                  },
                },
              ],
            }
          : { content };
      return {
        type: "success" as const,
        providerId: 7,
        providerName: "provider",
        response: {
          model: "vendor-model-r3",
          choices: [
            {
              message,
              ...(messages[0]?.content?.startsWith(
                "Output only the character x"
              )
                ? { finish_reason: "length" }
                : {}),
            },
          ],
          usage: {
            prompt_tokens: messages[0]?.content?.includes(
              "SAH_CONTEXT_START_V1"
            )
              ? 27_850
              : 14,
            completion_tokens: messages[0]?.content?.startsWith(
              "Output only the character x"
            )
              ? Number(input.maxTokens)
              : 1,
            total_tokens:
              (messages[0]?.content?.includes("SAH_CONTEXT_START_V1")
                ? 27_850
                : 14) +
              (messages[0]?.content?.startsWith("Output only the character x")
                ? Number(input.maxTokens)
                : 1),
            ...(input.enableThinking ? { reasoning_tokens: 1 } : {}),
          },
        },
      };
    });
    const persist = vi.fn(async () => undefined);

    const result = await runInferenceCapabilityProbe(
      {
        deploymentId: toolTarget.profile.deployment.deploymentId,
        actorUserId: 12,
      },
      {
        resolveTarget: async () => ({ ok: true, target: toolTarget }),
        execute: execute as never,
        persist,
      }
    );

    expect(result).toMatchObject({
      status: "incomplete",
      checks: { toolsContinuation: true, contextOutputLimits: true },
      parallelToolCallsVerified: true,
    });
    expect(result.reasonCode).toContain("TOOL_CONTRACT_PARITY_UNVERIFIED");
    expect(execute).toHaveBeenCalledTimes(7);
    expect(execute.mock.calls[5][0]).toMatchObject({
      strictProviderPin: true,
      disableProviderFallbacks: true,
      expectedProviderModelId: "vendor-model-r3",
      expectedApiStyle: "chat-completions",
      expectedModelMappingId: 19,
      extraBodyParams: {
        parallel_tool_calls: true,
        tool_choice: "required",
      },
    });
    expect(execute.mock.calls[6][0].messages).toEqual([
      {
        role: "user",
        content:
          "Call both qualification probe functions, one with marker A and one with marker B.",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_sah_probe_a",
            type: "function",
            function: {
              name: "sah_capability_probe_a",
              arguments: JSON.stringify({ marker: "SAH_TOOL_ARGUMENT_A_V1" }),
            },
          },
          {
            id: "call_sah_probe_b",
            type: "function",
            function: {
              name: "sah_capability_probe_b",
              arguments: JSON.stringify({ marker: "SAH_TOOL_ARGUMENT_B_V1" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_sah_probe_a",
        content: "SAH_TOOL_RESULT_A_V1",
      },
      {
        role: "tool",
        tool_call_id: "call_sah_probe_b",
        content: "SAH_TOOL_RESULT_B_V1",
      },
    ]);
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      checks: { toolsContinuation: true },
    });
  });

  it("measures the declared context and output ceilings while keeping region evidence unverified", async () => {
    const execute = vi.fn(async (input: Record<string, unknown>) => {
      const structured = input.extraBodyParams as
        Record<string, unknown> | undefined;
      const schema = structured?.response_format as
        Record<string, unknown> | undefined;
      const prompt = String(
        (input.messages as Array<{ content: string }>)[0].content
      );
      const isContextProbe = prompt.includes("SAH_CONTEXT_START_V1");
      const isOutputProbe = prompt.startsWith("Output only the character x");
      const content = isContextProbe
        ? "SAH_CONTEXT_START_V1|SAH_CONTEXT_END_V1"
        : isOutputProbe
          ? "x ".repeat(Number(input.maxTokens))
          : schema
            ? JSON.stringify({ marker: "SAH_CAPABILITY_JSON_V1" })
            : prompt.includes("single letter A")
              ? "A"
              : prompt.includes("single letter R")
                ? "R"
                : "SAH_CAPABILITY_TEXT_V1";
      return {
        type: "success" as const,
        providerId: 7,
        providerName: "provider",
        response: {
          model: "vendor-model-r3",
          choices: [
            {
              message: { content },
              ...(isOutputProbe ? { finish_reason: "length" } : {}),
            },
          ],
          usage: {
            prompt_tokens: isContextProbe ? 27_850 : 14,
            completion_tokens: isOutputProbe ? Number(input.maxTokens) : 1,
            total_tokens:
              (isContextProbe ? 27_850 : 14) +
              (isOutputProbe ? Number(input.maxTokens) : 1),
            ...(input.enableThinking ? { reasoning_tokens: 1 } : {}),
          },
        },
      };
    });
    const persist = vi.fn(async () => undefined);

    const result = await runInferenceCapabilityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: execute as never,
        persist,
        now: () => new Date("2026-09-27T04:00:00.000Z"),
      }
    );

    expect(result).toMatchObject({
      status: "incomplete",
      checks: {
        basicRequestResponse: true,
        contextOutputLimits: true,
        credentialOwnership: true,
        strictSchema: true,
        reasoningUsage: true,
        regionRetention: false,
      },
      probedCapabilityRefs: ["capability:text-chat"],
    });
    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[1][0]).toMatchObject({
      maxTokens: target.profile.model.capabilities.maxOutputTokens,
      timeoutMs: expect.any(Number),
    });
    expect(
      String(
        (execute.mock.calls[1][0].messages as Array<{ content: string }>)[0]
          .content
      )
    ).toContain("SAH_CONTEXT_END_V1");
    expect(execute.mock.calls[2][0]).toMatchObject({
      maxTokens: target.profile.model.capabilities.maxOutputTokens,
      timeoutMs: expect.any(Number),
    });
    expect(
      execute.mock.calls.every(
        ([call]) =>
          call.strictProviderPin === true &&
          call.disableProviderFallbacks === true &&
          call.expectedProviderModelId === "vendor-model-r3" &&
          call.expectedModelMappingId === 19 &&
          call.expectedApiStyle === "responses"
      )
    ).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0].probeKind).toBe("capability_suite");
    expect(persist.mock.calls[0][0].status).toBe("incomplete");
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      contextLimitVerified: true,
      maximumOutputLimitVerified: true,
    });
    expect(JSON.stringify(persist.mock.calls[0][0].resultJson)).not.toContain(
      "SAH_CAPABILITY_"
    );
  });

  it("does not send a large context/output probe when its conservative cost estimate exceeds budget", async () => {
    vi.stubEnv("INFERENCE_CAPABILITY_PROBE_MAX_COST_USD_MICROS", "250000");
    const expensiveTarget: CapabilityProbeTarget = {
      ...target,
      probePricing: {
        inputMicrosPerMillion: 10_000_000,
        outputMicrosPerMillion: 15_000_000,
        source: "mapping",
      },
      profile: {
        ...target.profile,
        deployment: {
          ...target.profile.deployment,
          price: {
            ...target.profile.deployment.price,
            inputMicrosPerMillion: 10_000_000,
            outputMicrosPerMillion: 15_000_000,
          },
        },
      },
    };
    const execute = vi.fn(async (input: Record<string, unknown>) => {
      const prompt = String(
        (input.messages as Array<{ content: string }>)[0].content
      );
      const schema = Boolean(
        (input.extraBodyParams as Record<string, unknown> | undefined)
          ?.response_format
      );
      const content = schema
        ? JSON.stringify({ marker: "SAH_CAPABILITY_JSON_V1" })
        : prompt.includes("single letter R")
          ? "R"
          : "SAH_CAPABILITY_TEXT_V1";
      return {
        type: "success" as const,
        providerId: 7,
        providerName: "provider",
        response: {
          model: "vendor-model-r3",
          choices: [{ message: { content } }],
          usage: {
            prompt_tokens: 14,
            completion_tokens: 1,
            total_tokens: 15,
            ...(input.enableThinking ? { reasoning_tokens: 1 } : {}),
          },
        },
      };
    });
    const persist = vi.fn(async () => undefined);

    const result = await runInferenceCapabilityProbe(
      {
        deploymentId: expensiveTarget.profile.deployment.deploymentId,
        actorUserId: 12,
      },
      {
        resolveTarget: async () => ({ ok: true, target: expensiveTarget }),
        execute: execute as never,
        persist,
      }
    );

    expect(result).toMatchObject({
      status: "incomplete",
      checks: { contextOutputLimits: false },
      reasonCode: expect.stringContaining("PROBE_COST_BUDGET_EXCEEDED"),
    });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(
      execute.mock.calls.some(([call]) =>
        String(
          (call.messages as Array<{ content: string }>)[0].content
        ).includes("SAH_CONTEXT_START_V1")
      )
    ).toBe(false);
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      limitProbeEvidence: {
        executed: false,
        estimatedCostUsdMicros: expect.any(Number),
        budgetUsdMicros: 250_000,
      },
    });
    vi.unstubAllEnvs();
  });

  it("rejects usage that exceeds the declared maximum output even when the request otherwise succeeds", async () => {
    const boundedTarget: CapabilityProbeTarget = {
      ...target,
      profile: {
        ...target.profile,
        model: {
          ...target.profile.model,
          capabilities: {
            ...target.profile.model.capabilities,
            maxContextTokens: 256,
            maxOutputTokens: 16,
          },
        },
      },
    };
    const execute = vi.fn(async (input: Record<string, unknown>) => {
      const prompt = String(
        (input.messages as Array<{ content: string }>)[0].content
      );
      const isContextProbe = prompt.includes("SAH_CONTEXT_START_V1");
      const isOutputProbe = prompt.startsWith("Output only the character x");
      const content = isContextProbe
        ? "SAH_CONTEXT_START_V1|SAH_CONTEXT_END_V1"
        : isOutputProbe
          ? "x ".repeat(17)
          : prompt.includes("single letter R")
            ? "R"
            : "SAH_CAPABILITY_TEXT_V1";
      const promptTokens = isContextProbe ? 200 : 14;
      const completionTokens = isOutputProbe ? 17 : 1;
      return {
        type: "success" as const,
        providerId: 7,
        providerName: "provider",
        response: {
          model: "vendor-model-r3",
          choices: [{ message: { content } }],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            ...(input.enableThinking ? { reasoning_tokens: 1 } : {}),
          },
        },
      };
    });
    const persist = vi.fn(async () => undefined);

    const result = await runInferenceCapabilityProbe(
      {
        deploymentId: boundedTarget.profile.deployment.deploymentId,
        actorUserId: 12,
      },
      {
        resolveTarget: async () => ({ ok: true, target: boundedTarget }),
        execute: execute as never,
        persist,
      }
    );

    expect(result).toMatchObject({
      status: "failed",
      checks: { contextOutputLimits: false },
      reasonCode: expect.stringContaining(
        "MAXIMUM_OUTPUT_LIMIT_EVIDENCE_MISSING"
      ),
    });
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      maximumOutputLimitVerified: false,
      limitProbeEvidence: {
        maximumOutputTokens: 16,
        observedMaximumOutputTokens: 17,
      },
    });
  });

  it("rejects an overlarge context payload before allocating or sending it", async () => {
    const oversizedTarget: CapabilityProbeTarget = {
      ...target,
      profile: {
        ...target.profile,
        model: {
          ...target.profile.model,
          capabilities: {
            ...target.profile.model.capabilities,
            maxContextTokens: 10_000_000,
          },
        },
      },
    };
    const execute = vi.fn(async () => ({
      type: "success" as const,
      providerId: 7,
      providerName: "provider",
      response: {
        model: "vendor-model-r3",
        choices: [{ message: { content: "SAH_CAPABILITY_TEXT_V1" } }],
        usage: { prompt_tokens: 14, completion_tokens: 1, total_tokens: 15 },
      },
    }));
    const persist = vi.fn(async () => undefined);

    const result = await runInferenceCapabilityProbe(
      {
        deploymentId: oversizedTarget.profile.deployment.deploymentId,
        actorUserId: 12,
      },
      {
        resolveTarget: async () => ({ ok: true, target: oversizedTarget }),
        execute: execute as never,
        persist,
      }
    );

    expect(result).toMatchObject({
      status: "incomplete",
      reasonCode: expect.stringContaining(
        "CONTEXT_PROBE_EXCEEDS_SAFE_INPUT_LIMIT"
      ),
      checks: { contextOutputLimits: false },
    });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      limitProbeEvidence: {
        executed: false,
        contextInputChars: expect.any(Number),
        maximumContextProbeInputChars: 2_000_000,
      },
    });
  });

  it("does not accept another provider's answer as capability evidence", async () => {
    const persist = vi.fn(async () => undefined);
    const execute = vi.fn(async () => ({
      type: "success" as const,
      providerId: 8,
      providerName: "other-provider",
      response: {
        model: "vendor-model-r3",
        choices: [{ message: { content: "SAH_CAPABILITY_TEXT_V1" } }],
      },
    }));
    const result = await runInferenceCapabilityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: execute as never,
        persist,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.reasonCode).toContain("OBSERVED_PROVIDER_MISMATCH");
    expect(execute).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      checks: { basicRequestResponse: false },
    });
  });

  it("stops provider calls after the baseline response fails", async () => {
    const execute = vi.fn(async () => ({
      type: "success" as const,
      providerId: 7,
      providerName: "provider",
      response: {
        model: "vendor-model-r3",
        choices: [{ message: { content: "unexpected" } }],
      },
    }));
    const result = await runInferenceCapabilityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: execute as never,
        persist: async () => undefined,
      }
    );
    expect(result.status).toBe("failed");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("blocks when immutable probe evidence cannot be persisted", async () => {
    const result = await runInferenceCapabilityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: (async () => ({
          type: "success",
          providerId: 7,
          providerName: "provider",
          response: {
            model: "vendor-model-r3",
            choices: [{ message: { content: "SAH_CAPABILITY_TEXT_V1" } }],
            usage: {
              prompt_tokens: 14,
              completion_tokens: 1,
              total_tokens: 15,
            },
          },
        })) as never,
        persist: async () => {
          throw new Error("db unavailable");
        },
      }
    );
    expect(result).toEqual({
      status: "blocked",
      reasonCode: "PROBE_EVIDENCE_PERSIST_FAILED",
    });
  });
});
