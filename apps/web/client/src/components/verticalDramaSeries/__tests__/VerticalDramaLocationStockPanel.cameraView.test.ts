import { describe, expect, it } from "vitest";

import {
  buildLocationCameraView,
} from "../VerticalDramaLocationStockPanel";
import {
  getVerticalDramaLocationCameraViewLabel,
} from "@shared/verticalDramaSeries/locationAssets";

describe("location camera view authoring", () => {
  it("builds a standard camera preset with an optional location directive", () => {
    expect(
      buildLocationCameraView({
        preset: "birds_eye_top_down",
        directive: "front of the island from the beach",
      }),
    ).toEqual({
      preset: "birds_eye_top_down",
      label: "Bird's-Eye / Top-Down — front of the island from the beach",
      directive: "front of the island from the beach",
    });
  });

  it("supports a fully custom location-specific view", () => {
    expect(
      buildLocationCameraView({
        preset: "custom",
        directive: "underwater above the coral",
      }),
    ).toEqual({
      preset: "custom",
      label: "Custom view — underwater above the coral",
      directive: "underwater above the coral",
    });
  });

  it("does not invent a view when the selector and directive are empty", () => {
    expect(buildLocationCameraView({})).toBeUndefined();
  });

  it("uses persisted custom labels and keeps legacy roles readable", () => {
    expect(
      getVerticalDramaLocationCameraViewLabel({
        role: "other",
        metadata: { cameraView: { label: "table by the window" } },
      }),
    ).toBe("table by the window");
    expect(
      getVerticalDramaLocationCameraViewLabel({ role: "side_angle", metadata: null }),
    ).toBe("Lateral view");
  });
});
