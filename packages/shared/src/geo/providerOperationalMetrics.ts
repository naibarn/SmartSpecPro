/** Bounded, privacy-safe label vocabulary for provider operations metrics. */
export const PROVIDER_METRIC_LABEL_VALUES = {
  provider: ["google", "maplibre", "openstreetmap", "weather-th", "hydro-th", "community", "other"],
  capability: ["map_tiles", "weather", "alerts", "routes", "hydrology", "local_news", "community", "other"],
  scopeKind: ["country", "admin1", "province", "admin2", "district", "basin", "subbasin", "municipality", "other"],
  operation: ["session", "tile", "attribution", "fetch", "normalize", "project", "other"],
  status: ["success", "failure", "partial", "other"],
  errorClass: ["timeout", "quota", "authentication", "provider", "invalid", "network", "other", "unknown"],
} as const;

type LabelVocabulary = typeof PROVIDER_METRIC_LABEL_VALUES;
type LabelKey = keyof LabelVocabulary;
type LabelValue<K extends LabelKey> = LabelVocabulary[K][number];

export interface ProviderMetricLabelInput {
  readonly provider: string;
  readonly capability: string;
  readonly scopeKind: string;
  readonly operation: string;
  readonly status: string;
  readonly errorClass?: string;
  /** Deliberately ignored: identifiers and free text must never become metric labels. */
  readonly regionId?: string;
  readonly detail?: string;
}

export interface ProviderMetricLabels {
  readonly provider: LabelValue<"provider">;
  readonly capability: LabelValue<"capability">;
  readonly scopeKind: LabelValue<"scopeKind">;
  readonly operation: LabelValue<"operation">;
  readonly status: LabelValue<"status">;
  readonly errorClass: LabelValue<"errorClass">;
}

function safeLabel<K extends LabelKey>(key: K, value: string | undefined): LabelValue<K> {
  const vocabulary: readonly string[] = PROVIDER_METRIC_LABEL_VALUES[key];
  if (typeof value !== "string") return (key === "errorClass" ? "unknown" : "other") as LabelValue<K>;
  const normalized = value.trim().toLowerCase();
  return (vocabulary.includes(normalized) ? normalized : key === "errorClass" ? "unknown" : "other") as LabelValue<K>;
}

/** Unknown or attacker-controlled values collapse to a fixed bucket. No raw id or detail is returned. */
export function normalizeProviderMetricLabels(input: ProviderMetricLabelInput): ProviderMetricLabels {
  return {
    provider: safeLabel("provider", input.provider),
    capability: safeLabel("capability", input.capability),
    scopeKind: safeLabel("scopeKind", input.scopeKind),
    operation: safeLabel("operation", input.operation),
    status: safeLabel("status", input.status),
    errorClass: safeLabel("errorClass", input.errorClass),
  };
}

export type ProviderOperationalState = "healthy" | "degraded" | "unavailable" | "disabled" | "unknown";
export type ProviderOperationalScopeKind = LabelValue<"scopeKind">;

export interface ProviderOperationalScope {
  readonly kind: ProviderOperationalScopeKind;
  readonly id: string;
}

export interface ProviderOperationalObservation {
  readonly provider: string;
  readonly capability: string;
  readonly scope: ProviderOperationalScope;
  readonly state: ProviderOperationalState;
}

export interface ScopedProviderHealthRequest {
  /** Trusted geography path ordered broadest to most specific. */
  readonly requestedPath: readonly ProviderOperationalScope[];
  readonly observations: readonly ProviderOperationalObservation[];
}

export interface ScopedProviderHealth {
  readonly provider: LabelValue<"provider">;
  readonly capability: LabelValue<"capability">;
  readonly state: ProviderOperationalState;
  readonly scope: ProviderOperationalScope;
}

const STATE_SEVERITY: Readonly<Record<ProviderOperationalState, number>> = {
  healthy: 0,
  disabled: 1,
  unknown: 2,
  degraded: 3,
  unavailable: 4,
};

function isSafeScope(scope: ProviderOperationalScope): boolean {
  return typeof scope.id === "string" && scope.id.length > 0 && scope.id.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(scope.id) &&
    PROVIDER_METRIC_LABEL_VALUES.scopeKind.includes(scope.kind);
}

/**
 * For each bounded provider/capability pair, pick the most-specific observation
 * on the requested path. Degradation at province/municipality level therefore
 * survives a healthier country aggregate. Conflicts at the same scope fail
 * toward the worse state.
 */
export function resolveScopedProviderHealth(request: ScopedProviderHealthRequest): ScopedProviderHealth[] {
  if (request.requestedPath.length === 0 || request.requestedPath.some(scope => !isSafeScope(scope))) return [];

  const selected = new Map<string, { specificity: number; item: ScopedProviderHealth }>();
  for (const observation of request.observations) {
    if (!isSafeScope(observation.scope) || !Object.prototype.hasOwnProperty.call(STATE_SEVERITY, observation.state)) continue;
    const specificity = request.requestedPath.findIndex(scope => scope.kind === observation.scope.kind && scope.id === observation.scope.id);
    if (specificity < 0) continue;
    const provider = safeLabel("provider", observation.provider);
    const capability = safeLabel("capability", observation.capability);
    const key = `${provider}\u0000${capability}`;
    const item: ScopedProviderHealth = { provider, capability, state: observation.state, scope: observation.scope };
    const current = selected.get(key);
    if (!current || specificity > current.specificity ||
      (specificity === current.specificity && STATE_SEVERITY[observation.state] > STATE_SEVERITY[current.item.state])) {
      selected.set(key, { specificity, item });
    }
  }

  return [...selected.values()].map(value => value.item)
    .sort((left, right) => left.provider.localeCompare(right.provider) || left.capability.localeCompare(right.capability));
}
