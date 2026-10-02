import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emergencyGeoWatchTransitions, emergencyGeoWatches } from "./schema";

const migration = readFileSync(new URL("./0379_spec262_geospatial_watches.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("./meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; tag: string }> };

describe("Spec262 geospatial watch storage migration", () => {
  it("is additive, ordered after hydrology storage, and tenant scoped", () => {
    const watchesEntry = journal.entries.find(entry => entry.tag === "0379_spec262_geospatial_watches");
    const provenanceEntry = journal.entries.find(entry => entry.tag === "0380_spec262_hydrology_observation_provenance");
    expect(watchesEntry).toMatchObject({ idx: 365 });
    expect(provenanceEntry).toMatchObject({ idx: 366 });
    expect(provenanceEntry!.idx).toBeGreaterThan(watchesEntry!.idx);
    expect(migration).toContain('"tenantId", "ownerUserId", "idempotencyKeyHash"');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "watchId") REFERENCES "emergency_geo_watches"("tenantId", "id")');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
  });

  it("bounds payload size and retains only idempotent transition receipts", () => {
    expect(migration).toContain('octet_length("watchJson"::text) <= 32768');
    expect(migration).toContain('"transition" IN (\'enter\', \'exit\', \'material-update\')');
    expect(emergencyGeoWatches.watchJson).toBeDefined();
    expect(emergencyGeoWatchTransitions.idempotencyKey).toBeDefined();
  });
});
