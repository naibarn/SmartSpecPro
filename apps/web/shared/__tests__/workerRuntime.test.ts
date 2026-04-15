import { describe, expect, it } from "vitest";

import {
  COMFY_IMAGE_GENERATION_FAILURE_CODES,
  COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
  COMFY_WORKFLOW_RUN_FAILURE_CODES,
  COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
  DEFAULT_CLAW_GATEWAY_COMPATIBILITY,
  LOCAL_FOLDER_INGEST_FAILURE_CODES,
  LOCAL_FOLDER_INGEST_PROGRESS_STAGES,
  VIDEO_ASSEMBLY_FAILURE_CODES,
  VIDEO_ASSEMBLY_PROGRESS_STAGES,
  WORKER_RUNTIME_DEFINITIONS,
  comfyImageGenerationJobContractSchema,
  comfyWorkflowRunJobContractSchema,
  WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
  WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
  WORKER_RUNTIME_PROTOCOL_VERSION,
  evaluateWorkerCompatibility,
  isWorkerPathWithinAllowedRoots,
  isWorkerLoopbackUrl,
  localFolderIngestJobContractSchema,
  videoAssemblyJobContractSchema,
  workerDesktopExecutionIdentitySchema,
  workerHeartbeatPayloadSchema,
  workerRegistrationPayloadSchema,
  summarizeHermesProviderRouting,
  summarizeHermesRuntimeChannel,
  summarizeHermesRuntimeMemorySync,
  summarizeHermesRuntimePersona,
  summarizeHermesTaskMode,
  workerRuntimeTypeValues,
  workerScopeValues,
} from "../workerRuntime";
import { evaluateHermesCapabilityRolloutReadiness } from "../featureFlags";

