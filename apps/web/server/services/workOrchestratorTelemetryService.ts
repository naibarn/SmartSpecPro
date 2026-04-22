import {
  orchestratorTelemetryEventSchema,
  type OrchestratorTelemetryEvent,
} from "../../shared/workOrchestrator";

const REQUESTER_SAFE_REDACTED_PAYLOAD_KEYS = new Set([
  "adminDiagnostics",
  "permissionDetails",
  "requiredPermissions",
  "requiredFeatureFlags",
  "policyJson",
  "rawExcerpt",
  "connectorCredentials",
  "privateVaultDetails",
  "featureFlags",
]);

function redactPayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPayloadValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REQUESTER_SAFE_REDACTED_PAYLOAD_KEYS.has(key))
      .map(([key, nestedValue]) => [key, redactPayloadValue(nestedValue)]),
  );
}

export function createTelemetryEvent(
  input: Omit<OrchestratorTelemetryEvent, "payload"> & {
    payload?: Record<string, unknown>;
  },
): OrchestratorTelemetryEvent {
  return orchestratorTelemetryEventSchema.parse({
    ...input,
    payload: input.payload ?? {},
  });
}

export function redactTelemetryEventForRequester(
  event: OrchestratorTelemetryEvent,
): OrchestratorTelemetryEvent {
  if (event.redactionMode !== "requester_safe") {
    return event;
  }

  const payload = redactPayloadValue(event.payload) as Record<string, unknown>;

  return {
    ...event,
    payload,
  };
}
