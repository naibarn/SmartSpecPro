import { calculateHydroTrend, type HydroTrendPolicy, type HydroTrendSample } from "./hydrologyTrend";

export interface HydroEventTimeQuery {
  readonly tenantId: string;
  readonly stationId: string;
  readonly variableCode: string;
  readonly fromObservedAt: string;
  readonly throughObservedAt: string;
  readonly order: "observedAt-desc";
  readonly limit: 500;
}

export interface HydroTrendReadInput {
  readonly tenantId: string;
  readonly stationId: string;
  readonly variableCode: string;
  readonly policy: HydroTrendPolicy;
  readonly now: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const VARIABLE = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_WINDOW_SECONDS = 31 * 24 * 60 * 60;

/**
 * Adapts a tenant-scoped event-time repository to the shared deterministic trend
 * calculator. Repository implementations must apply every query bound and order.
 */
export function createHydrologyTrendReader(repository: {
  readByEventTime(query: HydroEventTimeQuery): Promise<readonly HydroTrendSample[]>;
}) {
  return async (input: HydroTrendReadInput) => {
    const now = Date.parse(input.now);
    const { policy } = input;
    if (!ID.test(input.tenantId) || !ID.test(input.stationId) || !VARIABLE.test(input.variableCode) ||
      !Number.isFinite(now) || !Number.isSafeInteger(policy.windowSeconds) || policy.windowSeconds < 1 ||
      policy.windowSeconds > MAX_WINDOW_SECONDS) {
      throw new Error("HYDRO_TIME_QUERY_INVALID");
    }
    const rows = await repository.readByEventTime({
      tenantId: input.tenantId,
      stationId: input.stationId,
      variableCode: input.variableCode,
      fromObservedAt: new Date(now - policy.windowSeconds * 1_000).toISOString(),
      throughObservedAt: new Date(now).toISOString(),
      order: "observedAt-desc",
      limit: 500,
    });
    const boundedRows = rows.slice(0, 500);
    const trend = calculateHydroTrend(boundedRows, policy, new Date(now).toISOString());
    return {
      trend,
      coverageState: boundedRows.length === 0
        ? "NO_OBSERVATIONS" as const
        : trend.sampleCount > 0
          ? "DATA_AVAILABLE" as const
          : "OBSERVATIONS_UNUSABLE_OR_STALE" as const,
      queryCount: boundedRows.length,
    };
  };
}

export type HydroThresholdBand = "BELOW" | "AT_OR_ABOVE" | "UNKNOWN";
export type HydroMaterialKind = "THRESHOLD_CROSSED" | "SOURCE_BECAME_STALE" | "SOURCE_RECOVERED" | "TREND_REVERSED" | "RAPID_CHANGE";

export interface HydroMaterialChangeState {
  readonly thresholdBand: HydroThresholdBand;
  readonly trend: "RAPIDLY_RISING" | "RISING" | "SLIGHTLY_RISING" | "STABLE" | "SLIGHTLY_FALLING" | "FALLING" | "RAPIDLY_FALLING" | "UNKNOWN";
  readonly freshness: "current" | "stale" | "delayed" | "unknown";
}

/**
 * Produces an explicit event candidate only for material state transitions.
 * It does not persist, notify, or enqueue: an owning event worker must bind this
 * candidate to its transaction and canonical outbox before delivery.
 */
export function deriveHydroMaterialChange(input: {
  readonly tenantId: string;
  readonly stationId: string;
  readonly metric: string;
  readonly policyRevision: string;
  readonly previous?: HydroMaterialChangeState;
  readonly current: HydroMaterialChangeState & { readonly observationRef: string; readonly sourceRevision: string };
}) {
  if (!ID.test(input.tenantId) || !ID.test(input.stationId) || !VARIABLE.test(input.metric) ||
    !ID.test(input.policyRevision) || !ID.test(input.current.observationRef) || !ID.test(input.current.sourceRevision)) {
    throw new Error("HYDRO_MATERIAL_CHANGE_INVALID");
  }
  const previous = input.previous;
  if (!previous) return null;

  let kind: HydroMaterialKind | undefined;
  if (previous.thresholdBand !== "UNKNOWN" && input.current.thresholdBand !== "UNKNOWN" && previous.thresholdBand !== input.current.thresholdBand) {
    kind = "THRESHOLD_CROSSED";
  } else if (previous.freshness === "current" && input.current.freshness !== "current") {
    kind = "SOURCE_BECAME_STALE";
  } else if (previous.freshness !== "current" && input.current.freshness === "current") {
    kind = "SOURCE_RECOVERED";
  } else {
    const wasRising = previous.trend === "RAPIDLY_RISING" || previous.trend === "RISING" || previous.trend === "SLIGHTLY_RISING";
    const isFalling = input.current.trend === "RAPIDLY_FALLING" || input.current.trend === "FALLING" || input.current.trend === "SLIGHTLY_FALLING";
    const wasFalling = previous.trend === "RAPIDLY_FALLING" || previous.trend === "FALLING" || previous.trend === "SLIGHTLY_FALLING";
    const isRising = input.current.trend === "RAPIDLY_RISING" || input.current.trend === "RISING" || input.current.trend === "SLIGHTLY_RISING";
    if ((wasRising && isFalling) || (wasFalling && isRising)) kind = "TREND_REVERSED";
    else if ((input.current.trend === "RAPIDLY_RISING" || input.current.trend === "RAPIDLY_FALLING") && input.current.trend !== previous.trend) kind = "RAPID_CHANGE";
  }
  if (!kind) return null;

  const idempotencyKey = ["hydro-material", kind, input.tenantId, input.stationId, input.metric, input.current.sourceRevision, input.current.observationRef].join(":");
  return {
    kind,
    tenantId: input.tenantId,
    stationId: input.stationId,
    metric: input.metric,
    observationRef: input.current.observationRef,
    sourceRevision: input.current.sourceRevision,
    policyRevision: input.policyRevision,
    previous,
    current: input.current,
    idempotencyKey,
  } as const;
}
