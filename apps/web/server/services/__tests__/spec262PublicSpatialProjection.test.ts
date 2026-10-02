import { describe, expect, it } from "vitest";
import { projectSpec260PublicAlertGeometry, projectSpec260PublicLocation, resolveSpec262PublicSpatialClass } from "../spec262PublicSpatialProjection";

describe("Spec262 public emergency spatial projection", () => {
  const point = { latitude: 13.756331, longitude: 100.501762 };

  it("fails closed when public disclosure classification is absent or protected", () => {
    expect(projectSpec260PublicLocation(point, undefined)).toBeNull();
    expect(projectSpec260PublicLocation(point, "critical-infrastructure")).toBeNull();
    expect(projectSpec260PublicLocation(point, "responder-journey")).toBeNull();
  });

  it("uses stable server-side generalization and never returns the supplied point", () => {
    expect(projectSpec260PublicLocation(point, "protected-household")).toEqual({ latitude: 13.875, longitude: 100.625 });
    expect(projectSpec260PublicLocation(point, "protected-household")).not.toEqual(point);
  });

  it("suppresses non-ordinary alert geometry before a public response", () => {
    const geometry = { type: "Polygon", coordinates: [[[100.5, 13.7], [100.6, 13.7], [100.6, 13.8], [100.5, 13.8], [100.5, 13.7]]] };
    expect(projectSpec260PublicAlertGeometry(geometry, "critical-infrastructure")).toBeNull();
    expect(projectSpec260PublicAlertGeometry(geometry, "ordinary-public-feature")).toEqual(geometry);
  });

  it("chooses the stricter inherited policy for alert geometry and location", () => {
    expect(resolveSpec262PublicSpatialClass("ordinary-public-feature", "critical-infrastructure")).toBe("critical-infrastructure");
    expect(resolveSpec262PublicSpatialClass("protected-household", "ordinary-public-feature")).toBe("protected-household");
  });
});
