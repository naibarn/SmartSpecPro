import { describe, expect, it } from "vitest";
import { parseHydroObservation } from "./hydrologyContracts";

const valid = { observationId: "obs-1", stationId: "station-1", metric: "water_level", observedAt: "2026-10-01T00:00:00.000Z", receivedAt: "2026-10-01T00:01:00.000Z", normalizedAt: "2026-10-01T00:02:00.000Z", rawValue: 0, rawUnit: "m", normalizedValue: 0, normalizedUnit: "m", verticalDatumRef: "datum-1", sourceRef: "source-1", captureRef: "capture-1", sourceRevision: "r1", quality: "valid", freshness: "current" };

describe("hydrology observation contract", () => {
  it("preserves measured zero and distinct observation/receive/normalize clocks", () => {
    expect(parseHydroObservation(valid)).toMatchObject({ ok: true, value: { rawValue: 0, normalizedValue: 0, observedAt: valid.observedAt, receivedAt: valid.receivedAt, normalizedAt: valid.normalizedAt } });
  });
  it("permits explicit missing values without coercing them to zero", () => {
    expect(parseHydroObservation({ ...valid, rawValue: null, rawUnit: null, normalizedValue: null, normalizedUnit: null, verticalDatumRef: undefined, quality: "missing" })).toMatchObject({ ok: true, value: { rawValue: null, normalizedValue: null, quality: "missing" } });
    expect(parseHydroObservation({ ...valid, rawValue: null, rawUnit: null, normalizedValue: null, normalizedUnit: null, quality: "valid" })).toMatchObject({ ok: false });
  });
  it("accepts legal fractional ISO seconds and canonicalizes them to millisecond precision", () => {
    const result = parseHydroObservation({ ...valid, observedAt: "2026-10-01T00:00:00.1Z", receivedAt: "2026-10-01T00:01:00.12Z" });
    expect(result).toMatchObject({ ok: true, value: { observedAt: "2026-10-01T00:00:00.100Z", receivedAt: "2026-10-01T00:01:00.120Z" } });
  });
  it("rejects invalid timestamps, malformed provenance, and unknown keys", () => {
    expect(parseHydroObservation({ ...valid, observedAt: "yesterday" })).toMatchObject({ ok: false });
    expect(parseHydroObservation({ ...valid, captureRef: "" })).toMatchObject({ ok: false });
    expect(parseHydroObservation({ ...valid, secret: "not allowed" })).toMatchObject({ ok: false });
  });
});
