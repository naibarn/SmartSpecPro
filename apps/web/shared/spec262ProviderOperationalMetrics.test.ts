import { describe, expect, it } from "vitest";
import {
  normalizeProviderMetricLabels,
  resolveScopedProviderHealth,
  type ProviderMetricLabelInput,
} from "../../../packages/shared/src/geo/providerOperationalMetrics";

describe("provider operational metrics", () => {
  it("maps unbounded or sensitive label values to finite safe buckets", () => {
    const labels = normalizeProviderMetricLabels({
      provider: "google",
      capability: "map_tiles",
      scopeKind: "municipality",
      operation: "tile",
      status: "failure",
      errorClass: "authentication",
      regionId: "district-42-user@example.com",
      detail: "key=AIzaSy-secret raw report coordinates 13.75,100.50",
    } as ProviderMetricLabelInput);

    expect(labels).toEqual({
      provider: "google",
      capability: "map_tiles",
      scopeKind: "municipality",
      operation: "tile",
      status: "failure",
      errorClass: "authentication",
    });
    expect(JSON.stringify(labels)).not.toMatch(/district-42|user@example|AIza|13\.75|report/i);
  });

  it("uses a narrower degraded observation instead of a healthy country aggregate", () => {
    const health = resolveScopedProviderHealth({
      requestedPath: [
        { kind: "country", id: "TH" },
        { kind: "province", id: "TH-10" },
      ],
      observations: [
        { provider: "weather-th", capability: "weather", scope: { kind: "country", id: "TH" }, state: "healthy" },
        { provider: "weather-th", capability: "weather", scope: { kind: "province", id: "TH-10" }, state: "degraded" },
      ],
    });

    expect(health).toEqual([{
      provider: "weather-th",
      capability: "weather",
      state: "degraded",
      scope: { kind: "province", id: "TH-10" },
    }]);
  });

  it("does not let a healthy provider hide another provider's unavailable scope", () => {
    const health = resolveScopedProviderHealth({
      requestedPath: [{ kind: "country", id: "TH" }],
      observations: [
        { provider: "weather-th", capability: "weather", scope: { kind: "country", id: "TH" }, state: "healthy" },
        { provider: "hydro-th", capability: "hydrology", scope: { kind: "country", id: "TH" }, state: "unavailable" },
      ],
    });

    expect(health.map(item => [item.provider, item.state])).toEqual([
      ["hydro-th", "unavailable"],
      ["weather-th", "healthy"],
    ]);
  });

  it("fails closed for prototype-key states and uses the worst duplicate at one scope", () => {
    const health = resolveScopedProviderHealth({
      requestedPath: [{ kind: "country", id: "TH" }],
      observations: [
        { provider: "weather-th", capability: "weather", scope: { kind: "country", id: "TH" }, state: "healthy" },
        { provider: "weather-th", capability: "weather", scope: { kind: "country", id: "TH" }, state: "degraded" },
        { provider: "hydro-th", capability: "hydrology", scope: { kind: "country", id: "TH" }, state: "toString" as "unknown" },
      ],
    });

    expect(health).toEqual([{
      provider: "weather-th",
      capability: "weather",
      state: "degraded",
      scope: { kind: "country", id: "TH" },
    }]);
  });
});
