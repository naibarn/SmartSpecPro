/**
 * Bounded Spec 262 compound-hazard facts. These contracts retain supplied
 * evidence; they do not fetch, model, predict, or infer an omitted driver.
 */
export const HYDRO_DRIVERS = [
  "FLUVIAL_RAINFALL_RUNOFF", "PLUVIAL_RAINFALL", "RESERVOIR_RELEASE", "DAM_OR_LEVEE_FAILURE",
  "TIDAL_BACKWATER", "STORM_SURGE", "WAVE_OVERTOPPING", "SNOW_ICE_GLACIAL", "BURN_SCAR",
  "GROUNDWATER", "DRAINAGE_FAILURE", "TSUNAMI", "OTHER_UNKNOWN",
] as const;

export type HydroDriver = (typeof HYDRO_DRIVERS)[number];
export type CompoundFactClass = "observed" | "forecast" | "official-instruction" | "scenario" | "derived-estimate";
export type EvidenceFreshness = "current" | "stale" | "unknown";

export interface RevisionedSourceReference {
  readonly id: string;
  readonly revision: string;
  /** Sources in one group may be correlated and are never independent votes. */
  readonly independenceGroup?: string;
}

export interface EffectiveWindow {
  readonly startsAt: string;
  readonly endsAt?: string;
}

export interface HydroDriverContext {
  readonly driver: HydroDriver;
  readonly factClass: CompoundFactClass;
  readonly source: RevisionedSourceReference;
  readonly effectiveWindow: EffectiveWindow;
  readonly freshness: EvidenceFreshness;
  readonly uncertainty?: readonly string[];
}

export interface CompoundHazardCompositionInput {
  readonly occurredAt: string;
  readonly drivers: readonly HydroDriverContext[];
  /** Named requirements are supplied by an approved capability/source layer. */
  readonly requiredCapabilities: readonly string[];
  readonly availableCapabilities?: readonly string[];
}

export interface CompoundHazardSnapshot {
  readonly occurredAt: string;
  readonly drivers: readonly HydroDriverContext[];
  /** This module intentionally never generates inferred drivers. */
  readonly inferredDrivers: readonly [];
  readonly unsupportedDrivers: readonly string[];
  readonly uncertaintyContributors: readonly string[];
  readonly status: "ready" | "partial" | "blocked";
  /** Scenario facts cannot enter live publish/notification paths. */
  readonly scenarioOnly: boolean;
  readonly publishable: boolean;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))].sort((left, right) => left.localeCompare(right));
}

/**
 * Deterministic composition only. Invalid clocks and stale/unknown drivers
 * block freshness-sensitive interpretation rather than becoming normal/zero.
 */
export function composeCompoundHazardSnapshot(input: CompoundHazardCompositionInput): CompoundHazardSnapshot {
  const occurredAt = new Date(input.occurredAt);
  const clockInvalid = Number.isNaN(occurredAt.getTime());
  const available = new Set(input.availableCapabilities ?? []);
  const unsupportedDrivers = uniqueSorted(input.requiredCapabilities.filter(capability => !available.has(capability)));
  const staleDrivers = input.drivers.filter(driver => driver.freshness !== "current");
  const scenarioOnly = input.drivers.some(driver => driver.factClass === "scenario");
  const uncertaintyContributors = uniqueSorted([
    ...(clockInvalid ? ["invalid_occurred_at"] : []),
    ...staleDrivers.map(driver => `stale_driver:${driver.driver}`),
    ...input.drivers.flatMap(driver => driver.uncertainty ?? []),
    ...unsupportedDrivers.map(capability => `missing_capability:${capability}`),
  ]);
  const blocked = clockInvalid || staleDrivers.length > 0;
  return {
    occurredAt: input.occurredAt,
    drivers: [...input.drivers],
    inferredDrivers: [],
    unsupportedDrivers,
    uncertaintyContributors,
    status: blocked ? "blocked" : unsupportedDrivers.length > 0 ? "partial" : "ready",
    scenarioOnly,
    publishable: !scenarioOnly && !blocked,
  };
}
