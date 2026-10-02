import { describe, expect, it } from "vitest";
import {
  projectSpec260PublicAlertGeometry,
  projectSpec260PublicLocation,
} from "../../services/spec262PublicSpatialProjection";

describe("Spec260 public emergency spatial projection", () => {
  const point = { latitude: 13.756331, longitude: 100.501762 };

  it("fails closed when public disclosure classification is absent or protected", () => {
    expect(projectSpec260PublicLocation(point, undefined)).toBeNull();
    expect(projectSpec260PublicLocation(point, "critical-infrastructure")).toBeNull();
    expect(projectSpec260PublicLocation(point, "responder-journey")).toBeNull();
  });

  it("uses the canonical server-side projection and never returns the supplied precise point", () => {
    expect(projectSpec260PublicLocation(point, "protected-household"))
      .toEqual({ latitude: 13.875, longitude: 100.625 });
    expect(projectSpec260PublicLocation(point, "protected-household"))
      .not.toEqual(point);
  });

  it("suppresses sensitive alert geometry before it can enter a public response", () => {
    const geometry = { type: "Polygon", coordinates: [[[100.5, 13.7], [100.6, 13.7], [100.6, 13.8], [100.5, 13.8], [100.5, 13.7]]] };
    expect(projectSpec260PublicAlertGeometry(geometry, "critical-infrastructure")).toBeNull();
    expect(projectSpec260PublicAlertGeometry(geometry, "ordinary-public-feature"))
      .toEqual({ type: "Polygon", coordinates: [[[100.5, 13.7], [100.6, 13.7], [100.6, 13.8], [100.5, 13.8], [100.5, 13.7]]] });
  });
});
