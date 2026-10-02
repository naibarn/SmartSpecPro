import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

describe("hydrology observation provenance migration", () => {
  it("adds separate measurement clocks, raw/normalized values and append-only correction identity", () => {
    const migration = readFileSync(path.join(drizzleDir, "0380_spec262_hydrology_observation_provenance.sql"), "utf8");
    const schema = readFileSync(path.join(drizzleDir, "schema.ts"), "utf8");
    const journal = JSON.parse(readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    for (const column of ["sourceId", "sourceObservationRef", "rawValue", "rawUnit", "normalizedValue", "normalizedUnit", "receivedAt", "normalizedAt", "freshnessCode", "verticalDatumRef", "supersedesObservationId"]) {
      expect(migration).toContain(`\"${column}\"`);
    }
    expect(migration).toContain("emergency_hydro_observation_revision_unique");
    expect(migration).toContain("emergency_hydro_observation_supersedes_tenant_fk");
    expect(migration).toContain("emergency_hydro_observation_station_source_tenant_fk");
    expect(migration).toContain("emergency_hydro_observation_capture_source_tenant_fk");
    expect(migration).toContain("legacyBackfill");
    expect(migration).toContain("qualityCode");
    for (const column of ["sourceObservationRef", "rawValue", "rawUnit", "normalizedValue", "normalizedUnit", "receivedAt", "normalizedAt", "freshnessCode", "verticalDatumRef", "supersedesObservationId"]) {
      expect(schema).toContain(`${column}:`);
    }

    const entryIndex = journal.entries.findIndex(entry => entry.tag === "0380_spec262_hydrology_observation_provenance");
    expect(entryIndex).toBeGreaterThanOrEqual(0);
    expect(journal.entries[entryIndex]).toMatchObject({ idx: entryIndex, tag: "0380_spec262_hydrology_observation_provenance" });
  });
});
