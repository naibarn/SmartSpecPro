import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emergencyHydroObservations, emergencyHydroStations } from "./schema";

const migration = readFileSync(new URL("./0378_spec262_hydrology_observation_series.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("./meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; tag: string }> };

describe("Spec262 hydrology observation migration", () => {
  it("registers an additive migration after the Spec260 source and capture authority", () => {
    const entry = journal.entries.find(item => item.tag === "0378_spec262_hydrology_observation_series");
    expect(entry).toMatchObject({ idx: 364, tag: "0378_spec262_hydrology_observation_series" });
    expect(journal.entries.at(-1)?.idx).toBeGreaterThan(entry!.idx);
    expect(migration).toContain('REFERENCES "emergency_intel_sources"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "emergency_intel_captures"("id") ON DELETE RESTRICT');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
  });

  it("bounds station CRS and coordinates and preserves time-series provenance", () => {
    expect(migration).toContain('"crsCode" = \'EPSG:4326\'');
    expect(migration).toContain('"latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180');
    expect(migration).toContain('"tenantId", "stationId", "variableCode", "observedAt" DESC');
    expect(migration).toContain('"captureId"');
    expect(emergencyHydroStations.latitude).toBeDefined();
    expect(emergencyHydroObservations.observedAt).toBeDefined();
    expect(emergencyHydroObservations.contentHash).toBeDefined();
  });
});