describe("workerRuntime shared contracts", () => {
  it("includes openclaw_gateway in the runtime vocabulary", () => {
    expect(workerRuntimeTypeValues).toContain("openclaw_gateway");
  });

  it("includes hermes_agent_gateway in the runtime vocabulary", () => {
    expect(workerRuntimeTypeValues).toContain("hermes_agent_gateway");
  });

  it("exposes worker scopes for the control-plane loop", () => {
    expect(workerScopeValues).toEqual(expect.arrayContaining([
      "workers:register",
      "workers:heartbeat",
      "workers:claim",
      "workers:report",
      "workers:diagnostics",
    ]));
  });

  it("defines registration payload compatibility metadata", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      displayName: "Main Office OpenClaw",
      externalReference: "openclaw://main-office",
    });

    expect(parsed.compatibility.protocolVersion).toBe(WORKER_RUNTIME_PROTOCOL_VERSION);
    expect(parsed.compatibility.runtimeFamilySchemaVersion).toBe(
      WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
    );
    expect(parsed.compatibility.runtimeProfileSchemaVersion).toBe(
      WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
    );
    expect(parsed.runtimeType).toBe("openclaw_gateway");
  });

  it("validates desktop worker metadata and service-identity requirements", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "2.0.0",
      },
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "shared_department",
      runtimeMode: "wsl2_managed",
      displayName: "Post Team Render Host",
      externalReference: "desktop://render-host-01",
      machineId: "machine-01",
      machineName: "render-host-01",
      runtimeMetadataJson: {
        desktopVersion: "0.77.0",
        runtimeProfile: "wsl2_managed",
        workspaceRootsSummary: [
          {
            root: "\\\\media\\team",
            accessMode: "team_drive",
          },
        ],
        gpuSnapshot: {
          vendor: "nvidia",
          model: "RTX 4090",
        },
        toolchainSummary: {
          ffmpeg: "7.0",
        },
        doctorSummary: {
          status: "ok",
        },
        serviceMode: "managed_startup",
        executionIdentity: {
          mode: "service_identity",
          approvalMode: "preapproved_typed_jobs",
          budgetAttributionMode: "requesting_actor_budget",
          tokenRotationTriggers: ["periodic_rotation", "policy_change", "revocation"],
        },
      },
    });

    expect(parsed.runtimeMetadataJson).toEqual(expect.objectContaining({
      desktopVersion: "0.77.0",
      serviceMode: "managed_startup",
    }));

    expect(() => workerDesktopExecutionIdentitySchema.parse({
      mode: "user_bound",
      approvalMode: "owner_approved",
      budgetAttributionMode: "owner_budget",
      tokenRotationTriggers: ["manual_reissue"],
    })).not.toThrow();

    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "2.0.0",
      },
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "shared_department",
      runtimeMode: "native_constrained",
      displayName: "Bad Shared Desktop",
      externalReference: "desktop://bad-shared",
      machineId: "machine-02",
      machineName: "bad-shared",
      runtimeMetadataJson: {
        desktopVersion: "0.77.0",
        runtimeProfile: "native_constrained",
        workspaceRootsSummary: [],
        gpuSnapshot: {},
        toolchainSummary: {},
        doctorSummary: {},
        serviceMode: "managed_startup",
        executionIdentity: {
          mode: "user_bound",
          approvalMode: "owner_approved",
          budgetAttributionMode: "owner_budget",
          tokenRotationTriggers: ["manual_reissue"],
        },
      },
    })).toThrow(/service identity/i);
  });

  it("defines heartbeat payload compatibility metadata", () => {
    const parsed = workerHeartbeatPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      status: "online",
    });

    expect(parsed.status).toBe("online");
    expect(parsed.compatibility.runtimeVersion).toBe("1.2.3");
  });

  it("defines default HTTP gateway compatibility metadata", () => {
    expect(DEFAULT_CLAW_GATEWAY_COMPATIBILITY.httpEndpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/chat/completions" }),
      expect.objectContaining({ path: "/v1/responses" }),
      expect.objectContaining({ path: "/v1/models" }),
      expect.objectContaining({ path: "/v1/knowledge/rag/ingest" }),
    ]));
  });

  it("defines Hermes as a feature-gated external runtime with limited dispatch", () => {
    expect(WORKER_RUNTIME_DEFINITIONS.hermes_agent_gateway).toEqual(expect.objectContaining({
      runtimeType: "hermes_agent_gateway",
      displayName: "Hermes Agent Gateway",
      familyName: "Hermes",
      featureFlag: "hermesAgentRuntime",
      registrationSupport: "feature_gated",
      dispatchSupport: "limited",
      gatewayCompatibility: expect.objectContaining({
        preferredTransport: "http",
        httpEndpoints: expect.arrayContaining([
          expect.objectContaining({ path: "/v1/chat/completions" }),
          expect.objectContaining({ path: "/v1/responses" }),
          expect.objectContaining({ path: "/v1/models" }),
        ]),
      }),
    }));
  });

  it("labels Desktop + ZeroClaw with a user-facing family name", () => {
    expect(WORKER_RUNTIME_DEFINITIONS.desktop_zeroclaw_managed).toEqual(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      displayName: "Desktop + ZeroClaw Managed Runtime",
      familyName: "Desktop + ZeroClaw",
      featureFlag: "desktopZeroClawWorker",
      registrationSupport: "feature_gated",
      dispatchSupport: "limited",
    }));
  });

  it("validates Hermes bridge runtime metadata requirements", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        apiServerBaseUrl: "http://127.0.0.1:9001",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram", "discord"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    });

    expect(parsed.runtimeMetadataJson).toEqual(expect.objectContaining({
      hermesVersion: "0.3.0",
      profileName: "default",
      profileLabel: "Default Personal Assistant",
      profilePurpose: "Handle personal follow-up and coordination",
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      supportsDelegatedHttp: true,
      supportsCallbacks: true,
    }));

    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Broken Hermes",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        terminalBackend: "local",
        gatewayPlatforms: ["telegram"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    })).toThrow(/apiServerBaseUrl/i);
  });

  it("allows audited remote Hermes API servers when a policy exception is supplied", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        apiServerBaseUrl: "https://hermes.example.com",
        remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram", "discord"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    });

    expect(parsed.runtimeMetadataJson).toEqual(expect.objectContaining({
      apiServerBaseUrl: "https://hermes.example.com",
      remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
    }));
  });

  it("validates pinned Hermes provider routing metadata", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        llmRoutingMode: "pinned_provider",
        preferredProviderId: 42,
        preferredProviderName: "OpenRouter",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        apiServerEnabled: true,
        apiServerBaseUrl: "http://127.0.0.1:9001",
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    });

    expect(parsed.runtimeMetadataJson).toEqual(expect.objectContaining({
      llmRoutingMode: "pinned_provider",
      preferredProviderId: 42,
      preferredProviderName: "OpenRouter",
    }));

    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Broken Hermes",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        llmRoutingMode: "pinned_provider",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        apiServerEnabled: true,
        apiServerBaseUrl: "http://127.0.0.1:9001",
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    })).toThrow(/preferredProviderId/i);
  });

  it("rejects audited remote Hermes API servers that downgrade to http", () => {
    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        apiServerBaseUrl: "http://hermes.example.com",
        remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    })).toThrow(/https/i);
  });

  it("rejects remote Hermes API servers without a policy exception", () => {
    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.3.0",
      },
      runtimeType: "hermes_agent_gateway",
      workerMode: "per_user",
      runtimeMode: "external_managed",
      displayName: "Hermes Personal Agent",
      externalReference: "hermes://profiles/default",
      runtimeMetadataJson: {
        hermesVersion: "0.3.0",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        apiServerEnabled: true,
        apiServerBaseUrl: "https://hermes.example.com",
        terminalBackend: "local",
        gatewayPlatforms: ["telegram"],
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: false,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        hostPlatform: "linux",
        hostExecutionMode: "native",
      },
    })).toThrow(/loopback/i);
  });

  it("summarizes Hermes persona metadata with safe generic fallback", () => {
    expect(summarizeHermesRuntimePersona({
      hermesVersion: "0.3.0",
      profileName: "default",
      profileLabel: "Default Personal Assistant",
      profilePurpose: "Handle personal follow-up and coordination",
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      terminalBackend: "local",
      gatewayPlatforms: ["telegram"],
      supportsDelegatedHttp: true,
      supportsDelegatedMcp: false,
      supportsBoundConnector: true,
      supportsCallbacks: true,
      hostPlatform: "linux",
      hostExecutionMode: "native",
    })).toEqual(expect.objectContaining({
      profileName: "default",
      profileLabel: "Default Personal Assistant",
      profilePurpose: "Handle personal follow-up and coordination",
      displayLabel: "Default Personal Assistant",
      displayPurpose: "Handle personal follow-up and coordination",
      isGenericFallback: false,
    }));

    expect(summarizeHermesRuntimePersona(null)).toEqual(expect.objectContaining({
      profileName: null,
      displayLabel: "Generic Hermes",
      displayPurpose: "Default Hermes behavior",
      isGenericFallback: true,
    }));
  });

  it("summarizes Hermes channel, memory sync, and task mode state", () => {
    expect(summarizeHermesRuntimeChannel({
      hermesVersion: "0.3.0",
      profileName: "default",
      terminalBackend: "local",
      gatewayPlatforms: ["telegram", "discord"],
      supportsDelegatedHttp: true,
      supportsDelegatedMcp: true,
      supportsBoundConnector: true,
      supportsCallbacks: true,
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      hostPlatform: "linux",
      hostExecutionMode: "native",
      memorySyncEnabled: true,
      memorySyncScope: "personal",
      memorySyncStatus: "active",
      channelStatus: "connected",
    }, "online", null)).toEqual(expect.objectContaining({
      channelStatus: "connected",
      displayLabel: "Connected",
      hasCallbackSupport: true,
      connectedPlatforms: ["telegram", "discord"],
    }));

    expect(summarizeHermesRuntimeChannel({
      hermesVersion: "0.3.0",
      profileName: "default",
      terminalBackend: "local",
      gatewayPlatforms: ["telegram"],
      supportsDelegatedHttp: true,
      supportsDelegatedMcp: false,
      supportsBoundConnector: true,
      supportsCallbacks: true,
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      hostPlatform: "linux",
      hostExecutionMode: "native",
    }, "disabled", "2026-04-06T00:00:00.000Z")).toEqual(expect.objectContaining({
      channelStatus: "revoked",
      displayLabel: "Revoked",
    }));

    expect(summarizeHermesRuntimeMemorySync({
      hermesVersion: "0.3.0",
      profileName: "default",
      terminalBackend: "local",
      gatewayPlatforms: ["telegram"],
      supportsDelegatedHttp: true,
      supportsDelegatedMcp: false,
      supportsBoundConnector: true,
      supportsCallbacks: true,
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      hostPlatform: "linux",
      hostExecutionMode: "native",
      memorySyncEnabled: true,
      memorySyncScope: "team_shared",
      memorySyncStatus: "quarantined",
      channelStatus: "inactive",
    })).toEqual(expect.objectContaining({
      memorySyncEnabled: true,
      memorySyncScope: "team_shared",
      memorySyncStatus: "quarantined",
      displayLabel: "Memory sync quarantined",
      isSharedScope: true,
    }));

    expect(summarizeHermesTaskMode("worker_gateway_researcher")).toEqual(expect.objectContaining({
      taskMode: "research_summary",
      scopeProfile: "worker_gateway_researcher",
      displayLabel: "Research summary",
    }));

    expect(summarizeHermesTaskMode(null)).toEqual(expect.objectContaining({
      taskMode: "generic_fallback",
      scopeProfile: null,
      displayLabel: "Generic fallback",
    }));
  });

  it("summarizes Hermes provider routing state", () => {
    expect(summarizeHermesProviderRouting({
      hermesVersion: "0.3.0",
      profileName: "default",
      llmRoutingMode: "pinned_provider",
      preferredProviderId: 12,
      preferredProviderName: "OpenRouter",
      terminalBackend: "local",
      gatewayPlatforms: ["telegram"],
      supportsDelegatedHttp: true,
      supportsDelegatedMcp: false,
      supportsBoundConnector: true,
      supportsCallbacks: true,
      apiServerEnabled: true,
      apiServerBaseUrl: "http://127.0.0.1:9001",
      hostPlatform: "linux",
      hostExecutionMode: "native",
    })).toEqual(expect.objectContaining({
      llmRoutingMode: "pinned_provider",
      preferredProviderId: 12,
      preferredProviderName: "OpenRouter",
      displayLabel: "Pinned to OpenRouter",
    }));

    expect(summarizeHermesProviderRouting(null)).toEqual(expect.objectContaining({
      llmRoutingMode: "auto",
      preferredProviderId: null,
      displayLabel: "LLM provider auto-select",
    }));
  });

  it("summarizes Hermes capability rollout slices from feature flags", () => {
    expect(evaluateHermesCapabilityRolloutReadiness({
      hermesProfileExperience: true,
      hermesChannelWorkflowExpansion: true,
      hermesMemoryContextSync: false,
      hermesTaskModes: true,
      hermesVisibilitySummaries: false,
    })).toEqual({
      profileExperience: true,
      channelWorkflowExpansion: true,
      memoryContextSync: false,
      taskModes: true,
      visibilitySummaries: false,
    });
  });

  it("evaluates transport and runtime-profile compatibility separately", () => {
    const result = evaluateWorkerCompatibility("openclaw_gateway", {
      protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
      runtimeVersion: "1.2.3",
      runtimeFamilySchemaVersion: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
      runtimeProfileSchemaVersion: "2030-01-01",
    });

    expect(result.transport.compatible).toBe(true);
    expect(result.runtimeFamily.compatible).toBe(true);
    expect(result.runtimeProfile.compatible).toBe(false);
  });

  it("locks the canonical video_assembly contract and progress taxonomy", () => {
    const parsed = videoAssemblyJobContractSchema.parse({
      inputRefs: [
        {
          sourceKind: "authorized_local_path",
          path: "C:\\Media\\source.mp4",
        },
      ],
      editPlan: {
        clips: [
          {
            sourceRef: "C:\\Media\\source.mp4",
            trim: { startMs: 0, endMs: 5000 },
          },
        ],
        applyWatermark: true,
      },
      subtitlePlan: {
        sourcePriority: "user_provided",
        mode: "burn_in",
      },
      renderProfile: {
        aspectRatios: ["16:9", "9:16"],
        codecPreset: "h264_high",
        qualityPreset: "social_default",
        gpuRequired: true,
      },
      workspacePolicy: {
        mode: "workspace_scoped",
        allowedSourceRoots: ["C:\\Media"],
      },
      outputTargets: {
        renderedAssets: [
          {
            label: "main",
            aspectRatio: "16:9",
            publishToLibrary: true,
          },
        ],
        subtitlesOptional: true,
        thumbnailsOptional: true,
      },
    });

    expect(parsed.renderProfile.gpuRequired).toBe(true);
    expect(VIDEO_ASSEMBLY_PROGRESS_STAGES).toContain("render_outputs");
    expect(VIDEO_ASSEMBLY_FAILURE_CODES).toContain("unauthorized_path");
  });

  it("rejects video_assembly clip refs that bypass declared inputs", () => {
    expect(() => videoAssemblyJobContractSchema.parse({
      inputRefs: [
        {
          sourceKind: "authorized_local_path",
          path: "C:\\Media\\source.mp4",
        },
      ],
      editPlan: {
        clips: [
          {
            sourceRef: "D:\\Other\\source.mp4",
            trim: { startMs: 0, endMs: 5000 },
          },
        ],
        applyWatermark: false,
      },
      subtitlePlan: {
        sourcePriority: "system_generated",
        mode: "none",
      },
      renderProfile: {
        aspectRatios: ["16:9"],
        codecPreset: "h264_high",
        qualityPreset: "social_default",
        gpuRequired: false,
      },
      workspacePolicy: {
        mode: "workspace_scoped",
        allowedSourceRoots: ["C:\\Media"],
      },
      outputTargets: {
        renderedAssets: [
          {
            label: "main",
            aspectRatio: "16:9",
            publishToLibrary: true,
          },
        ],
        subtitlesOptional: false,
        thumbnailsOptional: false,
      },
    })).toThrow(/sourceRef/i);
  });

  it("enforces path-boundary checks for local worker roots", () => {
    expect(isWorkerPathWithinAllowedRoots("C:\\Media\\job\\clip.mp4", ["C:\\Media"])).toBe(true);
    expect(isWorkerPathWithinAllowedRoots("C:\\Media2\\clip.mp4", ["C:\\Media"])).toBe(false);

    expect(() => videoAssemblyJobContractSchema.parse({
      inputRefs: [
        {
          sourceKind: "authorized_local_path",
          path: "C:\\Media\\source.mp4",
        },
      ],
      editPlan: {
        clips: [
          {
            sourceRef: "C:\\Media\\source.mp4",
            trim: { startMs: 0, endMs: 5000 },
          },
        ],
        applyWatermark: false,
      },
      subtitlePlan: {
        sourcePriority: "user_provided",
        mode: "burn_in",
        subtitleRef: "C:\\Media2\\captions.srt",
      },
      renderProfile: {
        aspectRatios: ["16:9"],
        codecPreset: "h264_high",
        qualityPreset: "social_default",
        gpuRequired: false,
      },
      workspacePolicy: {
        mode: "workspace_scoped",
        allowedSourceRoots: ["C:\\Media"],
      },
      outputTargets: {
        renderedAssets: [
          {
            label: "main",
            aspectRatio: "16:9",
            publishToLibrary: true,
          },
        ],
        subtitlesOptional: false,
        thumbnailsOptional: false,
      },
    })).toThrow(/subtitleRef/i);
  });

  it("locks the canonical local_folder_ingest contract and progress taxonomy", () => {
    const parsed = localFolderIngestJobContractSchema.parse({
      roots: [
        {
          rootId: "quotes",
          name: "Quotes",
          path: "C:\\Media\\Quotes",
        },
      ],
      workspacePolicy: {
        mode: "workspace_scoped",
        allowedSourceRoots: ["C:\\Media"],
      },
      ingestPolicy: {
        maxDepth: 4,
        maxFiles: 200,
        includePreviewText: true,
        previewFileLimit: 12,
        snippetQuery: "launch",
        snippetFileLimit: 6,
      },
      outputTargets: {
        publishManifestToLibrary: true,
        publishSummaryToLibrary: true,
        triggerIndexing: true,
      },
    });

    expect(parsed.ingestPolicy.maxFiles).toBe(200);
    expect(LOCAL_FOLDER_INGEST_PROGRESS_STAGES).toContain("index_files");
    expect(LOCAL_FOLDER_INGEST_FAILURE_CODES).toContain("artifact_publish_failed");
  });

  it("locks the canonical comfy_image_generation contract and local-only service posture", () => {
    const parsed = comfyImageGenerationJobContractSchema.parse({
      service: {
        baseUrl: "http://127.0.0.1:8188",
        submitPath: "/prompt",
        historyPathTemplate: "/history/{promptId}",
        viewPath: "/view",
      },
      workflowJson: {
        "1": {
          class_type: "KSampler",
          inputs: {
            seed: 42,
          },
        },
      },
      generationSpec: {
        promptSummary: "Editorial portrait with warm rim light",
        gpuRequired: true,
      },
      outputTargets: {
        publishImagesToLibrary: true,
        publishManifestToLibrary: true,
        triggerIndexing: true,
        maxImages: 4,
      },
    });

    expect(parsed.generationSpec.gpuRequired).toBe(true);
    expect(COMFY_IMAGE_GENERATION_PROGRESS_STAGES).toContain("collect_outputs");
    expect(COMFY_IMAGE_GENERATION_FAILURE_CODES).toContain("execution_timeout");
    expect(isWorkerLoopbackUrl(parsed.service.baseUrl)).toBe(true);
  });

  it("rejects comfy_image_generation services that are not loopback-local", () => {
    expect(() => comfyImageGenerationJobContractSchema.parse({
      service: {
        baseUrl: "https://comfy.example.test",
        submitPath: "/prompt",
        historyPathTemplate: "/history/{promptId}",
        viewPath: "/view",
      },
      workflowJson: {
        "1": {
          class_type: "KSampler",
        },
      },
      generationSpec: {
        promptSummary: "Studio portrait",
        gpuRequired: true,
      },
      outputTargets: {
        publishImagesToLibrary: true,
        publishManifestToLibrary: false,
        triggerIndexing: true,
        maxImages: 2,
      },
    })).toThrow(/loopback/i);
  });

  it("locks the canonical comfy_workflow_run contract and output taxonomy", () => {
    const parsed = comfyWorkflowRunJobContractSchema.parse({
      service: {
        baseUrl: "http://localhost:8188",
        submitPath: "/prompt",
        historyPathTemplate: "/history/{promptId}",
        viewPath: "/view",
      },
      workflowJson: {
        "10": {
          class_type: "SaveImage",
          inputs: {
            filename_prefix: "smartspec",
          },
        },
      },
      workflowLabel: "Brand image batch",
      executionPolicy: {
        expectedOutputTypes: ["images", "files"],
        gpuRequired: true,
        failOnMissingOutputs: true,
      },
      outputTargets: {
        publishOutputFilesToLibrary: true,
        publishManifestToLibrary: true,
        triggerIndexing: false,
        maxOutputFiles: 12,
      },
    });

    expect(parsed.executionPolicy.expectedOutputTypes).toEqual(["images", "files"]);
    expect(COMFY_WORKFLOW_RUN_PROGRESS_STAGES).toContain("submit_workflow");
    expect(COMFY_WORKFLOW_RUN_FAILURE_CODES).toContain("unsupported_output");
  });

  it("rejects local_folder_ingest roots that escape the approved source roots", () => {
    expect(() => localFolderIngestJobContractSchema.parse({
      roots: [
        {
          rootId: "quotes",
          name: "Quotes",
          path: "D:\\Other\\Quotes",
        },
      ],
      workspacePolicy: {
        mode: "workspace_scoped",
        allowedSourceRoots: ["C:\\Media"],
      },
      ingestPolicy: {
        maxDepth: 4,
        maxFiles: 50,
        includePreviewText: true,
        previewFileLimit: 10,
        snippetFileLimit: 0,
      },
      outputTargets: {
        publishManifestToLibrary: true,
        publishSummaryToLibrary: false,
        triggerIndexing: true,
      },
    })).toThrow(/approved source root/i);
  });

  it("requires runtime-specific metadata for nemoclaw and hiclaw registrations", () => {
    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.9.0-alpha",
      },
      runtimeType: "nemoclaw_sandbox",
      displayName: "Secure Pool",
      externalReference: "nemoclaw://pool-1",
      runtimeMetadataJson: {
        openShellVersion: "1.0.0",
        sandboxName: "strict-egress",
        blueprintVersion: "2026.04",
        inferenceProviderProfile: "routed-nvidia",
        networkPolicyProfile: "deny-by-default",
        filesystemPolicyScope: "workspace-only",
        processRestrictionProfile: "strict",
        resourceClass: "sandbox-medium",
      },
    })).not.toThrow();

    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.9.0-alpha",
      },
      runtimeType: "hiclaw_cluster",
      displayName: "Research Cluster",
      externalReference: "hiclaw://cluster-1",
      runtimeMetadataJson: {
        managerEndpoint: "https://manager.example.test",
        clusterId: "cluster-1",
        gatewayMode: "matrix-first",
        credentialHandlingMode: "gateway-held",
        sharedArtifactStoreProfile: "minio-default",
        humanOversightMode: "manager_required",
        workerPoolSummary: { workers: 6 },
        matrixVisibilityMode: "room-visible",
      },
    })).not.toThrow();

    expect(() => workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "0.9.0-alpha",
      },
      runtimeType: "nemoclaw_sandbox",
      displayName: "Incomplete Pool",
      externalReference: "nemoclaw://pool-2",
      runtimeMetadataJson: {
        sandboxName: "missing-fields",
      },
    })).toThrow();
  });
});
