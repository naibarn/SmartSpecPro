import { z } from "zod";

import {
  AgentRuntimeRequestSchema,
  AgentRuntimeResponseSchema,
  AgentRuntimeSurfaceSchema,
  CURRENT_CHECKPOINT_SCHEMA_VERSION,
  CURRENT_RUNTIME_CONTRACT_VERSION,
  CURRENT_TRACE_SCHEMA_VERSION,
  type AgentRuntimeRequest,
  type AgentRuntimeResponse,
  type AgentRuntimeSurface,
  isSupportedCheckpointSchemaVersion,
  isSupportedRuntimeContractVersion,
  isSupportedTraceSchemaVersion,
} from "../../../shared/agentRuntime/types";
import {
  getAppRuntimeConfig,
  getPreferredInternalToken,
  type RuntimeConfig,
} from "../appRuntimeConfig";

const AGENT_RUNTIME_OPERATIONS = [
  "run",
  "runStreamed",
  "resume",
  "cancel",
  "health",
] as const;

export type AgentRuntimeOperation = (typeof AGENT_RUNTIME_OPERATIONS)[number];

export const AGENT_RUNTIME_INTERNAL_ROUTE_PREFIX =
  "/api/internal/openai-agents-runtime";

const AgentRuntimeResumeRequestSchema = z
  .intersection(
    AgentRuntimeRequestSchema,
    z.object({
      checkpointPayload: z.record(z.unknown()).nullable().optional(),
    })
  )
  .superRefine((value, ctx) => {
    if (!value.approvalCheckpointId && !value.resumeCursor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvalCheckpointId"],
        message: "resume_requires_checkpoint_or_cursor",
      });
    }
  });

const AgentRuntimeCancelRequestSchema = z
  .object({
    runtimeContractVersion: z.number().int(),
    traceSchemaVersion: z.number().int(),
    checkpointSchemaVersion: z.number().int(),
    surface: AgentRuntimeSurfaceSchema,
    tenantId: z.string().min(1),
    roomId: z.string().min(1).nullable().optional(),
    runId: z.string().min(1).nullable().optional(),
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    cancelReason: z.string().min(1).nullable().optional(),
    actorMetadata: z.record(z.unknown()).default({}),
    traceCorrelationIds: z
      .object({
        traceId: z.string().min(1).nullable().optional(),
        parentTraceId: z.string().min(1).nullable().optional(),
      })
      .default({}),
    manifestHash: z.string().min(1).nullable().optional(),
    stageKey: z.string().min(1).nullable().optional(),
    attemptId: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.surface !== "media_production") return;
    const checks: Array<[unknown, string, string]> = [
      [
        value.manifestHash,
        "manifestHash",
        "media_production_cancel_manifest_hash_required",
      ],
      [
        value.stageKey,
        "stageKey",
        "media_production_cancel_stage_key_required",
      ],
      [
        value.attemptId,
        "attemptId",
        "media_production_cancel_attempt_id_required",
      ],
    ];
    for (const [actual, path, message] of checks) {
      if (!actual) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message,
        });
      }
    }
  });

const AgentRuntimeAdapterErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  }),
});

const AgentRuntimeHealthSchema = z.object({
  adapterVersion: z.string().min(1),
  sdkVersion: z.string().min(1).nullable().optional(),
  gatewayModelSupportEnabled: z.boolean(),
  traceExportMode: z.string().min(1),
  productionSafeTracing: z.boolean(),
  supportedRuntimeContractVersions: z
    .array(z.number().int())
    .default([CURRENT_RUNTIME_CONTRACT_VERSION]),
  supportedTraceSchemaVersions: z
    .array(z.number().int())
    .default([CURRENT_TRACE_SCHEMA_VERSION]),
  supportedCheckpointSchemaVersions: z
    .array(z.number().int())
    .default([CURRENT_CHECKPOINT_SCHEMA_VERSION]),
});

export type AgentRuntimeResumeRequest = z.infer<
  typeof AgentRuntimeResumeRequestSchema
>;
export type AgentRuntimeCancelRequest = z.infer<
  typeof AgentRuntimeCancelRequestSchema
>;
export type AgentRuntimeHealth = z.infer<typeof AgentRuntimeHealthSchema>;

export interface AgentRuntimeClientOptions {
  fetchImpl?: typeof fetch;
  runtimeConfigLoader?: () => Promise<RuntimeConfig>;
  internalTokenLoader?: () => Promise<string>;
}

export class AgentRuntimeClientError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown> | null;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    details?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = "AgentRuntimeClientError";
    this.code = input.code;
    this.status = input.status ?? 500;
    this.details = input.details ?? null;
  }
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch !== "function") {
    throw new AgentRuntimeClientError({
      code: "fetch_unavailable",
      message: "Global fetch is not available for AgentRuntimeClient.",
      status: 500,
    });
  }
  return fetch;
}

