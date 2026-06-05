import { describe, expect, it } from "vitest";

import {
  defaultHyperframesProductionRolloutGate,
  evaluateHyperframesProductionRolloutGate,
} from "../hyperframesProductionRolloutGate";

describe("hyperframesProductionRolloutGate", () => {
  it("keeps production runtime blocked until dependency and route gates pass", () => {
    const gate = defaultHyperframesProductionRolloutGate();

    expect(gate.gate).toBe("blocked");
    expect(gate.runtimeMode).toBe("smoke_only");
    expect(gate.mvpSmokeReady).toBe(false);
    expect(gate.productionRuntimeReady).toBe(false);
    expect(gate.producerRuntimeBlocked).toBe(true);
    expect(gate.installAllowed).toBe(false);
    expect(gate.installCommandAllowed).toBe(false);
    expect(gate.blockers).toContain("package_install_deferred");
    expect(gate.blockers).toContain("ffmpeg_not_ready");
    expect(gate.blockers).toContain("seeded_route_e2e_missing");
    expect(gate.blockers).toContain("golden_snapshots_missing");
    expect(gate.requiredEvidence).toEqual(gate.blockers);
  });

  it("passes only when packages, worker image, seeded e2e, and golden snapshots are ready", () => {
    const gate = evaluateHyperframesProductionRolloutGate({
      packageInstallDeferred: false,
      pinnedVersionsKnown: true,
      licenseReviewed: true,
      nativePostinstallReviewed: true,
      provenanceReviewed: true,
      workerImageReviewed: true,
      fontsReviewed: true,
      chromeReady: true,
      ffmpegReady: true,
      bundleExcludesHyperframesPackages: true,
      seededRouteE2ePassed: true,
      goldenSnapshotsPassed: true,
    });

    expect(gate).toMatchObject({
      gate: "pass",
      runtimeMode: "producer_ready",
      mvpSmokeReady: true,
      productionRuntimeReady: true,
      producerRuntimeBlocked: false,
      installAllowed: true,
      installCommandAllowed: true,
      blockers: [],
      requiredEvidence: [],
    });
  });
});
