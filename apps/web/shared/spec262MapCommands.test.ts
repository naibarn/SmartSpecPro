import { describe, expect, it } from "vitest";
import { parseEmergencyMapCommand } from "../../../packages/shared/src/emergency/mapCommands";

describe("emergency map commands", () => {
  it("accepts bounded focus commands with a map revision", () => {
    expect(parseEmergencyMapCommand({ type: "map.focus", revision: 3, center: [100.5, 13.7], zoom: 8 })).toEqual({
      ok: true,
      command: { type: "map.focus", revision: 3, center: [100.5, 13.7], zoom: 8 },
    });
  });

  it("rejects unknown command types and fields", () => {
    expect(parseEmergencyMapCommand({ type: "map.delete_everything", revision: 1 })).toMatchObject({ ok: false, code: "UNKNOWN_COMMAND" });
    expect(parseEmergencyMapCommand({ type: "map.layer.show", revision: 1, layerId: "alerts", extra: true })).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("rejects invalid coordinates, revisions, and unbounded bounds", () => {
    expect(parseEmergencyMapCommand({ type: "map.focus", revision: -1, center: [181, 20], zoom: 99 })).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    expect(parseEmergencyMapCommand({ type: "map.fit_bounds", revision: 2, bounds: [-180, -80, 180, 80] })).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });

  it("rejects stale command revisions before applying commands", () => {
    expect(parseEmergencyMapCommand({ type: "map.clear_selection", revision: 4 }, 5)).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });

  it("rejects prototype keys and malformed or oversized drawn geometry", () => {
    expect(parseEmergencyMapCommand({ type: "constructor", revision: 0 })).toMatchObject({ ok: false, code: "UNKNOWN_COMMAND" });
    expect(parseEmergencyMapCommand({ type: "map.draw.commit", revision: 0, geometry: { type: "LineString", coordinates: [[100, 13]] } })).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    expect(parseEmergencyMapCommand({ type: "map.draw.commit", revision: 0, geometry: { type: "Polygon", coordinates: [[[100, 13], [101, 13], [101, 14], [100, 14]]] } })).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });
});