function buildOperationPath(operation: AgentRuntimeOperation): string {
  switch (operation) {
    case "run":
      return "run";
    case "runStreamed":
      return "run-streamed";
    case "resume":
      return "resume";
    case "cancel":
      return "cancel";
    case "health":
      return "health";
  }
}

export function buildAgentRuntimeAdapterUrl(
  baseUrl: string,
  operation: AgentRuntimeOperation
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}${AGENT_RUNTIME_INTERNAL_ROUTE_PREFIX}/${buildOperationPath(operation)}`;
}

function assertHealthCompatibility(health: AgentRuntimeHealth): void {
  if (
    !health.supportedRuntimeContractVersions.includes(
      CURRENT_RUNTIME_CONTRACT_VERSION
    )
  ) {
    throw new AgentRuntimeClientError({
      code: "adapter_runtime_contract_unsupported",
      message: `Adapter does not support runtime contract v${CURRENT_RUNTIME_CONTRACT_VERSION}.`,
      status: 409,
    });
  }
  if (
    !health.supportedTraceSchemaVersions.includes(CURRENT_TRACE_SCHEMA_VERSION)
  ) {
    throw new AgentRuntimeClientError({
      code: "adapter_trace_schema_unsupported",
      message: `Adapter does not support trace schema v${CURRENT_TRACE_SCHEMA_VERSION}.`,
      status: 409,
    });
  }
  if (
    !health.supportedCheckpointSchemaVersions.includes(
      CURRENT_CHECKPOINT_SCHEMA_VERSION
    )
  ) {
    throw new AgentRuntimeClientError({
      code: "adapter_checkpoint_schema_unsupported",
      message: `Adapter does not support checkpoint schema v${CURRENT_CHECKPOINT_SCHEMA_VERSION}.`,
      status: 409,
    });
  }
}

function assertCompatibleResponseVersions(
  response: AgentRuntimeResponse
): void {
  if (!isSupportedRuntimeContractVersion(response.runtimeContractVersion)) {
    throw new AgentRuntimeClientError({
      code: "adapter_runtime_contract_unsupported",
      message: `Unsupported runtime contract version ${response.runtimeContractVersion}.`,
      status: 409,
    });
  }
  if (!isSupportedTraceSchemaVersion(response.traceSchemaVersion)) {
    throw new AgentRuntimeClientError({
      code: "adapter_trace_schema_unsupported",
      message: `Unsupported trace schema version ${response.traceSchemaVersion}.`,
      status: 409,
    });
  }
  if (!isSupportedCheckpointSchemaVersion(response.checkpointSchemaVersion)) {
    throw new AgentRuntimeClientError({
      code: "adapter_checkpoint_schema_unsupported",
      message: `Unsupported checkpoint schema version ${response.checkpointSchemaVersion}.`,
      status: 409,
    });
  }
}

function parseValidatedAgentRuntimeResponse(
  payload: unknown
): AgentRuntimeResponse {
  const parsed = AgentRuntimeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    const issuePaths = parsed.error.issues.map(issue => issue.path.join("."));
    const unsupportedVersionPath = issuePaths.find(path =>
      [
        "runtimeContractVersion",
        "traceSchemaVersion",
        "checkpointSchemaVersion",
      ].includes(path)
    );
    if (unsupportedVersionPath === "runtimeContractVersion") {
      throw new AgentRuntimeClientError({
        code: "adapter_runtime_contract_unsupported",
        message: "Adapter returned an unsupported runtime contract version.",
        status: 409,
        details: {
          issues: parsed.error.issues,
        },
      });
    }
    if (unsupportedVersionPath === "traceSchemaVersion") {
      throw new AgentRuntimeClientError({
        code: "adapter_trace_schema_unsupported",
        message: "Adapter returned an unsupported trace schema version.",
        status: 409,
        details: {
          issues: parsed.error.issues,
        },
      });
    }
    if (unsupportedVersionPath === "checkpointSchemaVersion") {
      throw new AgentRuntimeClientError({
        code: "adapter_checkpoint_schema_unsupported",
        message: "Adapter returned an unsupported checkpoint schema version.",
        status: 409,
        details: {
          issues: parsed.error.issues,
        },
      });
    }
    throw new AgentRuntimeClientError({
      code: "adapter_contract_violation",
      message:
        "Adapter returned a payload that does not match the runtime response contract.",
      status: 502,
      details: {
        issues: parsed.error.issues,
      },
    });
  }
  assertCompatibleResponseVersions(parsed.data);
  return parsed.data;
}

export function verifyAgentRuntimeResponseForRequest(
  request: Pick<
    AgentRuntimeRequest,
    | "allowedSkills"
    | "allowedTools"
    | "allowedAgents"
    | "requestId"
    | "surface"
    | "stepContext"
    | "gatewayInvocationMetadata"
    | "productionAgentsSdkCapabilityManifest"
  >,
  response: AgentRuntimeResponse
): AgentRuntimeResponse {
  if (
    response.selectedSkillSlug &&
    request.allowedSkills.length > 0 &&
    !request.allowedSkills.includes(response.selectedSkillSlug)
  ) {
    throw new AgentRuntimeClientError({
      code: "selected_skill_not_allowed",
      message: `Adapter selected skill '${response.selectedSkillSlug}' outside the execution envelope.`,
      status: 422,
      details: {
        requestId: request.requestId,
        selectedSkillSlug: response.selectedSkillSlug,
      },
    });
  }

  if (
    response.selectedAgentName &&
    request.allowedAgents.length > 0 &&
    !request.allowedAgents.includes(response.selectedAgentName)
  ) {
    throw new AgentRuntimeClientError({
      code: "selected_agent_not_allowed",
      message: `Adapter selected agent '${response.selectedAgentName}' outside the execution envelope.`,
      status: 422,
      details: {
        requestId: request.requestId,
        selectedAgentName: response.selectedAgentName,
      },
    });
  }

  const disallowedTools = response.toolCallsMade.filter(
    toolSlug => !request.allowedTools.includes(toolSlug)
  );
  if (disallowedTools.length > 0) {
    throw new AgentRuntimeClientError({
      code: "selected_tool_not_allowed",
      message: `Adapter selected tool(s) outside the execution envelope: ${disallowedTools.join(", ")}`,
      status: 422,
      details: {
        requestId: request.requestId,
        disallowedTools,
      },
    });
  }

  if (request.surface === "media_production") {
    const manifest = request.productionAgentsSdkCapabilityManifest;
    const expectedManifestHash = manifest?.manifestHash;
    const expectedStageKey =
      manifest?.stageKey ??
      request.gatewayInvocationMetadata?.stageKey ??
      request.stepContext?.stepKey;
    const expectedAttemptId =
      manifest?.attemptId ??
      request.gatewayInvocationMetadata?.attemptId ??
      request.stepContext?.attemptId;
    const expectedAgentName =
      request.gatewayInvocationMetadata?.agentRole ??
      request.allowedAgents[0] ??
      manifest?.allowedAgents[0];
    if (
      expectedAgentName &&
      response.selectedAgentName &&
      response.selectedAgentName !== expectedAgentName
    ) {
      throw new AgentRuntimeClientError({
        code: "selected_agent_not_allowed",
        message: `Adapter selected agent '${response.selectedAgentName}' outside the media production manifest authority.`,
        status: 422,
        details: {
          requestId: request.requestId,
          selectedAgentName: response.selectedAgentName,
          expectedAgentName,
        },
      });
    }
    const assertIdentity = (
      actual: unknown,
      expected: string | null | undefined,
      field: string
    ) => {
      if (expected && actual !== expected) {
        throw new AgentRuntimeClientError({
          code: "media_production_response_identity_mismatch",
          message: `Adapter response ${field} does not match the media production manifest authority.`,
          status: 422,
          details: {
            requestId: request.requestId,
            field,
            actual,
            expected,
          },
        });
      }
    };
    assertIdentity(
      response.traceMetadata.manifestHash,
      expectedManifestHash,
      "traceMetadata.manifestHash"
    );
    assertIdentity(
      response.traceMetadata.stageKey,
      expectedStageKey,
      "traceMetadata.stageKey"
    );
    assertIdentity(
      response.traceMetadata.attemptId,
      expectedAttemptId,
      "traceMetadata.attemptId"
    );
    for (const [index, event] of response.events.entries()) {
      assertIdentity(
        event.manifestHash,
        expectedManifestHash,
        `events.${index}.manifestHash`
      );
      assertIdentity(
        event.stepKey,
        expectedStageKey,
        `events.${index}.stepKey`
      );
      assertIdentity(
        event.attemptId,
        expectedAttemptId,
        `events.${index}.attemptId`
      );
    }
    if (response.checkpoint) {
      assertIdentity(
        response.checkpoint.manifestHash,
        expectedManifestHash,
        "checkpoint.manifestHash"
      );
      assertIdentity(
        response.checkpoint.stepKey,
        expectedStageKey,
        "checkpoint.stepKey"
      );
      assertIdentity(
        response.checkpoint.attemptId,
        expectedAttemptId,
        "checkpoint.attemptId"
      );
    }
  }

  return response;
}

export function mapAdapterErrorToRuntimeError(
  payload: unknown,
  status = 500
): AgentRuntimeClientError {
  const parsed = AgentRuntimeAdapterErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new AgentRuntimeClientError({
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      status,
      details: parsed.data.error.details ?? null,
    });
  }

  return new AgentRuntimeClientError({
    code: "adapter_runtime_error",
    message: `Agent runtime adapter request failed with status ${status}.`,
    status,
  });
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentRuntimeClientError({
      code: "invalid_adapter_json",
      message: "Agent runtime adapter returned invalid JSON.",
      status: response.status || 502,
    });
  }
}

async function buildInternalHeaders(
  payload:
    | Pick<AgentRuntimeRequest, "requestId" | "tenantId" | "surface">
    | Pick<AgentRuntimeResumeRequest, "requestId" | "tenantId" | "surface">
    | Pick<AgentRuntimeCancelRequest, "requestId" | "tenantId" | "surface">
    | null,
  internalTokenLoader: () => Promise<string>
): Promise<Record<string, string>> {
  const token = await internalTokenLoader();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (token) {
    headers["x-internal-token"] = token;
    headers["x-gateway-attribution-token"] = token;
  }

  if (payload) {
    headers["x-platform-request-id"] = payload.requestId;
    headers["x-tenant-id"] = payload.tenantId;
    headers["x-agent-runtime-surface"] = payload.surface;
  }

  return headers;
}

export class AgentRuntimeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly runtimeConfigLoader: () => Promise<RuntimeConfig>;
  private readonly internalTokenLoader: () => Promise<string>;

  constructor(options: AgentRuntimeClientOptions = {}) {
    this.fetchImpl = resolveFetch(options.fetchImpl);
    this.runtimeConfigLoader =
      options.runtimeConfigLoader ?? getAppRuntimeConfig;
    this.internalTokenLoader =
      options.internalTokenLoader ?? getPreferredInternalToken;
  }

  async run(payload: AgentRuntimeRequest): Promise<AgentRuntimeResponse> {
    const request = AgentRuntimeRequestSchema.parse(payload);
    return this.callMutation("run", request);
  }

  async runStreamed(
    payload: AgentRuntimeRequest
  ): Promise<AgentRuntimeResponse> {
    const request = AgentRuntimeRequestSchema.parse(payload);
    return this.callMutation("runStreamed", request);
  }

  async resume(
    payload: AgentRuntimeResumeRequest
  ): Promise<AgentRuntimeResponse> {
    const request = AgentRuntimeResumeRequestSchema.parse(payload);
    return this.callMutation("resume", request);
  }

  async cancel(
    payload: AgentRuntimeCancelRequest
  ): Promise<AgentRuntimeResponse> {
    const request = AgentRuntimeCancelRequestSchema.parse(payload);
    return this.callMutation("cancel", request);
  }

  async health(): Promise<AgentRuntimeHealth> {
    const runtime = await this.runtimeConfigLoader();
    const headers = await buildInternalHeaders(null, this.internalTokenLoader);
    const response = await this.fetchImpl(
      buildAgentRuntimeAdapterUrl(runtime.pythonBackendUrl, "health"),
      {
        method: "GET",
        headers,
      }
    );
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw mapAdapterErrorToRuntimeError(payload, response.status);
    }
    const parsed = AgentRuntimeHealthSchema.parse(payload);
    assertHealthCompatibility(parsed);
    return parsed;
  }

  private async callMutation(
    operation: Exclude<AgentRuntimeOperation, "health">,
    payload:
      | AgentRuntimeRequest
      | AgentRuntimeResumeRequest
      | AgentRuntimeCancelRequest
  ): Promise<AgentRuntimeResponse> {
    const runtime = await this.runtimeConfigLoader();
    const headers = await buildInternalHeaders(
      "surface" in payload
        ? {
            requestId: payload.requestId,
            tenantId: payload.tenantId,
            surface: payload.surface as AgentRuntimeSurface,
          }
        : null,
      this.internalTokenLoader
    );
    const response = await this.fetchImpl(
      buildAgentRuntimeAdapterUrl(runtime.pythonBackendUrl, operation),
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }
    );
    const rawPayload = await parseJsonResponse(response);
    if (!response.ok) {
      throw mapAdapterErrorToRuntimeError(rawPayload, response.status);
    }

    const parsed = parseValidatedAgentRuntimeResponse(rawPayload);
    if (
      "allowedSkills" in payload &&
      "allowedTools" in payload &&
      "allowedAgents" in payload
    ) {
      return verifyAgentRuntimeResponseForRequest(payload, parsed);
    }
    return parsed;
  }
}
