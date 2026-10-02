import { describe, expect, it } from "vitest";
import { normalizeHydroMeasurement } from "./hydrologyUnits";

describe("hydrology units", () => {
  it("keeps the raw value/unit and converts only explicitly supported dimensions", () => {
    expect(normalizeHydroMeasurement({ metric: "water_level", value: 125, unit: "cm", verticalDatumRef: "datum-msl" })).toMatchObject({ ok: true, rawValue: 125, rawUnit: "cm", normalizedValue: 1.25, normalizedUnit: "m" });
    expect(normalizeHydroMeasurement({ metric: "rainfall", value: 0, unit: "mm" })).toMatchObject({ ok: true, normalizedValue: 0 });
  });
  it("requires a vertical datum and rejects unknown or dimensionally wrong units", () => {
    expect(normalizeHydroMeasurement({ metric: "water_level", value: 2, unit: "m" })).toMatchObject({ ok: false, code: "HYDRO_VERTICAL_DATUM_REQUIRED" });
    expect(normalizeHydroMeasurement({ metric: "rainfall", value: 2, unit: "m" })).toMatchObject({ ok: false, code: "HYDRO_DIMENSION_MISMATCH" });
    expect(normalizeHydroMeasurement({ metric: "discharge", value: 2, unit: "widgets" })).toMatchObject({ ok: false, code: "HYDRO_UNIT_UNSUPPORTED" });
  });
});
