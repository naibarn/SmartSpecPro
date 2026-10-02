import { describe, expect, it } from "vitest";
import { composeCompoundHazardSnapshot, type HydroDriverContext } from "./compoundHazards";

const rainfall: HydroDriverContext = {
  driver: "FLUVIAL_RAINFALL_RUNOFF",
  factClass: "observed",
  source: { id: "gauge:chao-phraya", revision: "obs-12", independenceGroup: "thai-hydro" },
  effectiveWindow: { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-01T01:00:00.000Z" },
  freshness: "current",
};

describe("compound hazard contracts", () => {
  it("keeps a rainfall-only snapshot bounded to its supplied driver", () => {
    const result = composeCompoundHazardSnapshot({
      occurredAt: "2026-10-01T00:30:00.000Z",
      drivers: [rainfall],
      requiredCapabilities: ["river-observation", "coastal-tide"],
    });

    expect(result.drivers.map(driver => driver.driver)).toEqual(["FLUVIAL_RAINFALL_RUNOFF"]);
    expect(result.unsupportedDrivers).toContain("coastal-tide");
    expect(result.inferredDrivers).toEqual([]);
    expect(result.status).toBe("partial");
  });

  it("makes stale evidence block freshness-sensitive compound interpretation and isolates scenarios", () => {
    const result = composeCompoundHazardSnapshot({
      occurredAt: "2026-10-01T00:30:00.000Z",
      drivers: [{ ...rainfall, driver: "DAM_OR_LEVEE_FAILURE", factClass: "scenario", freshness: "stale" }],
      requiredCapabilities: [],
    });

    expect(result.status).toBe("blocked");
    expect(result.scenarioOnly).toBe(true);
    expect(result.publishable).toBe(false);
    expect(result.uncertaintyContributors).toContain("stale_driver:DAM_OR_LEVEE_FAILURE");
  });
});
